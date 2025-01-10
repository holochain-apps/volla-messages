import { derived } from "svelte/store";
import type { InviteStore } from "./InviteStore";
import type { MergedProfileContactInviteStore } from "./MergedProfileContactInviteStore";
import type { ProfileStore } from "./ProfileStore";
import {
  deriveGenericKeyValueStoreReadable,
  type GenericKeyKeyValueStoreReadable,
} from "./generic/GenericKeyKeyValueStore";
import type { CellIdB64, ProfileExtended } from "$lib/types";

export type MergedProfileContactInviteUnjoinedStore =
  GenericKeyKeyValueStoreReadable<ProfileExtended>;

export function createMergedProfileContactInviteUnjoinedStore(
  profileStore: ProfileStore,
  inviteStore: InviteStore,
  mergedProfileContactInviteStore: MergedProfileContactInviteStore,
): MergedProfileContactInviteUnjoinedStore {
  const unjoinedAgentPubKeyB64s = derived(
    [profileStore, inviteStore],
    ([$profileStore, $inviteStore]) => {
      const data = Object.fromEntries(
        $inviteStore.list.map(([cellIdB64, invites]) => [
          cellIdB64,
          invites.filter((a) => !Object.keys($profileStore.data[cellIdB64] || {}).includes(a)),
        ]),
      );

      return {
        data,
        list: Object.entries(data),
        count: Object.keys(data).length,
      };
    },
  );

  return derived(
    [unjoinedAgentPubKeyB64s, mergedProfileContactInviteStore],
    ([$unjoinedAgentPubKeyB64s, $mergedProfileContactInviteStore]) => {
      const data = Object.fromEntries(
        $mergedProfileContactInviteStore.list.map(([cellIdB64, profilesData]) => {
          return [
            cellIdB64,
            Object.fromEntries(
              Object.entries(profilesData || {}).filter(
                ([agentPubKeyB64]) =>
                  $unjoinedAgentPubKeyB64s.data[cellIdB64] &&
                  $unjoinedAgentPubKeyB64s.data[cellIdB64].includes(agentPubKeyB64),
              ),
            ),
          ];
        }),
      );

      return {
        data,
        list: Object.entries(data),
        count: Object.keys(data).length,
      };
    },
  );
}

export function deriveCellMergedProfileContactInviteUnjoinedStore(
  mergedProfileContactUnjoinedStore: MergedProfileContactInviteUnjoinedStore,
  key: CellIdB64,
) {
  return deriveGenericKeyValueStoreReadable(mergedProfileContactUnjoinedStore, key);
}

export type MergedProfileContactInviteJoinedStore =
  GenericKeyKeyValueStoreReadable<ProfileExtended>;

export function createMergedProfileContactInviteJoinedStore(
  profileStore: ProfileStore,
  inviteStore: InviteStore,
  mergedProfileContactInviteStore: MergedProfileContactInviteStore,
): MergedProfileContactInviteJoinedStore {
  const unjoinedAgentPubKeyB64s = derived(
    [profileStore, inviteStore],
    ([$profileStore, $inviteStore]) => {
      const data = Object.fromEntries(
        $inviteStore.list.map(([cellIdB64, invites]) => [
          cellIdB64,
          invites.filter((a) => !Object.keys($profileStore.data[cellIdB64] || {}).includes(a)),
        ]),
      );

      return {
        data,
        list: Object.entries(data),
        count: Object.keys(data).length,
      };
    },
  );

  return derived(
    [unjoinedAgentPubKeyB64s, mergedProfileContactInviteStore],
    ([$unjoinedAgentPubKeyB64s, $mergedProfileContactInviteStore]) => {
      const data = Object.fromEntries(
        $mergedProfileContactInviteStore.list.map(([cellIdB64, profilesData]) => {
          return [
            cellIdB64,
            Object.fromEntries(
              Object.entries(profilesData || {}).filter(
                ([agentPubKeyB64]) =>
                  !$unjoinedAgentPubKeyB64s.data[cellIdB64] ||
                  !$unjoinedAgentPubKeyB64s.data[cellIdB64].includes(agentPubKeyB64),
              ),
            ),
          ];
        }),
      );

      return {
        data,
        list: Object.entries(data),
        count: Object.keys(data).length,
      };
    },
  );
}

export function deriveCellMergedProfileContactInviteJoinedStore(
  mergedProfileContactJoinedStore: MergedProfileContactInviteJoinedStore,
  key: CellIdB64,
) {
  return deriveGenericKeyValueStoreReadable(mergedProfileContactJoinedStore, key);
}
