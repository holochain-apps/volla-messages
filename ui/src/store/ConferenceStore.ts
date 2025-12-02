import { decodeHashFromBase64, encodeHashToBase64, type AgentPubKeyB64 } from "@holochain/client";
import { get, type Subscriber, type Invalidator, type Unsubscriber } from "svelte/store";
import { 
  createGenericKeyValueStore, 
  type GenericKeyValueStore,
  type GenericKeyValueStoreDataExtended,
  type GenericKeyValueStoreData,
  deriveGenericValueStore
} from "./generic/GenericKeyValueStore";
import { RelayClient } from "./RelayClient";
import {
  type ConferenceRoom,
  type ConferenceState,
  type SignalPayload,
  CallSignalType,
} from "$lib/types";

export interface ConferenceStore {
  createConference: (participants: AgentPubKeyB64[], cellIdB64?: string, initiatorPubKeyB64?: AgentPubKeyB64) => Promise<string>;
  joinConference: (roomId: string, participants: AgentPubKeyB64[]) => Promise<void>;
  acceptConferenceInvitation: (roomId: string) => Promise<void>;
  rejectConferenceInvitation: (roomId: string) => Promise<void>;
  leaveConference: (roomId: string) => Promise<void>;
  endConferenceForAll: (roomId: string) => Promise<void>;
  sendSignal: (roomId: string, target: AgentPubKeyB64, type: CallSignalType, data: string) => Promise<void>;
  sendMediaStateToAll: (roomId: string, videoEnabled: boolean, audioEnabled: boolean) => Promise<void>;
  handleSignalReceived: (roomId: string, signal: SignalPayload) => Promise<void>;
  initializeWebRTC: (roomId: string) => Promise<void>;
  createPeerConnectionToParticipant: (roomId: string, participantPubKey: string) => Promise<void>;
  cleanupWebRTC: (roomId: string) => void;
  deriveConferenceStore: (roomId: string) => import("./generic/GenericKeyValueStore").GenericValueStore<ConferenceState>;
  getConference: (roomId: string) => ConferenceState;
  setConference: (roomId: string, state: ConferenceState) => void;
  updateConference: (roomId: string, updater: (state: ConferenceState) => ConferenceState) => void;
  removeConference: (roomId: string) => void;
  getIncomingInvitations: () => ConferenceState[];
  subscribe: (
    run: Subscriber<GenericKeyValueStoreDataExtended<ConferenceState>>,
    invalidate?: Invalidator<GenericKeyValueStoreDataExtended<ConferenceState>>
  ) => Unsubscriber;
}

