import type {
  ActionHash,
  AgentPubKey,
  AgentPubKeyB64,
  CellId,
  ClonedCell,
  Create,
  CreateLink,
  Delete,
  DeleteLink,
  EntryHash,
  MembraneProof,
  SignedActionHashed,
  Update,
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

export interface MessageDeleted {
  type: "MessageDeleted";
  action: SignedActionHashed<Delete>;
  original_action: ActionHash;
  from: AgentPubKey;
}

export type RelaySignal =
  | MessageSignal
  | MessageDeleted
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
      type: "ConferenceRejected";
      room_id: string;
      agent: AgentPubKey;
    }
  | {
      type: "ConferenceEnded";
      room_id: string;
      ended_by: AgentPubKey;
    }
  | ({
      type: "WebRTCSignal";
    } & SignalPayload)
  | {
      type: "SignalAck";
      signal_id: string;
      from: AgentPubKey;
    }
  | {
      type: "RoleChanged";
      room_id: string;
      new_role: ConferenceRole;
      from: AgentPubKey;
    }
  | {
      type: "Kicked";
      room_id: string;
      kicked_by: AgentPubKey;
    }
  | {
      type: "HostTransfer";
      room_id: string;
      new_host: AgentPubKey;
      from: AgentPubKey;
    };

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
  authorAgentPubKeyB64: AgentPubKeyB64;
  timestamp: number;
}

export interface MessageRecord {
  original_action: ActionHash;
  signed_action: SignedActionHashed;
  message?: Message;
}

export type ConferenceLogEvent = "started" | "ended";

export interface ConferenceLog {
  type: "conference_log";
  event: ConferenceLogEvent;
  conference_id: string;
  initiator: AgentPubKeyB64;
  timestamp: number;
  participants: AgentPubKeyB64[];
  duration_seconds?: number; // Only for 'ended' event
  participant_count: number;
}

/**
 * Helper functions for conference logs
 */

export function createConferenceLogMessage(log: ConferenceLog): string {
  return JSON.stringify(log);
}

export function isConferenceLog(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return (
      parsed.type === "conference_log" && (parsed.event === "started" || parsed.event === "ended")
    );
  } catch {
    return false;
  }
}

export function parseConferenceLog(content: string): ConferenceLog | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.type === "conference_log") {
      return parsed as ConferenceLog;
    }
    return null;
  } catch {
    return null;
  }
}

export interface SendMessageInput {
  message: Message;
  agents: AgentPubKey[];
}

export interface DeleteMessageInput {
  original_message_hash: ActionHash;
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
export type ActionHashB64 = string;

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

export interface FileExtended {
  file?: File;
  status: FileStatus;
}

/* Conference */

/**
 * Role hierarchy for conference participants.
 * Lower numeric value = higher privilege level.
 */
export enum ConferenceRole {
  Host = 0,    // Full control, 1 per conference
  CoHost = 1,  // Can kick members, end conference
  Member = 2,  // Basic participant
}

export interface ConferenceParticipantRecord {
  room_id: string;
  agent: AgentPubKey;
  role: ConferenceRole;
  joined_at: number;
  is_active: boolean;
}

export interface TransferHostInput {
  room_id: string;
  new_host: AgentPubKey;
}

export interface KickParticipantInput {
  room_id: string;
  target: AgentPubKey;
}

export interface RoleChangeInput {
  room_id: string;
  target: AgentPubKey;
  new_role: ConferenceRole;
}

export interface ConferenceRoom {
  room_id: string;
  participants: AgentPubKey[];
}

export interface SignalPayload {
  room_id: string;
  from: AgentPubKeyB64;
  to: AgentPubKeyB64;
  payload_type: SimplePeerSignalType | string;
  data: string;
  // Unique identifier for tracking acknowledgments
  signal_id?: string;
}

export enum SimplePeerSignalType {
  InitRequest = "InitRequest",
  InitAccept = "InitAccept",
  SdpData = "SdpData",
  MediaState = "MediaState",
}

export interface SimplePeerSignalPayload {
  room_id: string;
  from: AgentPubKeyB64;
  to: AgentPubKeyB64;
  signal_type: SimplePeerSignalType;
  connection_id: string;
  data: string;
}

export interface CreateConferenceInput {
  participants: AgentPubKey[];
}

export interface JoinConferenceInput {
  room_id: string;
  participants: AgentPubKey[];
}

export interface SignalInput {
  room_id: string;
  target: AgentPubKey;
  payload_type: SimplePeerSignalType | string;
  data: string;
}