import {
  type ActionHash,
  type AgentPubKeyB64,
  type DnaHashB64,
} from "@holochain/client";
import {
  writable,
  get,
  derived,
  type Invalidator,
  type Subscriber,
  type Unsubscriber,
} from "svelte/store";
import { RelayStore } from "$store/RelayStore";
import { makeFullName } from "$lib/utils";
import { persisted } from "svelte-persisted-store";
import type { ConversationStore } from "./ConversationStore";
import type { Contact, ContactExtended } from "../types";

export interface ContactStore {
  getPrivateConversation: () => ConversationStore | undefined;
  getIsPendingConnection: () => boolean | undefined;
  subscribe: (
    this: void,
    run: Subscriber<ContactExtended>,
    invalidate?: Invalidator<ContactExtended> | undefined
  ) => Unsubscriber;
}

export function createContactStore(
  relayStore: RelayStore,
  avatar: string,
  currentActionHash: ActionHash | undefined,
  firstName: string,
  lastName: string,
  originalActionHash: ActionHash | undefined,
  publicKeyB64: AgentPubKeyB64,
  dnaHashB64?: DnaHashB64 | undefined
) {
  const privateConversationDnaHashB64 = persisted(
    `CONTACTS.${publicKeyB64}.PRIVATE_CONVERSATION`,
    dnaHashB64
  );
  const contact = writable<Contact>({
    avatar,
    currentActionHash,
    firstName,
    lastName,
    originalActionHash,
    publicKeyB64,
    privateConversationDnaHashB64: get(privateConversationDnaHashB64),
  });
  const { subscribe } = derived<typeof contact, ContactExtended>(
    contact,
    ($contact) => ({
      ...$contact,
      name: makeFullName($contact.firstName, $contact.lastName),
    })
  );

  function getPrivateConversation() {
    const val = get(privateConversationDnaHashB64);
    if (val === undefined) return undefined;

    return relayStore.getConversation(val);
  }

  // Check if the contact has joined the private conversation between you yet
  function getIsPendingConnection() {
    const privateConversation = getPrivateConversation();
    if (!privateConversation) return false;

    const conversationAgents =
      get(privateConversation).conversation.agentProfiles;
    return conversationAgents && Object.keys(conversationAgents).length === 1;
  }

  return {
    getPrivateConversation,
    getIsPendingConnection,
    subscribe,
  };
}
