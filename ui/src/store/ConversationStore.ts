import { uniq } from "lodash-es";
import { encode } from "@msgpack/msgpack";
import { Base64 } from "js-base64";
import {
  type AgentPubKey,
  type CellId,
  decodeHashFromBase64,
  encodeHashToBase64,
  type ActionHashB64,
  type ActionHash,
  type AgentPubKeyB64,
} from "@holochain/client";
import { FileStorageClient } from "@holochain-open-dev/file-storage";
import {
  derived,
  get,
  writable,
  type Invalidator,
  type Subscriber,
  type Unsubscriber,
} from "svelte/store";
import { v4 as uuidv4 } from "uuid";
import { RelayStore } from "$store/RelayStore";
import {
  type Config,
  type ContactExtended,
  type Conversation,
  type Image,
  type Invitation,
  type LocalConversationData,
  type Message,
  type MessageRecord,
  Privacy,
  type Profile,
  type ProfileExtended,
} from "../types";
import { createMessageHistoryStore } from "./MessageHistoryStore";
import pRetry from "p-retry";
import { fileToDataUrl } from "$lib/utils";
import { BUCKET_RANGE_MS, TARGET_MESSAGES_COUNT } from "$config";
import { page } from "$app/stores";
import { persisted } from "svelte-persisted-store";

export interface ConversationStoreData {
  conversation: Conversation;
  localData: LocalConversationData;
  lastMessage: Message | null;
  lastActivityAt: number;
  lastBucketLoaded: number;
  publicInviteCode: string;
  invitedContactKeys: AgentPubKeyB64[];
  archived: boolean;
  open: boolean;
  unread: boolean | undefined;
  created: number;
  processedMessages: Message[];
}

export interface ConversationStore {
  initialize: () => Promise<void>;
  loadMessagesSet: () => Promise<Array<ActionHashB64>>;
  loadMessageSetFromCurrentBucket: () => Promise<[number, ActionHashB64[]]>;
  loadImagesForMessage: (message: Message) => Promise<void>;
  fetchAgents: () => Promise<{
    [key: AgentPubKeyB64]: Profile;
  }>;
  fetchConfig: () => Promise<Config | undefined>;
  sendMessage: (authorKey: string, content: string, images: Image[]) => Promise<void>;
  addMessage: (message: Message) => void;
  setConfig: (config: Config) => Promise<void>;
  addContacts: (agentPubKeyB64s: AgentPubKeyB64[]) => void;
  toggleArchived: () => void;
  setUnread: (unread: boolean) => void;
  makeInviteCodeForAgent: (publicKeyB64: string) => Promise<string>;
  getAllMembers: () => ProfileExtended[];
  getJoinedMembers: () => ProfileExtended[];
  getInvitedUnjoinedContacts: () => ContactExtended[];
  getTitle: () => string;
  subscribe: (
    this: void,
    run: Subscriber<ConversationStoreData>,
    invalidate?: Invalidator<ConversationStoreData> | undefined,
  ) => Unsubscriber;
}

