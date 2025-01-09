import { derived, type Invalidator, type Subscriber, type Unsubscriber } from "svelte/store";
import type { CellIdB64, ProfileExtended } from "$lib/types";
import type { ProfileStore } from "./ProfileStore";
import type { ContactStore } from "./ContactStore";
import type { AgentPubKeyB64 } from "@holochain/client";
import { uniq } from "lodash-es";
import type { GenericKeyValueStoreData } from "./generic/GenericKeyValueStore";
import type { InviteStore } from "./InviteStore";
import {
  deriveGenericKeyValueStoreReadable,
  type GenericKeyKeyValueStoreReadable,
} from "./generic/GenericKeyKeyValueStore";

export type MergedProfileContactInviteStore = GenericKeyKeyValueStoreReadable<ProfileExtended>;

/**
 * Derived store following the same structure as ProfileStore,
 * but with ProfileExtended data replaced with transformed Contact data,
 * if a contact exists for that agent.
 *
 * @param client
 * @returns
 */
export function createMergedProfileContactInviteStore(
  profileStore: ProfileStore,
  contactStore: ContactStore,
  inviteStore: InviteStore,
): MergedProfileContactInviteStore {
  return derived(
    [profileStore, contactStore, inviteStore],
    ([$profileStore, $contactStore, $inviteStore]) => {
      const cellIdB64s = uniq([
        ...$profileStore.list.map(([key]) => key),
        ...$contactStore.list.map(([key]) => key),
        ...$inviteStore.list.map(([key]) => key),
      ]);

      const data = Object.fromEntries(
        cellIdB64s.map((cellIdB64) => {
          const agentPubKeyB64s = uniq([
            ...$profileStore.list.map(([key]) => key),
            ...$inviteStore.list.map(([key]) => key),
          ]);

          const data = Object.fromEntries(
            agentPubKeyB64s.map((agentPubKeyB64) =>
              // Return [AgentPubKeyB64, ProfileExtended]
              [
                agentPubKeyB64,
                agentPubKeyB64 in $contactStore
                  ? contactStore.getAsProfileExtended(agentPubKeyB64)
                  : $profileStore.data[cellIdB64][agentPubKeyB64],
              ],
            ),
          );

          // Return [CellIdB64, {[AgentPubKeyB64]: ProfileExtended}]
          return [cellIdB64, data];
        }),
      );

      return {
        data,
        list: Object.entries(data || {}),
        count: Object.keys(data || {}).length,
      };
    },
  );
}

export interface MergedProfileContactInviteListStore {
  subscribe: (
    this: void,
    run: Subscriber<GenericKeyValueStoreData<[string, ProfileExtended][]>>,
    invalidate?: Invalidator<GenericKeyValueStoreData<[string, ProfileExtended][]>> | undefined,
  ) => Unsubscriber;
}

export function deriveCellMergedProfileContactInviteStore(
  mergedProfileContactStore: MergedProfileContactInviteStore,
  cellIdB64: CellIdB64,
  myAgentPubKeyB64: AgentPubKeyB64,
) {
  return deriveGenericKeyValueStoreReadable(mergedProfileContactStore, cellIdB64, [
    // Sort by my agent first
    ([agentPubKeyB64]) => agentPubKeyB64 !== myAgentPubKeyB64,

    // Then by nickname alphabetically
    ([, profileExtended]) => profileExtended.profile.nickname,
  ]);
}
