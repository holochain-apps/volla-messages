import { type ActionHash, type AgentPubKeyB64, type DnaHashB64 } from "@holochain/client";
import { writable, get, type Writable } from "svelte/store";
import { RelayStore } from "$store/RelayStore";
import { type Contact } from "../types";
import { makeFullName } from "$lib/utils";
import { persisted, type Persisted } from "svelte-persisted-store";

export class ContactStore {
  private contact: Writable<Contact>;
  private privateConversationDnaHashB64: Persisted<DnaHashB64 | undefined>;

  constructor(
    public relayStore: RelayStore,
    public avatar: string,
    public currentActionHash: ActionHash | undefined,
    public firstName: string,
    public lastName: string,
    public originalActionHash: ActionHash | undefined,
    public publicKeyB64: AgentPubKeyB64,
    public dnaHashB64?: DnaHashB64 | undefined,
  ) {
    this.privateConversationDnaHashB64 = persisted(
      `CONTACTS.${publicKeyB64}.PRIVATE_CONVERSATION`,
      dnaHashB64,
    );
    this.contact = writable({
      avatar,
      confirmed: false,
      currentActionHash,
      firstName,
      lastName,
      originalActionHash,
      publicKeyB64,
      privateConversationDnaHashB64: get(this.privateConversationDnaHashB64),
    });
  }

  subscribe(run: any) {
    return this.contact.subscribe(run);
  }

  get data() {
    return get(this.contact);
  }

  get name() {
    return makeFullName(this.data.firstName, this.data.lastName);
  }

  get privateConversation() {
    return this.data.privateConversationDnaHashB64
      ? this.relayStore.getConversation(this.data.privateConversationDnaHashB64)
      : null;
  }

  // Check if the contact has joined the private conversation between you yet
  get pendingConnection() {
    const conversationAgents =
      this.data.privateConversationDnaHashB64 &&
      this.relayStore.getConversation(this.data.privateConversationDnaHashB64)?.data.agentProfiles;
    return conversationAgents && Object.keys(conversationAgents).length === 1;
  }

  update(newData: any) {
    this.contact.update((c) => {
      return { ...c, ...newData };
    });
  }
}