export function createConversationStore(
  relayStore: RelayStore,
  networkSeed: string,
  cellId: CellId,
  created: number,
  privacy: Privacy,
  progenitor: AgentPubKey,
  invitationTitle: string | undefined = undefined,
): ConversationStore {
  const client = relayStore.client;
  const fileStorageClient = new FileStorageClient(
    relayStore.client.client,
    "UNUSED ROLE NAME", // this is not used when cellId is specified, but the FileStorageClient still requires the parameter
    "file_storage",
    cellId,
  );

  const dnaHashB64 = encodeHashToBase64(cellId[0]);
  const conversation = writable<Conversation>({
    networkSeed,
    dnaHashB64,
    cellId,
    config: undefined,
    privacy,
    progenitor,
    agentProfiles: {},
    messages: {},
  });
  const history = createMessageHistoryStore(dnaHashB64, currentBucket());
  const lastBucketLoaded = writable<number>(-1);
  const localData = persisted<LocalConversationData>(`CONVERSATION.${dnaHashB64}.LOCAL_DATA`, {
    archived: false,
    invitedContactKeys: [],
    unread: false,
    invitationTitle,
  });
  const lastMessage = writable<Message | null>(null);
  const publicInviteCode = derived(conversation, ($conversation) => {
    return Base64.fromUint8Array(
      encode({
        created: created,
        networkSeed: $conversation.networkSeed,
        privacy: $conversation.privacy,
        progenitor: $conversation.progenitor,
        title: getTitle(),
      }),
    );
  });
  const isOpen = derived(
    page,
    ($page) => $page.route.id === "/conversations/[id]" && $page.params.id === dnaHashB64,
  );
  const processedMessages = derived(conversation, ($conversation) => {
    const messages = Object.values(($conversation as Conversation).messages).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
    const result: Message[] = [];

    let newLastMessage: Message | null = null;

    messages.forEach((message) => {
      // Don't display message if we don't have a profile from the author yet.
      if (!$conversation.agentProfiles[message.authorKey]) {
        return;
      }

      const contact = relayStore.contacts.find((c) => get(c).publicKeyB64 === message.authorKey);

      const displayMessage = {
        ...message,
        author: contact
          ? get(contact).contact.first_name
          : $conversation.agentProfiles[message.authorKey].fields.firstName,
        avatar: contact
          ? get(contact).contact.avatar
          : $conversation.agentProfiles[message.authorKey].fields.avatar,
      };

      if (
        !newLastMessage ||
        message.timestamp.toDateString() !== newLastMessage.timestamp.toDateString()
      ) {
        displayMessage.header = message.timestamp.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        });
      }

      // If same person is posting a bunch of messages in a row, hide their name and avatar
      if (
        newLastMessage?.authorKey === message.authorKey &&
        message.timestamp.getTime() - newLastMessage.timestamp.getTime() < 1000 * 60 * 5
      ) {
        displayMessage.hideDetails = true;
      }

      result.push(displayMessage);
      newLastMessage = message;
    });

    lastMessage.set(newLastMessage);

    return result;
  });

  const { subscribe } = derived(
    [
      conversation,
      localData,
      lastMessage,
      lastBucketLoaded,
      publicInviteCode,
      isOpen,
      processedMessages,
    ],
    ([
      $conversation,
      $localData,
      $lastMessage,
      $lastBucketLoaded,
      $publicInviteCode,
      $isOpen,
      $processedMessages,
    ]) => ({
      conversation: $conversation,
      localData: $localData,
      lastMessage: $lastMessage,
      lastActivityAt: $lastMessage ? $lastMessage.timestamp.getTime() : created,
      lastBucketLoaded: $lastBucketLoaded,
      publicInviteCode: $publicInviteCode,
      invitedContactKeys: $localData.invitedContactKeys,
      archived: $localData.archived,
      open: $isOpen,
      unread: $localData.unread,
      created,
      processedMessages: $processedMessages,
    }),
  );

  function bucketFromTimestamp(timestamp: number): number {
    const diff = timestamp - created;
    return Math.round(diff / BUCKET_RANGE_MS);
  }

  function bucketFromDate(date: Date): number {
    return bucketFromTimestamp(date.getTime());
  }

  function currentBucket(): number {
    return bucketFromDate(new Date());
  }

  async function initialize() {
    await fetchConfig();
    await fetchAgents();
    await loadMessagesSet();
  }

  // 1. looks in the history, starting at a current bucket, for hashes, and retrieves all
  // the actual messages in that bucket as well as any earlier buckets necessary
  // such that at least TARGET_MESSAGES_COUNT messages.
  // 2. then updates the "lateBucketLoaded" state variable so the next time earlier buckets
  // will be loaded.
  async function loadMessagesSet(): Promise<Array<ActionHashB64>> {
    const lastBucket = get(lastBucketLoaded);
    if (lastBucket === 0) return [];

    let bucket = lastBucket < 0 ? currentBucket() : lastBucket - 1;
    let [bucketLoaded, messageHashes] = await _loadMessageSetFrom(bucket);
    lastBucketLoaded.set(bucketLoaded);

    return messageHashes;
  }

  async function loadMessageSetFromCurrentBucket(): Promise<[number, ActionHashB64[]]> {
    return _loadMessageSetFrom(currentBucket());
  }

  // looks in the history starting at a bucket number for hashes, and retrieves all
  // the actual messages in that bucket as well as any earlier buckets necessary
  // such that at least TARGET_MESSAGES_COUNT messages.
  async function _loadMessageSetFrom(bucket: number): Promise<[number, ActionHashB64[]]> {
    const buckets = history.bucketsForSet(TARGET_MESSAGES_COUNT, bucket);
    const messageHashes: ActionHashB64[] = [];
    for (const b of buckets) {
      messageHashes.push(...(await _getMessagesForBucket(b)));
    }
    return [bucket - buckets.length + 1, messageHashes];
  }

  async function _getMessagesForBucket(b: number) {
    try {
      const newMessages: { [key: string]: Message } = get(conversation).messages;
      let bucket = history.getBucket(b);
      const messageHashes = await client.getMessageHashes(cellId, b, get(bucket).count);

      const messageHashesB64 = messageHashes.map((h) => encodeHashToBase64(h));
      const missingHashes = bucket.missingHashes(messageHashesB64);
      if (missingHashes.length > 0) {
        if (get(isOpen) == false) {
          setUnread(true);
        }
        bucket.add(missingHashes);
      }

      const hashesToLoad: Array<ActionHash> = [];
      get(bucket).hashes.forEach((h) => {
        if (!newMessages[h]) hashesToLoad.push(decodeHashFromBase64(h));
      });

      if (hashesToLoad.length > 0) {
        const messageRecords: Array<MessageRecord> = await client.getMessageEntries(
          cellId,
          hashesToLoad,
        );
        if (hashesToLoad.length != messageRecords.length) {
          console.log("Warning: not all requested hashes were loaded");
        }
        let l = get(lastMessage);
        for (const messageRecord of messageRecords) {
          try {
            const message = messageRecord.message;
            if (message) {
              message.hash = encodeHashToBase64(messageRecord.signed_action.hashed.hash);
              message.timestamp = new Date(
                messageRecord.signed_action.hashed.content.timestamp / 1000,
              );
              if (!l || message.timestamp > l.timestamp) {
                lastMessage.set(message);
              }
              message.authorKey = encodeHashToBase64(
                messageRecord.signed_action.hashed.content.author,
              );
              message.images = ((message.images as any[]) || []).map((i) => ({
                fileType: i.file_type,
                lastModified: i.last_modified,
                name: i.name,
                size: i.size,
                storageEntryHash: i.storage_entry_hash,
                status: "loading",
              }));
              message.status = "confirmed";

              // Async load the images
              loadImagesForMessage(message);

              if (!newMessages[message.hash]) {
                const matchesPending = Object.values(get(conversation).messages).find(
                  (m) =>
                    m.status === "pending" &&
                    m.authorKey === message.authorKey &&
                    m.content === message.content,
                );
                if (matchesPending) {
                  delete newMessages[matchesPending.hash];
                }
                newMessages[message.hash] = message;
              }
            }
          } catch (e) {
            console.error("Unable to parse message, ignoring", messageRecord, e);
          }
        }
        conversation.update((c) => ({
          ...c,
          messages: newMessages,
        }));
        lastMessage.set(l);
        return Object.keys(newMessages);
      }
    } catch (e) {
      //@ts-ignore
      console.error("Error getting messages", e);
    }
    return [];
  }

  /***** Setters & actions ******/

  async function sendMessage(authorKey: string, content: string, images: Image[]) {
    // Use temporary uuid as the hash until we get the real one back from the network
    const now = new Date();
    const bucket = bucketFromDate(now);
    const id = uuidv4();
    const oldMessage: Message = {
      authorKey,
      content,
      hash: id,
      status: "pending",
      timestamp: now,
      bucket,
      images,
    };
    addMessage(oldMessage);
    const imageStructs = await Promise.all(
      images
        .filter((i) => !!i.file)
        .map(async (image) => {
          const hash = await fileStorageClient.uploadFile(image.file!);
          return {
            last_modified: image.file!.lastModified,
            name: image.file!.name,
            size: image.file!.size,
            storage_entry_hash: hash,
            file_type: image.file!.type,
          };
        }),
    );
    const newMessageEntry = await client.sendMessage(
      cellId,
      content,
      bucket,
      imageStructs,
      Object.keys(get(conversation).agentProfiles).map((k) => decodeHashFromBase64(k)),
    );
    const newMessage: Message = {
      ...oldMessage,
      hash: encodeHashToBase64(newMessageEntry.actionHash),
      status: "confirmed",
      images: images.map((i) => ({ ...i, status: "loaded" })),
    };
    _updateMessage(oldMessage, newMessage);
  }

  function _updateMessage(oldMessage: Message, newMessage: Message): void {
    conversation.update((c) => {
      const messages = { ...c.messages };
      delete messages[oldMessage.hash];
      return { ...c, messages: { ...messages, [newMessage.hash]: newMessage } };
    });
    history.add(newMessage);
  }

  function addMessage(message: Message): void {
    conversation.update((c) => {
      message.images = message.images || [];
      const l = get(lastMessage);
      if (!l || message.timestamp > l.timestamp) {
        lastMessage.set(message);
      }
      return { ...c, messages: { ...c.messages, [message.hash]: message } };
    });

    if (message.hash.startsWith("uhCkk")) {
      // don't add placeholder to bucket yet.
      history.add(message);
      if (!get(isOpen) && message.authorKey !== encodeHashToBase64(client.client.myPubKey)) {
        setUnread(true);
      }
    }
  }

  async function loadImagesForMessage(message: Message) {
    if (message.images?.length === 0) return;

    const images = await Promise.all(message.images.map((image) => _loadImage(image)));
    conversation.update((c) => {
      c.messages[message.hash].images = images;
      return c;
    });
  }

  async function _loadImage(image: Image): Promise<Image> {
    try {
      if (image.status === "loaded") return image;
      if (image.storageEntryHash === undefined) return image;

      // Download image file, retrying up to 10 times if download fails
      const file = await pRetry(
        () => fileStorageClient.downloadFile(image.storageEntryHash as Uint8Array),
        {
          retries: 10,
          minTimeout: 1000,
          factor: 2,
          onFailedAttempt: (e) => {
            console.error(
              `Failed to download file from hash ${encodeHashToBase64(image.storageEntryHash as Uint8Array)}`,
              e,
            );
          },
        },
      );

      // Convert image blob to data url
      const dataURL = await fileToDataUrl(file);

      return { ...image, status: "loaded", dataURL } as Image;
    } catch (e) {
      console.error("Error loading image after 10 retries:", e);
      return { ...image, status: "error", dataURL: "" } as Image;
    }
  }

  async function setConfig(config: Config) {
    const c = get(conversation);
    await relayStore.client.setConfig(cellId, config);
    conversation.update((c) => ({ ...c, config }));
  }

  function addContacts(agentPubKeyB64s: AgentPubKeyB64[]) {
    localData.update((d) => ({
      ...d,
      invitedContactKeys: [...d.invitedContactKeys, ...agentPubKeyB64s],
    }));
  }

  function toggleArchived() {
    localData.update((d) => ({ ...d, archived: !d.archived }));
  }

  function setUnread(unread: boolean) {
    localData.update((d) => ({ ...d, unread }));
  }

  async function fetchConfig() {
    const config = await client.getConfig(cellId);
    conversation.update((c) => ({
      ...c,
      config,
    }));
    return config;
  }

  async function fetchAgents() {
    const agentProfiles = await client.getAllAgents(cellId);
    conversation.update((c) => ({
      ...c,
      agentProfiles,
    }));
    return agentProfiles;
  }

  async function makeInviteCodeForAgent(publicKeyB64: string) {
    const c = get(conversation);
    if (c.privacy === Privacy.Public) {
      const publicCode = get(publicInviteCode);
      if (!publicCode) throw new Error("Failed to get public invite code");
      return publicCode;
    }

    const proof = await client.inviteAgentToConversation(
      cellId,
      decodeHashFromBase64(publicKeyB64),
    );

    // The name of the conversation we are inviting to should be our name + # of other people invited
    let myProfile = get(client.profilesStore.myProfile);
    const profileData = myProfile.status === "complete" ? myProfile.value?.entry : undefined;
    let title = (profileData?.fields.firstName || "") + " " + profileData?.fields.lastName;
    if (get(localData).invitedContactKeys.length > 1) {
      title = `${title} + ${get(localData).invitedContactKeys.length - 1}`;
    }

    const invitation: Invitation = {
      created,
      progenitor: c.progenitor,
      privacy: c.privacy,
      proof,
      networkSeed: c.networkSeed,
      title,
    };
    const msgpck = encode(invitation);
    return Base64.fromUint8Array(msgpck);
  }

  function getInvitedUnjoinedContacts(): ContactExtended[] {
    const joinedAgents = get(conversation).agentProfiles;
    return get(localData)
      .invitedContactKeys.filter((contactKey) => !joinedAgents[contactKey]) // filter out already joined agents
      .map((contactKey) => {
        const contactProfile = relayStore.contacts.find((c) => get(c).publicKeyB64 === contactKey);
        if (!contactProfile) return;

        return get(contactProfile);
      })
      .filter((c) => c !== undefined);
  }

  function getAllMembers(): ProfileExtended[] {
    return _getMembers(true);
  }

  function getJoinedMembers(): ProfileExtended[] {
    return _getMembers(false);
  }

  function _getMembers(includeInvited: boolean): ProfileExtended[] {
    // return the list of agents that have joined the conversation, checking the relayStore for contacts and using the contact info first and if that doesn't exist using the agent profile
    const joinedAgents = get(conversation).agentProfiles;

    const keys = uniq(
      Object.keys(joinedAgents).concat(includeInvited ? get(localData).invitedContactKeys : []),
    );

    // Filter out progenitor, as they are always in the list,
    // use contact data for each agent if it exists locally, otherwise use their profile
    // sort by first name (for now)
    const myPubKeyB64 = encodeHashToBase64(client.client.myPubKey);
    return keys
      .filter((k) => k !== myPubKeyB64)
      .map((agentKey) => {
        const contactProfile = relayStore.contacts.find((c) => get(c).publicKeyB64 === agentKey);

        if (contactProfile) {
          return contactProfile.getAsProfile();
        } else if (joinedAgents[agentKey]) {
          return {
            profile: joinedAgents[agentKey],
            publicKeyB64: agentKey,
          };
        } else {
          return undefined;
        }
      })
      .filter((u) => u !== undefined)
      .sort((a, b) => a.profile.nickname.localeCompare(b.profile.nickname));
  }

  function getTitle() {
    const allMembers = getAllMembers();
    const c = get(conversation);
    const { invitationTitle } = get(localData);

    let title;
    if (c.config) {
      title = c.config.title;
    } else if (invitationTitle) {
      title = invitationTitle;
    } else {
      title = "...";
    }

    if (c.privacy === Privacy.Public) {
      return title;
    }

    if (allMembers.length === 0) {
      // When joining a private converstion that has not synced yet
      return title;
    } else if (allMembers.length === 1) {
      // Use full name of the one other person in the chat
      return allMembers[0].profile.nickname;
    } else if (allMembers.length === 2) {
      return allMembers.map((m) => m.profile.fields.firstName).join(" & ");
    } else {
      return allMembers.map((m) => m.profile.fields.firstName).join(", ");
    }
  }

  return {
    initialize,

    // load messages
    loadMessagesSet,
    loadMessageSetFromCurrentBucket,
    loadImagesForMessage,

    // load agents
    fetchAgents,

    // load config
    fetchConfig,

    // send message
    sendMessage,
    addMessage,

    // update config
    setConfig,

    // update local data
    addContacts,
    toggleArchived,
    setUnread,

    // invite agents
    makeInviteCodeForAgent,

    // get filtered data
    getAllMembers,
    getJoinedMembers,
    getInvitedUnjoinedContacts,
    getTitle,

    subscribe,
  };
}
