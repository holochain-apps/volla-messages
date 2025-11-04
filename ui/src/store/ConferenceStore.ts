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
  createConference: (participants: AgentPubKeyB64[]) => Promise<string>;
  joinConference: (roomId: string, participants: AgentPubKeyB64[]) => Promise<void>;
  acceptConferenceInvitation: (roomId: string) => Promise<void>;
  rejectConferenceInvitation: (roomId: string) => Promise<void>;
  leaveConference: (roomId: string) => Promise<void>;
  sendSignal: (roomId: string, target: AgentPubKeyB64, type: CallSignalType, data: string) => Promise<void>;
  handleSignalReceived: (roomId: string, signal: SignalPayload) => Promise<void>;
  initializeWebRTC: (roomId: string) => Promise<void>;
  cleanupWebRTC: (roomId: string) => void;
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

  async function createConference(participants: AgentPubKeyB64[]): Promise<string> {
    console.log("Creating conference with participants", participants);
    const participantsEncoded = participants.map(p => decodeHashFromBase64(p));
    console.log("Decoded participants", participantsEncoded);
    const roomId = await client.createConference(participantsEncoded);
    console.log("Created conference with room id", roomId);
    if (!roomId) throw new Error("Failed to create conference room");

    const room: ConferenceRoom = {
      participants: participantsEncoded,
      room_id: roomId
    };

    const state: ConferenceState = {
      room,
      participants: new Map(
        participants.map(p => [p, {
          publicKey: p,
          isConnected: false,
          hasJoined: false
        }])
      ),
      isInitiator: true,
      ended: false
    };

    conferences.setKeyValue(room.room_id, state);
    return room.room_id;
  }

  async function joinConference(roomId: string, participants: AgentPubKeyB64[]): Promise<void> {
    console.log("Joining conference with room id", roomId);
    
    const state: ConferenceState = {
      room: {
        room_id: roomId,
        participants: participants.map(p => decodeHashFromBase64(p))
      },
      participants: new Map(
        participants.map(p => [p, {
          publicKey: p,
          isConnected: false,
          hasJoined: false
        }])
      ),
      isInitiator: false,
      ended: false
    };
    
    conferences.setKeyValue(roomId, state);
    
    await client.joinConference(
      roomId,
      participants.map(p => decodeHashFromBase64(p))
    );
  }

  async function acceptConferenceInvitation(roomId: string): Promise<void> {
    const state = conferences.getKeyValue(roomId);
    if (!state) return;

    conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      invitationStatus: 'accepted' as const,
      isInitiator: false
    }));

    const participants = Array.from(state.participants.keys());
    await client.joinConference(
      roomId,
      participants.map(p => decodeHashFromBase64(p))
    );

    await initializeWebRTC(roomId);
  }

  async function rejectConferenceInvitation(roomId: string): Promise<void> {
    const state = conferences.getKeyValue(roomId);
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
    await client.leaveConference(roomId);
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

  async function handleSignalReceived(roomId: string, signal: SignalPayload): Promise<void> {
    const state = conferences.getKeyValue(roomId);
    if (!state) return;

    const participant = state.participants.get(signal.from);
    if (!participant) return;

    const peerConnection = participant.peerConnection;
    if (!peerConnection) return;

    switch (signal.payload_type) {
      case CallSignalType.Offer:
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
        await peerConnection.addIceCandidate(JSON.parse(signal.data));
        break;
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
        console.log('Trying media constraints:', constraint);
        const stream = await navigator.mediaDevices.getUserMedia(constraint);
        console.log('Successfully acquired media with constraints:', constraint);
        return stream;
      } catch (error) {
        console.warn('Failed with constraints:', constraint, 'Error:', error);
      }
    }

    throw new Error('Unable to acquire camera or microphone access. Please check permissions and try again.');
  }

  async function initializeWebRTC(roomId: string): Promise<void> {
    const state = conferences.getKeyValue(roomId);
    if (!state) return;

    try {
      const stream = await getUserMediaWithFallback();

      conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        localStream: stream
      }));

      for (const [pubKey, participant] of state.participants.entries()) {
        if (pubKey === encodeHashToBase64(client.client.myPubKey)) continue;

        const peerConnection = new RTCPeerConnection(RTCConfig);

        conferences.updateKeyValue(roomId, (conf) => {
          const participants = new Map(conf.participants);
          const existing = participants.get(pubKey);
          if (existing) {
            participants.set(pubKey, { ...existing, peerConnection });
          }
          return { ...conf, participants };
        });
        
        stream.getTracks().forEach(track => {
          peerConnection.addTrack(track, stream);
        });

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
          conferences.updateKeyValue(roomId, (conf) => {
            const participants = new Map(conf.participants);
            const participant = participants.get(pubKey);
            if (!participant) return conf;

            participants.set(pubKey, {
              ...participant,
              stream: event.streams[0],
              isConnected: true
            });

            return {
              ...conf,
              participants
            };
          });
        };

        peerConnection.onconnectionstatechange = () => {
          console.log('Peer connection state change:', peerConnection.connectionState);

          if (peerConnection.connectionState === 'failed') {
            console.error('Peer connection failed for participant:', pubKey);
            conferences.updateKeyValue(roomId, (conf) => {
              const participants = new Map(conf.participants);
              const participant = participants.get(pubKey);
              if (participant) {
                participants.set(pubKey, {
                  ...participant,
                  isConnected: false
                });
              }
              return { ...conf, participants };
            });
          } else if (peerConnection.connectionState === 'connected') {
            console.log('Peer connection established for participant:', pubKey);
            conferences.updateKeyValue(roomId, (conf) => {
              const participants = new Map(conf.participants);
              const participant = participants.get(pubKey);
              if (participant) {
                participants.set(pubKey, {
                  ...participant,
                  isConnected: true
                });
              }
              return { ...conf, participants };
            });
          }
        };

        if (state.isInitiator) {
          try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            await sendSignal(
              roomId,
              pubKey,
              CallSignalType.Offer,
              JSON.stringify(peerConnection.localDescription)
            );
          } catch (error) {
            console.error('Error creating offer for participant:', pubKey, error);
          }
        }
      }
    } catch (error) {
      console.error('Error initializing WebRTC:', error);
      conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        error: error instanceof Error ? error.message : 'Failed to initialize WebRTC'
      }));
    }
  }

  function cleanupWebRTC(roomId: string): void {
    const state = conferences.getKeyValue(roomId);
    if (!state) return;

    state.localStream?.getTracks().forEach(track => track.stop());

    for (const participant of state.participants.values()) {
      participant.peerConnection?.close();
      participant.stream?.getTracks().forEach(track => track.stop());
    }
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
    sendSignal,
    handleSignalReceived,
    initializeWebRTC,
    cleanupWebRTC,
    getConference: conferences.getKeyValue,
    setConference: conferences.setKeyValue,
    updateConference: conferences.updateKeyValue,
    removeConference: conferences.removeKeyValue,
    getIncomingInvitations,
    subscribe: conferences.subscribe,
  };
}
