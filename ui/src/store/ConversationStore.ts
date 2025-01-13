import { decode, encode } from "@msgpack/msgpack";
import {
  decodeHashFromBase64,
  type AgentPubKeyB64,
  type ClonedCell,
} from "@holochain/client";
import {
  Privacy,
  type CellIdB64,
  type Config,
  type ConversationExtended,
  type CreateConversationInput,
  type Invitation,
  type RelayDnaProperties,
} from "$lib/types";
import { decodeCellIdFromBase64, encodeCellIdToBase64 } from "$lib/utils";
import type { RelayClient } from "./RelayClient";
import {
  createGenericKeyValueStore,
  deriveGenericValueStore,
  type GenericKeyValueStore,
  type GenericValueStore,
} from "./generic/GenericKeyValueStore";
import { get } from "svelte/store";
import { persisted } from "./generic/GenericPersistedStore";
import { Base64 } from "js-base64";
import { BUCKET_RANGE_MS } from "$config";

export interface ConversationStore
  extends GenericKeyValueStore<ConversationExtended> {
  initialize: () => Promise<void>;
  loadConfig: (key: CellIdB64) => Promise<void>;
  create: (input: CreateConversationInput) => Promise<CellIdB64>;
  join(input: Invitation): Promise<CellIdB64>;
  updateConfig: (key: CellIdB64, val: Config) => Promise<void>;
  enable: (key: CellIdB64) => Promise<void>;
  disable: (key: CellIdB64) => Promise<void>;
  updateUnread: (key: CellIdB64, val: boolean) => Promise<void>;
  makePrivateInviteCode: (
    key: CellIdB64,
    agentPubKeyB64: AgentPubKeyB64,
    title: string
  ) => Promise<string>;
  getBucket: (key1: CellIdB64, timestamp: number) => number;
}

