import { decodeHashFromBase64, encodeHashToBase64, type AgentPubKeyB64 } from "@holochain/client";
import { get, type Subscriber, type Invalidator, type Unsubscriber } from "svelte/store";
import { 
  createGenericKeyValueStore, 
  type GenericKeyValueStore,
  type GenericKeyValueStoreDataExtended,
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
  createConference: (title: string, participants: AgentPubKeyB64[]) => Promise<string>;
  joinConference: (roomId: string) => Promise<void>;
  leaveConference: (roomId: string) => Promise<void>;
  sendSignal: (roomId: string, target: AgentPubKeyB64, type: CallSignalType, data: string) => Promise<void>;
  handleSignalReceived: (roomId: string, signal: SignalPayload) => Promise<void>;
  initializeWebRTC: (roomId: string) => Promise<void>;
  cleanupWebRTC: (roomId: string) => void;
  getConference: (roomId: string) => ConferenceState;
  setConference: (roomId: string, state: ConferenceState) => void;
  updateConference: (roomId: string, updater: (state: ConferenceState) => ConferenceState) => void;
  removeConference: (roomId: string) => void;
  subscribe: (
    run: Subscriber<GenericKeyValueStoreDataExtended<ConferenceState>>,
    invalidate?: Invalidator<GenericKeyValueStoreDataExtended<ConferenceState>>
  ) => Unsubscriber;
}

export function createConferenceStore(client: RelayClient): ConferenceStore {
  const conferences: GenericKeyValueStore<ConferenceState> = createGenericKeyValueStore<ConferenceState>([
    ([_, conference]) => conference.room.created_at
  ]);

  const RTCConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  async function createConference(title: string, participants: AgentPubKeyB64[]): Promise<string> {
    console.log("Creating conference with participants", participants);
    const participantsEncoded = participants.map(p => decodeHashFromBase64(p));
    console.log("Decoded participants", participantsEncoded);
    const roomId = await client.createConference(title, participantsEncoded);
    if (!roomId) throw new Error("Failed to decode conference room entry");

    const room: ConferenceRoom = {
      initiator: client.client.myPubKey,
      participants: participantsEncoded,
      created_at: Date.now(),
      title,
      room_id: roomId
    };

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

    conferences.setKeyValue(room.room_id, state);
    return room.room_id;
  }

  async function joinConference(roomId: string): Promise<void> {
    await client.joinConference(roomId);
    // Updating the conference state to mark as joined
    conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      isInitiator: false
    }));
  }

  async function leaveConference(roomId: string): Promise<void> {
    await client.leaveConference(roomId);
    cleanupWebRTC(roomId);
    // Removing the conference from state
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

  async function initializeWebRTC(roomId: string): Promise<void> {
    const state = conferences.getKeyValue(roomId);
    if (!state) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    // Updating the state with local stream
    conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      localStream: stream
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

      // Updating the participant with peer connection
      conferences.updateKeyValue(roomId, (conf) => {
        const participants = new Map(conf.participants);
        participants.set(pubKey, {
          ...participant,
          peerConnection
        });

        return {
          ...conf,
          participants
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
    const state = conferences.getKeyValue(roomId);
    if (!state) return;

    state.localStream?.getTracks().forEach(track => track.stop());

    // Closing all the peer connections
    for (const participant of state.participants.values()) {
      participant.peerConnection?.close();
      participant.stream?.getTracks().forEach(track => track.stop());
    }
  }

  // Derived store for a specific conference
  function deriveConferenceStore(roomId: string) {
    return deriveGenericValueStore(conferences, roomId);
  }

  return {
    createConference,
    joinConference,
    leaveConference,
    sendSignal,
    handleSignalReceived,
    initializeWebRTC,
    cleanupWebRTC,
    getConference: conferences.getKeyValue,
    setConference: conferences.setKeyValue,
    updateConference: conferences.updateKeyValue,
    removeConference: conferences.removeKeyValue,
    subscribe: conferences.subscribe,
  };
}