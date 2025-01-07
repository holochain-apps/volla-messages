import { derived, type Invalidator, type Subscriber, type Unsubscriber } from "svelte/store";
import type { CellIdB64, ProfileExtended } from "$lib/types";
import type { ProfileStore } from "./ProfileStore";
import type { ContactStore } from "./ContactStore";
import type { GenericKeyKeyValueStoreData } from "./GenericKeyKeyValueStore";
import type { AgentPubKeyB64 } from "@holochain/client";
import { sortBy } from "lodash-es";
import type { GenericKeyValueStoreData } from "./GenericKeyValueStore";

export interface MergedProfileContactStore {
  subscribe: (
    this: void,
    run: Subscriber<GenericKeyKeyValueStoreData<ProfileExtended>>,
    invalidate?: Invalidator<GenericKeyKeyValueStoreData<ProfileExtended>> | undefined,
  ) => Unsubscriber;
}

/**
 * Derived store following the same structure as ProfileStore,
 * but with ProfileExtended data replaced with transformed Contact data,
 * if a contact exists for that agent.
 *
 * @param client
 * @returns
 */
export function createMergedProfileContactStore(
  profileStore: ProfileStore,
  contactStore: ContactStore,
): MergedProfileContactStore {
  const { subscribe } = derived([profileStore, contactStore], ([$profileStore, $contactStore]) => {
    const cellIdB64s = Object.keys($profileStore);

    return Object.fromEntries(
      cellIdB64s.map((cellIdB64) => {
        const agentPubKeyB64s = Object.keys($profileStore[cellIdB64]);

        // Return [CellIdB64, {[AgentPubKeyB64]: ProfileExtended}]
        return [
          cellIdB64,
          Object.fromEntries(
            agentPubKeyB64s.map((agentPubKeyB64) =>
              // Return [AgentPubKeyB64, ProfileExtended]
              [
                agentPubKeyB64,
                agentPubKeyB64 in $contactStore
                  ? contactStore.getAsProfileExtended(agentPubKeyB64)
                  : $profileStore[cellIdB64][agentPubKeyB64],
              ],
            ),
          ),
        ];
      }),
    );
  });

  return {
    subscribe,
  };
}

export interface MergedProfileContactListStore {
  subscribe: (
    this: void,
    run: Subscriber<GenericKeyValueStoreData<[string, ProfileExtended][]>>,
    invalidate?: Invalidator<GenericKeyValueStoreData<[string, ProfileExtended][]>> | undefined,
  ) => Unsubscriber;
}

export function deriveMergedProfileContactListStore(
  mergedProfileContactStore: MergedProfileContactStore,
  myAgentPubKeyB64: AgentPubKeyB64,
): MergedProfileContactListStore {
  const { subscribe } = derived(mergedProfileContactStore, ($mergedProfileContactStore) => {
    return Object.fromEntries(
      Object.entries($mergedProfileContactStore).map(([cellIdB64, cellProfiles]) => [
        cellIdB64,
        sortBy(Object.entries(cellProfiles), [
          // Sort by my agent first
          ([agentPubKeyB64]) => agentPubKeyB64 !== myAgentPubKeyB64,

          // Then by nickname alphabetically
          ([, profileExtended]) => profileExtended.profile.nickname,
        ]),
      ]),
    );
  });

  return {
    subscribe,
  };
}

export function deriveCellMergedProfileContactStore(
  mergedProfileContactStore: MergedProfileContactStore,
  cellIdB64: CellIdB64,
) {
  return derived(mergedProfileContactStore, ($mergedProfileContactStore) => {
    if ($mergedProfileContactStore[cellIdB64] === undefined) return {};

    return $mergedProfileContactStore[cellIdB64];
  });
}

export function deriveCellMergedProfileContactListStore(
  mergedProfileContactStore: MergedProfileContactStore,
  cellIdB64: CellIdB64,
  myAgentPubKeyB64: AgentPubKeyB64,
) {
  return derived(mergedProfileContactStore, ($mergedProfileContactStore) => {
    if (!$mergedProfileContactStore[cellIdB64]) return [];

    return sortBy(Object.entries($mergedProfileContactStore[cellIdB64]), [
      // Sort by my agent first
      ([agentPubKeyB64]) => agentPubKeyB64 !== myAgentPubKeyB64,

      // Then by nickname alphabetically
      ([, profileExtended]) => profileExtended.profile.nickname,
    ]);
  });
}
