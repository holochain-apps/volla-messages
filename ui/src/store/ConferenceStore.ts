import { decodeHashFromBase64, encodeHashToBase64, type AgentPubKeyB64} from "@holochain/client";
import { get, type Subscriber, type Invalidator, type Unsubscriber } from "svelte/store";
import { createGenericKeyValueStore, type GenericKeyValueStoreData } from "./GenericKeyValueStore";
import { RelayClient } from "./RelayClient";
import {
  type ConferenceState,
  type SignalPayload,
  CallSignalType,
} from "$lib/types";

export interface ConferenceStore {
  initialize: () => Promise<void>;
  createConference: (title: string, participants: AgentPubKeyB64[]) => Promise<string>;
  joinConference: (roomId: string) => Promise<void>;
  leaveConference: (roomId: string) => Promise<void>;
  sendSignal: (roomId: string, target: AgentPubKeyB64, type: CallSignalType, data: string) => Promise<void>;
  handleSignalReceived: (roomId: string, signal: SignalPayload) => Promise<void>;
  initializeWebRTC: (roomId: string) => Promise<void>;
  cleanupWebRTC: (roomId: string) => void;
  subscribe: (
    run: Subscriber<GenericKeyValueStoreData<ConferenceState>>,
    invalidate?: Invalidator<GenericKeyValueStoreData<ConferenceState>>
  ) => Unsubscriber;
}

export function createConferenceStore(client: RelayClient): ConferenceStore {
  const conferences = createGenericKeyValueStore<ConferenceState>();

  const RTCConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  async function initialize(): Promise<void> {
    // Initialising with empty state as conferences will be added as they are created/joined
    conferences.set({});
  }

  async function createConference(title: string, participants: AgentPubKeyB64[]): Promise<string> {
    const participantKeys = participants.map(p => decodeHashFromBase64(p));
    const record = await client.createConference(title, participantKeys);
    const room = record.entry;
    if (!room) throw new Error("Failed to decode conference room entry");

    const state: ConferenceState = {
      room,
      participants: new Map(
        participants.map(p => [p, {
          publicKey: p,
          isConnected: false
        }])
      ),
      isInitiator: true,
      ended: false
    };

    conferences.update(c => ({
      ...c,
      [room.room_id]: state
    }));

    return room.room_id;
  }

  async function joinConference(roomId: string): Promise<void> {
    await client.joinConference(decodeHashFromBase64(roomId));
    
    // Updating the conference state to mark as joined
    conferences.update(c => {
      const conf = c[roomId];
      if (!conf) return c;
      
      return {
        ...c,
        [roomId]: {
          ...conf,
          isInitiator: false
        }
      };
    });
  }

  async function leaveConference(roomId: string): Promise<void> {
    await client.leaveConference(decodeHashFromBase64(roomId));
    cleanupWebRTC(roomId);
    
    // Removing the conference from state
    conferences.update(c => {
      const { [roomId]: _, ...rest } = c;
      return rest;
    });
  }

  async function sendSignal(
    roomId: string, 
    target: AgentPubKeyB64,
    type: CallSignalType,
    data: string
  ): Promise<void> {
    await client.sendSignal(
      roomId,
      decodeHashFromBase64(target),
      type,
      data
    );
  }

  async function handleSignalReceived(roomId: string, signal: SignalPayload): Promise<void> {
    const state = get(conferences)[roomId];
    if (!state) return;

    const participant = state.participants.get(encodeHashToBase64(signal.from));
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
          encodeHashToBase64(signal.from),
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

  async function initializeWebRTC(roomId: string): Promise<void> {
    const state = get(conferences)[roomId];
    if (!state) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    // Updating the state with local stream
    conferences.update(c => ({
      ...c,
      [roomId]: {
        ...c[roomId],
        localStream: stream
      }
    }));

    // Initialising the peer connections for all participants
    for (const [pubKey, participant] of state.participants.entries()) {
      if (pubKey === encodeHashToBase64(client.client.myPubKey)) continue;

      const peerConnection = new RTCPeerConnection(RTCConfig);
      
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
        conferences.update(c => {
          const conf = c[roomId];
          if (!conf) return c;

          const participants = new Map(conf.participants);
          const participant = participants.get(pubKey);
          if (!participant) return c;

          participants.set(pubKey, {
            ...participant,
            stream: event.streams[0],
            isConnected: true
          });

          return {
            ...c,
            [roomId]: {
              ...conf,
              participants
            }
          };
        });
      };

      // Updating the participant with peer connection
      conferences.update(c => {
        const conf = c[roomId];
        if (!conf) return c;

        const participants = new Map(conf.participants);
        participants.set(pubKey, {
          ...participant,
          peerConnection
        });

        return {
          ...c,
          [roomId]: {
            ...conf,
            participants
          }
        };
      });

      // If we are the initiator, create and send offer
      if (state.isInitiator) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await sendSignal(
          roomId,
          pubKey,
          CallSignalType.Offer,
          JSON.stringify(offer)
        );
      }
    }
  }

  function cleanupWebRTC(roomId: string): void {
    const state = get(conferences)[roomId];
    if (!state) return;

    state.localStream?.getTracks().forEach(track => track.stop());

    // Closing all the peer connections
    for (const participant of state.participants.values()) {
      participant.peerConnection?.close();
      participant.stream?.getTracks().forEach(track => track.stop());
    }
  }

  return {
    initialize,
    createConference,
    joinConference,
    leaveConference,
    sendSignal,
    handleSignalReceived,
    initializeWebRTC,
    cleanupWebRTC,
    subscribe: conferences.subscribe
  };
}