export function createConferenceStore(client: RelayClient): ConferenceStore {
  // sort conferences by invitation timestamp
  const conferences: GenericKeyValueStore<ConferenceState> = createGenericKeyValueStore<ConferenceState>([
    ([_, conference]) => conference.invitationTimestamp || Date.now()
  ]);

  const RTCConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all' as RTCIceTransportPolicy
  };

  type ParticipantState = ConferenceState["participants"] extends Map<any, infer T> ? T : never;
  const hasWindow = typeof window !== "undefined";
  const RECONNECT_CONFIG = {
    maxAttempts: 3,
    baseDelayMs: 1500,
    disconnectionGraceMs: 4000,
  } as const;

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
    updater: (participant: ParticipantState) => ParticipantState
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
    closeImmediately = true
  ): void {
    const state = safeGetConference(roomId);
    if (!state?.localStream || !hasWindow) return;
    const participant = state.participants.get(pubKey);
    if (!participant) return;

    // Avoid duplicate timers
    if (participant.reconnectTimerId !== undefined) return;

    const nextAttempt = (participant.reconnectAttempts ?? 0) + 1;
    if (nextAttempt > RECONNECT_CONFIG.maxAttempts) {
      console.warn('[WebRTC] Max reconnect attempts reached for participant:', pubKey.slice(0, 20));
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
        await createPeerConnectionForParticipant(roomId, pubKey, latestState.localStream, { isRetry: true });
      } catch (error) {
        console.error('[WebRTC] Retry connection failed for participant:', pubKey.slice(0, 20), error);
        schedulePeerReconnect(
          roomId,
          pubKey,
          `retry_failed:${reason}`,
          RECONNECT_CONFIG.baseDelayMs,
          true
        );
      }
    }, delay);

    updateParticipant(roomId, pubKey, (p) => ({
      ...p,
      reconnectAttempts: nextAttempt,
      reconnectTimerId: timerId,
      lastFailureReason: reason,
      isConnected: false,
      ...(closeImmediately
        ? { peerConnection: undefined, stream: undefined }
        : {}),
    }));
  }

  async function createAndSendOffer(
    roomId: string,
    pubKey: string,
    peerConnection: RTCPeerConnection,
    context: string
  ): Promise<void> {
    if (peerConnection.signalingState !== 'stable') {
      return;
    }

    let shouldAbort = false;
    updateParticipant(roomId, pubKey, (participant) => {
      if (participant.makingOffer) {
        shouldAbort = true;
        return participant;
      }
      return { ...participant, makingOffer: true };
    });

    if (shouldAbort) return;

    try {
      await peerConnection.setLocalDescription();
      if (peerConnection.localDescription) {
        await sendSignal(
          roomId,
          pubKey,
          CallSignalType.Offer,
          JSON.stringify(peerConnection.localDescription)
        );
      }
    } catch (err) {
      console.error('[Perfect Negotiation] Error creating offer for:', pubKey.slice(0, 20), 'context:', context, err);
    } finally {
      updateParticipant(roomId, pubKey, (participant) => ({
        ...participant,
        makingOffer: false,
      }));
    }
  }

  async function createConference(participants: AgentPubKeyB64[], cellIdB64?: string, initiatorPubKeyB64?: AgentPubKeyB64): Promise<string> {
    const participantsEncoded = participants.map((p) => decodeHashFromBase64(p));
    const roomId = await client.createConference(participantsEncoded);

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
      invitationStatus: 'accepted',
    };

    // Add self to participants as already joined
    // The initiator created the conference
    // so they're implicitly joined
    state.participants.set(myPubKey, {
      publicKey: myPubKey,
      isConnected: false,
      hasJoined: true,  // Initiator is already in the conference
    });

    conferences.setKeyValue(room.room_id, state);

    return room.room_id;
  }

  async function joinConference(roomId: string, participants: AgentPubKeyB64[]): Promise<void> {
  const existingState = safeGetConference(roomId);
    const participantsDecoded = participants.map((p) => decodeHashFromBase64(p));

    if (existingState) {
      await client.joinConference(roomId, participantsDecoded);
      return;
    }

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

    await client.joinConference(roomId, participantsDecoded);
  }

  async function acceptConferenceInvitation(roomId: string): Promise<void> {
  const state = safeGetConference(roomId);
    if (!state) return;

    conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      invitationStatus: 'accepted' as const,
    }));

    const participants = Array.from(state.participants.keys());
    await client.joinConference(
      roomId,
      participants.map(p => decodeHashFromBase64(p))
    );
  }

  async function rejectConferenceInvitation(roomId: string): Promise<void> {
  const state = safeGetConference(roomId);
    if (!state) return;

    conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      invitationStatus: 'rejected' as const
    }));

    try {
      const participantsDecoded = Array.from(state.participants.keys())
        .map((p) => decodeHashFromBase64(p));
      await client.rejectConference(roomId, participantsDecoded);
    } catch (e) {
      console.error('Failed to send reject signal', e);
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

    return Object.values(currentData).filter((conf: ConferenceState) =>
      conf.invitationStatus === 'pending' && !conf.isInitiator
    );
  }

  async function leaveConference(roomId: string): Promise<void> {
  const state = safeGetConference(roomId);
    
    // Send leave signal to holochain
    await client.leaveConference(roomId);
    
    // Clean up WebRTC resources
    cleanupWebRTC(roomId);
    
    // Keep the conference in state with a 'left' status so the user can rejoin
    // This applies to both initiators and participants
    if (state) {
      conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        invitationStatus: 'left' as const, // Status to indicate user left the conference
        localStream: undefined,
        participants: new Map(
          Array.from(conf.participants.entries()).map(([key, participant]) => [
            key,
            {
              ...participant,
              peerConnection: undefined,
              stream: undefined,
              isConnected: false,
              reconnectAttempts: 0,
              reconnectTimerId: undefined,
              lastFailureReason: undefined,
            }
          ])
        )
      }));
    }
  }

  async function endConferenceForAll(roomId: string): Promise<void> {
  const conference = safeGetConference(roomId);
    if (!conference?.room?.participants) {
      console.error("[ConferenceStore] Cannot end conference - no participants found");
      return;
    }

    await client.endConferenceForAll(roomId, conference.room.participants);
    cleanupWebRTC(roomId);
    conferences.removeKeyValue(roomId);
  }

  async function sendSignal(
    roomId: string,
    target: AgentPubKeyB64,
    type: CallSignalType,
    data: string
  ): Promise<void> {
    const targetDecoded = decodeHashFromBase64(target);
    await client.sendSignal(
      roomId,
      targetDecoded,
      type,
      data
    );
  }

  async function sendMediaStateToAll(
    roomId: string,
    videoEnabled: boolean,
    audioEnabled: boolean
  ): Promise<void> {
  const state = safeGetConference(roomId);
    if (!state) return;
    const mediaState = JSON.stringify({ videoEnabled, audioEnabled });
    const selfPubKeyB64 = encodeHashToBase64(client.client.myPubKey);
    const sendPromises: Promise<void>[] = [];
    state.participants.forEach((participant, pubKey) => {
      if (pubKey === selfPubKeyB64) return;
      sendPromises.push(
        sendSignal(roomId, pubKey, CallSignalType.MediaState, mediaState)
      );
    });
    await Promise.all(sendPromises);
  }

  async function handleSignalReceived(roomId: string, signal: SignalPayload): Promise<void> {
  const state = safeGetConference(roomId);
    if (!state) return;

    const participant = state.participants.get(signal.from);
    if (!participant) return;

    const peerConnection = participant.peerConnection;
    
    if (!peerConnection) {
      conferences.updateKeyValue(roomId, (conf) => {
        const participants = new Map(conf.participants);
        const p = participants.get(signal.from);
        if (p) {
          participants.set(signal.from, {
            ...p,
            pendingSignals: [...(p.pendingSignals || []), signal]
          });
        }
        return { ...conf, participants };
      });
      return;
    }

    // Determine polite peer via lexicographic comparison
    const myPubKey = encodeHashToBase64(client.client.myPubKey);
    const isPolite = myPubKey < signal.from;

    try {
      switch (signal.payload_type) {
        case CallSignalType.Offer:
          const offerCollision = 
            peerConnection.signalingState !== 'stable' ||
            (participant.makingOffer === true);
          
          const ignoreOffer = !isPolite && offerCollision;
          if (ignoreOffer) return;

          // Set making offer flag to false when receiving offer
          conferences.updateKeyValue(roomId, (conf) => {
            const participants = new Map(conf.participants);
            const p = participants.get(signal.from);
            if (p) {
              participants.set(signal.from, { ...p, makingOffer: false });
            }
            return { ...conf, participants };
          });

          await peerConnection.setRemoteDescription(JSON.parse(signal.data));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          await sendSignal(
            roomId,
            signal.from,
            CallSignalType.Answer,
            JSON.stringify(answer)
          );
          break;

        case CallSignalType.Answer:
          await peerConnection.setRemoteDescription(JSON.parse(signal.data));
          break;

        case CallSignalType.IceCandidate:
          try {
            await peerConnection.addIceCandidate(JSON.parse(signal.data));
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
                audioEnabled
              });
            }
            return { ...conf, participants };
          });
          break;
      }
    } catch (err) {
      console.error(`[Perfect Negotiation] Error handling signal from ${signal.from.slice(0, 20)}:`, err);
      
      conferences.updateKeyValue(roomId, (conf) => {
        const participants = new Map(conf.participants);
        const p = participants.get(signal.from);
        if (p) {
          participants.set(signal.from, { ...p, ignoreOffer: isPolite });
        }
        return { ...conf, participants };
      });
    }
  }

  async function getUserMediaWithFallback(): Promise<MediaStream> {
    const constraints = [
      // ideal constraints first
      {
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      },
      // fallback to lower quality
      {
        video: {
          width: { ideal: 320, max: 640 },
          height: { ideal: 240, max: 480 }
        },
        audio: true
      },
      // audio only fallback
      {
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      },
      // just audio
      { audio: true }
    ];

    for (const constraint of constraints) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraint);
        return stream;
      } catch (error) {
        console.warn('Failed with constraints:', constraint, 'Error:', error);
      }
    }

    throw new Error('Unable to acquire camera or microphone access. Please check permissions and try again.');
  }

  async function createPeerConnectionForParticipant(
    roomId: string,
    pubKey: string,
    localStream: MediaStream,
    options: { isRetry?: boolean } = {}
  ): Promise<void> {
    const existingState = safeGetConference(roomId);
    if (!existingState) {
      console.warn('[WebRTC] Cannot create peer connection - missing conference state', roomId);
      return;
    }

    const existingParticipant = existingState.participants.get(pubKey);
    if (!existingParticipant) {
      console.warn('[WebRTC] Participant not found when creating connection:', pubKey.slice(0, 20));
      return;
    }

    existingParticipant.peerConnection?.close();
    clearParticipantReconnect(roomId, pubKey);

    let peerConnection: RTCPeerConnection;
    try {
      peerConnection = new RTCPeerConnection(RTCConfig);
    } catch (error) {
      console.error('[WebRTC] Failed to create RTCPeerConnection for:', pubKey, error);
      throw error;
    }

    updateParticipant(roomId, pubKey, (participant) => ({
      ...participant,
      peerConnection,
      isConnected: false,
      reconnectTimerId: undefined,
      lastFailureReason: options.isRetry ? participant.lastFailureReason : undefined,
    }));

    const renegotiate = async (source: string) => {
      await createAndSendOffer(roomId, pubKey, peerConnection, source);
    };

    peerConnection.onnegotiationneeded = async () => {
      await renegotiate('onnegotiationneeded');
    };

    peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        await sendSignal(
          roomId,
          pubKey,
          CallSignalType.IceCandidate,
          JSON.stringify(event.candidate)
        );
      }
    };

    peerConnection.ontrack = (event) => {
      console.log('[WebRTC] ontrack event received for:', pubKey.slice(0, 20), {
        streamsCount: event.streams.length,
        streamId: event.streams[0]?.id,
        track: event.track.kind,
        trackId: event.track.id,
        trackEnabled: event.track.enabled,
        trackReadyState: event.track.readyState
      });

      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        clearParticipantReconnect(roomId, pubKey);

        conferences.updateKeyValue(roomId, (conf) => {
          const participants = new Map(conf.participants);
          const participant = participants.get(pubKey);
          if (!participant) {
            console.warn('[WebRTC] ontrack: Participant not found in conference:', pubKey.slice(0, 20));
            return conf;
          }

          participants.set(pubKey, {
            ...participant,
            stream: remoteStream,
            isConnected: true,
            lastFailureReason: undefined
          });

          return {
            ...conf,
            participants
          };
        });
      } else {
        console.warn('[WebRTC] ontrack: No streams in event');
      }
    };

    peerConnection.onconnectionstatechange = () => {
      switch (peerConnection.connectionState) {
        case 'failed':
          console.error('[WebRTC] Peer connection failed for participant:', pubKey);
          peerConnection.restartIce();
          schedulePeerReconnect(roomId, pubKey, 'connection_failed', 0, true);
          break;
        case 'disconnected':
          console.warn('[WebRTC] Peer connection disconnected for:', pubKey);
          schedulePeerReconnect(
            roomId,
            pubKey,
            'connection_disconnected',
            RECONNECT_CONFIG.disconnectionGraceMs,
            false
          );
          break;
        case 'connected':
          clearParticipantReconnect(roomId, pubKey);
          conferences.updateKeyValue(roomId, (conf) => {
            const participants = new Map(conf.participants);
            const participant = participants.get(pubKey);
            if (participant) {
              participants.set(pubKey, {
                ...participant,
                isConnected: true,
                ignoreOffer: false,
                lastFailureReason: undefined
              });
            }
            return { ...conf, participants };
          });
          break;
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      if (peerConnection.iceConnectionState === 'failed') {
        console.error('[WebRTC] ICE connection failed for:', pubKey);
      }
    };

    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    await renegotiate('initial_tracks');

    const latestState = safeGetConference(roomId);
    const participant = latestState?.participants.get(pubKey);
    if (participant?.pendingSignals && participant.pendingSignals.length > 0) {
      for (const queuedSignal of participant.pendingSignals) {
        try {
          await handleSignalReceived(roomId, queuedSignal);
        } catch (error) {
          console.error('Error processing queued signal:', error);
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

  async function createPeerConnectionToParticipant(roomId: string, participantPubKey: string): Promise<void> {
    const state = safeGetConference(roomId);
    if (!state?.localStream) {
      console.error('[WebRTC] Cannot create peer connection - no local stream');
      return;
    }

    // Check if peer connection already exists
    const participant = state.participants.get(participantPubKey);
    if (participant?.peerConnection) {
      return;
    }

    await createPeerConnectionForParticipant(roomId, participantPubKey, state.localStream);
  }

  async function initializeWebRTC(roomId: string): Promise<void> {
  const state = safeGetConference(roomId);
    if (!state) {
      console.error('[ConferenceStore] initializeWebRTC: No conference state found for room:', roomId);
      return;
    }

    // Check if already initialized
    if (state.localStream) {
      console.log('[ConferenceStore] initializeWebRTC: WebRTC already initialized for room:', roomId);
      return;
    }

    console.log('[ConferenceStore] initializeWebRTC: Starting initialization for room:', roomId, {
      isInitiator: state.isInitiator,
      participantCount: state.participants.size
    });

    try {
      // Check if WebRTC is available
      if (typeof RTCPeerConnection === 'undefined') {
        throw new Error('RTCPeerConnection is not available in this browser/webview. WebRTC is not supported.');
      }

      const stream = await getUserMediaWithFallback();
      console.log('[ConferenceStore] initializeWebRTC: Got local media stream', {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length
      });

      conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        localStream: stream
      }));

      // Broadcast initial media state (both video and audio enabled by default)
      await sendMediaStateToAll(roomId, true, true);

      const selfPubKey = encodeHashToBase64(client.client.myPubKey);
      
      for (const [pubKey, participant] of state.participants.entries()) {
        // Skip ourselves
        if (pubKey === selfPubKey) continue;
        
        console.log('[ConferenceStore] initializeWebRTC: Creating peer connection to:', pubKey.slice(0, 20), {
          hasJoined: participant.hasJoined,
          isConnected: participant.isConnected
        });

        await createPeerConnectionForParticipant(roomId, pubKey, stream);
      }
      
      console.log('[ConferenceStore] initializeWebRTC: Initialization complete');
    } catch (error) {
      console.error('[ConferenceStore] Error initializing WebRTC:', error);
      conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        error: error instanceof Error ? error.message : 'Failed to initialize WebRTC'
      }));
    }
  }

  function cleanupWebRTC(roomId: string): void {
    const state = safeGetConference(roomId);
    if (!state) return;

    state.localStream?.getTracks().forEach(track => track.stop());

    for (const [pubKey, participant] of state.participants.entries()) {
      participant.peerConnection?.close();
      participant.stream?.getTracks().forEach(track => track.stop());
      if (hasWindow && participant.reconnectTimerId !== undefined) {
        window.clearTimeout(participant.reconnectTimerId);
      }
      updateParticipant(roomId, pubKey, (p) => ({
        ...p,
        peerConnection: undefined,
        stream: undefined,
        reconnectTimerId: undefined,
        reconnectAttempts: 0,
        isConnected: false,
      }));
    }

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
