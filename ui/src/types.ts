import type {
  ActionHash,
  AgentPubKeyB64,
  CellId,
  EntryHash,
  SignedActionHashed,
  AgentPubKey,
  Create,
  Update,
  Delete,
  CreateLink,
  DeleteLink,
  MembraneProof,
  ClonedCell,
  DnaHashB64,
} from "@holochain/client";

import type { Profile } from "@holochain-open-dev/profiles";

export type RelaySignal =
  | {
      type: "Message";
      action: SignedActionHashed<Create>;
      message: Message;
      from: AgentPubKey;
    }
  | {
      type: "EntryCreated";
      action: SignedActionHashed<Create>;
      app_entry: EntryTypes;
    }
  | {
      type: "EntryUpdated";
      action: SignedActionHashed<Update>;
      app_entry: EntryTypes;
      original_app_entry: EntryTypes;
    }
  | {
      type: "EntryDeleted";
      action: SignedActionHashed<Delete>;
      original_app_entry: EntryTypes;
    }
  | {
      type: "LinkCreated";
      action: SignedActionHashed<CreateLink>;
      link_type: string;
    }
  | {
      type: "LinkDeleted";
      action: SignedActionHashed<DeleteLink>;
      link_type: string;
    };

export enum Privacy {
  Private,
  Public,
}

// DNA modifier properties for a conversation
export interface Properties {
  created: number;
  privacy: Privacy;
  progenitor: AgentPubKeyB64;
}

export type EntryTypes = { type: "Message" } & MessageInput;

export interface Contact {
  currentActionHash?: ActionHash;
  originalActionHash?: ActionHash;
  avatar: string;
  privateConversationDnaHashB64?: DnaHashB64;
  firstName: string;
  lastName: string;
  publicKeyB64: AgentPubKeyB64;
}

export interface MessageInput {
  content: string;
  bucket: number;
}

export type Messages = { [key: string]: Message };

export interface Conversation {
  networkSeed: string;
  dnaHashB64: DnaHashB64;
  cellId: CellId;
  config: Config;
  description?: string;
  privacy: Privacy;
  progenitor: AgentPubKey;
  messages: Messages;
  agentProfiles: { [key: AgentPubKeyB64]: Profile };
}

export interface LocalConversationData {
  archived?: boolean;
  invitedContactKeys: string[];
  unread?: boolean;
}

export interface MembraneProofData {
  conversation_id: string;
  for_agent: AgentPubKey;
  as_role: number;
}

export interface Invitation {
  created: number;
  networkSeed: string;
  privacy: Privacy;
  progenitor: AgentPubKey;
  proof?: MembraneProof;
  title: string;
}

// Holochain Type
export interface ImageStruct {
  last_modified: number;
  name: string;
  size: number;
  storage_entry_hash: EntryHash;
  file_type: string;
}

export interface Image {
  dataURL?: string;
  fileType: string;
  file?: File;
  name: string;
  lastModified: number;
  size: number;
  storageEntryHash?: EntryHash;
  status?: "loading" | "loaded" | "pending" | "error"; // Pending = not yet sent to holochain, loading = loading from holochain, loaded = loaded from holochain, error = failed to load
}

export interface Message {
  hash: string;
  author?: string; // Used in the UI to display the author's name
  authorKey: string;
  avatar?: string; // Used in the UI to display the author's avatar
  content: string;
  header?: string; // an optional header to display above this message in the conversation UI
  images: Image[];
  hideDetails?: boolean; // Used in the UI to toggle the display of the message details
  status?: "pending" | "confirmed" | "delivered" | "read"; // status of the message
  timestamp: Date;
  bucket: number;
}

export type BucketInput = {
  bucket: number;
  count: number;
};

export interface MessageRecord {
  original_action: ActionHash;
  signed_action: SignedActionHashed;
  message?: Message;
}

export interface Config {
  title: string;
  image: string;
}

export interface ConversationCellAndConfig {
  cell: ClonedCell;
  config: Config;
}
