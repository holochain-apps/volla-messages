import SimplePeer from "simple-peer";
import { decodeHashFromBase64, encodeHashToBase64, type AgentPubKeyB64 } from "@holochain/client";
import {
  type ConferenceContext,
  type PeerCleanupReport,
  ICE_CONFIG,
  CONNECTION_TIMEOUT_MS,
  SDP_BUFFER_EXPIRY_MS,
  safeGetConference,
  updateParticipant,
  deriveConnectionQuality,
} from "./types";

export interface PeerConnectionManager {
  createPeer: (
    roomId: string,
    participantPubKey: AgentPubKeyB64,
    connectionId: string,
    initiator: boolean,
    localStream?: MediaStream,
  ) => SimplePeer.Instance;
  cleanupPeer: (roomId: string, pubKey: string) => void;
  cleanupPeerWithVerification: (roomId: string, pubKey: string) => PeerCleanupReport;
}

export type ScheduleReconnectFn = (roomId: string, pubKey: string) => void;
export type StartNetworkMonitoringFn = (
  roomId: string,
  pubKey: string,
  timeoutMs: number,
) => void;
export type StopNetworkMonitoringFn = (roomId: string, pubKey: string) => void;

export function createPeerConnectionManager(
  ctx: ConferenceContext,
  scheduleReconnect: ScheduleReconnectFn,
  startNetworkMonitoring: StartNetworkMonitoringFn,
  stopNetworkMonitoring: StopNetworkMonitoringFn,
): PeerConnectionManager {

  function cleanupPeer(roomId: string, pubKey: string): void {
    const state = safeGetConference(ctx, roomId);
    if (!state) return;

    const participant = state.participants.get(pubKey);
    if (!participant) return;

    if (participant.reconnectTimer) {
      clearTimeout(participant.reconnectTimer);
    }
    if (participant.connectionTimeout) {
      clearTimeout(participant.connectionTimeout);
    }
    if (participant.networkMonitorTimeout) {
      clearTimeout(participant.networkMonitorTimeout);
    }

    if (participant.peer && !participant.peer.destroyed) {
      try {
        participant.peer.destroy();
      } catch (e) {
        console.warn(`[SimplePeer] Error destroying peer for ${pubKey.slice(0, 20)}:`, e);
      }
    }

    updateParticipant(ctx, roomId, pubKey, (p) => ({
      publicKey: p.publicKey,
      hasJoined: p.hasJoined,
      connectionStatus: "idle",
      videoEnabled: p.videoEnabled,
      audioEnabled: p.audioEnabled,
      peer: undefined,
      stream: undefined,
      connectionId: undefined,
      pendingSdpSignals: [],
      reconnectTimer: undefined,
      connectionTimeout: undefined,
      networkMonitorTimeout: undefined,
      lastIceState: undefined,
      videoTrackActive: undefined,
      audioTrackActive: undefined,
      trackFailureDetected: undefined,
      pendingInitRequest: undefined,
    }));

    console.log(`[SimplePeer] Cleaned up peer connection: ${pubKey.slice(0, 20)}`);
  }

  function createPeer(
    roomId: string,
    participantPubKey: AgentPubKeyB64,
    connectionId: string,
    initiator: boolean,
    localStream?: MediaStream,
  ): SimplePeer.Instance {
    console.log(
      `[SimplePeer] Creating peer for ${participantPubKey.slice(0, 20)}, initiator: ${initiator}, connectionId: ${connectionId}`,
    );

    const peerOpts: SimplePeer.Options = {
      initiator,
      config: { iceServers: ICE_CONFIG },
      trickle: true,
    };

    if (localStream) {
      peerOpts.stream = localStream;
    }

    const peer = new SimplePeer(peerOpts);

    peer.on("signal", async (data) => {
      if (peer.destroyed) {
        console.warn(
          `[SimplePeer] Peer destroyed, skipping signal for ${participantPubKey.slice(0, 20)}`,
        );
        return;
      }

      console.log(
        `[SimplePeer] Signal event for ${participantPubKey.slice(0, 20)}:`,
        data.type || "ice-candidate",
      );

      const state = safeGetConference(ctx, roomId);

      if (!state?.cellIdB64) {
        console.warn(
          `[SimplePeer] No cellIdB64 yet, buffering outgoing SDP for ${participantPubKey.slice(0, 20)}`,
        );
        updateParticipant(ctx, roomId, participantPubKey, (p) => ({
          ...p,
          pendingOutgoingSdp: [...(p.pendingOutgoingSdp || []), JSON.stringify(data)],
        }));
        return;
      }

      const cellId = ctx.client.decodeCellId(state.cellIdB64);
      const targetDecoded = decodeHashFromBase64(participantPubKey);

      try {
        await ctx.client.sendSdpData(roomId, targetDecoded, connectionId, data, cellId);
      } catch (error) {
        if (!peer.destroyed) {
          console.error(`[SimplePeer] Error sending SDP data:`, error);
        }
      }
    });

    peer.on("stream", (remoteStream) => {
      console.log(
        `[SimplePeer] Received remote stream from ${participantPubKey.slice(0, 20)}:`,
        remoteStream.getTracks().map((t) => ({ kind: t.kind, enabled: t.enabled })),
      );

      console.log(`[SimplePeer] peer.streams after stream event:`, {
        streamsCount: peer.streams?.length ?? 0,
        peerConnected: peer.connected,
        peerDestroyed: peer.destroyed,
      });

      updateParticipant(ctx, roomId, participantPubKey, (p) => ({
        ...p,
        stream: remoteStream,
        connectionStatus: "connected",
        streamVersion: (p.streamVersion || 0) + 1,
      }));

      const state = safeGetConference(ctx, roomId);
      const updatedParticipant = state?.participants.get(participantPubKey);
      console.log(`[SimplePeer] Participant state after stream update:`, {
        hasPeer: !!updatedParticipant?.peer,
        hasStream: !!updatedParticipant?.stream,
        streamVersion: updatedParticipant?.streamVersion,
        connectionStatus: updatedParticipant?.connectionStatus,
        peerStreamsCount: updatedParticipant?.peer?.streams?.length ?? 0,
      });
    });

    peer.on("iceStateChange", (iceState: RTCIceConnectionState) => {
      if (peer.destroyed) {
        console.log(
          `[SimplePeer] ICE state change on destroyed peer for ${participantPubKey.slice(0, 20)}, ignoring`,
        );
        return;
      }

      const currentState = safeGetConference(ctx, roomId);
      if (!currentState || currentState.ended) {
        console.log(
          `[SimplePeer] ICE state change for ended conference ${roomId.slice(0, 20)}, ignoring`,
        );
        return;
      }

      const quality = deriveConnectionQuality(iceState);
      console.log(
        `[SimplePeer] ICE state change for ${participantPubKey.slice(0, 20)}: ${iceState} (quality: ${quality})`,
      );

      updateParticipant(ctx, roomId, participantPubKey, (p) => ({
        ...p,
        lastIceState: iceState,
        connectionQuality: quality,
      }));

      switch (iceState) {
        case "disconnected":
          console.warn(
            `[SimplePeer] ICE disconnected for ${participantPubKey.slice(0, 20)}, monitoring for recovery`,
          );
          startNetworkMonitoring(roomId, participantPubKey, 5000);
          break;

        case "failed":
          console.error(
            `[SimplePeer] ICE failed for ${participantPubKey.slice(0, 20)}, triggering reconnect`,
          );
          stopNetworkMonitoring(roomId, participantPubKey);
          scheduleReconnect(roomId, participantPubKey);
          break;

        case "connected":
        case "completed":
          console.log(`[SimplePeer] ICE ${iceState} for ${participantPubKey.slice(0, 20)}`);
          stopNetworkMonitoring(roomId, participantPubKey);
          break;
      }
    });

    peer.on("track", (track, _stream) => {
      console.log(
        `[SimplePeer] Track received: ${track.kind} from ${participantPubKey.slice(0, 20)}`,
        `(enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState})`,
      );

      const trackKindKey = track.kind === "video" ? "videoTrackActive" : "audioTrackActive";
      updateParticipant(ctx, roomId, participantPubKey, (p) => ({
        ...p,
        [trackKindKey]: track.readyState === "live",
      }));

      track.onended = () => {
        console.warn(
          `[SimplePeer] ${track.kind} track ended for ${participantPubKey.slice(0, 20)}`,
        );

        updateParticipant(ctx, roomId, participantPubKey, (p) => ({
          ...p,
          [trackKindKey]: false,
          trackFailureDetected: true,
        }));

        if (track.kind === "audio") {
          console.warn(
            `[SimplePeer] Audio track failure detected - connection may need renegotiation`,
          );
        }
      };

      track.onmute = () => {
        console.log(
          `[SimplePeer] ${track.kind} track muted for ${participantPubKey.slice(0, 20)}`,
        );
      };

      track.onunmute = () => {
        console.log(
          `[SimplePeer] ${track.kind} track unmuted for ${participantPubKey.slice(0, 20)}`,
        );
      };
    });

    peer.on("connect", () => {
      console.log(`[SimplePeer] Connected to ${participantPubKey.slice(0, 20)}`);

      updateParticipant(ctx, roomId, participantPubKey, (p) => {
        if (p.connectionTimeout) {
          clearTimeout(p.connectionTimeout);
        }
        if (p.reconnectTimer) {
          clearTimeout(p.reconnectTimer);
        }

        return {
          ...p,
          connectionStatus: "connected",
          reconnectAttempts: 0,
          reconnectTimer: undefined,
          connectionTimeout: undefined,
        };
      });

      const currentState = safeGetConference(ctx, roomId);
      if (currentState?.localStream && currentState.cellIdB64) {
        const videoTracks = currentState.localStream.getVideoTracks();
        const audioTracks = currentState.localStream.getAudioTracks();
        const videoEnabled = videoTracks.some((track) => track.enabled);
        const audioEnabled = audioTracks.some((track) => track.enabled);

        const cellId = ctx.client.decodeCellId(currentState.cellIdB64);
        const targetDecoded = decodeHashFromBase64(participantPubKey);

        const participant = currentState.participants.get(participantPubKey);
        if (participant?.connectionId) {
          ctx.client
            .sendMediaStateSignal(
              roomId,
              targetDecoded,
              participant.connectionId,
              videoEnabled,
              audioEnabled,
              cellId,
            )
            .then(() => {
              console.log(
                `[SimplePeer] Sent media state to late joiner ${participantPubKey.slice(0, 20)}: video=${videoEnabled}, audio=${audioEnabled}`,
              );
            })
            .catch((err) =>
              console.error("[SimplePeer] Error sending initial media state:", err),
            );
        }
      }

      if (currentState) {
        const myPubKey = encodeHashToBase64(ctx.client.client.myPubKey);
        currentState.participants.forEach((otherParticipant, otherPubKey) => {
          if (otherPubKey !== participantPubKey && otherPubKey !== myPubKey) {
            const otherTargetDecoded = decodeHashFromBase64(otherPubKey);
            if (otherParticipant?.connectionId && currentState.cellIdB64) {
              const otherCellId = ctx.client.decodeCellId(currentState.cellIdB64);
              ctx.client
                .sendMediaStateSignal(
                  roomId,
                  otherTargetDecoded,
                  otherParticipant.connectionId,
                  otherParticipant.videoEnabled || false,
                  otherParticipant.audioEnabled || false,
                  otherCellId,
                )
                .catch((err) =>
                  console.warn("[SimplePeer] Error syncing media state for late joiner:", err),
                );
            }
          }
        });
      }
    });

    peer.on("close", () => {
      console.log(`[SimplePeer] Connection closed with ${participantPubKey.slice(0, 20)}`);

      const currentState = safeGetConference(ctx, roomId);
      if (currentState?.ended) return;

      const participant = currentState?.participants.get(participantPubKey);
      if (!participant?.hasJoined) {
        console.log(
          `[SimplePeer] Participant ${participantPubKey.slice(0, 20)} has left the conference, not reconnecting`,
        );
        return;
      }

      updateParticipant(ctx, roomId, participantPubKey, (p) => ({
        ...p,
        connectionStatus: "idle",
      }));

      scheduleReconnect(roomId, participantPubKey);
    });

    peer.on("error", (err) => {
      console.error(`[SimplePeer] Error with ${participantPubKey.slice(0, 20)}:`, err);

      const currentState = safeGetConference(ctx, roomId);
      const participant = currentState?.participants.get(participantPubKey);
      if (!participant?.hasJoined || currentState?.ended) {
        console.log(
          `[SimplePeer] Participant ${participantPubKey.slice(0, 20)} has left or conference ended, not reconnecting after error`,
        );
        return;
      }

      updateParticipant(ctx, roomId, participantPubKey, (p) => ({
        ...p,
        connectionStatus: "failed",
      }));

      scheduleReconnect(roomId, participantPubKey);
    });

    const timeout = setTimeout(() => {
      console.error(
        `[SimplePeer] Connection timeout (${CONNECTION_TIMEOUT_MS}ms) for ${participantPubKey.slice(0, 20)}`,
      );

      updateParticipant(ctx, roomId, participantPubKey, (p) => ({
        ...p,
        connectionStatus: "failed",
      }));

      if (!peer.destroyed) {
        peer.destroy();
      }

      scheduleReconnect(roomId, participantPubKey);
    }, CONNECTION_TIMEOUT_MS);

    updateParticipant(ctx, roomId, participantPubKey, (p) => ({
      ...p,
      connectionTimeout: timeout,
    }));

    const currentState = safeGetConference(ctx, roomId);
    const participant = currentState?.participants.get(participantPubKey);

    if (participant?.pendingSdpSignals?.length) {
      console.log(
        `[SimplePeer] Flushing ${participant.pendingSdpSignals.length} buffered SDP signals for ${participantPubKey.slice(0, 20)}`,
      );

      const now = Date.now();
      const validSignals = participant.pendingSdpSignals.filter((signal) => {
        try {
          const parsed = JSON.parse(signal);
          const signalTime = parsed.timestamp || now;
          return now - signalTime < SDP_BUFFER_EXPIRY_MS;
        } catch {
          return false;
        }
      });

      if (validSignals.length < participant.pendingSdpSignals.length) {
        console.log(
          `[SimplePeer] Discarded ${participant.pendingSdpSignals.length - validSignals.length} expired/invalid signals`,
        );
      }

      for (const bufferedData of validSignals) {
        try {
          if (peer.destroyed) {
            console.warn(
              `[SimplePeer] Peer destroyed, skipping buffered signal for ${participantPubKey.slice(0, 20)}`,
            );
            break;
          }

          const signalData = JSON.parse(bufferedData);
          peer.signal(signalData);

          updateParticipant(ctx, roomId, participantPubKey, (p) => ({
            ...p,
            lastSignalReceived: now,
          }));
        } catch (error) {
          console.error("[SimplePeer] Error processing buffered SDP signal:", error);
        }
      }

      updateParticipant(ctx, roomId, participantPubKey, (p) => ({
        ...p,
        pendingSdpSignals: [],
        signalBufferExpiry: undefined,
      }));
    }

    if (participant?.pendingOutgoingSdp?.length && currentState?.cellIdB64) {
      const cellId = ctx.client.decodeCellId(currentState.cellIdB64);
      const targetDecoded = decodeHashFromBase64(participantPubKey);

      for (const outData of participant.pendingOutgoingSdp) {
        ctx.client
          .sendSdpData(roomId, targetDecoded, connectionId, JSON.parse(outData), cellId)
          .catch((err) =>
            console.error("[SimplePeer] Error sending buffered outgoing SDP:", err),
          );
      }

      updateParticipant(ctx, roomId, participantPubKey, (p) => ({
        ...p,
        pendingOutgoingSdp: [],
      }));
    }

    return peer;
  }

  function cleanupPeerWithVerification(roomId: string, pubKey: string): PeerCleanupReport {
    const state = safeGetConference(ctx, roomId);
    if (!state)
      return { peersDestroyed: 0, timersCleared: 0, buffersCleared: 0, errors: [] };

    const participant = state.participants.get(pubKey);
    if (!participant)
      return { peersDestroyed: 0, timersCleared: 0, buffersCleared: 0, errors: [] };

    const report: PeerCleanupReport = {
      peersDestroyed: 0,
      timersCleared: 0,
      buffersCleared: 0,
      errors: [],
    };

    if (participant.reconnectTimer) {
      try {
        clearTimeout(participant.reconnectTimer);
        report.timersCleared++;
        console.log(`[SimplePeer] Cleared reconnect timer for ${pubKey.slice(0, 20)}`);
      } catch (e) {
        const error = `[SimplePeer] Error clearing reconnect timer for ${pubKey.slice(0, 20)}: ${e}`;
        console.warn(error);
        report.errors.push(error);
      }
    }
    if (participant.connectionTimeout) {
      try {
        clearTimeout(participant.connectionTimeout);
        report.timersCleared++;
        console.log(`[SimplePeer] Cleared connection timeout for ${pubKey.slice(0, 20)}`);
      } catch (e) {
        const error = `[SimplePeer] Error clearing connection timeout for ${pubKey.slice(0, 20)}: ${e}`;
        console.warn(error);
        report.errors.push(error);
      }
    }
    if (participant.networkMonitorTimeout) {
      try {
        clearTimeout(participant.networkMonitorTimeout);
        report.timersCleared++;
        console.log(`[SimplePeer] Cleared network monitor timeout for ${pubKey.slice(0, 20)}`);
      } catch (e) {
        const error = `[SimplePeer] Error clearing network monitor timeout for ${pubKey.slice(0, 20)}: ${e}`;
        console.warn(error);
        report.errors.push(error);
      }
    }

    if (participant.peer && !participant.peer.destroyed) {
      try {
        participant.peer.destroy();
        report.peersDestroyed++;
        console.log(`[SimplePeer] Destroyed peer for ${pubKey.slice(0, 20)}`);
      } catch (e) {
        const error = `[SimplePeer] Error destroying peer for ${pubKey.slice(0, 20)}: ${e}`;
        console.warn(error);
        report.errors.push(error);
      }
    }

    const bufferCount =
      (participant.pendingSdpSignals?.length || 0) +
      (participant.pendingOutgoingSdp?.length || 0);
    if (bufferCount > 0) {
      console.log(
        `[SimplePeer] Clearing ${bufferCount} buffered signals for ${pubKey.slice(0, 20)}`,
      );
    }

    try {
      updateParticipant(ctx, roomId, pubKey, (p) => ({
        publicKey: p.publicKey,
        hasJoined: p.hasJoined,
        connectionStatus: "idle",
        videoEnabled: p.videoEnabled,
        audioEnabled: p.audioEnabled,
        peer: undefined,
        stream: undefined,
        connectionId: undefined,
        pendingSdpSignals: [],
        pendingOutgoingSdp: [],
        reconnectTimer: undefined,
        connectionTimeout: undefined,
        networkMonitorTimeout: undefined,
        signalBufferExpiry: undefined,
        lastSignalReceived: undefined,
        lastIceState: undefined,
        videoTrackActive: undefined,
        audioTrackActive: undefined,
        trackFailureDetected: undefined,
        connectionRetryCount: p.connectionRetryCount,
      }));
      report.buffersCleared += bufferCount;
    } catch (e) {
      const error = `[SimplePeer] Error resetting participant state for ${pubKey.slice(0, 20)}: ${e}`;
      console.warn(error);
      report.errors.push(error);
    }

    console.log(
      `[SimplePeer] Verified cleanup for ${pubKey.slice(0, 20)}: ${JSON.stringify({
        peersDestroyed: report.peersDestroyed,
        timersCleared: report.timersCleared,
        buffersCleared: report.buffersCleared,
        errors: report.errors.length,
      })}`,
    );

    return report;
  }

  return {
    createPeer,
    cleanupPeer,
    cleanupPeerWithVerification,
  };
}
