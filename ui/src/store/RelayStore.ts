import { decode } from "@msgpack/msgpack";
import { camelCase, mapKeys } from "lodash-es";
import { derived, get, type Readable } from "svelte/store";
import {
  type AgentPubKey,
  type AgentPubKeyB64,
  decodeHashFromBase64,
  encodeHashToBase64,
  type AppSignal,
  type DnaHashB64,
} from "@holochain/client";
import { type ContactStore, createContactStore } from "./ContactStore";
import {
  type ConversationStore,
  createConversationStore,
} from "./ConversationStore";
import { RelayClient } from "$store/RelayClient";
import type {
  Contact,
  Image,
  ConversationCellAndConfig,
  Invitation,
  Message,
  Properties,
  RelaySignal,
} from "../types";
import { Privacy } from "../types";
import { enqueueNotification, isMobile, makeFullName } from "$lib/utils";

export class RelayStore {
  public contacts: ContactStore[] = [];
  public conversations: ConversationStore[] = [];
  public archivedConversations = derived(this.conversations, ($conversations) =>
    $conversations.filter((c) => c.archived)
  );
  public activeConversations = derived(this.conversations, ($conversations) =>
    $conversations.filter((c) => !c.archived)
  );

  constructor(public client: RelayClient) {}

  async initialize() {
    await this.client.initConversations();

    for (const conversation of Object.values(this.client.conversations)) {
      await this._addConversation(conversation);
    }

    await this.fetchAllContacts();

    const myPubKeyB64 = encodeHashToBase64(this.client.client.myPubKey);

    this.client.client.on("signal", async (signal: Signal) => {
      if (!(SignalType.App in signal)) return;

      const payload: RelaySignal = signal.payload as RelaySignal;

      if (payload.type == "Message") {
        const conversation = this.getConversation(
          encodeHashToBase64(signal[SignalType.App].cell_id[0])
        );

        const from: AgentPubKey = payload.from;
        const message: Message = {
          hash: encodeHashToBase64(payload.action.hashed.hash),
          authorKey: encodeHashToBase64(from),
          content: payload.message.content,
          bucket: payload.message.bucket,
          images: payload.message.images.map(
            (i: any) =>
              ({
                ...(mapKeys(i, (v, k) => camelCase(k)) as Image),
                status: "loading",
              }) as Image
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
              message.content.length > 125
                ? message.content.slice(0, 50) + "..."
                : message.content;
            if (isMobile()) {
              enqueueNotification(
                `${sender ? makeFullName(sender.firstName, sender.lastName) : message.authorKey}: ${msgShort}`,
                message.content
              );
            } else {
              enqueueNotification(
                `Message from ${sender ? makeFullName(sender.firstName, sender.lastName) : message.authorKey}`,
                message.content
              );
            }
            conversation.loadImagesForMessage(message); // async load images
          }
        }
      }
    });
  }

  async _addConversation(convoCellAndConfig: ConversationCellAndConfig) {
    if (!this.client) return;
    const properties: Properties = decode(
      convoCellAndConfig.cell.dna_modifiers.properties
    ) as Properties;
    const progenitor = decodeHashFromBase64(properties.progenitor);
    const privacy = properties.privacy;
    const newConversation = createConversationStore(
      this,
      convoCellAndConfig.cell.dna_modifiers.network_seed,
      convoCellAndConfig.cell.cell_id,
      convoCellAndConfig.config,
      properties.created,
      privacy,
      progenitor
    );

    this.conversations = [...this.conversations, newConversation];

    await newConversation.initialize();
    return newConversation;
  }

  async createConversation(
    title: string,
    image: string,
    privacy: Privacy,
    initialContacts: AgentPubKeyB64[] = []
  ) {
    if (!this.client) return null;
    const convoCellAndConfig = await this.client.createConversation(
      title,
      image,
      privacy
    );
    if (convoCellAndConfig) {
      const conversationStore = await this._addConversation(convoCellAndConfig);
      if (conversationStore) {
        if (initialContacts.length > 0) {
          conversationStore.addContacts(initialContacts);
        }
        return conversationStore;
      }
    }
    return null;
  }

  async joinConversation(invitation: Invitation) {
    if (!this.client) return null;
    const convoCellAndConfig = await this.client.joinConversation(invitation);
    if (convoCellAndConfig) {
      return await this._addConversation(convoCellAndConfig);
    }
    return null;
  }

  async inviteAgentToConversation(
    dnaHashB64: DnaHashB64,
    agent: AgentPubKey,
    role: number = 0
  ) {
    if (!this.client) return;
    return await this.client.inviteAgentToConversation(dnaHashB64, agent, role);
  }

  getConversation(dnaHashB64: DnaHashB64): ConversationStore | undefined {
    return this.conversations.find(
      (c) => get(c).conversation.dnaHashB64 === dnaHashB64
    );
  }

  /***** Contacts ******/
  async fetchAllContacts() {
    const contactRecords = await this.client.getAllContacts();
    this.contacts = contactRecords.map((contactRecord: any) => {
      const contact = contactRecord.contact;
      return createContactStore(
        this,
        contact.avatar,
        contactRecord.signed_action.hashed.hash,
        contact.first_name,
        contact.last_name,
        contactRecord.original_action,
        encodeHashToBase64(contact.public_key)
      );
    });
  }

  async createContact(contact: Contact) {
    if (!this.client) return false;
    // TODO: if adding contact fails we should remove it from the store
    const contactResult = await this.client.createContact(contact);
    if (contactResult) {
      // Immediately add a conversation with the new contact, unless you already have one with them
      let conversation =
        this.conversations.find(
          (c) =>
            get(c).conversation.privacy === Privacy.Private &&
            c
              .getAllMembers()
              .every((m) => m.publicKeyB64 === contact.publicKeyB64)
        ) || null;
      if (!conversation) {
        conversation = await this.createConversation(
          makeFullName(contact.firstName, contact.lastName),
          "",
          Privacy.Private,
          [contact.publicKeyB64]
        );
      }
      const contactStore = createContactStore(
        this,
        contact.avatar,
        contactResult.signed_action.hashed.hash,
        contact.firstName,
        contact.lastName,
        contactResult.signed_action.hashed.hash,
        contact.publicKeyB64,
        conversation ? get(conversation).conversation.dnaHashB64 : undefined
      );
      this.contacts = [...this.contacts, contactStore];
      return contactStore;
    }
  }

  async updateContact(contact: Contact) {
    if (!this.client) return false;
    const contactResult = await this.client.updateContact(contact);
    if (contactResult) {
      const contactStore = createContactStore(
        this,
        contact.avatar,
        contactResult.signed_action.hashed.hash,
        contact.firstName,
        contact.lastName,
        contact.originalActionHash,
        contact.publicKeyB64
      );
      this.contacts = [
        ...this.contacts.filter(
          (c) => get(c).publicKeyB64 !== contact.publicKeyB64
        ),
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
