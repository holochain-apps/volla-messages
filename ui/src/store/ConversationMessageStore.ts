import {
  FileStatus,
  type CellIdB64,
  type LocalFile,
  type Message,
  type MessageExtended,
  type MessageFile,
  type MessageRecord,
  type MessageSignal,
  type ProfileExtended,
} from "$lib/types";
import { encodeCellIdToBase64, decodeCellIdFromBase64, enqueueNotification } from "$lib/utils";
import { FileStorageClient } from "@holochain-open-dev/file-storage";
import { EntryRecord } from "@holochain-open-dev/utils";
import {
  decodeHashFromBase64,
  encodeHashToBase64,
  type ActionHashB64,
  type CellId,
} from "@holochain/client";
import { difference, flatten, range, sortBy, sum } from "lodash-es";
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
import { TARGET_MESSAGES_COUNT } from "$config";
import type { FileStore } from "./FileStore";

export interface ConversationMessageStore extends GenericKeyKeyValueStore<MessageExtended> {
  initialize: () => Promise<void>;
  loadMessagesInCurrentBucketTargetCount: (
    key1: CellIdB64,
    targetCount?: number,
    bucketChunkSize?: number,
    maxBucketsToFetch?: number,
  ) => Promise<number>;
  loadMessagesInPreviousBucketTargetCount: (
    key1: CellIdB64,
    targetCount?: number,
    bucketChunkSize?: number,
    maxBucketsToFetch?: number,
  ) => Promise<number>;
  sendMessage: (key1: CellIdB64, content: string, files: LocalFile[]) => Promise<void>;
  handleMessageSignalReceived: (key1: CellIdB64, signal: MessageSignal) => Promise<void>;
}

