import { derived } from "svelte/store";
import type { CellIdB64, ContactExtended, ProfileExtended } from "$lib/types";
import type { ProfileStore } from "./ProfileStore";
import type { ContactStore } from "./ContactStore";
import type { AgentPubKeyB64 } from "@holochain/client";
import { uniq } from "lodash-es";
import type { GenericKeyValueStoreReadable } from "./generic/GenericKeyValueStore";
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
  /**
   * Get a contact, transform into a ProfileExtended
   *
   * @param agentPubKeyB64
   * @returns
   */
  function _makeProfileExtendedFromContactExtended(c: ContactExtended): ProfileExtended {
    return {
      profile: {
        nickname: c.fullName,
        fields: {
          firstName: c.contact.first_name,
          lastName: c.contact.last_name,
          avatar: c.contact.avatar,
        },
      },
      publicKeyB64: c.publicKeyB64,
    };
  }

  return derived(
    [profileStore, contactStore, inviteStore],
    ([$profileStore, $contactStore, $inviteStore]) => {
      const cellIdB64s = uniq([
        ...$profileStore.list.map(([key]) => key),
        ...$inviteStore.list.map(([key]) => key),
      ]);

      const data = Object.fromEntries(
        cellIdB64s.map((cellIdB64) => {
          // Merge list of agents with profiles, and invited agents
          const agentPubKeyB64s = uniq([
            ...Object.entries($profileStore.data[cellIdB64] || {}).map(([key]) => key),
            ...($inviteStore.data[cellIdB64] || []),
          ]);

          const data = Object.fromEntries(
            agentPubKeyB64s
              .map((agentPubKeyB64) => {
                let value;
                if (agentPubKeyB64 in $contactStore.data) {
                  value = _makeProfileExtendedFromContactExtended(
                    $contactStore.data[agentPubKeyB64],
                  );
                } else if ($profileStore.data[cellIdB64] !== undefined) {
                  value = $profileStore.data[cellIdB64][agentPubKeyB64];
                }

                // Return [AgentPubKeyB64, ProfileExtended]
                return [
                  agentPubKeyB64,

                  // If contact exists, use contact, transformed into ProfileExtended data structure
                  // Otherwise, use profile.
                  //
                  // If neither contact, nor profile exists, this will be undefined.
                  value,
                ];
              })

              // Exclude agents who have neither a contact, nor profile
              .filter(([, val]) => val !== undefined),
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

export function deriveCellMergedProfileContactInviteStore(
  mergedProfileContactInviteStore: MergedProfileContactInviteStore,
  cellIdB64: CellIdB64,
  myAgentPubKeyB64: AgentPubKeyB64,
): GenericKeyValueStoreReadable<ProfileExtended> {
  return deriveGenericKeyValueStoreReadable(mergedProfileContactInviteStore, cellIdB64, [
    // Sort by my agent first
    ([agentPubKeyB64]) => agentPubKeyB64 !== myAgentPubKeyB64,

    // Then by nickname alphabetically
    ([, profileExtended]) =>
      profileExtended ? profileExtended.profile.nickname : Number.MAX_SAFE_INTEGER,

    // Then by AgentPubKeyB64 alphabetically
    ([, profileExtended]) => profileExtended.publicKeyB64,
  ]);
}
