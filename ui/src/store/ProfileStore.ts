import {
  encodeHashToBase64,
  type AgentPubKeyB64,
  type ClonedCell,
  type ProvisionedCell,
} from "@holochain/client";
import { type Invalidator, type Subscriber, type Unsubscriber } from "svelte/store";
import { encodeCellIdToBase64, makeFullName } from "$lib/utils";
import type { CellIdB64, CreateProfileInputUI, Profile, ProfileExtended } from "$lib/types";
import type { RelayClient } from "./RelayClient";
import { EntryRecord } from "@holochain-open-dev/utils";
import { flatten } from "lodash-es";
import {
  createGenericKeyKeyValueStore,
  deriveGenericKeyValueStore,
  type GenericKeyKeyValueStore,
} from "./generic/GenericKeyKeyValueStore";
import type {
  GenericKeyValueStore,
  GenericKeyValueStoreData,
  GenericKeyValueStoreDataExtended,
} from "./generic/GenericKeyValueStore";

export interface ProfilesExtendedObj {
  [agentPubKeyB64: AgentPubKeyB64]: ProfileExtended;
}

export interface ProfileStore extends GenericKeyKeyValueStore<ProfileExtended> {
  initialize: () => Promise<void>;
  createProfile: (val: CreateProfileInputUI) => Promise<void>;
  updateProfile: (val: CreateProfileInputUI) => Promise<void>;
  load: (key: CellIdB64) => Promise<void>;
  subscribe: (
    this: void,
    run: Subscriber<GenericKeyValueStoreDataExtended<GenericKeyValueStoreData<ProfileExtended>>>,
    invalidate?:
      | Invalidator<GenericKeyValueStoreDataExtended<GenericKeyValueStoreData<ProfileExtended>>>
      | undefined,
  ) => Unsubscriber;
}

/**
 * Creates a store for managing profiles
 *
 * @param client
 * @returns
 */
export function createProfileStore(client: RelayClient): ProfileStore {
  const profiles = createGenericKeyKeyValueStore<ProfileExtended>();

  /**
   * Fetch contacts data and load into writable
   */
  async function initialize() {
    // Get all relay cells
    const cellInfos = flatten(
      await Promise.all([client.getRelayClonedCellInfos(), client.getRelayProvisionedCellInfo()]),
    );

    // Get all profiles in all relay cells
    // Ignore any failures
    const data = (
      await Promise.allSettled(
        cellInfos.map(async (cellInfo) => [
          encodeCellIdToBase64(cellInfo.cell_id),
          await _loadProfiles(cellInfo),
        ]),
      )
    )
      .filter((p) => p.status === "fulfilled")
      .map((p) => p.value);

    // Add all profiles to writable
    profiles.set(Object.fromEntries(data));
  }

  /**
   * Create your profile
   *
   * @param val
   */
  async function createProfile(val: CreateProfileInputUI) {
    const input = {
      nickname: makeFullName(val.firstName, val.lastName),
      fields: val,
    };
    const myPubKeyB64 = encodeHashToBase64(client.client.myPubKey);

    // Get all relay cells
    const cellInfos = flatten(
      await Promise.all([client.getRelayClonedCellInfos(), client.getRelayProvisionedCellInfo()]),
    );

    // Create profile in all relay cells
    // Ignore any failures
    const promises = await Promise.allSettled(
      cellInfos.map(async (cellInfo) => {
        const record = await client.createProfile(cellInfo.cell_id, input);
        const profile = new EntryRecord<Profile>(record).entry;
        if (!profile) throw new Error("Failed to get profile entry");

        return {
          cellIdB64: encodeCellIdToBase64(cellInfo.cell_id),
          agentPubKeyB64: myPubKeyB64,
          profileExtended: {
            profile,
            publicKeyB64: myPubKeyB64,
          },
        };
      }),
    );
    const data = promises.filter((p) => p.status === "fulfilled").map((p) => p.value);

    // Add all profiles to writable
    data.forEach(({ cellIdB64, agentPubKeyB64, profileExtended }) =>
      profiles.setKeyKeyValue(cellIdB64, agentPubKeyB64, profileExtended),
    );
  }

  /**
   * Update your profile
   */
  async function updateProfile(val: CreateProfileInputUI) {
    const input = {
      nickname: makeFullName(val.firstName, val.lastName),
      fields: val,
    };
    const myPubKeyB64 = encodeHashToBase64(client.client.myPubKey);

    // Get all relay cells
    const cellInfos = flatten(
      await Promise.all([client.getRelayClonedCellInfos(), client.getRelayProvisionedCellInfo()]),
    );

    // Create profile in all relay cells
    // Ignore any failures
    const promises = await Promise.allSettled(
      cellInfos.map(async (cellInfo) => {
        const record = await client.updateProfile(cellInfo.cell_id, input);
        const profile = new EntryRecord<Profile>(record).entry;
        if (!profile) throw new Error("Failed to get profile entry");

        return {
          cellIdB64: encodeCellIdToBase64(cellInfo.cell_id),
          agentPubKeyB64: myPubKeyB64,
          profileExtended: {
            profile,
            publicKeyB64: myPubKeyB64,
          },
        };
      }),
    );
    const data = promises.filter((p) => p.status === "fulfilled").map((p) => p.value);

    // Add all profiles to writable
    data.forEach(({ cellIdB64, agentPubKeyB64, profileExtended }) => {
      profiles.setKeyKeyValue(cellIdB64, agentPubKeyB64, profileExtended);
    });
  }

  async function load(key: CellIdB64) {
    // Get all relay cells
    const cellInfos = flatten(
      await Promise.all([client.getRelayClonedCellInfos(), client.getRelayProvisionedCellInfo()]),
    );

    // Find selected cell
    const cellInfo = cellInfos.find((c) => encodeCellIdToBase64(c.cell_id) === key);
    if (!cellInfo) throw new Error(`Failed to get CellInfo for cellIdB64 ${key}`);

    // Fetch profiles for cell
    const data = await _loadProfiles(cellInfo);
    profiles.setKeyValue(key, data);
  }

  async function _loadProfiles(
    cellInfo: ClonedCell | ProvisionedCell,
  ): Promise<{ [agentPubKeyB64: string]: ProfileExtended }> {
    const profilesExtended = await client.getAllProfiles(cellInfo.cell_id);

    return Object.fromEntries(profilesExtended.map((p) => [p.publicKeyB64, p]));
  }

  return {
    ...profiles,
    initialize,
    load,
    createProfile,
    updateProfile,
  };
}

export interface CellProfileStore extends GenericKeyValueStore<ProfileExtended> {
  load: () => Promise<void>;
}

export function deriveCellProfileStore(
  profileStore: ProfileStore,
  cellIdB64: CellIdB64,
): CellProfileStore {
  const store = deriveGenericKeyValueStore(profileStore, cellIdB64);

  return {
    ...store,
    load: () => profileStore.load(cellIdB64),
  };
}
