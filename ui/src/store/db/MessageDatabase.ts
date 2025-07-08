import Dexie, { type Table } from "dexie";
import type { ActionHashB64, CellIdB64, MessageExtended } from "$lib/types";

// Database schema for persistent message storage
export interface DBMessage {
  id?: number; // Auto-increment primary key
  actionHashB64: ActionHashB64; // Unique message identifier
  cellIdB64: CellIdB64; // Conversation identifier
  message: MessageExtended; // The actual message data
  timestamp: number; // Message timestamp for sorting
  bucket: number; // Message bucket for pagination
  createdAt: number; // When this record was added to DB
}

export class MessageDatabase extends Dexie {
  messages!: Table<DBMessage>;

  constructor() {
    super("VollaMessagesDB");

    this.version(1).stores({
      messages:
        "++id, actionHashB64, cellIdB64, timestamp, bucket, [cellIdB64+timestamp], [cellIdB64+bucket]",
    });
  }

  /**
   * Store a message in the database
   */
  async storeMessage(
    cellIdB64: CellIdB64,
    actionHashB64: ActionHashB64,
    messageExtended: MessageExtended,
  ): Promise<void> {
    await this.messages.put({
      actionHashB64,
      cellIdB64,
      message: messageExtended,
      timestamp: messageExtended.timestamp,
      bucket: messageExtended.message.bucket,
      createdAt: Date.now(),
    });
  }

  /**
   * Store multiple messages in the database
   */
  async storeMessages(
    cellIdB64: CellIdB64,
    messages: Array<[ActionHashB64, MessageExtended]>,
  ): Promise<void> {
    const dbMessages = messages.map(([actionHashB64, messageExtended]) => ({
      actionHashB64,
      cellIdB64,
      message: messageExtended,
      timestamp: messageExtended.timestamp,
      bucket: messageExtended.message.bucket,
      createdAt: Date.now(),
    }));

    await this.messages.bulkPut(dbMessages);
  }

  /**
   * Get messages for a conversation with pagination
   */
  async getMessages(
    cellIdB64: CellIdB64,
    limit: number = 50,
    offset: number = 0,
  ): Promise<Array<[ActionHashB64, MessageExtended]>> {
    const messages = await this.messages
      .where("[cellIdB64+timestamp]")
      .between([cellIdB64, Dexie.minKey], [cellIdB64, Dexie.maxKey])
      .reverse() // Latest messages first
      .offset(offset)
      .limit(limit)
      .toArray();

    return messages.map((dbMessage) => [dbMessage.actionHashB64, dbMessage.message]);
  }

  /**
   * Get oldest messages for loading previous pages
   */
  async getOlderMessages(
    cellIdB64: CellIdB64,
    olderThanTimestamp: number,
    limit: number = 50,
  ): Promise<Array<[ActionHashB64, MessageExtended]>> {
    const messages = await this.messages
      .where("[cellIdB64+timestamp]")
      .between([cellIdB64, Dexie.minKey], [cellIdB64, olderThanTimestamp], false, false)
      .reverse()
      .limit(limit)
      .toArray();

    return messages.map((dbMessage) => [dbMessage.actionHashB64, dbMessage.message]);
  }

  /**
   * Check if a message exists in the database
   */
  async hasMessage(actionHashB64: ActionHashB64): Promise<boolean> {
    const count = await this.messages.where("actionHashB64").equals(actionHashB64).count();
    return count > 0;
  }

  /**
   * Get the total count of messages for a conversation
   */
  async getMessageCount(cellIdB64: CellIdB64): Promise<number> {
    return await this.messages.where("cellIdB64").equals(cellIdB64).count();
  }

  /**
   * Delete a message from the database
   */
  async deleteMessage(actionHashB64: ActionHashB64): Promise<void> {
    await this.messages.where("actionHashB64").equals(actionHashB64).delete();
  }

  /**
   * Get the latest message for a conversation
   */
  async getLatestMessage(
    cellIdB64: CellIdB64,
  ): Promise<[ActionHashB64, MessageExtended] | undefined> {
    const message = await this.messages
      .where("[cellIdB64+timestamp]")
      .between([cellIdB64, Dexie.minKey], [cellIdB64, Dexie.maxKey])
      .reverse()
      .first();

    return message ? [message.actionHashB64, message.message] : undefined;
  }

  /**
   * Clear all messages for a conversation
   */
  async clearConversationMessages(cellIdB64: CellIdB64): Promise<void> {
    await this.messages.where("cellIdB64").equals(cellIdB64).delete();
  }
}

// Singleton instance
export const messageDB = new MessageDatabase();
