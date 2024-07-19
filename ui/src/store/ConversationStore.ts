import { encode } from '@msgpack/msgpack';
import { Base64 } from 'js-base64';
import { type AgentPubKey, type DnaHash, decodeHashFromBase64, encodeHashToBase64, type Timestamp, type ActionHashB64 } from "@holochain/client";
import { writable, get, type Writable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { RelayClient } from '$store/RelayClient'
import { type Config, type Conversation, type Invitation, type Message, type MessageRecord, Privacy, type MessageHistory, type Messages, HistoryType } from '../types';

export const MINUTES_IN_BUCKET = 1  // 60 * 24 * 7  // 1 week
export const MIN_MESSAGES_LOAD = 20

export class ConversationStore {
  private conversation: Writable<Conversation>;
  private buckets: Array<MessageHistory> = []
  private bucketsLoaded: number = -1

  constructor(
    public client: RelayClient,
    public id: string,
    public cellDnaHash: DnaHash,
    public config: Config,
    public created: number,
    public privacy: Privacy,
    public progenitor: AgentPubKey,
  ) {
    const messages: Messages = {}

    const dnaB64 = encodeHashToBase64(cellDnaHash)
    const currentBucket = this.currentBucket()
    for (let b = 0; b<= currentBucket;  b+=1) {
      const historyStr = localStorage.getItem(`c.${dnaB64}.${b}`)
      if (historyStr) {
        try {
          this.buckets[b] = JSON.parse(historyStr)
        } catch(e) {
          console.log("badly formed history for ",dnaB64,e)
        }
      }
      if (this.buckets[b] === undefined) {
        this.buckets[b] = {
          type: HistoryType.Hashes,
          hashes: new Set()
        }
      }
    }
    this.conversation = writable({ id, cellDnaHash, config, privacy, progenitor, agentProfiles: {}, messages });
  }

  async initialize() {
    await this.getAgents()
    let bucket = this.currentBucket()
    console.log("CURERNT BUCKET", bucket)
    const buckets:Array<number> = [bucket]
    let count = 0
    // add buckets until we get to threshold of what to load
    while (bucket > 0 && count < MIN_MESSAGES_LOAD) {
      const h = this.buckets[bucket]
      if (h)
        count += h.type == HistoryType.Count ? h.count : h.hashes.size
      bucket-=1
      buckets.push(bucket)
    }
    this.bucketsLoaded = bucket
    await this.getMessages(buckets)
  }

  get data() {
    return get(this.conversation);
  }

  subscribe(run: any) {
    return this.conversation.subscribe(run);
  }

  async getAgents() {
    const agentProfiles = await this.client.getAllAgents(this.data.id)
    this.conversation.update(c => {
      c.agentProfiles = {...agentProfiles}
      return c
    })
    return agentProfiles
  }

  async getConfig() {
    const config = await this.client._getConfig(this.data.id)
    if (config) {
      this.conversation.update(c => {
        c.config = {...config.entry}
        return c
      })
      return config.entry
    }
    return null
  }

  async getMessages(buckets: Array<number>) {
    try {
      const newMessages: { [key: string] : Message } = this.data.messages
      const messageRecords: Array<MessageRecord> = await this.client.getAllMessages(this.data.id, buckets)
      for (const messageRecord of messageRecords) {
        try {
          const message = messageRecord.message
          if (message) {
            message.hash = encodeHashToBase64(messageRecord.signed_action.hashed.hash)
            message.timestamp = new Date(messageRecord.signed_action.hashed.content.timestamp / 1000)
            message.authorKey = encodeHashToBase64(messageRecord.signed_action.hashed.content.author)
            message.status = 'confirmed'

            if (!newMessages[message.hash]) {
              const matchesPending = Object.values(this.data.messages).find(m => m.status === 'pending' && m.authorKey === message.authorKey && m.content === message.content);
              if (matchesPending) {
                delete newMessages[matchesPending.hash]
              }
              newMessages[message.hash] = message
            }
          }
        } catch(e) {
          console.error("Unable to parse message, ignoring", messageRecord, e)
        }
      }
      this.conversation.update(c => {
        c.messages = {...newMessages}
        return c
      })
      return newMessages
    } catch (e) {
      //@ts-ignore
      console.error("Error getting messages", e)
    }
    return []
  }

  bucketFromTimestamp(timestamp: number) : number {
    console.log("created", this.created)
    console.log("timestamp", timestamp)
    const diff = timestamp - this.created
    console.log("diff", diff)
    return Math.round(diff / (MINUTES_IN_BUCKET * 60 * 1000))
  }

  bucketFromDate(date: Date) : number {
    console.log("bucketFromDate", date)
    return this.bucketFromTimestamp(date.getTime())
  }

  currentBucket() :number {
    return this.bucketFromDate(new Date())
  }

  sendMessage(authorKey: string, content: string): void {
    // Use temporary uuid as the hash until we get the real one back from the network
    const now = new Date()
    const bucket = this.bucketFromDate(now)
    this.addMessage({ authorKey, content, hash: uuidv4(), status: 'pending', timestamp: now, bucket })
    this.client.sendMessage(this.data.id, content, bucket, Object.keys(this.data.agentProfiles).map(k => decodeHashFromBase64(k)));
  }

  addMessage(message: Message): void {
    this.conversation.update(conversation => {
      return { ...conversation, messages: {...conversation.messages, [message.hash]: message } };
    });
    const history = this.buckets[message.bucket]
    if (history === undefined) { 
      const hashes:Set<ActionHashB64> = new Set() 
      hashes.add(message.hash)
      this.buckets[message.bucket] = {
        type: HistoryType.Hashes,
        hashes
      }
    } else if (history.type === HistoryType.Hashes) {
      history.hashes.add(message.hash)
    }
    else if (history.type === HistoryType.Count) {
      history.count += 1
    }
    this.saveBucket(message.bucket)
  }

  saveBucket(bucket: number) {
    const dnaB64 = encodeHashToBase64(this.cellDnaHash)
    localStorage.setItem(`c.${dnaB64}.${bucket}`, JSON.stringify(this.buckets[bucket]))
  }

  get publicInviteCode() {
    if (this.data.privacy === Privacy.Public) {
      const invitation: Invitation = {
        created: this.created,
        conversationName: this.data.config.title,
        networkSeed: this.data.id,
        privacy: this.data.privacy,
        progenitor: this.data.progenitor
      }
      const msgpck = encode(invitation);
      return Base64.fromUint8Array(msgpck);
    } else {
      return ''
    }
  }
}
