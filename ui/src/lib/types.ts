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

export enum Privacy {
  Private,
  Public,
}

// DNA modifier properties for a conversation
export interface DnaProperties {
  created: number;
  privacy: Privacy;

  // This is *NOT* the type specified in the DNA struct Properties (there it is an AgentPubKey)
  //
  // But because we have already been cloning cells rom the UI, using an AgentPubKeyB64 as progenitor,
  // we must keep it consistent to avoid an DNA-integrity breaking change.
  //
  // See https://github.com/holochain-apps/volla-messages/issues/392
  progenitor: AgentPubKeyB64;
}

export type EntryTypes = { type: "Message" } & MessageInput;

export interface MessageInput {
  content: string;
  bucket: number;
}

export type Messages = { [key: string]: Message };

export interface Conversation {
  networkSeed: string;
  dnaHashB64: DnaHashB64;
  cellId: CellId;
  config?: Config;
  privacy: Privacy;
  progenitor: AgentPubKey;
  messages: Messages;
  agentProfiles: { [key: AgentPubKeyB64]: Profile };
}

export interface LocalConversationData {
  archived: boolean;
  invitedContactKeys: string[];
  unread: boolean;
  invitationTitle?: string;
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
  title: string;
  proof?: MembraneProof;
}

// Holochain Type
export interface ImageStruct {
  last_modified: number;
  name: string;
  size: number;
  storage_entry_hash: EntryHash;
  file_type: string;
}

export enum FileStatus {
  Preview, // Stored locally, ready for display in input field.
  Pending, // Sent to holochain, but not published yet
  Loading, // Fetched from holochain
  Loaded, // Fetched from holochain and loaded into base64 data url
  Error,
}

export interface Image {
  id: string;
  dataURL?: string;
  fileType: string;
  file?: File;
  name: string;
  lastModified: number;
  size: number;
  storageEntryHash?: EntryHash;
  status: FileStatus;
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
  fullName: string; // Full name
  publicKeyB64: AgentPubKeyB64;
  originalActionHash: ActionHash;
  previousActionHash: ActionHash;
  privateConversationDnaHashB64?: DnaHashB64;
}

/**
 * Profiles
 */
import type { Profile } from "@holochain-open-dev/profiles";
export type { Profile } from "@holochain-open-dev/profiles";

export interface ProfileExtended {
  profile: Profile;
  publicKeyB64: AgentPubKeyB64;
}

/**
 * UI
 */
export enum Alignment {
  Left,
  Right,
}

export enum Size {
  Small,
  Large,
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
  participants: Map<AgentPubKeyB64, ConferenceParticipant>;
  localStream?: MediaStream;
  isInitiator: boolean;
  ended: boolean;
}

export interface ConferenceParticipant {
  publicKey: AgentPubKeyB64;
  peerConnection?: RTCPeerConnection;
  stream?: MediaStream;
  isConnected: boolean;
}