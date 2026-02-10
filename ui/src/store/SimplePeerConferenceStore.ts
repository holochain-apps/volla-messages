import { type Subscriber, type Invalidator, type Unsubscriber } from "svelte/store";
import {
  createGenericKeyValueStore,
  type GenericKeyValueStore,
  type GenericKeyValueStoreDataExtended,
  deriveGenericValueStore,
} from "./generic/GenericKeyValueStore";
import { RelayClient } from "./RelayClient";
import { type AgentPubKeyB64 } from "@holochain/client";
import { ConferenceRole } from "$lib/types";

import {
  type ConferenceContext,
  type SimplePeerConferenceState,
  type SimplePeerParticipant,
  type ConnectionQuality,
  MAX_CONFERENCE_PARTICIPANTS,
  INVITATION_TIMEOUT_MS,
  createUIStateManager,
  createRoleManager,
  createConnectionMonitor,
  createSignalHandler,
  createPeerConnectionManager,
  createMediaManager,
  createConferenceLifecycle,
} from "./conference";

export type {
  SimplePeerConferenceState,
  SimplePeerParticipant,
  ConnectionQuality,
};
export { MAX_CONFERENCE_PARTICIPANTS, INVITATION_TIMEOUT_MS };

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
  handleSimplePeerSignal: (roomId: string, signal: import("$lib/types").SimplePeerSignalPayload) => void;
  initializeWebRTC: (roomId: string) => Promise<void>;
  initiateConnections: (roomId: string) => Promise<void>;
  cleanupWebRTC: (roomId: string) => void;
  cleanupPeer: (roomId: string, pubKey: string) => void;
  deriveConferenceStore: (
    roomId: string,
  ) => import("./generic/GenericKeyValueStore").GenericValueStore<SimplePeerConferenceState>;
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

export function createSimplePeerConferenceStore(client: RelayClient): SimplePeerConferenceStore {
  const conferences: GenericKeyValueStore<SimplePeerConferenceState> =
    createGenericKeyValueStore<SimplePeerConferenceState>([
      ([_, conference]) => conference?.invitationTimestamp || Date.now(),
    ]);

  const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const networkMonitorTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const healthMonitorIntervals = new Map<string, ReturnType<typeof setInterval>>();
  const mediaStateDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const outgoingSdpBuffer = new Map<string, Array<{ data: string; timestamp: number }>>();

  const ctx: ConferenceContext = {
    client,
    conferences,
    reconnectTimers,
    networkMonitorTimers,
    healthMonitorIntervals,
    mediaStateDebounceTimers,
    outgoingSdpBuffer,
  };

  let peerManager: ReturnType<typeof createPeerConnectionManager>;

  const connectionMonitor = createConnectionMonitor(
    ctx,
    (roomId: string, pubKey: string) => peerManager.cleanupPeer(roomId, pubKey),
    (roomId: string) => signalHandler.initiateConnections(roomId),
  );

  peerManager = createPeerConnectionManager(
    ctx,
    connectionMonitor.scheduleReconnect,
    connectionMonitor.startNetworkMonitoring,
    connectionMonitor.stopNetworkMonitoring,
  );

  const signalHandler = createSignalHandler(ctx, peerManager.createPeer);

  const mediaManager = createMediaManager(
    ctx,
    peerManager.cleanupPeer,
    peerManager.cleanupPeerWithVerification,
    signalHandler.handleSimplePeerSignal,
    signalHandler.initiateConnections,
    connectionMonitor.startConnectionHealthMonitoring,
    connectionMonitor.stopConnectionHealthMonitoring,
  );

  const lifecycle = createConferenceLifecycle(
    ctx,
    peerManager.cleanupPeer,
    mediaManager.cleanupWebRTC,
  );

  const roleManager = createRoleManager(ctx, peerManager.cleanupPeer);

  const uiState = createUIStateManager(ctx);

  function deriveConferenceStore(roomId: string) {
    return deriveGenericValueStore(conferences, roomId);
  }

  return {
    createConference: lifecycle.createConference,
    joinConference: lifecycle.joinConference,
    acceptConferenceInvitation: lifecycle.acceptConferenceInvitation,
    rejectConferenceInvitation: lifecycle.rejectConferenceInvitation,
    leaveConference: lifecycle.leaveConference,
    endConferenceForAll: lifecycle.endConferenceForAll,

    setShowPreJoinScreen: uiState.setShowPreJoinScreen,
    setMinimized: uiState.setMinimized,
    setMediaEnabled: uiState.setMediaEnabled,
    getIncomingInvitations: uiState.getIncomingInvitations,

    sendMediaStateToAll: mediaManager.sendMediaStateToAll,
    initializeWebRTC: mediaManager.initializeWebRTC,
    cleanupWebRTC: mediaManager.cleanupWebRTC,

    handleSimplePeerSignal: signalHandler.handleSimplePeerSignal,
    initiateConnections: signalHandler.initiateConnections,

    cleanupPeer: peerManager.cleanupPeer,

    fetchRoles: roleManager.fetchRoles,
    transferHost: roleManager.transferHost,
    kickParticipant: roleManager.kickParticipant,
    changeParticipantRole: roleManager.changeParticipantRole,
    canEndConference: roleManager.canEndConference,
    canKick: roleManager.canKick,

    deriveConferenceStore,
    getConference: conferences.getKeyValue,
    setConference: conferences.setKeyValue,
    updateConference: conferences.updateKeyValue,
    removeConference: conferences.removeKeyValue,
    subscribe: conferences.subscribe,
  };
}
