import {
  FileStatus,
  type CellIdB64,
  type LocalFile,
  type Message,
  type MessageExtended,
  type MessageFile,
  type MessageFileExtended,
  type MessageRecord,
  type MessageSignal,
  type ProfileExtended,
} from "$lib/types";
import {
  encodeCellIdToBase64,
  decodeCellIdFromBase64,
  enqueueNotification,
  fileToDataUrl,
} from "$lib/utils";
import { FileStorageClient } from "@holochain-open-dev/file-storage";
import { EntryRecord } from "@holochain-open-dev/utils";
import { decodeHashFromBase64, encodeHashToBase64, type CellId } from "@holochain/client";
import { difference, sortBy } from "lodash-es";
import pRetry from "p-retry";
import type { ConversationStore } from "./ConversationStore";
import {
  createGenericKeyKeyValueStore,
  deriveGenericKeyValueStore,
  type GenericKeyKeyValueStore,
} from "./generic/GenericKeyKeyValueStore";
import {
  deriveCellMergedProfileContactInviteStore,
  type MergedProfileContactInviteStore,
} from "./MergedProfileContactInviteStore";
import type { RelayClient } from "./RelayClient";
import { derived, get } from "svelte/store";
import type { GenericKeyValueStoreReadable } from "./generic/GenericKeyValueStore";

export interface ConversationMessageStore extends GenericKeyKeyValueStore<MessageExtended> {
  initialize: () => Promise<void>;
  loadMessagesInCurrentBucket: (key1: CellIdB64) => Promise<void>;
  loadMessagesInPreviousBucket: (key1: CellIdB64) => Promise<void>;
  sendMessage: (key1: CellIdB64, content: string, files: LocalFile[]) => Promise<void>;
  handleMessageSignalReceived: (key1: CellIdB64, signal: MessageSignal) => Promise<void>;
}

export function createConversationMessageStore(
  client: RelayClient,
  conversationStore: ConversationStore,
  mergedProfileContactInviteStore: MergedProfileContactInviteStore,
): ConversationMessageStore {
  const messages = createGenericKeyKeyValueStore<MessageExtended>();

  // Filter out messages by agents who do not have a Contact nor Profile
  const { subscribe } = derived(
    [messages, mergedProfileContactInviteStore],
    ([$messages, $mergedProfileContactInviteStore]) => {
      const filteredMessages = Object.fromEntries(
        $messages.list.map(([cellIdB64, messagesData]) => [
          cellIdB64,
          Object.fromEntries(
            Object.entries(messagesData).filter(
              ([, messageExtended]) =>
                $mergedProfileContactInviteStore.data[cellIdB64] !== undefined &&
                $mergedProfileContactInviteStore.data[cellIdB64][
                  messageExtended.authorAgentPubKeyB64
                ] !== undefined,
            ),
          ),
        ]),
      );

      return {
        data: filteredMessages,
        list: Object.entries(filteredMessages),
        count: Object.keys(filteredMessages).length,
      };
    },
  );

  async function initialize() {
    const cellInfos = await client.getRelayClonedCellInfos();

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
        loadMessagesInCurrentBucket(encodeCellIdToBase64(cellInfo.cell_id)),
      ),
    );
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
    const mergedProfileContact = deriveCellMergedProfileContactInviteStore(
      mergedProfileContactInviteStore,
      key1,
      encodeHashToBase64(client.client.myPubKey),
    );
    const agentPubKeys = get(mergedProfileContact).list.map(([a]) => decodeHashFromBase64(a));

    // Create Message entry
    const record = await client.createMessage(cellId, {
      message: {
        content,
        bucket: conversationStore.getBucket(key1, new Date().getTime()),
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

  /**
   * Load messages in bucket for the current timestamp
   *
   * @param key1 CellIdB64
   * @returns
   */
  async function loadMessagesInCurrentBucket(key1: CellIdB64) {
    return _loadMessagesInBucket(key1, conversationStore.getBucket(key1, new Date().getTime()));
  }

  /**
   * Load Messages in bucket before the oldest loaded bucket.
   *
   * i.e. the newest bucket that has not been loaded yet
   * @param key1 CellIdB64
   * @returns
   */
  async function loadMessagesInPreviousBucket(key1: CellIdB64) {
    const messagesSorted = sortBy(Object.entries(get(messages).data[key1] || {}), [
      ([, m]) => -1 * m.timestamp,
    ]);
    const oldestBucketLoaded = messagesSorted[messagesSorted.length - 1];
    if (oldestBucketLoaded === undefined) return;

    return _loadMessagesInBucket(
      key1,
      conversationStore.getBucket(key1, oldestBucketLoaded[1].timestamp) - 1,
    );
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
    const mergedProfileContact = deriveCellMergedProfileContactInviteStore(
      mergedProfileContactInviteStore,
      key1,
      encodeHashToBase64(client.client.myPubKey),
    );
    const fromProfile = get(mergedProfileContact).data[encodeHashToBase64(signal.from)];

    // Trigger a system notification
    _triggerMessageNotification(messageExtended, fromProfile);
  }

  async function _loadMessagesInBucket(key1: CellIdB64, bucket: number) {
    const m = get(messages).data[key1];

    // Fetch message hashes from bucket
    const cellId = decodeCellIdFromBase64(key1);
    const actionHashB64s = (
      await client.getMessageHashes(cellId, {
        bucket,
        count: 0,
      })
    ).map((h) => encodeHashToBase64(h));

    // Determine which messages we are currently missing
    const storedActionHashB64s = Object.keys(m || {});
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
    if (Object.keys(data || {}).length === 0) return;

    // Update writable
    messages.update((c) => ({
      ...c,
      [key1]: {
        ...(c[key1] || {}),
        ...data,
      },
    }));
  }

  async function _triggerMessageNotification(
    messageExtended: MessageExtended,
    fromProfile?: ProfileExtended,
  ) {
    const content =
      messageExtended.message.content.length > 125
        ? messageExtended.message.content.slice(0, 50) + "..."
        : messageExtended.message.content;
    const header = fromProfile ? `Message From ${fromProfile.profile.nickname}` : `New Message`;

    await enqueueNotification(header, content);
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

  return {
    ...messages,
    initialize,
    loadMessagesInCurrentBucket,
    loadMessagesInPreviousBucket,
    sendMessage,
    handleMessageSignalReceived,
    subscribe,
  };
}

export interface CellConversationMessageStore
  extends GenericKeyValueStoreReadable<MessageExtended> {
  initialize: () => Promise<void>;
  loadMessagesInCurrentBucket: (key1: CellIdB64) => Promise<void>;
  loadMessagesInPreviousBucket: (key1: CellIdB64) => Promise<void>;
  sendMessage: (key1: CellIdB64, content: string, files: LocalFile[]) => Promise<void>;
  handleMessageSignalReceived: (key1: CellIdB64, signal: MessageSignal) => Promise<void>;
}

export function deriveCellConversationMessageStore(
  conversationMessageStore: ConversationMessageStore,
  key: CellIdB64,
) {
  const data = deriveGenericKeyValueStore(conversationMessageStore, key, [([, m]) => m.timestamp]);

  return {
    ...data,
    loadMessagesInCurrentBucket: () => conversationMessageStore.loadMessagesInCurrentBucket(key),
    loadMessagesInPreviousBucket: () => conversationMessageStore.loadMessagesInPreviousBucket(key),
    sendMessage: (content: string, files: LocalFile[]) =>
      conversationMessageStore.sendMessage(key, content, files),
    handleMessageSignalReceived: (signal: MessageSignal) =>
      conversationMessageStore.handleMessageSignalReceived(key, signal),
  };
}
