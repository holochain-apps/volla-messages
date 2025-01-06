import { decode, encode } from "@msgpack/msgpack";
import {
  decodeHashFromBase64,
  encodeHashToBase64,
  type AgentPubKeyB64,
  type CellId,
  type ClonedCell,
} from "@holochain/client";
import {
  FileStatus,
  Privacy,
  type CellIdB64,
  type Config,
  type ConversationExtended,
  type CreateConversationInput,
  type Invitation,
  type LocalFile,
  type Message,
  type MessageExtended,
  type MessageFile,
  type MessageFileExtended,
  type MessageRecord,
  type MessageSignal,
  type ProfileExtended,
  type RelayDnaProperties,
} from "$lib/types";
import {
  decodeCellIdFromBase64,
  encodeCellIdToBase64,
  enqueueNotification,
  fileToDataUrl,
} from "$lib/utils";
import type { RelayClient } from "./RelayClient";
import { createGenericKeyValueStore, type GenericKeyValueStoreData } from "./GenericKeyValueStore";
import type { Subscriber, Invalidator, Unsubscriber } from "svelte/motion";
import { derived, get } from "svelte/store";
import { persisted } from "./GenericPersistedStore";
import { Base64 } from "js-base64";
import {
  createGenericKeyKeyValueStore,
  type GenericKeyKeyValueStoreData,
} from "./GenericKeyKeyValueStore";
import { FileStorageClient } from "@holochain-open-dev/file-storage";
import { EntryRecord } from "@holochain-open-dev/utils";
import pRetry from "p-retry";
import { BUCKET_RANGE_MS } from "$config";
import { difference, sortBy } from "lodash-es";
import {
  deriveCellMergedProfileContactStore,
  type MergedProfileContactStore,
} from "./MergedProfileContactStore";

export interface ConversationStore {
  initialize: () => Promise<void>;
  loadConfig: (key: CellIdB64) => Promise<void>;
  create: (input: CreateConversationInput) => Promise<CellIdB64>;
  join(input: Invitation): Promise<CellIdB64>;
  updateConfig: (key: CellIdB64, val: Config) => Promise<void>;
  enable: (key: CellIdB64) => Promise<void>;
  disable: (key: CellIdB64) => Promise<void>;
  updateUnread: (key: CellIdB64, val: boolean) => Promise<void>;
  invite: (key: CellIdB64, agents: AgentPubKeyB64[]) => Promise<void>;
  makePrivateInviteCode: (key: CellIdB64, agentPubKeyB64: AgentPubKeyB64) => Promise<string>;
  sendMessage: (key1: CellIdB64, content: string, files: LocalFile[]) => Promise<void>;
  loadMessagesInBucket: (key1: CellIdB64, bucket: number) => Promise<void>;
  getBucket: (key1: CellIdB64, timestamp: number) => number;
  handleMessageSignalReceived: (key1: CellIdB64, signal: MessageSignal) => Promise<void>;
  subscribe: (
    this: void,
    run: Subscriber<{
      conversations: GenericKeyValueStoreData<ConversationExtended>;
      messages: GenericKeyKeyValueStoreData<MessageExtended>;
      latestMessage: GenericKeyValueStoreData<MessageExtended | undefined>;
    }>,
    invalidate?:
      | Invalidator<{
          conversations: GenericKeyValueStoreData<ConversationExtended>;
          messages: GenericKeyKeyValueStoreData<MessageExtended>;
          latestMessage: GenericKeyValueStoreData<MessageExtended | undefined>;
        }>
      | undefined,
  ) => Unsubscriber;
}

