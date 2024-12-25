import { decode } from "@msgpack/msgpack";
import { isEqual, camelCase, mapKeys } from "lodash-es";
import { writable, get, type Writable } from "svelte/store";
import {
  type AgentPubKey,
  type AgentPubKeyB64,
  type DnaHash,
  decodeHashFromBase64,
  encodeHashToBase64,
  type AppSignal,
  type DnaHashB64,
} from "@holochain/client";
import { ContactStore } from "./ContactStore";
import { ConversationStore } from "./ConversationStore";
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
import { enqueueNotification, isMobile } from "$lib/utils";

export class RelayStore {
  public contacts: Writable<ContactStore[]>;
  public conversations: Writable<ConversationStore[]>;

  constructor(public client: RelayClient) {
    this.contacts = writable([]);
    this.conversations = writable([]);
  }

  get contactData() {
    return get(this.contacts);
  }

  get conversationsData() {
    return get(this.conversations);
  }

  async initialize() {
    await this.client.initConversations();

    for (const conversation of Object.values(this.client.conversations)) {
      await this._addConversation(conversation);
    }

    await this.fetchAllContacts();

    this.client.client.on("signal", async (signal: AppSignal) => {
      console.log("Got Signal:", signal);

      const payload: RelaySignal = signal.payload as RelaySignal;

      if (payload.type == "Message") {
        const conversation = this.getConversationByCellDnaHash(
          signal.cell_id[0]
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

        if (conversation && message.authorKey !== this.client.myPubKeyB64) {
          const sender = conversation.allMembers.find(
            (m) => m.publicKeyB64 == message.authorKey
          );
          conversation.addMessage(message);
          if (!conversation.archived) {
            const msgShort =
              message.content.length > 125
                ? message.content.slice(0, 50) + "..."
                : message.content;
            if (isMobile()) {
              enqueueNotification(
                `${sender ? sender.firstName + " " + sender.lastName : message.authorKey}: ${msgShort}`,
                message.content
              );
            } else {
              enqueueNotification(
                `Message from ${sender ? sender.firstName + " " + sender.lastName : message.authorKey}`,
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
    const newConversation = new ConversationStore(
      this,
      convoCellAndConfig.cell.dna_modifiers.network_seed,
      convoCellAndConfig.cell.cell_id,
      convoCellAndConfig.config,
      properties.created,
      privacy,
      progenitor
    );

    const unsub = newConversation.lastMessage.subscribe(() => {
      // Trigger update to conversations store whenever lastMessage changes
      this.conversations.update((convs) => {
        return [...convs]; // Force reactivity by returning a new array reference
      });
    });

    const unsub2 = newConversation.localDataStore.subscribe(() => {
      // Trigger update to conversations store whenever localDataStore changes
      this.conversations.update((convs) => {
        return [...convs]; // Force reactivity by returning a new array reference
      });
    });

    this.conversations.update((conversations) => [
      ...conversations,
      newConversation,
    ]);

    await newConversation.initialize();
    return newConversation;
  }

  async createConversation(
    title: string,
    image: string,
    privacy: Privacy,
    initialContacts: Contact[] = []
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
    let foundConversation;
    this.conversations.subscribe((conversations) => {
      foundConversation = conversations.find(
        (conversation) => conversation.data.dnaHashB64 === dnaHashB64
      );
    })();

    return foundConversation;
  }

  getConversationByCellDnaHash(
    cellDnaHash: DnaHash
  ): ConversationStore | undefined {
    let foundConversation;
    this.conversations.subscribe((conversations) => {
      foundConversation = conversations.find((conversation) =>
        isEqual(conversation.data.cellId[0], cellDnaHash)
      );
    })();

    return foundConversation;
  }

  /***** Contacts ******/
  async fetchAllContacts() {
    const contactRecords = await this.client.getAllContacts();
    this.contacts.set(
      contactRecords.map((contactRecord: any) => {
        const contact = contactRecord.contact;
        return new ContactStore(
          this,
          contact.avatar,
          contactRecord.signed_action.hashed.hash,
          contact.first_name,
          contact.last_name,
          contactRecord.original_action,
          encodeHashToBase64(contact.public_key)
        );
      })
    );
  }

  async createContact(contact: Contact) {
    if (!this.client) return false;
    // TODO: if adding contact fails we should remove it from the store
    const contactResult = await this.client.createContact(contact);
    if (contactResult) {
      // Immediately add a conversation with the new contact, unless you already have one with them
      let conversation =
        this.conversationsData.find(
          (c) =>
            c.privacy === Privacy.Private &&
            c.allMembers.every((m) => m.publicKeyB64 === contact.publicKeyB64)
        ) || null;
      if (!conversation) {
        conversation = await this.createConversation(
          contact.firstName + " " + contact.lastName,
          "",
          Privacy.Private,
          [contact]
        );
      }
      const contactStore = new ContactStore(
        this,
        contact.avatar,
        contactResult.signed_action.hashed.hash,
        contact.firstName,
        contact.lastName,
        contactResult.signed_action.hashed.hash,
        contact.publicKeyB64,
        conversation?.data.dnaHashB64
      );
      this.contacts.update((contacts) => [...contacts, contactStore]);
      return contactStore;
    }
  }

  async updateContact(contact: Contact) {
    if (!this.client) return false;
    const contactResult = await this.client.updateContact(contact);
    if (contactResult) {
      const contactStore = new ContactStore(
        this,
        contact.avatar,
        contactResult.signed_action.hashed.hash,
        contact.firstName,
        contact.lastName,
        contact.originalActionHash,
        contact.publicKeyB64
      );
      this.contacts.update((contacts) => [
        ...contacts.filter((c) => c.publicKeyB64 !== contact.publicKeyB64),
        contactStore,
      ]);
      return contactStore;
    }
    return false;
  }

  getContact(publicKey: AgentPubKeyB64): ContactStore | undefined {
    let foundContact;
    this.contacts.subscribe((contacts) => {
      foundContact = contacts.find(
        (contact) => contact.data.publicKeyB64 === publicKey
      );
    })();

    return foundContact;
  }
}
