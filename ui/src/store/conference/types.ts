import SimplePeer from "simple-peer";
import { type AgentPubKeyB64 } from "@holochain/client";
import { type Subscriber, type Invalidator, type Unsubscriber } from "svelte/store";
import {
  type GenericKeyValueStore,
  type GenericKeyValueStoreDataExtended,
  type GenericValueStore,
} from "../generic/GenericKeyValueStore";
import { type RelayClient } from "../RelayClient";
import { type ConferenceRoom, type SimplePeerSignalPayload, ConferenceRole } from "$lib/types";

export {
  ICE_CONFIG,
  RECONNECT_CONFIG,
  CONNECTION_TIMEOUT_MS,
  MAX_CONFERENCE_PARTICIPANTS,
  INVITATION_TIMEOUT_MS,
  MEDIA_STATE_DEBOUNCE_MS,
  SDP_BUFFER_EXPIRY_MS,
  ROLE_CACHE_TTL_MS,
} from "$lib/../config";

export type ConnectionQuality = "excellent" | "good" | "fair" | "poor" | "disconnected" | "unknown";

export function deriveConnectionQuality(iceState?: RTCIceConnectionState): ConnectionQuality {
  switch (iceState) {
    case "connected":
    case "completed":
      return "excellent";
    case "checking":
      return "fair";
    case "disconnected":
      return "poor";
    case "failed":
    case "closed":
      return "disconnected";
    case "new":
      return "unknown";
    default:
      return "unknown";
  }
}

export interface SimplePeerParticipant {
  publicKey: AgentPubKeyB64;
  peer?: SimplePeer.Instance;
  connectionId?: string;
  hasJoined: boolean;
  connectionStatus?: "idle" | "init-sent" | "init-received" | "connecting" | "connected" | "failed";
  videoEnabled?: boolean;
  audioEnabled?: boolean;
  role?: ConferenceRole;
  pendingSdpSignals?: string[];
  pendingOutgoingSdp?: string[];
  reconnectAttempts?: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  connectionTimeout?: ReturnType<typeof setTimeout>;
  signalBufferExpiry?: number;
  lastSignalReceived?: number;
  connectionRetryCount?: number;
  networkMonitorTimeout?: ReturnType<typeof setTimeout>;
  lastIceState?: RTCIceConnectionState;
  videoTrackActive?: boolean;
  audioTrackActive?: boolean;
  trackFailureDetected?: boolean;
  connectionQuality?: ConnectionQuality;
  pendingInitRequest?: SimplePeerSignalPayload;
  streamVersion?: number;
  stream?: MediaStream;
}

export function isParticipantConnected(participant?: SimplePeerParticipant): boolean {
  return participant?.peer?.connected === true;
}

export function isParticipantDestroyed(participant?: SimplePeerParticipant): boolean {
  return participant?.peer?.destroyed === true;
}

export interface SimplePeerConferenceState {
  room: ConferenceRoom;
  participants: Map<AgentPubKeyB64, SimplePeerParticipant>;
  localStream?: MediaStream;
  isInitiator: boolean;
  ended: boolean;
  endedByMe?: boolean;
  error?: string;
  invitationStatus?: "pending" | "accepted" | "rejected" | "active" | "left";
  showPreJoinScreen?: boolean;
  isMinimized?: boolean;
  videoEnabled?: boolean;
  audioEnabled?: boolean;
  invitedBy?: AgentPubKeyB64;
  invitationTimestamp?: number;
  leftTimestamp?: number;
  rejoiningTimestamp?: number;
  cellIdB64?: string;
  startTime?: number;
  initiatorPubKeyB64?: AgentPubKeyB64;
  healthMonitorInterval?: ReturnType<typeof setInterval>;
  invitationTimeoutHandle?: ReturnType<typeof setTimeout>;
  myRole?: ConferenceRole;
  currentHostPubKeyB64?: AgentPubKeyB64;
  rolesFetchedAt?: number;
  cleaningUp?: boolean;
}

