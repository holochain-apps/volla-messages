import { decode } from "@msgpack/msgpack";
import { camelCase, mapKeys } from "lodash-es";
import { derived, get, type Readable } from "svelte/store";
import {
  type AgentPubKey,
  type AgentPubKeyB64,
  decodeHashFromBase64,
  encodeHashToBase64,
  type Signal,
  SignalType,
  type DnaHashB64,
  type ClonedCell,
} from "@holochain/client";
import { type ContactStore, createContactStore } from "./ContactStore";
import { type ConversationStore, createConversationStore } from "./ConversationStore";
import { RelayClient } from "$store/RelayClient";
import type {
  Contact,
  Image,
  ConversationCellAndConfig,
  Invitation,
  Message,
  Properties,
  RelaySignal,
  UpdateContactInput,
} from "../types";
import { Privacy } from "../types";
import { enqueueNotification, isMobile, makeFullName } from "$lib/utils";

export class RelayStore {
  public contacts: ContactStore[] = [];
  public conversations: ConversationStore[] = [];
  public archivedConversations = derived(this.conversations, ($conversations) =>
    $conversations.filter((c) => c.archived),
  );
  public activeConversations = derived(this.conversations, ($conversations) =>
    $conversations.filter((c) => !c.archived),
  );

  constructor(public client: RelayClient) {}

  async initialize() {
    const clonedCellInfos = await this.client.getRelayClonedCellInfos();
    await Promise.allSettled(clonedCellInfos.map(async (c) => this._addConversation(c)));
    await this.fetchAllContacts();

    const myPubKeyB64 = encodeHashToBase64(this.client.client.myPubKey);
    this.client.client.on("signal", async (signal: Signal) => {
      if (!(SignalType.App in signal)) return;

      console.log("Got App Signal:", signal);

      const payload: RelaySignal = signal[SignalType.App].payload as RelaySignal;

      if (payload.type == "Message") {
        const conversation = this.getConversation(
          encodeHashToBase64(signal[SignalType.App].cell_id[0]),
        );

        const from: AgentPubKey = payload.from;
        const message: Message = {
          hash: encodeHashToBase64(payload.action.hashed.hash),
          authorKey: encodeHashToBase64(from),
          content: payload.message.content,
          bucket: payload.message.bucket,
          images: payload.message.images.map(
            (i: any) =>
              ({ ...(mapKeys(i, (v, k) => camelCase(k)) as Image), status: "loading" }) as Image,
          ), // convert snake_case to camelCase
          status: "confirmed",
          timestamp: new Date(payload.action.hashed.content.timestamp / 1000),
        };

        if (conversation && message.authorKey !== myPubKeyB64) {
          const sender = conversation
            .getAllMembers()
            .find((m) => m.publicKeyB64 == message.authorKey);
          conversation.addMessage(message);
          if (!get(conversation).archived) {
            const msgShort =
              message.content.length > 125 ? message.content.slice(0, 50) + "..." : message.content;
            if (isMobile()) {
              enqueueNotification(
                `${sender ? sender.profile.nickname : message.authorKey}: ${msgShort}`,
                message.content,
              );
            } else {
              enqueueNotification(
                `Message from ${sender ? sender.profile.nickname : message.authorKey}`,
                message.content,
              );
            }
            conversation.loadImagesForMessage(message); // async load images
          }
        }
      }
    });
  }

  async _addConversation(cellInfo: ClonedCell): Promise<ConversationStore> {
    const config = await this.client.getConfig(cellInfo.cell_id);

    const properties: Properties = decode(cellInfo.dna_modifiers.properties) as Properties;
    const newConversation = createConversationStore(
      this,
      cellInfo.dna_modifiers.network_seed,
      cellInfo.cell_id,
      config,
      properties.created,
      properties.privacy,
      decodeHashFromBase64(properties.progenitor),
    );
    this.conversations = [...this.conversations, newConversation];
    await newConversation.initialize();

    return newConversation;
  }

  async createConversation(
    title: string,
    image: string,
    privacy: Privacy,
    initialContacts: AgentPubKeyB64[] = [],
  ): Promise<ConversationStore> {
    const cellInfo = await this.client.createConversation(title, image, privacy);
    const conversationStore = await this._addConversation(cellInfo);
    conversationStore.addContacts(initialContacts);

    return conversationStore;
  }

  async joinConversation(invitation: Invitation): Promise<ConversationStore> {
    const cellInfo = await this.client.joinConversation(invitation);
    return this._addConversation(cellInfo);
  }

  getConversation(dnaHashB64: DnaHashB64): ConversationStore | undefined {
    return this.conversations.find((c) => get(c).conversation.dnaHashB64 === dnaHashB64);
  }

  /***** Contacts ******/
  async fetchAllContacts() {
    const contactRecords = await this.client.getAllContacts();
    this.contacts = contactRecords.map((contactRecord: any) => {
      return createContactStore(
        this,
        contactRecord.contact,
        contactRecord.original_action,
        contactRecord.signed_action.hashed.hash,
      );
    });
  }

  async createContact(contact: Contact) {
    const contactResult = await this.client.createContact(contact);
    const contactPubKeyB64 = encodeHashToBase64(contact.public_key);

    if (contactResult) {
      // Immediately add a conversation with the new contact, unless you already have one with them
      let conversation = this.conversations.find(
        (c) =>
          get(c).conversation.privacy === Privacy.Private &&
          c.getAllMembers().every((m) => m.publicKeyB64 === contactPubKeyB64),
      );
      if (!conversation) {
        conversation = await this.createConversation(
          makeFullName(contact.first_name, contact.last_name),
          "",
          Privacy.Private,
          [contactPubKeyB64],
        );
      }
      const contactStore = createContactStore(
        this,
        contact,
        contactResult.signed_action.hashed.hash,
        contactResult.signed_action.hashed.hash,
        conversation ? get(conversation).conversation.dnaHashB64 : undefined,
      );
      this.contacts = [...this.contacts, contactStore];
      return contactStore;
    }
  }

  async updateContact(input: UpdateContactInput) {
    if (!this.client) return false;
    const contactResult = await this.client.updateContact(input);
    const contactPubKeyB64 = encodeHashToBase64(input.updated_contact.public_key);

    if (contactResult) {
      const contactStore = createContactStore(
        this,
        input.updated_contact,
        input.original_contact_hash,
        input.previous_contact_hash,
        input.updated_contact.avatar,
      );
      this.contacts = [
        ...this.contacts.filter((c) => get(c).publicKeyB64 !== contactPubKeyB64),
        contactStore,
      ];
      return contactStore;
    }
    return false;
  }

  getContact(publicKey: AgentPubKeyB64): ContactStore | undefined {
    return this.contacts.find((c) => get(c).publicKeyB64 === publicKey);
  }
}