export function createConversationMessageStore(
  client: RelayClient,
  conversationStore: ConversationStore,
  mergedProfileContactInviteStore: MergedProfileContactInviteStore,
  fileStore: FileStore,
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
                true ||
                ($mergedProfileContactInviteStore.data[cellIdB64] !== undefined &&
                  $mergedProfileContactInviteStore.data[cellIdB64][
                    messageExtended.authorAgentPubKeyB64
                  ] !== undefined),
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

    // Load a target count of 1 message, starting at current bucket
    //
    // This gives us a "latest message" to display on the Conversations list page,
    // without attempting to load so much up front that it slows down app startup.
    await Promise.allSettled(
      cellInfos.map(async (cellInfo) =>
        loadMessagesInCurrentBucketTargetCount(encodeCellIdToBase64(cellInfo.cell_id), 1, 5, 50),
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
        const entryHash = await fileStore.upload(key1, file.file);

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
   * Load messages, starting at the current bucket and working bakckwards,
   * until at least a targetCount have been fetched.
   *
   * @param key1 CellIdB64
   * @returns
   */
  async function loadMessagesInCurrentBucketTargetCount(
    key1: CellIdB64,
    targetCount = TARGET_MESSAGES_COUNT,
    bucketChunkSize: number = 3,
    maxBucketsToFetch?: number,
  ): Promise<number> {
    let bucket = conversationStore.getBucket(key1, new Date().getTime());

    return _loadMessagesFromBucketTargetCount(
      key1,
      bucket,
      targetCount,
      bucketChunkSize,
      maxBucketsToFetch,
    );
  }

  /**
   * Load messages, starting at the oldest stored message's bucket and working bakckwards,
   * until at least a targetCount have been fetched.
   *
   * @param key1 CellIdB64
   * @returns
   */
  async function loadMessagesInPreviousBucketTargetCount(
    key1: CellIdB64,
    targetCount = TARGET_MESSAGES_COUNT,
    bucketChunkSize: number = 3,
    maxBucketsToFetch?: number,
  ): Promise<number> {
    const messagesSorted = sortBy(Object.entries(get(messages).data[key1] || {}), [
      ([, m]) => -1 * m.timestamp,
    ]);
    const oldestMessageLoaded = messagesSorted[messagesSorted.length - 1];
    if (oldestMessageLoaded === undefined) return 0;

    return _loadMessagesFromBucketTargetCount(
      key1,
      oldestMessageLoaded[1].message.bucket - 1,
      targetCount,
      bucketChunkSize,
      maxBucketsToFetch,
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

  /**
   * Main function for fetching and loads messages
   *
   * @param key1 CellIdB64
   * @param bucket Bucket to start from
   * @param targetCount Target number of messages to fetch
   * @returns
   */
  async function _loadMessagesFromBucketTargetCount(
    key1: CellIdB64,
    bucket: number,
    targetCount: number = TARGET_MESSAGES_COUNT,
    bucketChunkSize: number = 3,
    maxBucketsToFetch?: number,
  ): Promise<number> {
    // Fetch the list of buckets that contain the target count
    // This step is split out so that buckets can be fetched in chunks, in parallel
    const bucketsToFetch = await _fetchBucketsTargetCount(
      key1,
      bucket,
      targetCount,
      bucketChunkSize,
      maxBucketsToFetch,
    );
    const actionHashB64s = flatten(bucketsToFetch.map(({ actionHashB64s }) => actionHashB64s));

    // Filter only messages we are not storing already
    const missingActionHashB64s = await _filterMissingMessages(key1, actionHashB64s);

    // Fetch and save missing message data to store
    const count = await _loadMessages(key1, missingActionHashB64s);

    return count;
  }

  /**
   * Fetch bucket's ActionHashes, starting at the given bucket and working bakckwards,
   * until at least a targetCount of ActionHashes have been received.
   *
   * @param key1 CellIdB64
   * @returns
   */
  async function _fetchBucketsTargetCount(
    key1: CellIdB64,
    bucket: number,
    targetCount: number = TARGET_MESSAGES_COUNT,
    bucketChunkSize: number = 3,
    maxBucketsToFetch?: number,
  ): Promise<{ bucket: number; actionHashB64s: ActionHashB64[] }[]> {
    const cellId = decodeCellIdFromBase64(key1);

    let bucketsToFetch: { bucket: number; actionHashB64s: ActionHashB64[] }[] = [];
    while (
      // We have not reached the target count
      sum(bucketsToFetch.map(({ actionHashB64s }) => actionHashB64s.length)) <= targetCount &&
      // There are still buckets available to fetch
      bucket >= 0 &&
      // We have not fetched more than our maximum allowed
      (maxBucketsToFetch === undefined || bucketsToFetch.length <= maxBucketsToFetch)
    ) {
      // Fetch message hashes for a chunk of buckets
      const bucketsChunk = range(bucket, bucket - bucketChunkSize).filter((b) => b >= 0);
      bucketsToFetch = [
        ...bucketsToFetch,
        ...(await Promise.all(
          bucketsChunk.map(async (b) => ({
            bucket: b,
            actionHashB64s: (
              await client.getMessageHashes(cellId, {
                bucket: b,
                count: 0,
              })
            ).map((a) => encodeHashToBase64(a)),
          })),
        )),
      ];
      bucket -= 1;
    }

    // Remove extra buckets that put us beyond our targetCount
    // This is a necessary step because we are fetching buckets in chunks.
    // And thus we may have overshot our target with the last chunk.
    while (
      // If we can remove the last bucket and are still above the targetCount,
      // then remove the last bucket
      sum(bucketsToFetch.slice(0, -1).map(({ actionHashB64s }) => actionHashB64s.length)) >
      targetCount
    ) {
      bucketsToFetch.pop();
    }

    return bucketsToFetch;
  }

  /**
   * Determine which messages we are currently missing

   * @param key1 
   * @param actionHashB64s 
   * @returns ActionHashB64[] of missing messages
   */
  async function _filterMissingMessages(key1: CellIdB64, actionHashB64s: ActionHashB64[]) {
    const m = get(messages).data[key1];

    const storedActionHashB64s = Object.keys(m || {});
    return difference(actionHashB64s, storedActionHashB64s);
  }

  async function _loadMessages(key1: CellIdB64, actionHashB64s: ActionHashB64[]): Promise<number> {
    const cellId = decodeCellIdFromBase64(key1);

    // Fetch missing messages
    const messageRecords: Array<MessageRecord> = await client.getMessageEntries(
      cellId,
      actionHashB64s.map((a) => decodeHashFromBase64(a)),
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
    const count = Object.keys(data || {}).length;
    if (count === 0) return 0;

    // Update writable
    messages.update((c) => ({
      ...c,
      [key1]: {
        ...(c[key1] || {}),
        ...data,
      },
    }));

    return count;
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

    messageRecord.message.images.forEach((messageFile) =>
      fileStore.download(
        encodeCellIdToBase64(cellId),
        encodeHashToBase64(messageFile.storage_entry_hash),
      ),
    );

    return {
      message: messageRecord.message,
      authorAgentPubKeyB64: encodeHashToBase64(messageRecord.signed_action.hashed.content.author),
      timestamp: messageRecord.signed_action.hashed.content.timestamp,
    };
  }

  return {
    ...messages,
    initialize,
    loadMessagesInCurrentBucketTargetCount,
    loadMessagesInPreviousBucketTargetCount,
    sendMessage,
    handleMessageSignalReceived,
    subscribe,
  };
}

export interface CellConversationMessageStore
  extends GenericKeyValueStoreReadable<MessageExtended> {
  initialize: () => Promise<void>;
  loadMessagesInCurrentBucketTargetCount: (
    targetCount?: number,
    bucketChunkSize?: number,
    maxBucketsToFetch?: number,
  ) => Promise<number>;
  loadMessagesInPreviousBucketTargetCount: (
    targetCount?: number,
    bucketChunkSize?: number,
    maxBucketsToFetch?: number,
  ) => Promise<number>;
  sendMessage: (content: string, files: LocalFile[]) => Promise<void>;
  handleMessageSignalReceived: (signal: MessageSignal) => Promise<void>;
}

export function deriveCellConversationMessageStore(
  conversationMessageStore: ConversationMessageStore,
  key: CellIdB64,
) {
  const data = deriveGenericKeyValueStore(conversationMessageStore, key, [([, m]) => m.timestamp]);

  return {
    ...data,
    loadMessagesInCurrentBucketTargetCount: (
      targetCount?: number,
      bucketChunkSize?: number,
      maxBucketsToFetch?: number,
    ) =>
      conversationMessageStore.loadMessagesInCurrentBucketTargetCount(
        key,
        targetCount,
        bucketChunkSize,
        maxBucketsToFetch,
      ),
    loadMessagesInPreviousBucketTargetCount: (
      targetCount?: number,
      bucketChunkSize?: number,
      maxBucketsToFetch?: number,
    ) =>
      conversationMessageStore.loadMessagesInPreviousBucketTargetCount(
        key,
        targetCount,
        bucketChunkSize,
        maxBucketsToFetch,
      ),
    sendMessage: (content: string, files: LocalFile[]) =>
      conversationMessageStore.sendMessage(key, content, files),
    handleMessageSignalReceived: (signal: MessageSignal) =>
      conversationMessageStore.handleMessageSignalReceived(key, signal),
  };
}
