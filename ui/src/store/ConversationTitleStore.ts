import { derived, get, type Invalidator, type Subscriber, type Unsubscriber } from "svelte/store";
import type { ConversationStore } from "./ConversationStore";
import { type MergedProfileContactInviteStore } from "./MergedProfileContactInviteStore";
import { Privacy, type CellIdB64, type ProfileExtended } from "$lib/types";
import { persisted } from "./generic/GenericPersistedStore";
import type { GenericKeyValueStoreData } from "./generic/GenericKeyValueStore";
import type { InvitationStore } from "./InvitationStore";
import type { MergedProfileContactInviteJoinedStore } from "./MergedProfileContactInviteJoinedStore";

export interface ConversationTitleStore {
  subscribe: (
    this: void,
    run: Subscriber<GenericKeyValueStoreData<string>>,
    invalidate?: Invalidator<GenericKeyValueStoreData<string>> | undefined,
  ) => Unsubscriber;
}

export function createConversationTitleStore(
  conversationStore: ConversationStore,
  mergedProfileContactInviteStore: MergedProfileContactInviteStore,
  invitationStore: InvitationStore,
): ConversationTitleStore {
  const persistedData = persisted<{ [cellIdB64: CellIdB64]: string }>("CONVERSATION.TITLE", {});

  const data = derived(
    [conversationStore, mergedProfileContactInviteStore, invitationStore],
    ([$conversationStore, $mergedProfileContactInviteStore, $invitationStore]) => {
      const newVal = Object.fromEntries(
        $conversationStore.list
          .map(([cellIdB64, conversation]) => {
            const previousTitle = get(persistedData)[cellIdB64];
            let title;

            // Derive a title for the conversation

            // If Private, and there are other profiles, generate a title from the profile names
            if (
              conversation.dnaProperties.privacy === Privacy.Private &&
              $mergedProfileContactInviteStore.data[cellIdB64] !== undefined &&
              Object.keys($mergedProfileContactInviteStore.data[cellIdB64]).length > 1
            ) {
              title = makePrivateConversationTitle(
                Object.values($mergedProfileContactInviteStore.data[cellIdB64] || {}),
              );
            }
            // If we have a Config, use that title
            else if (conversation.config !== undefined) {
              title = conversation.config.title;
            }
            // If we have an Invitation saved to localstorage, use that title
            else if ($invitationStore[cellIdB64] !== undefined) {
              title = $invitationStore[cellIdB64].title;
            }
            // If it is public and there are other profiles, generate a title from the profile names
            else if (
              $mergedProfileContactInviteStore.data[cellIdB64] !== undefined &&
              Object.keys($mergedProfileContactInviteStore.data[cellIdB64]).length > 1
            ) {
              title = makePrivateConversationTitle(
                Object.values($mergedProfileContactInviteStore.data[cellIdB64] || {}),
              );
            }
            // If we have a previous title saved to localstorage, use that
            // Localstorage persistance is necessary for disabled conversations as we cannot access the cell's data
            else if (
              previousTitle !== undefined &&
              previousTitle !== null &&
              previousTitle !== ""
            ) {
              title = previousTitle;
            }
            // If we cannot derive a title, and we don't have one saved, use the cellInfo cell name
            else {
              title = conversation.cellInfo.name;
            }

            return [cellIdB64, title];
          })

          // Exclude titles that are still undefined
          .filter((val) => val !== undefined),
      );

      // Persist new title to localstorage
      persistedData.set(newVal);

      return newVal;
    },
  );

  return {
    subscribe: data.subscribe,
  };
}

export function deriveCellConversationTitleStore(
  conversationTitleStore: ConversationTitleStore,
  cellIdB64: CellIdB64,
) {
  return derived(
    conversationTitleStore,
    ($conversationTitleStore) => $conversationTitleStore[cellIdB64],
  );
}

function makePrivateConversationTitle(profiles: ProfileExtended[]) {
  let title;
  if (profiles.length === 2) {
    // Full name of the one other person in the chat
    title = profiles[1].profile.nickname;
  } else if (profiles.length === 3) {
    // First names of all participants, excluding self
    title = profiles
      .slice(1)
      .map((p) => p.profile.fields.firstName)
      .join(" & ");
  } else {
    // First names of first 3 participants, then number of additional participants, excluding self
    title = `${profiles
      .slice(1, 4)
      .map((p) => p.profile.fields.firstName)
      .join(", ")} + ${profiles.length - 4} Others`;
  }

  return title;
}
