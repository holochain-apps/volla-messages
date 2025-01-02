import { decode } from "@msgpack/msgpack";
import { camelCase, mapKeys } from "lodash-es";
import { derived, get } from "svelte/store";
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
import {
  type Contact,
  type Image,
  type Invitation,
  type Message,
  type DnaProperties,
  type RelaySignal,
  type FileStatus,
  Privacy,
  type UpdateContactInput,
} from "$lib/types";
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
              ({
                ...(mapKeys(i, (v, k) => camelCase(k)) as Image),
                status: FileStatus.Loading,
              }) as Image,
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

  async _addConversation(
    cellInfo: ClonedCell,
    invitationTitle: string | undefined = undefined,
  ): Promise<ConversationStore> {
    const properties: DnaProperties = decode(cellInfo.dna_modifiers.properties) as DnaProperties;
    const newConversation = createConversationStore(
      this,
      cellInfo.dna_modifiers.network_seed,
      cellInfo.cell_id,
      properties.created,
      properties.privacy,
      decodeHashFromBase64(properties.progenitor),
      invitationTitle,
    );
    await newConversation.initialize();
    this.conversations = [...this.conversations, newConversation];

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
    return this._addConversation(cellInfo, invitation.title);
  }

  getConversation(dnaHashB64: DnaHashB64): ConversationStore | undefined {
    console.log("conversations", this.conversations);
    return this.conversations.find((c) => get(c).conversation.dnaHashB64 === dnaHashB64);
  }
}
