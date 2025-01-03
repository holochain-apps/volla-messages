import { derived, type Invalidator, type Subscriber, type Unsubscriber } from "svelte/store";
import type { CellIdB64, ProfileExtended } from "$lib/types";
import type { ProfileStore } from "./ProfileStore";
import type { ContactStore } from "./ContactStore";
import type { GenericKeyKeyValueStoreData } from "./GenericKeyKeyValueStore";

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
        return [
          cellIdB64,
          Object.fromEntries(
            agentPubKeyB64s.map((agentPubKeyB64) => [
              agentPubKeyB64,
              agentPubKeyB64 in $contactStore
                ? contactStore.getAsProfileExtended(agentPubKeyB64)
                : $profileStore[cellIdB64][agentPubKeyB64],
            ]),
          ),
        ];
      }),
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
  return derived(
    mergedProfileContactStore,
    ($mergedProfileContactStore) => $mergedProfileContactStore[cellIdB64],
  );
}
