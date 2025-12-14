import { decodeHashFromBase64, encodeHashToBase64, type AgentPubKeyB64 } from "@holochain/client";
import { get, type Subscriber, type Invalidator, type Unsubscriber } from "svelte/store";
import {
  createGenericKeyValueStore,
  type GenericKeyValueStore,
  type GenericKeyValueStoreDataExtended,
  type GenericKeyValueStoreData,
  deriveGenericValueStore,
} from "./generic/GenericKeyValueStore";
import { RelayClient } from "./RelayClient";
import {
  type ConferenceRoom,
  type ConferenceState,
  type SignalPayload,
  CallSignalType,
} from "$lib/types";

export interface ConferenceStore {
  createConference: (
    participants: AgentPubKeyB64[],
    cellIdB64?: string,
    initiatorPubKeyB64?: AgentPubKeyB64,
  ) => Promise<string>;
  joinConference: (roomId: string, participants: AgentPubKeyB64[]) => Promise<void>;
  acceptConferenceInvitation: (roomId: string) => Promise<void>;
  rejectConferenceInvitation: (roomId: string) => Promise<void>;
  leaveConference: (roomId: string) => Promise<void>;
  endConferenceForAll: (roomId: string) => Promise<void>;
  sendSignal: (
    roomId: string,
    target: AgentPubKeyB64,
    type: CallSignalType,
    data: string,
  ) => Promise<void>;
  sendMediaStateToAll: (
    roomId: string,
    videoEnabled: boolean,
    audioEnabled: boolean,
  ) => Promise<void>;
  handleSignalReceived: (roomId: string, signal: SignalPayload) => Promise<void>;
  handleAckReceived: (roomId: string, signalId: string, from: AgentPubKeyB64) => void;
  initializeWebRTC: (roomId: string) => Promise<void>;
  createPeerConnectionToParticipant: (roomId: string, participantPubKey: string) => Promise<void>;
  cleanupWebRTC: (roomId: string) => void;
  deriveConferenceStore: (
    roomId: string,
  ) => import("./generic/GenericKeyValueStore").GenericValueStore<ConferenceState>;
  getConference: (roomId: string) => ConferenceState;
  setConference: (roomId: string, state: ConferenceState) => void;
  updateConference: (roomId: string, updater: (state: ConferenceState) => ConferenceState) => void;
  removeConference: (roomId: string) => void;
  getIncomingInvitations: () => ConferenceState[];
  subscribe: (
    run: Subscriber<GenericKeyValueStoreDataExtended<ConferenceState>>,
    invalidate?: Invalidator<GenericKeyValueStoreDataExtended<ConferenceState>>,
  ) => Unsubscriber;
}