export function createConversationStore(
  client: RelayClient,
  mergedProfileContactStore: MergedProfileContactStore,
): ConversationStore {
  const conversations = createGenericKeyValueStore<ConversationExtended>();
  const messages = createGenericKeyKeyValueStore<MessageExtended>();

  const unread = persisted<{ [cellIdB64: CellIdB64]: boolean }>("CONVERSATION.UNREAD", {});
  const invited = persisted<{ [cellIdB64: CellIdB64]: AgentPubKeyB64[] }>(
    "CONVERSATION.INVITED",
    {},
  );
  const title = persisted<{ [cellIdB64: CellIdB64]: string }>("CONVERSATION.TITLE", {});

  const { subscribe } = derived([conversations, messages], ([$conversations, $messages]) => ({
    conversations: $conversations,
    messages: $messages,
    latestMessage: Object.fromEntries(
      Object.entries($messages).map(([cellIdB64, cellMessages]) => [
        cellIdB64,
        sortBy(cellMessages, [(m) => -m.timestamp])[0],
      ]),
    ),
  }));

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
          }),
        )
      )
        .filter((p) => p.status === "fulfilled")
        .map((p) => p.value),
    );
    conversations.set(conversationsData);

    // Initialize messages
    const messagesData = Object.fromEntries(
      (
        await Promise.allSettled(
          cellInfos.map(async (cellInfo) => {
            // Return [cellIdB64, {}]
            return [encodeCellIdToBase64(cellInfo.cell_id), {}];
          }),
        )
      )
        .filter((p) => p.status === "fulfilled")
        .map((p) => p.value),
    );
    messages.set(messagesData);

    // Load first bucket of messages
    await Promise.allSettled(
      cellInfos.map(async (cellInfo) =>
        loadMessagesInBucket(
          encodeCellIdToBase64(cellInfo.cell_id),
          getBucket(encodeCellIdToBase64(cellInfo.cell_id), new Date().getTime()),
        ),
      ),
    );
  }

  async function loadConfig(key: CellIdB64): Promise<void> {
    const cellInfos = await client.getRelayClonedCellInfos();
    const cellInfo = cellInfos.find((c) => encodeCellIdToBase64(c.cell_id) === key);
    if (cellInfo === undefined) throw new Error(`Failed to get cellInfo for cellIdB64 ${key}`);

    const conversationExtended = await _makeConversationExtended(cellInfo);
    conversations.update((c) => ({
      ...c,
      [key]: conversationExtended,
    }));
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
    messages.update((c) => ({
      ...c,
      [cellIdB64]: {},
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
    messages.update((c) => ({
      ...c,
      [cellIdB64]: {},
    }));
    title.update((c) => ({
      ...c,
      [cellIdB64]: input.title,
    }));

    return cellIdB64;
  }

  async function updateConfig(key: CellIdB64, val: Config): Promise<void> {
    await client.setConfig(decodeCellIdFromBase64(key), val);

    title.update((c) => ({
      ...c,
      [key]: val.title,
    }));
    conversations.update((c) => ({
      ...c,
      [key]: {
        ...c[key],
        config: val,
      },
    }));
  }

  async function enable(key: CellIdB64): Promise<void> {
    await client.enableConversationCell(decodeCellIdFromBase64(key));
    conversations.update((c) => ({
      ...c,
      [key]: {
        ...c[key],
        cellInfo: {
          ...c[key].cellInfo,
          enabled: true,
        },
      },
    }));
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

  async function invite(key: CellIdB64, agentPubKeyB64s: AgentPubKeyB64[]): Promise<void> {
    invited.update((c) => ({
      ...c,
      [key]: [...(c[key] || []), ...agentPubKeyB64s],
    }));
    conversations.update((c) => ({
      ...c,
      [key]: {
        ...c[key],
        invited: get(invited)[key],
      },
    }));
  }

  async function makePrivateInviteCode(key: CellIdB64, agentPubKeyB64: AgentPubKeyB64) {
    const c = get(conversations)[key];
    if (c.dnaProperties.privacy === Privacy.Public)
      throw new Error("Private invitation codes are only for private conversations");

    const membraneProof = await client.generateMembraneProof(
      decodeCellIdFromBase64(key),
      decodeHashFromBase64(agentPubKeyB64),
    );

    // TODO The name of the conversation we are inviting to should be our name + # of other people invited
    const invitation: Invitation = {
      created: c.dnaProperties.created,
      progenitor: decodeHashFromBase64(c.dnaProperties.progenitor),
      privacy: c.dnaProperties.privacy,
      proof: membraneProof,
      networkSeed: c.cellInfo.dna_modifiers.network_seed,
      title: c.title,
    };
    return Base64.fromUint8Array(encode(invitation));
  }

  async function sendMessage(key1: CellIdB64, content: string, files: LocalFile[]) {
    const cellId = decodeCellIdFromBase64(key1);
    const fileStorageClient = new FileStorageClient(
      client.client,
      "UNUSED ROLE NAME", // this is not used when cellId is specified, but the FileStorageClient still requires the parameter
      "file_storage",
      cellId,
    );
    const messageFiles = await Promise.all(
      files.map(async (file) => {
        const entryHash = await fileStorageClient.uploadFile(file.file);

        const messageFile: MessageFile = {
          last_modified: file.file.lastModified,
          name: file.file.name,
          size: file.file.size,
          storage_entry_hash: entryHash,
          file_type: file.file.type,
        };
        return messageFile;
      }),
    );

    // Get all AgentPubKeys in the conversation.
    // We know about them only because they have published a Profile.
    const mergedProfileContact = deriveCellMergedProfileContactStore(
      mergedProfileContactStore,
      key1,
    );
    const agentPubKeys = Object.keys(get(mergedProfileContact)).map((a) => decodeHashFromBase64(a));

    // Create Message entry
    const record = await client.createMessage(cellId, {
      message: {
        content,
        bucket: _makeBucket(key1, new Date()),
        images: messageFiles,
      },
      agents: agentPubKeys,
    });

    const message = new EntryRecord<Message>(record).entry;
    if (message === undefined) throw new Error("Failed to decode Message entry from record");

    const messageExtended = await _makeMessageExtended(cellId, {
      message,
      original_action: record.signed_action.hashed.hash,
      signed_action: record.signed_action,
    });
    messages.update((m) => ({
      ...m,
      [key1]: {
        ...(m[key1] || {}),
        [encodeHashToBase64(record.signed_action.hashed.hash)]: messageExtended,
      },
    }));
  }

  async function loadMessagesInBucket(key1: CellIdB64, bucket: number) {
    const m = get(messages)[key1];

    // Fetch message hashes from bucket
    const cellId = decodeCellIdFromBase64(key1);
    const actionHashB64s = (
      await client.getMessageHashes(cellId, {
        bucket,
        count: 0,
      })
    ).map((h) => encodeHashToBase64(h));

    // Determine which messages we are currently missing
    const storedActionHashB64s = Object.keys(m);
    const missingActionHashs = difference(actionHashB64s, storedActionHashB64s).map((h) =>
      decodeHashFromBase64(h),
    );

    // Fetch missing messages
    const messageRecords: Array<MessageRecord> = await client.getMessageEntries(
      cellId,
      missingActionHashs,
    );

    // Transform Messages into MessageExtendeds
    const data = Object.fromEntries(
      (
        await Promise.allSettled(
          messageRecords.map(async (m) => [
            encodeHashToBase64(m.original_action),
            await _makeMessageExtended(cellId, m),
          ]),
        )
      )
        .filter((p) => p.status === "fulfilled")
        .map((p) => p.value),
    );
    if (Object.keys(data).length === 0) return;

    // Update writable
    messages.update((c) => ({
      ...c,
      [key1]: {
        ...(c[key1] || {}),
        ...data,
      },
    }));
  }

  function getBucket(key1: CellIdB64, timestamp: number): number {
    const c = get(conversations)[key1];
    if (!c) throw new Error(`Failed to get conversation with CellIdB64 ${key1}`);

    return Math.round((timestamp - c.dnaProperties.created) / BUCKET_RANGE_MS);
  }

  async function handleMessageSignalReceived(key1: CellIdB64, signal: MessageSignal) {
    // Make MessageExtended
    const messageExtended = await _makeMessageExtended(decodeCellIdFromBase64(key1), {
      message: signal.message,
      original_action: signal.action.hashed.hash,
      signed_action: signal.action,
    });

    // Add to writable
    messages.update((m) => ({
      ...m,
      [key1]: {
        ...(m[key1] || {}),
        [encodeHashToBase64(signal.action.hashed.hash)]: messageExtended,
      },
    }));

    // Get Profile of Message author
    const mergedProfileContact = deriveCellMergedProfileContactStore(
      mergedProfileContactStore,
      key1,
    );
    const fromProfile = get(mergedProfileContact)[encodeHashToBase64(signal.from)];

    // Trigger a system notification
    _triggerMessageNotification(messageExtended, fromProfile);

    // Mark conversation as unread
    updateUnread(key1, true);
  }

  async function _triggerMessageNotification(
    messageExtended: MessageExtended,
    fromProfile?: ProfileExtended,
  ) {
    const content =
      messageExtended.message.content.length > 125
        ? messageExtended.message.content.slice(0, 50) + "..."
        : messageExtended.message.content;
    const title = fromProfile ? `Message From ${fromProfile.profile.nickname}` : `New Message`;

    enqueueNotification(title, content);
  }

  async function _makeConversationExtended(cellInfo: ClonedCell): Promise<ConversationExtended> {
    const dnaProperties = decode(cellInfo.dna_modifiers.properties) as RelayDnaProperties;
    const config = cellInfo.enabled ? await client.getConfig(cellInfo.cell_id) : undefined;

    // Generate a title
    // Get title from config,
    // Else get title from peristed store,
    // Else use placeholder value "..."
    const key = encodeCellIdToBase64(cellInfo.cell_id);
    let titleVal;
    if (config) {
      titleVal = config.title;
    } else if (get(title)[key]) {
      titleVal = get(title)[key];
    } else {
      titleVal = "...";
    }

    // Generate a public invite code
    // If the conversation is Private, this is undefined
    let publicInviteCode;
    if (dnaProperties.privacy === Privacy.Public) {
      const invitation: Invitation = {
        created: dnaProperties.created,
        networkSeed: cellInfo.dna_modifiers.network_seed,
        privacy: dnaProperties.privacy,
        progenitor: decodeHashFromBase64(dnaProperties.progenitor),
        title: titleVal,
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
      invited: get(invited)[key] || [],
      title: titleVal,
    };
  }

  async function _makeMessageExtended(
    cellId: CellId,
    messageRecord: MessageRecord,
  ): Promise<MessageExtended> {
    if (messageRecord.message === undefined)
      throw new Error("MessageRecord does not include message entry");

    const fileStorageClient = new FileStorageClient(
      client.client,
      "UNUSED ROLE NAME", // this is not used when cellId is specified, but the FileStorageClient still requires the parameter
      "file_storage",
      cellId,
    );
    const messageFileExtendeds = await Promise.all(
      messageRecord.message.images.map(async (i) => _loadMessageFile(fileStorageClient, i)),
    );

    return {
      message: messageRecord.message,
      messageFileExtendeds,
      authorAgentPubKeyB64: encodeHashToBase64(messageRecord.signed_action.hashed.content.author),
      timestamp: messageRecord.signed_action.hashed.content.timestamp,
    };
  }

  async function _loadMessageFile(
    fileStorageClient: FileStorageClient,
    messageFile: MessageFile,
  ): Promise<MessageFileExtended> {
    try {
      // Download image file, retrying up to 10 times if download fails
      const file = await pRetry(
        () => fileStorageClient.downloadFile(messageFile.storage_entry_hash),
        {
          retries: 10,
          minTimeout: 1000,
          factor: 2,
          onFailedAttempt: (e) => {
            console.error(
              `Failed to download file from hash ${encodeHashToBase64(messageFile.storage_entry_hash)}`,
              e,
            );
          },
        },
      );

      // Convert image blob to data url
      const dataURL = await fileToDataUrl(file);

      return { messageFile, status: FileStatus.Loaded, dataURL };
    } catch (e) {
      return { messageFile, status: FileStatus.Error, dataURL: undefined };
    }
  }

  function _makeBucket(key1: CellIdB64, date: Date) {
    const c = get(conversations)[key1];
    if (!c) throw new Error(`Conversation not found with CellIdB64 ${key1}`);

    const diff = date.getTime() - c.dnaProperties.created;
    return Math.round(diff / BUCKET_RANGE_MS);
  }

  return {
    initialize,
    loadConfig,

    create,
    join,
    updateConfig,
    enable,
    disable,
    updateUnread,
    invite,
    makePrivateInviteCode,

    sendMessage,
    loadMessagesInBucket,
    getBucket,
    handleMessageSignalReceived,

    subscribe,
  };
}

export interface CellConversationStore {
  loadConfig: () => Promise<void>;
  updateConfig: (val: Config) => Promise<void>;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  updateUnread: (val: boolean) => Promise<void>;
  invite: (a: AgentPubKeyB64[]) => Promise<void>;
  makePrivateInviteCode: (a: AgentPubKeyB64) => Promise<string>;
  sendMessage: (content: string, files: LocalFile[]) => Promise<void>;
  loadMessagesInBucket: (bucket: number) => Promise<void>;
  getBucket: (timestamp: number) => number;
  handleMessageSignalReceived: (signal: MessageSignal) => Promise<void>;
  subscribe: (
    this: void,
    run: Subscriber<{
      conversation: ConversationExtended;
      messages: GenericKeyValueStoreData<MessageExtended>;
      latestMessage?: MessageExtended;
    }>,
    invalidate?:
      | Invalidator<{
          conversation: ConversationExtended;
          messages: GenericKeyValueStoreData<MessageExtended>;
          latestMessage?: MessageExtended;
        }>
      | undefined,
  ) => Unsubscriber;
}

export function deriveCellConversationStore(
  conversationStore: ConversationStore,
  key: CellIdB64,
): CellConversationStore {
  const { subscribe } = derived(conversationStore, ($conversationStore) => ({
    conversation: $conversationStore.conversations[key],
    messages: $conversationStore.messages[key],
    latestMessage: $conversationStore.latestMessage[key],
  }));

  return {
    loadConfig: () => conversationStore.loadConfig(key),
    updateConfig: (val: Config) => conversationStore.updateConfig(key, val),
    enable: () => conversationStore.enable(key),
    disable: () => conversationStore.disable(key),
    updateUnread: (val: boolean) => conversationStore.updateUnread(key, val),
    invite: (a: AgentPubKeyB64[]) => conversationStore.invite(key, a),
    makePrivateInviteCode: (a: AgentPubKeyB64) => conversationStore.makePrivateInviteCode(key, a),
    sendMessage: (content: string, files: LocalFile[]) =>
      conversationStore.sendMessage(key, content, files),
    loadMessagesInBucket: (bucket: number) => conversationStore.loadMessagesInBucket(key, bucket),
    getBucket: (timestamp: number) => conversationStore.getBucket(key, timestamp),
    handleMessageSignalReceived: (signal: MessageSignal) =>
      conversationStore.handleMessageSignalReceived(key, signal),
    subscribe,
  };
}

export interface CellConversationMessagesListStore {
  loadCurrentBucket: () => void;
  loadPreviousBucket: () => void;
  subscribe: (
    this: void,
    run: Subscriber<[string, MessageExtended][]>,
    invalidate?: Invalidator<[string, MessageExtended][]> | undefined,
  ) => Unsubscriber;
}

export function deriveCellConversationMessagesListStore(
  cellConversationStore: CellConversationStore,
): CellConversationMessagesListStore {
  const data = derived(cellConversationStore, ($cellConversationStore) => {
    if ($cellConversationStore.messages === undefined) return [];

    return sortBy(Object.entries($cellConversationStore.messages), [(c) => c[1].timestamp]);
  });

  return {
    loadCurrentBucket: () => {
      return cellConversationStore.loadMessagesInBucket(
        cellConversationStore.getBucket(new Date().getTime()),
      );
    },
    loadPreviousBucket: () => {
      // Get bucket before oldest stored message timestamp
      const d = get(data);
      const oldestBucketLoaded = d[d.length - 1];
      if (oldestBucketLoaded === undefined) return;

      return cellConversationStore.loadMessagesInBucket(
        cellConversationStore.getBucket(oldestBucketLoaded[1].timestamp) - 1,
      );
    },
    subscribe: data.subscribe,
  };
}

export const deriveConversationListStore = (conversationStore: ConversationStore) =>
  derived(conversationStore, ($conversationStore) => {
    if ($conversationStore.conversations === undefined) return [];

    return sortBy(Object.entries($conversationStore.conversations), [
      (c) => {
        const m = $conversationStore.latestMessage[c[0]];
        return m === undefined ? Number.MAX_SAFE_INTEGER : -m.timestamp;
      },
      (c) => c[1].title,
      (c) => c[1].dnaProperties.created,
    ]);
  });
