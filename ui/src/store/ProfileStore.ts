import { encodeHashToBase64, type AgentPubKeyB64, type CellId } from "@holochain/client";
import { type Invalidator, type Subscriber, type Unsubscriber } from "svelte/store";
import { makeFullName } from "$lib/utils";
import type { CreateProfileInputUI, Profile, ProfileExtended } from "$lib/types";
import type { RelayClient } from "./RelayClient";
import { EntryRecord } from "@holochain-open-dev/utils";
import { flatten } from "lodash-es";
import {
  createGenericCellIdAgentKeyedStore,
  encodeCellIdToBase64,
  type GenericCellIdAgentKeyedStoreData,
} from "./GenericCellIdAgentStore";

export interface ProfilesExtendedObj {
  [agentPubKeyB64: AgentPubKeyB64]: ProfileExtended;
}

export interface ProfileStore {
  initialize: () => Promise<void>;
  create: (val: CreateProfileInputUI) => Promise<void>;
  update: (val: CreateProfileInputUI) => Promise<void>;
  subscribe: (
    this: void,
    run: Subscriber<GenericCellIdAgentKeyedStoreData<ProfileExtended>>,
    invalidate?: Invalidator<GenericCellIdAgentKeyedStoreData<ProfileExtended>> | undefined,
  ) => Unsubscriber;
}

/**
 * Creates a store for managing profiles
 *
 * @param client
 * @returns
 */
export function createProfileStore(client: RelayClient): ProfileStore {
  const profiles = createGenericCellIdAgentKeyedStore<ProfileExtended>();

  /**
   * Create your profile
   *
   * @param val
   */
  async function create(val: CreateProfileInputUI) {
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
      profiles.setOne(cellIdB64, agentPubKeyB64, profileExtended),
    );
  }

  /**
   * Update your profile
   */
  async function update(val: CreateProfileInputUI) {
    console.log("update profile", val);

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
      profiles.updateOne(cellIdB64, agentPubKeyB64, profileExtended),
        console.log("update", cellIdB64);
    });
  }

  /**
   * Fetch contacts data and load into writable
   */
  async function initialize() {
    // Get all relay cells
    const cellInfos = flatten(
      await Promise.all([client.getRelayClonedCellInfos(), client.getRelayProvisionedCellInfo()]),
    );

    // Create profile in all relay cells
    // Ignore any failures
    const data = (
      await Promise.allSettled(
        cellInfos.map(async (cellInfo) => {
          const profilesExtended = await client.getAllProfiles(cellInfo.cell_id);

          return profilesExtended.map((p) => ({
            cellIdB64: encodeCellIdToBase64(cellInfo.cell_id),
            agentPubKeyB64: p.publicKeyB64,
            profileExtended: p,
          }));
        }),
      )
    )
      .filter((p) => p.status === "fulfilled")
      .map((p) => p.value);

    // Add all profiles to writable
    flatten(data).forEach(({ cellIdB64, agentPubKeyB64, profileExtended }) =>
      profiles.setOne(cellIdB64, agentPubKeyB64, profileExtended),
    );
  }

  return {
    initialize,

    create,
    update,

    subscribe: profiles.subscribe,
  };
}
