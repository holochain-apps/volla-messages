import SimplePeer from "simple-peer";
import { decodeHashFromBase64, encodeHashToBase64 } from "@holochain/client";
import { SimplePeerSignalType, type SimplePeerSignalPayload } from "$lib/types";
import {
  type ConferenceContext,
  safeGetConference,
  updateParticipant,
  isParticipantDestroyed,
  isParticipantConnected,
  generateConnectionId,
} from "./types";

export interface SignalHandler {
  handleSimplePeerSignal: (roomId: string, signal: SimplePeerSignalPayload) => void;
  initiateConnections: (roomId: string) => Promise<void>;
}

export type CreatePeerFn = (
  roomId: string,
  pubKey: string,
  connectionId: string,
  initiator: boolean,
  stream: MediaStream,
) => SimplePeer.Instance;

export function createSignalHandler(
  ctx: ConferenceContext,
  createPeer: CreatePeerFn,
): SignalHandler {
  function handleSimplePeerSignal(roomId: string, signal: SimplePeerSignalPayload): void {
    console.log(
      `[SimplePeer] Received ${signal.signal_type} from ${signal.from.slice(0, 20)}, connectionId: ${signal.connection_id}`,
    );

    const state = safeGetConference(ctx, roomId);
    if (!state) {
      console.warn(`[SimplePeer] No conference state for room ${roomId}`);
      return;
    }

    if (state.ended) {
      console.log(
        `[SimplePeer] Ignoring ${signal.signal_type} signal for ended conference ${roomId.slice(0, 20)}`,
      );
      return;
    }

    switch (signal.signal_type) {
      case SimplePeerSignalType.InitRequest:
        handleInitRequest(roomId, signal);
        break;
      case SimplePeerSignalType.InitAccept:
        handleInitAccept(roomId, signal);
        break;
      case SimplePeerSignalType.SdpData:
        handleSdpData(roomId, signal);
        break;
      case SimplePeerSignalType.MediaState:
        handleMediaState(roomId, signal);
        break;
      default:
        console.warn(`[SimplePeer] Unknown signal type: ${signal.signal_type}`);
    }
  }

  function handleInitRequest(roomId: string, signal: SimplePeerSignalPayload): void {
    console.log(
      `[SimplePeer] InitRequest from ${signal.from.slice(0, 20)}, connectionId: ${signal.connection_id}`,
    );

    const state = safeGetConference(ctx, roomId);
    if (!state) {
      console.warn("[SimplePeer] Cannot handle InitRequest - no conference state");
      return;
    }

    if (!state.cellIdB64) {
      console.warn("[SimplePeer] Cannot handle InitRequest - no cellIdB64");
      return;
    }

    const participant = state.participants.get(signal.from);
    if (participant?.peer) {
      console.log(
        `[SimplePeer] Peer already exists for InitRequest from ${signal.from.slice(0, 20)}, skipping`,
      );
      return;
    }

    if (!state.localStream) {
      console.log(
        `[SimplePeer] Buffering InitRequest from ${signal.from.slice(0, 20)} - no local stream yet`,
      );
      updateParticipant(ctx, roomId, signal.from, (p) => ({
        ...p,
        pendingInitRequest: signal,
      }));
      return;
    }

    const peer = createPeer(roomId, signal.from, signal.connection_id, false, state.localStream);

    updateParticipant(ctx, roomId, signal.from, (p) => ({
      ...p,
      peer,
      connectionId: signal.connection_id,
      connectionStatus: "init-received",
    }));

    const cellId = ctx.client.decodeCellId(state.cellIdB64);
    const targetDecoded = decodeHashFromBase64(signal.from);

    ctx.client
      .sendInitAccept(roomId, targetDecoded, signal.connection_id, cellId)
      .then(() => {
        console.log(`[SimplePeer] Sent InitAccept to ${signal.from.slice(0, 20)}`);
      })
      .catch((error) => {
        console.error(`[SimplePeer] Error sending InitAccept:`, error);
      });
  }

  function handleInitAccept(roomId: string, signal: SimplePeerSignalPayload): void {
    console.log(
      `[SimplePeer] InitAccept from ${signal.from.slice(0, 20)}, connectionId: ${signal.connection_id}`,
    );

    const state = safeGetConference(ctx, roomId);
    if (!state?.localStream) {
      console.warn("[SimplePeer] Cannot handle InitAccept - no local stream");
      return;
    }

    const participant = state.participants.get(signal.from);
    if (participant?.peer) {
      console.log(`[SimplePeer] Peer already exists for ${signal.from.slice(0, 20)}, skipping`);
      return;
    }

    const peer = createPeer(roomId, signal.from, signal.connection_id, true, state.localStream);

    updateParticipant(ctx, roomId, signal.from, (p) => ({
      ...p,
      peer,
      connectionId: signal.connection_id,
      connectionStatus: "connecting",
    }));
  }

  function handleSdpData(roomId: string, signal: SimplePeerSignalPayload): void {
    const state = safeGetConference(ctx, roomId);
    if (!state) return;

    const participant = state.participants.get(signal.from);
    if (!participant?.peer || isParticipantDestroyed(participant)) {
      console.warn(
        `[SimplePeer] No peer or peer destroyed for ${signal.from.slice(0, 20)}, buffering signal`,
      );

      updateParticipant(ctx, roomId, signal.from, (p) => ({
        ...p,
        pendingSdpSignals: [...(p.pendingSdpSignals || []), signal.data],
      }));
      return;
    }

    try {
      const wrapper = JSON.parse(signal.data);
      const data = wrapper.sdp || wrapper;
      console.log(
        `[SimplePeer] Passing ${data.type || "ice-candidate"} to peer for ${signal.from.slice(0, 20)}`,
      );
      participant.peer.signal(data);
    } catch (error) {
      console.error(`[SimplePeer] Error parsing/signaling SDP data:`, error);
    }
  }

  function handleMediaState(roomId: string, signal: SimplePeerSignalPayload): void {
    try {
      const { videoEnabled, audioEnabled } = JSON.parse(signal.data);
      console.log(
        `[SimplePeer] MediaState from ${signal.from.slice(0, 20)}: video=${videoEnabled}, audio=${audioEnabled}`,
      );

      updateParticipant(ctx, roomId, signal.from, (p) => ({
        ...p,
        videoEnabled,
        audioEnabled,
      }));
    } catch (error) {
      console.error(`[SimplePeer] Error parsing media state:`, error);
    }
  }

  async function initiateConnections(roomId: string): Promise<void> {
    const state = safeGetConference(ctx, roomId);
    if (!state?.localStream || !state.cellIdB64) {
      console.error("[SimplePeer] Cannot initiate connections - no local stream or cellIdB64");
      return;
    }

    const myPubKey = encodeHashToBase64(ctx.client.client.myPubKey);
    const cellId = ctx.client.decodeCellId(state.cellIdB64);

    for (const [pubKey, participant] of state.participants.entries()) {
      if (pubKey === myPubKey) continue;

      if (!participant.hasJoined) {
        console.log(
          `[SimplePeer] Participant ${pubKey.slice(0, 20)} not marked joined yet — continuing (race-resilient)`,
        );
      }

      if (
        isParticipantConnected(participant) ||
        (participant.connectionStatus && participant.connectionStatus !== "idle")
      ) {
        console.log(
          `[SimplePeer] Skipping ${pubKey.slice(0, 20)} - connected: ${isParticipantConnected(participant)}, status: ${participant.connectionStatus}`,
        );
        continue;
      }

      const shouldInitiate = myPubKey < pubKey;

      if (shouldInitiate) {
        const connectionId = generateConnectionId();
        console.log(
          `[SimplePeer] Initiating connection to ${pubKey.slice(0, 20)}, connectionId: ${connectionId}`,
        );

        updateParticipant(ctx, roomId, pubKey, (p) => ({
          ...p,
          connectionId,
          connectionStatus: "init-sent",
        }));

        const targetDecoded = decodeHashFromBase64(pubKey);
        try {
          await ctx.client.sendInitRequest(roomId, targetDecoded, connectionId, cellId);
          console.log(`[SimplePeer] Sent InitRequest to ${pubKey.slice(0, 20)}`);
        } catch (error) {
          console.error(
            `[SimplePeer] Error sending InitRequest to ${pubKey.slice(0, 20)}:`,
            error,
          );
          updateParticipant(ctx, roomId, pubKey, (p) => ({
            ...p,
            connectionStatus: "idle",
          }));
        }
      } else {
        console.log(
          `[SimplePeer] Waiting for InitRequest from ${pubKey.slice(0, 20)} (they have lower pubkey)`,
        );
      }
    }
  }

  return {
    handleSimplePeerSignal,
    initiateConnections,
  };
}
