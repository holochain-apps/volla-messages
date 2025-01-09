import { derived, get, type Invalidator, type Subscriber, type Unsubscriber } from "svelte/store";
import type { ConversationStore } from "./ConversationStore";
import { type MergedProfileContactInviteStore } from "./MergedProfileContactInviteStore";
import { Privacy, type CellIdB64, type ProfileExtended } from "$lib/types";
import { persisted } from "./generic/GenericPersistedStore";
import type { GenericKeyValueStoreData } from "./generic/GenericKeyValueStore";

export interface ConversationTitleStore {
  subscribe: (
    this: void,
    run: Subscriber<GenericKeyValueStoreData<string>>,
    invalidate?: Invalidator<GenericKeyValueStoreData<string>> | undefined,
  ) => Unsubscriber;
}

export function createConversationTitleStore(
  conversationStore: ConversationStore,
  mergedProfileContactStore: MergedProfileContactInviteStore,
): ConversationTitleStore {
  const persistedData = persisted<{ [cellIdB64: CellIdB64]: string }>("CONVERSATION.TITLE", {});

  const data = derived(
    [conversationStore, mergedProfileContactStore],
    ([$conversationStore, $mergedProfileContactStore]) => {
      const newVal = Object.fromEntries(
        Object.entries($conversationStore.conversations).map(([cellIdB64, conversation]) => {
          const previousTitle = get(persistedData)[cellIdB64];

          let title;
          if (
            previousTitle !== undefined &&
            (!conversation.cellInfo.enabled ||
              $mergedProfileContactStore.data[cellIdB64] === undefined ||
              conversation.config === undefined)
          ) {
            // We have a title saved, and we are not able to derive a title, so use the saved title
            title = previousTitle;
          } else if (
            conversation.dnaProperties.privacy === Privacy.Private &&
            $mergedProfileContactStore.data[cellIdB64] !== undefined
          ) {
            // Private conversations have a title derived from the names of the participants, and my own name
            title = makePrivateConversationTitle(
              Object.values($mergedProfileContactStore.data[cellIdB64]),
            );
          } else if (conversation.dnaProperties.privacy === Privacy.Public && conversation.config) {
            title = conversation.config.title;
          } else {
            title = "...";
          }

          return [cellIdB64, title];
        }),
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
  console.log("makePrivateConversationTitle", profiles);
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
    // First names of all participants, excluding self
    title = profiles
      .slice(1)
      .map((p) => p.profile.fields.firstName)
      .join(", ");
  }

  return title;
}