export function createConversationStore(
  client: RelayClient
): ConversationStore {
  const conversations = createGenericKeyValueStore<ConversationExtended>();

  // Unread is persisted to localstorage as it is never stored via holochain
  const unread = persisted<{ [cellIdB64: CellIdB64]: boolean }>(
    "CONVERSATION.UNREAD",
    {}
  );

  async function initialize(): Promise<void> {
    const cellInfos = await client.getRelayClonedCellInfos();

    // Initialize conversations
    const conversationsData = Object.fromEntries(
      (
        await Promise.allSettled(
          cellInfos.map(async (cellInfo) => {
            // Return [cellIdB64, ConversationExtended]
            return [
              encodeCellIdToBase64(cellInfo.cell_id),
              await _makeConversationExtended(cellInfo),
            ];
          })
        )
      )
        .filter((p) => p.status === "fulfilled")
        .map((p) => p.value)
    );
    conversations.set(conversationsData);
  }

  async function create(input: CreateConversationInput): Promise<CellIdB64> {
    const cellInfo = await client.createConversation(input);
    await client.setConfig(cellInfo.cell_id, input.config);
    await client.setMyProfileForConversation(cellInfo.cell_id);

    const conversationExtended = await _makeConversationExtended(cellInfo);
    const cellIdB64 = encodeCellIdToBase64(cellInfo.cell_id);
    conversations.update((c) => ({
      ...c,
      [cellIdB64]: conversationExtended,
    }));

    return cellIdB64;
  }

  async function join(input: Invitation): Promise<CellIdB64> {
    const cellInfo = await client.joinConversation(input);
    await client.setMyProfileForConversation(cellInfo.cell_id);

    const conversationExtended = await _makeConversationExtended(cellInfo);
    const cellIdB64 = encodeCellIdToBase64(cellInfo.cell_id);
    conversations.update((c) => ({
      ...c,
      [cellIdB64]: conversationExtended,
    }));

    return cellIdB64;
  }

  async function enable(key: CellIdB64): Promise<void> {
    await client.enableConversationCell(decodeCellIdFromBase64(key));
    await initialize();
  }

  async function disable(key: CellIdB64): Promise<void> {
    await client.disableConversationCell(decodeCellIdFromBase64(key));
    conversations.update((c) => ({
      ...c,
      [key]: {
        ...c[key],
        cellInfo: {
          ...c[key].cellInfo,
          enabled: false,
        },
      },
    }));
  }

  async function loadConfig(key: CellIdB64): Promise<void> {
    const cellInfos = await client.getRelayClonedCellInfos();
    const cellInfo = cellInfos.find(
      (c) => encodeCellIdToBase64(c.cell_id) === key
    );
    if (cellInfo === undefined)
      throw new Error(`Failed to get cellInfo for cellIdB64 ${key}`);

    const conversationExtended = await _makeConversationExtended(cellInfo);
    conversations.update((c) => ({
      ...c,
      [key]: conversationExtended,
    }));
  }

  async function updateConfig(key: CellIdB64, val: Config): Promise<void> {
    await client.setConfig(decodeCellIdFromBase64(key), val);
    conversations.update((c) => ({
      ...c,
      [key]: {
        ...c[key],
        config: val,
      },
    }));
  }

  async function updateUnread(key: CellIdB64, val: boolean): Promise<void> {
    unread.update((c) => ({
      ...c,
      [key]: val,
    }));
    conversations.update((c) => ({
      ...c,
      [key]: {
        ...c[key],
        unread: val,
      },
    }));
  }

  async function makePrivateInviteCode(
    key: CellIdB64,
    agentPubKeyB64: AgentPubKeyB64,
    title: string
  ) {
    const c = get(conversations).data[key];
    if (!c) throw new Error(`Conversation not found with cellIdB64 ${key}`);
    if (c.dnaProperties.privacy === Privacy.Public)
      throw new Error(
        "Private invitation codes are only for private conversations"
      );

    const membraneProof = await client.generateMembraneProof(
      decodeCellIdFromBase64(key),
      decodeHashFromBase64(agentPubKeyB64)
    );

    const invitation: Invitation = {
      created: c.dnaProperties.created,
      progenitor: decodeHashFromBase64(c.dnaProperties.progenitor),
      privacy: c.dnaProperties.privacy,
      proof: membraneProof,
      networkSeed: c.cellInfo.dna_modifiers.network_seed,
      title,
    };
    return Base64.fromUint8Array(encode(invitation));
  }

  function getBucket(key1: CellIdB64, timestamp: number): number {
    const c = get(conversations).data[key1];
    if (!c)
      throw new Error(`Failed to get conversation with CellIdB64 ${key1}`);

    return Math.round((timestamp - c.dnaProperties.created) / BUCKET_RANGE_MS);
  }

  async function _makeConversationExtended(
    cellInfo: ClonedCell
  ): Promise<ConversationExtended> {
    const key = encodeCellIdToBase64(cellInfo.cell_id);
    const dnaProperties = decode(
      cellInfo.dna_modifiers.properties
    ) as RelayDnaProperties;
    const config = cellInfo.enabled
      ? await client.getConfig(cellInfo.cell_id)
      : undefined;

    // Generate a public invite code
    // If the conversation is Private, this is undefined
    let publicInviteCode;
    if (dnaProperties.privacy === Privacy.Public) {
      const invitation: Invitation = {
        created: dnaProperties.created,
        networkSeed: cellInfo.dna_modifiers.network_seed,
        privacy: dnaProperties.privacy,
        progenitor: decodeHashFromBase64(dnaProperties.progenitor),
        title: config ? config.title : cellInfo.name,
      };
      publicInviteCode = Base64.fromUint8Array(encode(invitation));
    }

    return {
      cellInfo,
      dnaProperties,
      config,
      publicInviteCode,

      // persisted fields
      unread: get(unread)[key] || false,
    };
  }

  return {
    ...conversations,
    initialize,
    create,
    join,
    enable,
    disable,
    loadConfig,
    updateConfig,
    updateUnread,
    makePrivateInviteCode,
    getBucket,
  };
}

export interface CellConversationStore
  extends GenericValueStore<ConversationExtended> {
  loadConfig: () => Promise<void>;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  updateConfig: (val: Config) => Promise<void>;
  updateUnread: (val: boolean) => Promise<void>;
  makePrivateInviteCode: (a: AgentPubKeyB64, title: string) => Promise<string>;
  getBucket: (timestamp: number) => number;
}

export function deriveCellConversationStore(
  conversationStore: ConversationStore,
  key: CellIdB64
): CellConversationStore {
  const data = deriveGenericValueStore(conversationStore, key);

  return {
    ...data,
    enable: () => conversationStore.enable(key),
    disable: () => conversationStore.disable(key),
    loadConfig: () => conversationStore.loadConfig(key),
    updateConfig: (val: Config) => conversationStore.updateConfig(key, val),
    updateUnread: (val: boolean) => conversationStore.updateUnread(key, val),
    makePrivateInviteCode: (a: AgentPubKeyB64, title: string) =>
      conversationStore.makePrivateInviteCode(key, a, title),
    getBucket: (timestamp: number) =>
      conversationStore.getBucket(key, timestamp),
  };
}
