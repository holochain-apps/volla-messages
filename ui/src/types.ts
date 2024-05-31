import type {
  ActionHash,
  AgentPubKeyB64,
  Record,
  DnaHash,
  SignedActionHashed,
  EntryHash,
  AgentPubKey,
  Create,
  Update,
  Delete,
  CreateLink,
  DeleteLink,
  MembraneProof
} from '@holochain/client';

import type { Profile } from '@holochain-open-dev/profiles'

export type RelaySignal = {
  type: 'EntryCreated';
  action: SignedActionHashed<Create>;
  app_entry: EntryTypes;
} | {
  type: 'EntryUpdated';
  action: SignedActionHashed<Update>;
  app_entry: EntryTypes;
  original_app_entry: EntryTypes;
} | {
  type: 'EntryDeleted';
  action: SignedActionHashed<Delete>;
  original_app_entry: EntryTypes;
} | {
  type: 'LinkCreated';
  action: SignedActionHashed<CreateLink>;
  link_type: string;
} | {
  type: 'LinkDeleted';
  action: SignedActionHashed<DeleteLink>;
  link_type: string;
};

// DNA modifier properties for a conversation
export interface Properties {
  name: string;
  progenitor: AgentPubKeyB64
}

export type EntryTypes =
 | ({ type: 'Message'; } & MessageInput);

 export interface MessageInput {
  content: string;
}

export interface Message {
  id?: string;
  content: string;
  author?: string;
  authorKey: string;
  avatar?: string;
  timestamp: Date;
  header?: string;
}

export interface MessageRecord {
  original_action: ActionHash;
  signed_action: SignedActionHashed;
  message?: Message;
}

export interface Conversation {
  id: string; // the clone id
  cellDnaHash: DnaHash;
  description?: string;
  name: string;
  networkSeed: string;
  progenitor: AgentPubKey;
  messages: Message[];
  agentProfiles: { [key: AgentPubKeyB64]: Profile };
}

export interface MembraneProofData {
  conversation_name: string;
  for_agent: AgentPubKey;
  as_role: number;
}

export interface Invitation {
  conversationName: string;
  progenitor: AgentPubKey;
  proof?: MembraneProof;
  networkSeed: string;
}