import { writable, derived, type Writable, get } from "svelte/store";
import { type AgentPubKey, type AgentPubKeyB64, type ActionHash, decodeHashFromBase64, encodeHashToBase64 } from "@holochain/client";
import type { RelayStore } from "./RelayStore";
import { type ConferenceRoom, type ConferenceState, type SignalPayload, CallSignalType } from "$lib/types";

// TODO: Changing it as per requirement of project
const RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

export class ConferenceStore {
  private cleanup: (() => void)[] = [];
  public store: Writable<ConferenceState>;
  public participants;
  public activeParticipants;
  public isEnded;

  constructor(
    private relayStore: RelayStore,
    room: ConferenceRoom,
    initiator: AgentPubKey
  ) {
    this.store = writable<ConferenceState>({
      room,
      participants: new Map(),
      isInitiator: encodeHashToBase64(room.initiator) === encodeHashToBase64(initiator),
      ended: false
    });

    this.participants = derived(this.store, ($store) => Array.from($store.participants.values()));
    this.activeParticipants = derived(this.participants, ($participants) => 
      $participants.filter(p => p.isConnected)
    );
    this.isEnded = derived(this.store, ($store) => $store.ended);

    room.participants.forEach(participant => {
      this.addParticipant(participant);
    });
  }

  async start(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      this.store.update(state => ({
        ...state,
        localStream: stream
      }));

      const state = get(this.store);
      state.participants.forEach((participant, key) => {
        this.initializePeerConnection(key);
      });

      this.cleanup.push(() => {
        stream.getTracks().forEach(track => track.stop());
      });

    } catch (error) {
      console.error("Failed to start conference:", error);
      throw error;
    }
  }

  private initializePeerConnection(participantKey: AgentPubKeyB64): void {
    const state = get(this.store);
    const participant = state.participants.get(participantKey);
    
    if (!participant) return;

    const peerConnection = new RTCPeerConnection(RTCConfiguration);

    if (state.localStream) {
      state.localStream.getTracks().forEach(track => {
        state.localStream && peerConnection.addTrack(track, state.localStream);
      });
    }

    peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        await this.relayStore.client.sendSignal(
          state.room.room_id,
          decodeHashFromBase64(participantKey) as AgentPubKey,
          CallSignalType.IceCandidate,
          JSON.stringify(event.candidate)
        );
      }
    };

    peerConnection.ontrack = (event) => {
      this.store.update(state => {
        const participant = state.participants.get(participantKey);
        if (participant) {
          participant.stream = event.streams[0];
          participant.isConnected = true;
          state.participants.set(participantKey, participant);
        }
        return state;
      });
    };

    this.store.update(state => {
      const participant = state.participants.get(participantKey);
      if (participant) {
        participant.peerConnection = peerConnection;
        state.participants.set(participantKey, participant);
      }
      return state;
    });

    this.cleanup.push(() => {
      peerConnection.close();
    });

    if (state.isInitiator) {
      this.createAndSendOffer(participantKey, peerConnection);
    }
  }

  private async createAndSendOffer(participantKey: AgentPubKeyB64, peerConnection: RTCPeerConnection): Promise<void> {
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      const state = get(this.store);
      await this.relayStore.client.sendSignal(
        state.room.room_id,
        decodeHashFromBase64(participantKey),
        CallSignalType.Offer,
        JSON.stringify(offer)
      );
    } catch (error) {
      console.error("Error creating/sending offer:", error);
    }
  }

  async handleWebRTCSignal(signal: SignalPayload): Promise<void> {
    const state = get(this.store);
    const participant = state.participants.get(encodeHashToBase64(signal.from));
    
    if (!participant?.peerConnection) return;

    try {
      switch (signal.payload_type) {
        case CallSignalType.Offer:
          await this.handleOffer(participant.peerConnection, signal);
          break;
          
        case CallSignalType.Answer:
          await this.handleAnswer(participant.peerConnection, signal);
          break;
          
        case CallSignalType.IceCandidate:
          await this.handleIceCandidate(participant.peerConnection, signal);
          break;
      }
    } catch (error) {
      console.error("Error handling WebRTC signal:", error);
    }
  }

  private async handleOffer(peerConnection: RTCPeerConnection, signal: SignalPayload): Promise<void> {
    const offer = JSON.parse(signal.data);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    const state = get(this.store);
    await this.relayStore.client.sendSignal(
      state.room.room_id,
      signal.from,
      CallSignalType.Answer,
      JSON.stringify(answer)
    );
  }

  private async handleAnswer(peerConnection: RTCPeerConnection, signal: SignalPayload): Promise<void> {
    const answer = JSON.parse(signal.data);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  private async handleIceCandidate(peerConnection: RTCPeerConnection, signal: SignalPayload): Promise<void> {
    const candidate = JSON.parse(signal.data);
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  addParticipant(publicKey: AgentPubKey): void {
    const publicKeyB64 = encodeHashToBase64(publicKey);
    
    this.store.update(state => {
      if (!state.participants.has(publicKeyB64)) {
        state.participants.set(publicKeyB64, {
          publicKey: publicKeyB64,
          isConnected: false
        });
        
        if (state.localStream) {
          this.initializePeerConnection(publicKeyB64);
        }
      }
      return state;
    });
  }

  removeParticipant(publicKey: AgentPubKey): void {
    const publicKeyB64 = encodeHashToBase64(publicKey);
    
    this.store.update(state => {
      const participant = state.participants.get(publicKeyB64);
      if (participant?.peerConnection) {
        participant.peerConnection.close();
      }
      state.participants.delete(publicKeyB64);
      return state;
    });
  }

  async end(): Promise<void> {
    const state = get(this.store);
    
    if (!state.ended) {
      const actionHash = decodeHashFromBase64(state.room.room_id) as ActionHash;
      await this.relayStore.client.leaveConference(actionHash);
    }

    this.cleanup.forEach(cleanup => cleanup());
    this.cleanup = [];

    this.store.update(state => ({
      ...state,
      ended: true,
      localStream: undefined,
      participants: new Map()
    }));
  }
}

export function createConferenceStore(
  relayStore: RelayStore,
  room: ConferenceRoom,
  initiator: AgentPubKey
): ConferenceStore {
  return new ConferenceStore(relayStore, room, initiator);
}