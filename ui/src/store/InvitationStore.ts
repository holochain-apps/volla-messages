import type { CellIdB64, Invitation } from "$lib/types";
import type { Subscriber, Invalidator, Unsubscriber } from "svelte/motion";
import { persisted } from "./generic/GenericPersistedStore";
import type { Updater } from "svelte/store";
import type { GenericKeyValueStoreData } from "./generic/GenericKeyValueStore";

export interface InvitationStore {
  set: (key: CellIdB64, input: Invitation) => void;
  subscribe: (
    this: void,
    run: Subscriber<GenericKeyValueStoreData<Invitation>>,
    invalidate?: Invalidator<GenericKeyValueStoreData<Invitation>> | undefined,
  ) => Unsubscriber;
}

/**
 * Store to persist invitations I have received (out of band), and then input into the app's /conversation/join page
 *
 * This ensures that the invitation's `title` can be used as the Conversation title, until the Conversation Config can be fetched
 *
 * @returns
 */
export function createInvitationStore() {
  // Invitation I used to join conversation is persisted to localstorage to ensure it remains available when the cell is disabled.
  const invitation = persisted<{ [cellIdB64: CellIdB64]: Invitation }>(
    "CONVERSATION.INVITATION",
    {},
  );

  function set(key: CellIdB64, val: Invitation) {
    invitation.update((c) => ({
      ...c,
      [key]: val,
    }));
  }

  function update(key: CellIdB64, updater: Updater<Invitation>) {
    invitation.update((c) => ({
      ...c,
      [key]: updater(c[key]),
    }));
  }

  return {
    set,
    update,
    subscribe: invitation.subscribe,
  };
}
