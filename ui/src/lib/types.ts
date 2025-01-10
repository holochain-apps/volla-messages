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
} from "@holochain/client";

/**
 * App Signals
 */

export type EntryTypes = { type: "Message" } & Message;

export interface MessageSignal {
  type: "Message";
  action: SignedActionHashed<Create>;
  message: Message;
  from: AgentPubKey;
}

export type RelaySignal =
  | MessageSignal
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
    }
  | {
      type: "ConferenceInvite";
      room: ConferenceRoom;
      agent: AgentPubKey;
    }
  | {
      type: "ConferenceJoined";
      room_id: string;
      agent: AgentPubKey;
    }
  | {
      type: "ConferenceLeft";
      room_id: string;
      agent: AgentPubKey;
    }
  | {
      type: "WebRTCSignal";
      signal: SignalPayload;
    }

/**
 * Conversation Message File
 */

export interface MessageFile {
  name: string;
  last_modified: number;
  size: number; // Size in bytes
  file_type: string;
  storage_entry_hash: EntryHash;
}

export interface MessageFileExtended {
  messageFile: MessageFile;
  status: FileStatus;
  dataURL?: string;
}

/**
 * Conversation Message
 */

// Mirror of rust struct "File", renamed to avoid naming conflict with javascript native File
export interface Message {
  content: string;
  bucket: number;
  images: MessageFile[];
}

export interface MessageExtended {
  message: Message;
  messageFileExtendeds: MessageFileExtended[];
  authorAgentPubKeyB64: AgentPubKeyB64;
  timestamp: number;
}

export interface MessageRecord {
  original_action: ActionHash;
  signed_action: SignedActionHashed;
  message?: Message;
}

export interface SendMessageInput {
  message: Message;
  agents: AgentPubKey[];
}

/**
 * Conversation
 */

export interface Config {
  title: string;
  image: string;
}

export enum Privacy {
  Private,
  Public,
}

export interface ConversationExtended {
  cellInfo: ClonedCell;
  dnaProperties: RelayDnaProperties;
  publicInviteCode?: string; // undefined if the conversation is private
  config?: Config; // undefined if we have not fetched the Config entry

  // Locally persisted data
  unread: boolean;
}

export type BucketInput = {
  bucket: number;
  count: number;
};

// UI type only
export interface CreateConversationInput {
  config: Config;
  privacy: Privacy;
}

/**
 * Relay DNA
 */

// Mirror of rust type DnaProperties, renamed to avoid naming conflict with holochain client
export interface RelayDnaProperties {
  created: number;
  privacy: Privacy;

  // This is *NOT* the type specified in the rust struct DnaProperties (there it is an AgentPubKey)
  //
  // But because we have already been cloning cells rom the UI, using an AgentPubKeyB64 as progenitor,
  // we must keep it consistent to avoid an DNA-integrity breaking change.
  //
  // See https://github.com/holochain-apps/volla-messages/issues/392
  progenitor: AgentPubKeyB64;
}

export interface Invitation {
  created: number;
  networkSeed: string;
  privacy: Privacy;
  progenitor: AgentPubKey;
  title: string;
  proof?: MembraneProof;
}

export interface MembraneProofData {
  conversation_id: string;
  for_agent: AgentPubKey;
  as_role: number;
}

/**
 * Contact
 */

export interface Contact {
  public_key: AgentPubKey;
  first_name: string;
  last_name: string;
  avatar: string;
}

export interface ContactRecord {
  original_action: ActionHash;
  signed_action: SignedActionHashed;
  contact?: Contact;
}

export interface UpdateContactInput {
  original_contact_hash: ActionHash;
  previous_contact_hash: ActionHash;
  updated_contact: Contact;
}

export interface ContactExtended {
  contact: Contact;
  fullName: string;
  publicKeyB64: AgentPubKeyB64;
  originalActionHash: ActionHash;
  previousActionHash: ActionHash;

  // CellId of private 1-1 conversation with this contact
  cellId?: CellId;
}

/**
 * Profiles
 */
export interface Profile {
  nickname: string;
  fields: {
    firstName: string;
    lastName: string;
    avatar: string;
  };
}
export interface ProfileExtended {
  profile: Profile;
  publicKeyB64: AgentPubKeyB64;
}

export interface CreateProfileInputUI {
  firstName: string;
  lastName: string;
  avatar: string;
}

/**
 * UI
 */
export enum Alignment {
  Left,
  Right,
}

export type CellIdB64 = string;

export interface LocalFile {
  file: File;
  dataURL: string;

  // Unique key used only by UI to give a persistent unique reference when rendered in a list
  // So that removing elements from the middle list removes that DOM element from the middle of the list
  // rather than from the end of the list.
  //
  // See https://svelte.dev/tutorial/svelte/keyed-each-blocks
  key: string;
}

export enum FileStatus {
  Pending, // Sent to holochain, but not published yet
  Loading, // Fetched from holochain
  Loaded, // Fetched from holochain and loaded into base64 data url
  Error,
}


/* Conference */

export interface ConferenceRoom {
  initiator: AgentPubKey;
  participants: AgentPubKey[];
  created_at: number;
  title: string;
  room_id: string;
}

export interface SignalPayload {
  room_id: string;
  from: AgentPubKey;
  to: AgentPubKey;
  payload_type: CallSignalType;
  data: string;
}

export enum CallSignalType {
  Offer = "Offer",
  Answer = "Answer",
  IceCandidate = "IceCandidate"
}

export interface CreateConferenceInput {
  participants: AgentPubKey[];
  title: string;
}

export interface JoinConferenceInput {
  room_id: ActionHash;
}

export interface SignalInput {
  room_id: string;
  target: AgentPubKey;
  payload_type: CallSignalType;
  data: string;
}

export interface ConferenceState {
  room: ConferenceRoom;
  participants: Map<AgentPubKey, ConferenceParticipant>;
  localStream?: MediaStream;
  isInitiator: boolean;
  ended: boolean;
}

export interface ConferenceParticipant {
  publicKey: AgentPubKey;
  peerConnection?: RTCPeerConnection;
  stream?: MediaStream;
  isConnected: boolean;
}