export function createConferenceStore(client: RelayClient): ConferenceStore {
  // sort conferences by invitation timestamp
  const conferences: GenericKeyValueStore<ConferenceState> =
    createGenericKeyValueStore<ConferenceState>([
      ([_, conference]) => conference.invitationTimestamp || Date.now(),
    ]);

  const RTCConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: "all" as RTCIceTransportPolicy,
  };

  type ParticipantState = ConferenceState["participants"] extends Map<any, infer T> ? T : never;
  const hasWindow = typeof window !== "undefined";
  const RECONNECT_CONFIG = {
    maxAttempts: 3,
    baseDelayMs: 1500,
    disconnectionGraceMs: 4000,
  } as const;

  const ACK_CONFIG = {
    // Wait 5 seconds for acknowledgment
    timeoutMs: 5000,
    // Retry up to 3 times
    maxRetries: 3,
    // Wait 2 seconds between retries
    retryDelayMs: 2000,
  } as const;

  function generateSignalId(): string {
    return `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  function safeGetConference(roomId: string): ConferenceState | undefined {
    try {
      return conferences.getKeyValue(roomId);
    } catch (error) {
      return undefined;
    }
  }

  function updateParticipant(
    roomId: string,
    pubKey: string,
    updater: (participant: ParticipantState) => ParticipantState,
  ): void {
    conferences.updateKeyValue(roomId, (conf) => {
      if (!conf) return conf;
      const participants = new Map(conf.participants);
      const participant = participants.get(pubKey);
      if (!participant) return conf;
      participants.set(pubKey, updater(participant));
      return { ...conf, participants };
    });
  }

  function cleanupParticipantConnection(roomId: string, pubKey: string): void {
    const state = safeGetConference(roomId);
    if (!state) return;

    const participant = state.participants.get(pubKey);
    if (!participant) return;

    // Close peer connection
    if (participant.peerConnection) {
      try {
        participant.peerConnection.close();
      } catch (e) {
        console.warn(`[WebRTC] Error closing peer connection for ${pubKey.slice(0, 20)}:`, e);
      }
    }

    // Stop remote stream tracks
    if (participant.stream) {
      participant.stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn(`[WebRTC] Error stopping track:`, e);
        }
      });
    }

    // Clear reconnect timer
    if (hasWindow && participant.reconnectTimerId !== undefined) {
      window.clearTimeout(participant.reconnectTimerId);
    }

    // Clear all pending ack timers
    if (participant.pendingAcks) {
      for (const [_, ack] of participant.pendingAcks) {
        if (ack.timerId && hasWindow) {
          window.clearTimeout(ack.timerId);
        }
      }
    }

    // Reset participant state to clean slate
    updateParticipant(roomId, pubKey, (p) => ({
      publicKey: p.publicKey,
      isConnected: false,
      // Keep this to track they were/are in the call
      hasJoined: p.hasJoined,
      videoEnabled: p.videoEnabled,
      audioEnabled: p.audioEnabled,
      // Clear all connection-related state
      peerConnection: undefined,
      stream: undefined,
      reconnectTimerId: undefined,
      reconnectAttempts: 0,
      lastFailureReason: undefined,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      pendingSignals: [],
      pendingIceCandidates: [],
      pendingAcks: new Map(),
    }));

    console.log(`[WebRTC] Cleaned up participant connection: ${pubKey.slice(0, 20)}`);
  }

  function clearPendingAck(roomId: string, pubKey: string, signalId: string): void {
    const state = safeGetConference(roomId);
    if (!state) return;
    const participant = state.participants.get(pubKey);
    if (!participant?.pendingAcks) return;

    const pendingAck = participant.pendingAcks.get(signalId);
    if (pendingAck?.timerId && hasWindow) {
      window.clearTimeout(pendingAck.timerId);
    }

    updateParticipant(roomId, pubKey, (p) => {
      const pendingAcks = new Map(p.pendingAcks || new Map());
      pendingAcks.delete(signalId);
      return { ...p, pendingAcks };
    });
  }

  async function scheduleSignalRetry(
    roomId: string,
    pubKey: string,
    signalId: string,
  ): Promise<void> {
    const state = safeGetConference(roomId);
    if (!state?.cellIdB64) return;
    const participant = state.participants.get(pubKey);
    const pendingAck = participant?.pendingAcks?.get(signalId);
    if (!pendingAck) return;

    if (pendingAck.retries >= ACK_CONFIG.maxRetries) {
      console.error(`[WebRTC] Signal ${signalId} failed after ${ACK_CONFIG.maxRetries} retries`);
      clearPendingAck(roomId, pubKey, signalId);
      return;
    }

    const nextRetry = pendingAck.retries + 1;
    console.warn(
      `[WebRTC] Retrying signal ${signalId} (attempt ${nextRetry}/${ACK_CONFIG.maxRetries})`,
    );

    // Update retry count
    updateParticipant(roomId, pubKey, (p) => {
      const pendingAcks = new Map(p.pendingAcks || new Map());
      const ack = pendingAcks.get(signalId);
      if (ack) {
        pendingAcks.set(signalId, { ...ack, retries: nextRetry, timerId: undefined });
      }
      return { ...p, pendingAcks };
    });

    // Wait before retry
    await new Promise((resolve) => setTimeout(resolve, ACK_CONFIG.retryDelayMs));

    // Resend the signal
    const latestState = safeGetConference(roomId);
    const latestParticipant = latestState?.participants.get(pubKey);
    const latestAck = latestParticipant?.pendingAcks?.get(signalId);
    if (!latestAck || !latestState?.cellIdB64) return;

    await sendSignalWithAck(
      roomId,
      pubKey,
      latestAck.signal.payload_type,
      latestAck.signal.data,
      signalId,
    );
  }

  async function sendSignalWithAck(
    roomId: string,
    target: string,
    type: CallSignalType,
    data: string,
    signalId?: string,
  ): Promise<void> {
    const state = safeGetConference(roomId);
    if (!state?.cellIdB64) {
      console.error("[ConferenceStore] Cannot send signal - no cellIdB64 in state");
      return;
    }

    const id = signalId || generateSignalId();
    const targetDecoded = decodeHashFromBase64(target);
    const cellId = client.decodeCellId(state.cellIdB64);

    // Track signal for acknowledgment (only for critical signals)
    const isCriticalSignal = type === CallSignalType.Offer || type === CallSignalType.Answer;
    if (isCriticalSignal) {
      const signalPayload: SignalPayload = {
        room_id: roomId,
        from: encodeHashToBase64(client.client.myPubKey),
        to: target,
        payload_type: type,
        data,
        signal_id: id,
      };

      updateParticipant(roomId, target, (p) => {
        const pendingAcks = new Map(p.pendingAcks || new Map());
        pendingAcks.set(id, {
          signal: signalPayload,
          timestamp: Date.now(),
          retries: signalId ? pendingAcks.get(id)?.retries || 0 : 0,
          timerId: undefined,
        });
        return { ...p, pendingAcks };
      });

      // Set timeout for acknowledgment
      if (hasWindow) {
        const timerId = window.setTimeout(() => {
          scheduleSignalRetry(roomId, target, id);
        }, ACK_CONFIG.timeoutMs);

        updateParticipant(roomId, target, (p) => {
          const pendingAcks = new Map(p.pendingAcks || new Map());
          const ack = pendingAcks.get(id);
          if (ack) {
            pendingAcks.set(id, { ...ack, timerId });
          }
          return { ...p, pendingAcks };
        });
      }
    }

    await client.sendSignal(roomId, targetDecoded, type, data, cellId);
  }

  function clearParticipantReconnect(roomId: string, pubKey: string): void {
    const state = safeGetConference(roomId);
    if (!state) return;
    const participant = state.participants.get(pubKey);
    if (!participant) return;

    if (hasWindow && participant.reconnectTimerId !== undefined) {
      window.clearTimeout(participant.reconnectTimerId);
    }

    updateParticipant(roomId, pubKey, (p) => ({
      ...p,
      reconnectTimerId: undefined,
      reconnectAttempts: 0,
      lastFailureReason: undefined,
    }));
  }

  function schedulePeerReconnect(
    roomId: string,
    pubKey: string,
    reason: string,
    extraDelayMs = 0,
    closeImmediately = true,
  ): void {
    const state = safeGetConference(roomId);
    if (!state?.localStream || !hasWindow) return;
    const participant = state.participants.get(pubKey);
    if (!participant) return;

    // Avoid duplicate timers
    if (participant.reconnectTimerId !== undefined) return;

    const nextAttempt = (participant.reconnectAttempts ?? 0) + 1;
    if (nextAttempt > RECONNECT_CONFIG.maxAttempts) {
      console.warn("[WebRTC] Max reconnect attempts reached for participant:", pubKey.slice(0, 20));
      updateParticipant(roomId, pubKey, (p) => ({
        ...p,
        isConnected: false,
        lastFailureReason: reason,
      }));
      return;
    }

    if (closeImmediately) {
      participant.peerConnection?.close();
    }

    const backoffDelay = RECONNECT_CONFIG.baseDelayMs * Math.pow(2, nextAttempt - 1);
    const delay = extraDelayMs + backoffDelay;

    const timerId = window.setTimeout(async () => {
      const latestState = safeGetConference(roomId);
      if (!latestState?.localStream) return;
      const latestParticipant = latestState.participants.get(pubKey);
      if (!latestParticipant) return;

      // Clear timer reference immediately
      updateParticipant(roomId, pubKey, (p) => ({
        ...p,
        reconnectTimerId: undefined,
      }));

      // If connection recovered before timer fired, skip recreating
      if (latestParticipant.isConnected) {
        clearParticipantReconnect(roomId, pubKey);
        return;
      }

      if (!closeImmediately) {
        latestParticipant.peerConnection?.close();
      }

      try {
        await createPeerConnectionForParticipant(roomId, pubKey, latestState.localStream, {
          isRetry: true,
        });
      } catch (error) {
        console.error(
          "[WebRTC] Retry connection failed for participant:",
          pubKey.slice(0, 20),
          error,
        );
        schedulePeerReconnect(
          roomId,
          pubKey,
          `retry_failed:${reason}`,
          RECONNECT_CONFIG.baseDelayMs,
          true,
        );
      }
    }, delay);

    updateParticipant(roomId, pubKey, (p) => ({
      ...p,
      reconnectAttempts: nextAttempt,
      reconnectTimerId: timerId,
      lastFailureReason: reason,
      isConnected: false,
      ...(closeImmediately ? { peerConnection: undefined, stream: undefined } : {}),
    }));
  }

  async function createAndSendOffer(
    roomId: string,
    pubKey: string,
    peerConnection: RTCPeerConnection,
    context: string,
  ): Promise<void> {
    // Check signaling state before attempting to create offer
    if (
      peerConnection.signalingState !== "stable" &&
      peerConnection.signalingState !== "have-local-offer"
    ) {
      console.log(
        `[Perfect Negotiation] Skipping offer creation for ${pubKey.slice(0, 20)} - wrong state: ${peerConnection.signalingState}`,
      );
      return;
    }

    let shouldAbort = false;
    let currentState = false;

    // Check and update makingOffer flag atomically
    conferences.updateKeyValue(roomId, (conf) => {
      const participants = new Map(conf.participants);
      const participant = participants.get(pubKey);

      if (!participant) {
        shouldAbort = true;
        return conf;
      }

      if (participant.makingOffer) {
        console.log(
          `[Perfect Negotiation] Already making offer to ${pubKey.slice(0, 20)}, skipping`,
        );
        shouldAbort = true;
        return conf;
      }

      currentState = participant.makingOffer || false;
      participants.set(pubKey, { ...participant, makingOffer: true });
      return { ...conf, participants };
    });

    if (shouldAbort) return;

    try {
      // Check state again right before creating offer
      if (
        peerConnection.signalingState !== "stable" &&
        peerConnection.signalingState !== "have-local-offer"
      ) {
        console.log(
          `[Perfect Negotiation] State changed before offer creation: ${peerConnection.signalingState}`,
        );
        return;
      }

      await peerConnection.setLocalDescription();

      if (peerConnection.localDescription) {
        console.log(
          `[Perfect Negotiation] Sending offer to ${pubKey.slice(0, 20)} (context: ${context})`,
        );
        await sendSignal(
          roomId,
          pubKey,
          CallSignalType.Offer,
          JSON.stringify(peerConnection.localDescription),
        );
      }
    } catch (err) {
      console.error(
        "[Perfect Negotiation] Error creating offer for:",
        pubKey.slice(0, 20),
        "context:",
        context,
        err,
      );
    } finally {
      // Always clear makingOffer flag
      conferences.updateKeyValue(roomId, (conf) => {
        const participants = new Map(conf.participants);
        const participant = participants.get(pubKey);
        if (participant) {
          participants.set(pubKey, { ...participant, makingOffer: false });
        }
        return { ...conf, participants };
      });
    }
  }

  async function createConference(
    participants: AgentPubKeyB64[],
    cellIdB64?: string,
    initiatorPubKeyB64?: AgentPubKeyB64,
  ): Promise<string> {
    if (!cellIdB64) {
      throw new Error("cellIdB64 is required for creating a conference");
    }

    const participantsEncoded = participants.map((p) => decodeHashFromBase64(p));
    const cellId = client.decodeCellId(cellIdB64);
    const roomId = await client.createConference(participantsEncoded, cellId);

    if (!roomId) throw new Error("Failed to create conference room");

    const room: ConferenceRoom = {
      participants: participantsEncoded,
      room_id: roomId,
    };

    const myPubKey = encodeHashToBase64(client.client.myPubKey);

    const state: ConferenceState = {
      room,
      participants: new Map(
        participants.map((p) => [
          p,
          {
            publicKey: p,
            isConnected: false,
            hasJoined: false,
          },
        ]),
      ),
      isInitiator: true,
      ended: false,
      cellIdB64,
      startTime: Date.now(),
      initiatorPubKeyB64,
      invitationStatus: "accepted",
    };

    // Add self to participants as already joined
    // The initiator created the conference
    // so they're implicitly joined
    state.participants.set(myPubKey, {
      publicKey: myPubKey,
      isConnected: false,
      hasJoined: true, // Initiator is already in the conference
    });

    conferences.setKeyValue(room.room_id, state);

    return room.room_id;
  }

  async function joinConference(roomId: string, participants: AgentPubKeyB64[]): Promise<void> {
    const existingState = safeGetConference(roomId);
    const participantsDecoded = participants.map((p) => decodeHashFromBase64(p));

    if (existingState) {
      // Conference already exists, just join it
      if (!existingState.cellIdB64) {
        throw new Error("Conference state must have cellIdB64");
      }
      const cellId = client.decodeCellId(existingState.cellIdB64);
      await client.joinConference(roomId, participantsDecoded, cellId);
      return;
    }

    // Create new conference state
    const state: ConferenceState = {
      room: {
        room_id: roomId,
        participants: participantsDecoded,
      },
      participants: new Map(
        participants.map((p) => [
          p,
          {
            publicKey: p,
            isConnected: false,
            hasJoined: false,
          },
        ]),
      ),
      isInitiator: false,
      ended: false,
    };

    conferences.setKeyValue(roomId, state);

    // Note: We cannot join without knowing the cellId
    // This branch should not be reached in normal operation
    console.warn("[ConferenceStore] joinConference called without existing conference state");
  }

  async function acceptConferenceInvitation(roomId: string): Promise<void> {
    const state = safeGetConference(roomId);
    if (!state) return;

    if (!state.cellIdB64) {
      throw new Error("Conference state must have cellIdB64");
    }

    // Check if this is a rejoin (user previously left)
    // BEFORE clearing leftTimestamp
    const isRejoining = state.invitationStatus === "left" && state.leftTimestamp !== undefined;

    if (isRejoining) {
      console.log(`[ConferenceStore] Rejoining conference: ${roomId}`);

      // Clean up any residual state from previous session
      const myPubKey = encodeHashToBase64(client.client.myPubKey);
      for (const [pubKey] of state.participants) {
        if (pubKey !== myPubKey) {
          cleanupParticipantConnection(roomId, pubKey);
        }
      }
    }

    conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      invitationStatus: "accepted" as const,
      // Clear the left timestamp
      leftTimestamp: undefined,
      // Mark that we're rejoining
      rejoiningTimestamp: isRejoining ? Date.now() : undefined,
    }));

    const cellId = client.decodeCellId(state.cellIdB64);
    const participants = Array.from(state.participants.keys());
    await client.joinConference(
      roomId,
      participants.map((p) => decodeHashFromBase64(p)),
      cellId,
    );
  }

  async function rejectConferenceInvitation(roomId: string): Promise<void> {
    const state = safeGetConference(roomId);
    if (!state) return;

    if (!state.cellIdB64) {
      console.warn("Conference state missing cellIdB64, skipping reject signal");
      conferences.removeKeyValue(roomId);
      return;
    }

    conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      invitationStatus: "rejected" as const,
    }));

    try {
      const cellId = client.decodeCellId(state.cellIdB64);
      const participantsDecoded = Array.from(state.participants.keys()).map((p) =>
        decodeHashFromBase64(p),
      );
      await client.rejectConference(roomId, participantsDecoded, cellId);
    } catch (e) {
      console.error("Failed to send reject signal", e);
    }
    setTimeout(() => {
      conferences.removeKeyValue(roomId);
    }, 1000);
  }

  function getIncomingInvitations(): ConferenceState[] {
    let currentData: GenericKeyValueStoreData<ConferenceState> = {};
    const unsubscribe = conferences.subscribe((data) => {
      currentData = data.data;
    });
    unsubscribe();

    return Object.values(currentData).filter(
      (conf: ConferenceState) => conf.invitationStatus === "pending" && !conf.isInitiator,
    );
  }

  async function leaveConference(roomId: string): Promise<void> {
    const state = safeGetConference(roomId);

    if (!state?.cellIdB64) {
      console.warn("Conference state missing cellIdB64, skipping leave signal");
      cleanupWebRTC(roomId);
      return;
    }

    const cellId = client.decodeCellId(state.cellIdB64);

    // Send leave signal to holochain
    await client.leaveConference(roomId, cellId);

    // Clean up WebRTC resources
    cleanupWebRTC(roomId);

    // Keep the conference in state with a 'left' status so the user can rejoin
    // This applies to both initiators and participants
    if (state) {
      conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        invitationStatus: "left" as const, // Status to indicate user left the conference
        localStream: undefined,
        // Track when we left for rejoin detection
        leftTimestamp: Date.now(),
        participants: new Map(
          Array.from(conf.participants.entries()).map(([key, participant]) => [
            key,
            {
              publicKey: participant.publicKey,
              isConnected: false,
              hasJoined: participant.hasJoined,
              videoEnabled: participant.videoEnabled,
              audioEnabled: participant.audioEnabled,
              // Clear all connection-related state completely
              peerConnection: undefined,
              stream: undefined,
              reconnectTimerId: undefined,
              reconnectAttempts: 0,
              lastFailureReason: undefined,
              makingOffer: false,
              ignoreOffer: false,
              isSettingRemoteAnswerPending: false,
              pendingSignals: [],
              pendingIceCandidates: [],
              pendingAcks: new Map(),
            },
          ]),
        ),
      }));
    }

    console.log(`[ConferenceStore] Left conference: ${roomId}`);
  }

  async function endConferenceForAll(roomId: string): Promise<void> {
    const conference = safeGetConference(roomId);
    if (!conference?.room?.participants) {
      console.error("[ConferenceStore] Cannot end conference - no participants found");
      return;
    }

    if (!conference.cellIdB64) {
      console.error("[ConferenceStore] Cannot end conference - no cellIdB64 found");
      cleanupWebRTC(roomId);
      conferences.removeKeyValue(roomId);
      return;
    }

    const cellId = client.decodeCellId(conference.cellIdB64);
    await client.endConferenceForAll(roomId, conference.room.participants, cellId);
    cleanupWebRTC(roomId);
    conferences.removeKeyValue(roomId);
  }

  async function sendSignal(
    roomId: string,
    target: AgentPubKeyB64,
    type: CallSignalType,
    data: string,
  ): Promise<void> {
    await sendSignalWithAck(roomId, target, type, data);
  }

  function handleAckReceived(roomId: string, signalId: string, from: AgentPubKeyB64): void {
    console.log(
      `[WebRTC] Acknowledgment received for signal ${signalId} from ${from.slice(0, 20)}`,
    );
    clearPendingAck(roomId, from, signalId);
  }

  async function sendMediaStateToAll(
    roomId: string,
    videoEnabled: boolean,
    audioEnabled: boolean,
  ): Promise<void> {
    const state = safeGetConference(roomId);
    if (!state) return;
    const mediaState = JSON.stringify({ videoEnabled, audioEnabled });
    const selfPubKeyB64 = encodeHashToBase64(client.client.myPubKey);
    const sendPromises: Promise<void>[] = [];
    state.participants.forEach((participant, pubKey) => {
      if (pubKey === selfPubKeyB64) return;
      sendPromises.push(sendSignal(roomId, pubKey, CallSignalType.MediaState, mediaState));
    });
    await Promise.all(sendPromises);
  }

  async function handleSignalReceived(roomId: string, signal: SignalPayload): Promise<void> {
    const state = safeGetConference(roomId);
    if (!state) return;

    const participant = state.participants.get(signal.from);
    if (!participant) return;

    // Send acknowledgment for critical signals
    const isCriticalSignal =
      signal.payload_type === CallSignalType.Offer || signal.payload_type === CallSignalType.Answer;
    if (isCriticalSignal && signal.signal_id && state.cellIdB64) {
      const cellId = client.decodeCellId(state.cellIdB64);
      const target = decodeHashFromBase64(signal.from);
      try {
        await client.sendAckSignal(signal.signal_id, target, cellId);
        console.log(`[WebRTC] Sent acknowledgment for signal ${signal.signal_id}`);
      } catch (error) {
        console.error(`[WebRTC] Failed to send acknowledgment:`, error);
      }
    }

    const peerConnection = participant.peerConnection;

    if (!peerConnection) {
      // Buffer signal for later processing, but with timestamp for cleanup
      const signalWithTimestamp = { ...signal, bufferedAt: Date.now() };

      conferences.updateKeyValue(roomId, (conf) => {
        const participants = new Map(conf.participants);
        const p = participants.get(signal.from);
        if (p) {
          // Filter out old buffered signals (older than 10 seconds)
          const now = Date.now();
          const validSignals = (p.pendingSignals || []).filter(
            (s: any) => !s.bufferedAt || now - s.bufferedAt < 10000,
          );

          participants.set(signal.from, {
            ...p,
            pendingSignals: [...validSignals, signalWithTimestamp],
          });
        }
        return { ...conf, participants };
      });

      console.log(
        `[WebRTC] Buffering signal ${signal.payload_type} from ${signal.from.slice(0, 20)} (no peer connection yet)`,
      );
      return;
    }

    // Determine polite peer via lexicographic comparison
    const myPubKey = encodeHashToBase64(client.client.myPubKey);
    const isPolite = myPubKey < signal.from;

    try {
      switch (signal.payload_type) {
        case CallSignalType.Offer:
          // Perfect Negotiation: detect offer collision
          const offerCollision =
            peerConnection.signalingState !== "stable" || participant.makingOffer === true;

          const ignoreOffer = !isPolite && offerCollision;
          if (ignoreOffer) {
            console.log(
              `[Perfect Negotiation] Ignoring offer from ${signal.from.slice(0, 20)} (impolite peer, collision detected)`,
            );
            return;
          }

          // If polite and colliding, rollback our offer
          if (isPolite && offerCollision) {
            console.log(
              `[Perfect Negotiation] Polite peer rolling back for offer from ${signal.from.slice(0, 20)}`,
            );
            await peerConnection.setLocalDescription({ type: "rollback" });

            // Clear makingOffer flag after rollback
            conferences.updateKeyValue(roomId, (conf) => {
              const participants = new Map(conf.participants);
              const p = participants.get(signal.from);
              if (p) {
                participants.set(signal.from, { ...p, makingOffer: false });
              }
              return { ...conf, participants };
            });
          }

          await peerConnection.setRemoteDescription(JSON.parse(signal.data));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);

          // Process any buffered ICE candidates after setting remote description
          const bufferedCandidates = participant.pendingIceCandidates || [];
          if (bufferedCandidates.length > 0) {
            console.log(
              `[WebRTC] Processing ${bufferedCandidates.length} buffered ICE candidates from ${signal.from.slice(0, 20)}`,
            );
            for (const candidate of bufferedCandidates) {
              try {
                await peerConnection.addIceCandidate(candidate);
              } catch (err) {
                console.warn(`Failed to add buffered ICE candidate:`, err);
              }
            }

            // Clear buffer
            conferences.updateKeyValue(roomId, (conf) => {
              const participants = new Map(conf.participants);
              const p = participants.get(signal.from);
              if (p) {
                participants.set(signal.from, { ...p, pendingIceCandidates: [] });
              }
              return { ...conf, participants };
            });
          }

          await sendSignal(roomId, signal.from, CallSignalType.Answer, JSON.stringify(answer));
          break;

        case CallSignalType.Answer:
          // Check if we're in correct state to accept answer
          if (peerConnection.signalingState !== "have-local-offer") {
            console.warn(
              `[Perfect Negotiation] Received answer in wrong state: ${peerConnection.signalingState}`,
            );
            return;
          }

          // Prevent race condition with multiple answers
          if (participant.isSettingRemoteAnswerPending) {
            console.warn(
              `[Perfect Negotiation] Already setting remote answer for ${signal.from.slice(0, 20)}`,
            );
            return;
          }

          // Set flag to prevent concurrent answer processing
          conferences.updateKeyValue(roomId, (conf) => {
            const participants = new Map(conf.participants);
            const p = participants.get(signal.from);
            if (p) {
              participants.set(signal.from, { ...p, isSettingRemoteAnswerPending: true });
            }
            return { ...conf, participants };
          });

          try {
            await peerConnection.setRemoteDescription(JSON.parse(signal.data));

            // Process any buffered ICE candidates after setting remote description
            const bufferedCandidates = participant.pendingIceCandidates || [];
            if (bufferedCandidates.length > 0) {
              console.log(
                `[WebRTC] Processing ${bufferedCandidates.length} buffered ICE candidates from ${signal.from.slice(0, 20)}`,
              );
              for (const candidate of bufferedCandidates) {
                try {
                  await peerConnection.addIceCandidate(candidate);
                } catch (err) {
                  console.warn(`Failed to add buffered ICE candidate:`, err);
                }
              }
            }

            // Clear flag and buffer
            conferences.updateKeyValue(roomId, (conf) => {
              const participants = new Map(conf.participants);
              const p = participants.get(signal.from);
              if (p) {
                participants.set(signal.from, {
                  ...p,
                  isSettingRemoteAnswerPending: false,
                  pendingIceCandidates: [],
                  makingOffer: false,
                });
              }
              return { ...conf, participants };
            });
          } catch (err) {
            // Clear flag on error
            conferences.updateKeyValue(roomId, (conf) => {
              const participants = new Map(conf.participants);
              const p = participants.get(signal.from);
              if (p) {
                participants.set(signal.from, { ...p, isSettingRemoteAnswerPending: false });
              }
              return { ...conf, participants };
            });
            throw err;
          }
          break;

        case CallSignalType.IceCandidate:
          const candidateData = JSON.parse(signal.data);

          // Buffer ICE candidates if remote description not yet set
          if (!peerConnection.remoteDescription || !peerConnection.remoteDescription.type) {
            console.log(
              `[WebRTC] Buffering ICE candidate from ${signal.from.slice(0, 20)} (no remote description yet)`,
            );
            conferences.updateKeyValue(roomId, (conf) => {
              const participants = new Map(conf.participants);
              const p = participants.get(signal.from);
              if (p) {
                participants.set(signal.from, {
                  ...p,
                  pendingIceCandidates: [...(p.pendingIceCandidates || []), candidateData],
                });
              }
              return { ...conf, participants };
            });
            return;
          }

          try {
            await peerConnection.addIceCandidate(candidateData);
          } catch (err) {
            console.warn(`Failed to add ICE candidate from ${signal.from.slice(0, 20)}:`, err);
          }
          break;

        case CallSignalType.MediaState:
          const { videoEnabled, audioEnabled } = JSON.parse(signal.data);

          // Update the participant's media state in the store
          conferences.updateKeyValue(roomId, (conf) => {
            const participants = new Map(conf.participants);
            const p = participants.get(signal.from);
            if (p) {
              participants.set(signal.from, {
                ...p,
                videoEnabled,
                audioEnabled,
              });
            }
            return { ...conf, participants };
          });
          break;
      }
    } catch (err) {
      console.error(
        `[Perfect Negotiation] Error handling signal from ${signal.from.slice(0, 20)}:`,
        err,
      );

      // Only set ignoreOffer if we're impolite and there's an offer collision
      if (!isPolite && signal.payload_type === CallSignalType.Offer) {
        conferences.updateKeyValue(roomId, (conf) => {
          const participants = new Map(conf.participants);
          const p = participants.get(signal.from);
          if (p) {
            participants.set(signal.from, { ...p, ignoreOffer: true });
          }
          return { ...conf, participants };
        });
      }
    }
  }

  async function getUserMediaWithFallback(): Promise<MediaStream> {
    const constraints = [
      // ideal constraints first
      {
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      },
      // fallback to lower quality
      {
        video: {
          width: { ideal: 320, max: 640 },
          height: { ideal: 240, max: 480 },
        },
        audio: true,
      },
      // audio only fallback
      {
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      },
      // just audio
      { audio: true },
    ];

    for (const constraint of constraints) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraint);
        return stream;
      } catch (error) {
        console.warn("Failed with constraints:", constraint, "Error:", error);
      }
    }

    throw new Error(
      "Unable to acquire camera or microphone access. Please check permissions and try again.",
    );
  }

  async function createPeerConnectionForParticipant(
    roomId: string,
    pubKey: string,
    localStream: MediaStream,
    options: { isRetry?: boolean } = {},
  ): Promise<void> {
    const existingState = safeGetConference(roomId);
    if (!existingState) {
      console.warn("[WebRTC] Cannot create peer connection - missing conference state", roomId);
      return;
    }

    const existingParticipant = existingState.participants.get(pubKey);
    if (!existingParticipant) {
      console.warn("[WebRTC] Participant not found when creating connection:", pubKey.slice(0, 20));
      return;
    }

    existingParticipant.peerConnection?.close();
    clearParticipantReconnect(roomId, pubKey);

    let peerConnection: RTCPeerConnection;
    try {
      peerConnection = new RTCPeerConnection(RTCConfig);
    } catch (error) {
      console.error("[WebRTC] Failed to create RTCPeerConnection for:", pubKey, error);
      throw error;
    }

    updateParticipant(roomId, pubKey, (participant) => ({
      ...participant,
      peerConnection,
      isConnected: false,
      reconnectTimerId: undefined,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      pendingIceCandidates: [],
      lastFailureReason: options.isRetry ? participant.lastFailureReason : undefined,
    }));

    const renegotiate = async (source: string) => {
      await createAndSendOffer(roomId, pubKey, peerConnection, source);
    };

    peerConnection.onnegotiationneeded = async () => {
      // Debounce negotiation to avoid rapid-fire offers
      await new Promise((resolve) => setTimeout(resolve, 100));
      await renegotiate("onnegotiationneeded");
    };

    peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        await sendSignal(
          roomId,
          pubKey,
          CallSignalType.IceCandidate,
          JSON.stringify(event.candidate),
        );
      }
    };

    peerConnection.ontrack = (event) => {
      console.log("[WebRTC] ontrack event received for:", pubKey.slice(0, 20), {
        streamsCount: event.streams.length,
        streamId: event.streams[0]?.id,
        track: event.track.kind,
        trackId: event.track.id,
        trackEnabled: event.track.enabled,
        trackReadyState: event.track.readyState,
      });

      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        clearParticipantReconnect(roomId, pubKey);

        conferences.updateKeyValue(roomId, (conf) => {
          const participants = new Map(conf.participants);
          const participant = participants.get(pubKey);
          if (!participant) {
            console.warn(
              "[WebRTC] ontrack: Participant not found in conference:",
              pubKey.slice(0, 20),
            );
            return conf;
          }

          participants.set(pubKey, {
            ...participant,
            stream: remoteStream,
            isConnected: true,
            lastFailureReason: undefined,
          });

          return {
            ...conf,
            participants,
          };
        });
      } else {
        console.warn("[WebRTC] ontrack: No streams in event");
      }
    };

    peerConnection.onconnectionstatechange = () => {
      switch (peerConnection.connectionState) {
        case "failed":
          console.error("[WebRTC] Peer connection failed for participant:", pubKey);
          peerConnection.restartIce();
          schedulePeerReconnect(roomId, pubKey, "connection_failed", 0, true);
          break;
        case "disconnected":
          console.warn("[WebRTC] Peer connection disconnected for:", pubKey);
          schedulePeerReconnect(
            roomId,
            pubKey,
            "connection_disconnected",
            RECONNECT_CONFIG.disconnectionGraceMs,
            false,
          );
          break;
        case "connected":
          clearParticipantReconnect(roomId, pubKey);
          conferences.updateKeyValue(roomId, (conf) => {
            const participants = new Map(conf.participants);
            const participant = participants.get(pubKey);
            if (participant) {
              participants.set(pubKey, {
                ...participant,
                isConnected: true,
                ignoreOffer: false,
                makingOffer: false,
                lastFailureReason: undefined,
              });
            }
            return { ...conf, participants };
          });
          break;
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      if (peerConnection.iceConnectionState === "failed") {
        console.error("[WebRTC] ICE connection failed for:", pubKey);
      }
    };

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    // Determine who should initiate based on lexicographic ordering
    const myPubKey = encodeHashToBase64(client.client.myPubKey);
    const shouldInitiate = myPubKey > pubKey; // Higher pubkey initiates

    if (shouldInitiate && existingParticipant.hasJoined) {
      // Add small jitter to prevent exact simultaneous offers
      const jitter = Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, jitter));
      await renegotiate("initial_tracks");
    }

    // Process any pending signals
    const latestState = safeGetConference(roomId);
    const participant = latestState?.participants.get(pubKey);
    if (participant?.pendingSignals && participant.pendingSignals.length > 0) {
      console.log(
        `[WebRTC] Processing ${participant.pendingSignals.length} pending signals for ${pubKey.slice(0, 20)}`,
      );
      for (const queuedSignal of participant.pendingSignals) {
        try {
          await handleSignalReceived(roomId, queuedSignal);
        } catch (error) {
          console.error("Error processing queued signal:", error);
        }
      }

      conferences.updateKeyValue(roomId, (conf) => {
        const participants = new Map(conf.participants);
        const p = participants.get(pubKey);
        if (p) {
          participants.set(pubKey, { ...p, pendingSignals: [] });
        }
        return { ...conf, participants };
      });
    }
  }

  async function createPeerConnectionToParticipant(
    roomId: string,
    participantPubKey: string,
  ): Promise<void> {
    const state = safeGetConference(roomId);
    if (!state?.localStream) {
      console.error("[WebRTC] Cannot create peer connection - no local stream");
      return;
    }

    // Check if peer connection already exists and is in a good state
    const participant = state.participants.get(participantPubKey);
    if (participant?.peerConnection) {
      const connState = participant.peerConnection.connectionState;

      // If connection is already connected or connecting, don't recreate
      if (connState === "connected" || connState === "connecting") {
        console.log(
          `[WebRTC] Peer connection already ${connState} for ${participantPubKey.slice(0, 20)}, skipping recreation`,
        );
        return;
      }

      // If in failed/disconnected/closed state, close it before creating new one
      if (connState === "failed" || connState === "disconnected" || connState === "closed") {
        console.log(
          `[WebRTC] Closing existing ${connState} peer connection before creating new one for ${participantPubKey.slice(0, 20)}`,
        );
        try {
          participant.peerConnection.close();
        } catch (e) {
          console.warn("Error closing existing peer connection:", e);
        }
      }
    }

    await createPeerConnectionForParticipant(roomId, participantPubKey, state.localStream);
  }

  async function initializeWebRTC(roomId: string): Promise<void> {
    const state = safeGetConference(roomId);
    if (!state) {
      console.error(
        "[ConferenceStore] initializeWebRTC: No conference state found for room:",
        roomId,
      );
      return;
    }

    // Detect if this is a rejoin scenario using rejoiningTimestamp
    const isRejoining =
      // Within 10 seconds of rejoin
      state.rejoiningTimestamp !== undefined && Date.now() - state.rejoiningTimestamp < 10000;
    // Check if already initialized (but allow reinitialization on rejoin)
    if (state.localStream && !isRejoining) {
      console.log(
        "[ConferenceStore] initializeWebRTC: WebRTC already initialized for room:",
        roomId,
      );
      return;
    }

    // If rejoining OR have existing stream, force cleanup first
    if ((isRejoining || state.localStream) && state.localStream) {
      console.log(
        "[ConferenceStore] initializeWebRTC: Detected rejoin, cleaning up old state first",
      );

      // Stop old local stream
      state.localStream.getTracks().forEach((track) => track.stop());

      // Clean up all peer connections
      const myPubKey = encodeHashToBase64(client.client.myPubKey);
      for (const [pubKey] of state.participants) {
        if (pubKey !== myPubKey) {
          cleanupParticipantConnection(roomId, pubKey);
        }
      }

      // Clear local stream
      conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        localStream: undefined,
      }));

      // Small delay to ensure cleanup completes
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log("[ConferenceStore] initializeWebRTC: Starting initialization for room:", roomId, {
      isInitiator: state.isInitiator,
      participantCount: state.participants.size,
      isRejoining,
    });

    try {
      // Check if WebRTC is available
      if (typeof RTCPeerConnection === "undefined") {
        throw new Error(
          "RTCPeerConnection is not available in this browser/webview. WebRTC is not supported.",
        );
      }

      const stream = await getUserMediaWithFallback();
      console.log("[ConferenceStore] initializeWebRTC: Got local media stream", {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
      });

      conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        localStream: stream,
      }));

      // Broadcast initial media state (both video and audio enabled by default)
      await sendMediaStateToAll(roomId, true, true);

      const selfPubKey = encodeHashToBase64(client.client.myPubKey);

      for (const [pubKey, participant] of state.participants.entries()) {
        // Skip ourselves
        if (pubKey === selfPubKey) continue;

        console.log(
          "[ConferenceStore] initializeWebRTC: Creating peer connection to:",
          pubKey.slice(0, 20),
          {
            hasJoined: participant.hasJoined,
            isConnected: participant.isConnected,
          },
        );

        await createPeerConnectionForParticipant(roomId, pubKey, stream);
      }

      console.log("[ConferenceStore] initializeWebRTC: Initialization complete");

      // Clear the rejoining timestamp after successful initialization
      conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        rejoiningTimestamp: undefined,
      }));
    } catch (error) {
      console.error("[ConferenceStore] Error initializing WebRTC:", error);
      conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        error: error instanceof Error ? error.message : "Failed to initialize WebRTC",
        rejoiningTimestamp: undefined, // Clear on error too
      }));
    }
  }

  function cleanupWebRTC(roomId: string): void {
    const state = safeGetConference(roomId);
    if (!state) return;

    console.log(`[ConferenceStore] Cleaning up WebRTC for room: ${roomId}`);

    // Stop local stream
    if (state.localStream) {
      state.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn("[WebRTC] Error stopping local track:", e);
        }
      });
    }

    // Clean up all participant connections
    for (const [pubKey] of state.participants.entries()) {
      cleanupParticipantConnection(roomId, pubKey);
    }

    // Clear local stream
    conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      localStream: undefined,
    }));
  }

  function deriveConferenceStore(roomId: string) {
    return deriveGenericValueStore(conferences, roomId);
  }

  return {
    createConference,
    joinConference,
    acceptConferenceInvitation,
    rejectConferenceInvitation,
    leaveConference,
    endConferenceForAll,
    sendSignal,
    sendMediaStateToAll,
    handleSignalReceived,
    handleAckReceived,
    initializeWebRTC,
    createPeerConnectionToParticipant,
    cleanupWebRTC,
    deriveConferenceStore, // Export for component use
    getConference: conferences.getKeyValue,
    setConference: conferences.setKeyValue,
    updateConference: conferences.updateKeyValue,
    removeConference: conferences.removeKeyValue,
    getIncomingInvitations,
    subscribe: conferences.subscribe,
  };
}
