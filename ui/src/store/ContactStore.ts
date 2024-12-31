import {
  encodeHashToBase64,
  type ActionHash,
  type AgentPubKeyB64,
  type DnaHashB64,
} from "@holochain/client";
import {
  writable,
  get,
  type Invalidator,
  type Subscriber,
  type Unsubscriber,
} from "svelte/store";
import { RelayStore } from "$store/RelayStore";
import { makeFullName } from "$lib/utils";
import { persisted } from "svelte-persisted-store";
import type { ConversationStore } from "./ConversationStore";
import type { Contact, ContactExtended } from "$lib/types";

export interface ContactStore {
  getPrivateConversation: () => ConversationStore | undefined;
  getIsPendingConnection: () => boolean | undefined;
  getAsProfile: () => {
    publicKeyB64: string;
    profile: {
      nickname: string;
      fields: {
        firstName: string;
        lastName: string;
        avatar: string;
      };
    };
  };
  subscribe: (
    this: void,
    run: Subscriber<ContactExtended>,
    invalidate?: Invalidator<ContactExtended> | undefined
  ) => Unsubscriber;
}

export function createContactStore(
  relayStore: RelayStore,
  contact: Contact,
  originalActionHash: ActionHash,
  previousActionHash: ActionHash,
  dnaHashB64?: DnaHashB64 | undefined
) {
  const publicKeyB64 = encodeHashToBase64(contact.public_key);
  const privateConversationDnaHashB64 = persisted(
    `CONTACTS.${publicKeyB64}.PRIVATE_CONVERSATION`,
    dnaHashB64
  );
  const data = writable<ContactExtended>({
    contact,
    originalActionHash,
    previousActionHash,
    fullName: makeFullName(contact.first_name, contact.last_name),
    publicKeyB64,
    privateConversationDnaHashB64: get(privateConversationDnaHashB64),
  });

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

  function getAsProfile() {
    const val = get(data);

    return {
      publicKeyB64: val.publicKeyB64,
      profile: {
        nickname: val.fullName,
        fields: {
          firstName: val.contact.first_name,
          lastName: val.contact.last_name,
          avatar: val.contact.avatar,
        },
      },
    };
  }

  return {
    getPrivateConversation,
    getIsPendingConnection,
    getAsProfile,
    subscribe: data.subscribe,
  };
}