export interface ConferenceContext {
  client: RelayClient;
  conferences: GenericKeyValueStore<SimplePeerConferenceState>;
  reconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  networkMonitorTimers: Map<string, ReturnType<typeof setTimeout>>;
  healthMonitorIntervals: Map<string, ReturnType<typeof setInterval>>;
  mediaStateDebounceTimers: Map<string, ReturnType<typeof setTimeout>>;
  outgoingSdpBuffer: Map<string, Array<{ data: string; timestamp: number }>>;
}

export function safeGetConference(
  ctx: ConferenceContext,
  roomId: string,
): SimplePeerConferenceState | undefined {
  try {
    return ctx.conferences.getKeyValue(roomId);
  } catch {
    return undefined;
  }
}

export function generateConnectionId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export function updateParticipant(
  ctx: ConferenceContext,
  roomId: string,
  pubKey: string,
  updater: (participant: SimplePeerParticipant) => SimplePeerParticipant,
): void {
  ctx.conferences.updateKeyValue(roomId, (conf) => {
    if (!conf?.participants) return conf;
    const participant = conf.participants.get(pubKey);
    if (!participant) return conf;
    const newParticipants = new Map(conf.participants);
    newParticipants.set(pubKey, updater(participant));
    return { ...conf, participants: newParticipants };
  });
}

export interface SimplePeerConferenceStore {
  createConference: (
    participants: AgentPubKeyB64[],
    cellIdB64?: string,
    initiatorPubKeyB64?: AgentPubKeyB64,
  ) => Promise<string>;
  joinConference: (roomId: string, participants: AgentPubKeyB64[]) => Promise<void>;
  acceptConferenceInvitation: (roomId: string) => Promise<void>;
  setShowPreJoinScreen: (roomId: string, show: boolean) => void;
  setMinimized: (roomId: string, minimized: boolean) => void;
  setMediaEnabled: (roomId: string, video: boolean, audio: boolean) => void;
  rejectConferenceInvitation: (roomId: string) => Promise<void>;
  leaveConference: (roomId: string) => Promise<void>;
  endConferenceForAll: (roomId: string) => Promise<void>;
  sendMediaStateToAll: (
    roomId: string,
    videoEnabled: boolean,
    audioEnabled: boolean,
  ) => Promise<void>;
  handleSimplePeerSignal: (roomId: string, signal: SimplePeerSignalPayload) => void;
  initializeWebRTC: (roomId: string) => Promise<void>;
  initiateConnections: (roomId: string) => Promise<void>;
  cleanupWebRTC: (roomId: string) => void;
  cleanupPeer: (roomId: string, pubKey: string) => void;
  deriveConferenceStore: (roomId: string) => GenericValueStore<SimplePeerConferenceState>;
  getConference: (roomId: string) => SimplePeerConferenceState;
  setConference: (roomId: string, state: SimplePeerConferenceState) => void;
  updateConference: (
    roomId: string,
    updater: (state: SimplePeerConferenceState) => SimplePeerConferenceState,
  ) => void;
  removeConference: (roomId: string) => void;
  getIncomingInvitations: () => SimplePeerConferenceState[];
  fetchRoles: (roomId: string) => Promise<void>;
  transferHost: (roomId: string, newHostPubKeyB64: AgentPubKeyB64) => Promise<void>;
  kickParticipant: (roomId: string, targetPubKeyB64: AgentPubKeyB64) => Promise<void>;
  changeParticipantRole: (
    roomId: string,
    targetPubKeyB64: AgentPubKeyB64,
    newRole: ConferenceRole,
  ) => Promise<void>;
  canEndConference: (roomId: string) => boolean;
  canKick: (roomId: string, targetPubKeyB64: AgentPubKeyB64) => boolean;
  subscribe: (
    run: Subscriber<GenericKeyValueStoreDataExtended<SimplePeerConferenceState>>,
    invalidate?: Invalidator<GenericKeyValueStoreDataExtended<SimplePeerConferenceState>>,
  ) => Unsubscriber;
}

export interface CleanupReport {
  localStreamsStopped: number;
  peersDestroyed: number;
  timersCleared: number;
  buffersCleared: number;
  errors: string[];
}

export interface PeerCleanupReport {
  peersDestroyed: number;
  timersCleared: number;
  buffersCleared: number;
  errors: string[];
}
