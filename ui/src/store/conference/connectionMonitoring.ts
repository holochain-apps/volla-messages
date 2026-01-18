import { encodeHashToBase64 } from "@holochain/client";
import {
  type ConferenceContext,
  RECONNECT_CONFIG,
  safeGetConference,
  updateParticipant,
  isParticipantConnected,
} from "./types";

export interface ConnectionMonitor {
  scheduleReconnect: (roomId: string, pubKey: string) => void;
  startNetworkMonitoring: (roomId: string, pubKey: string, timeoutMs: number) => void;
  stopNetworkMonitoring: (roomId: string, pubKey: string) => void;
  startConnectionHealthMonitoring: (roomId: string) => void;
  stopConnectionHealthMonitoring: (roomId: string) => void;
}

export function createConnectionMonitor(
  ctx: ConferenceContext,
  cleanupPeer: (roomId: string, pubKey: string) => void,
  initiateConnections: (roomId: string) => Promise<void>,
): ConnectionMonitor {

  function scheduleReconnect(roomId: string, pubKey: string): void {
    const state = safeGetConference(ctx, roomId);
    if (!state) return;

    const participant = state.participants.get(pubKey);
    if (!participant) return;

    const attempt = (participant.reconnectAttempts || 0) + 1;
    const totalRetries = (participant.connectionRetryCount || 0) + 1;

    if (attempt > RECONNECT_CONFIG.maxAttempts) {
      console.error(
        `[SimplePeer] Max reconnect attempts (${RECONNECT_CONFIG.maxAttempts}) reached for ${pubKey.slice(0, 20)}. Total connection attempts: ${totalRetries}`,
      );
      updateParticipant(ctx, roomId, pubKey, (p) => ({
        ...p,
        connectionStatus: "failed",
        reconnectAttempts: 0,
        reconnectTimer: undefined,
        connectionRetryCount: totalRetries,
      }));
      return;
    }

    const baseDelay =
      RECONNECT_CONFIG.baseDelayMs *
      Math.pow(RECONNECT_CONFIG.backoffMultiplier, attempt - 1);
    const jitter = Math.random() * RECONNECT_CONFIG.jitterFactor * baseDelay;
    const delay = Math.min(baseDelay + jitter, RECONNECT_CONFIG.maxDelayMs);

    console.log(
      `[SimplePeer] Scheduling reconnect attempt ${attempt}/${RECONNECT_CONFIG.maxAttempts}, total ${totalRetries} in ${Math.round(delay)}ms for ${pubKey.slice(0, 20)}`,
    );

    updateParticipant(ctx, roomId, pubKey, (p) => ({
      ...p,
      reconnectAttempts: attempt,
      connectionRetryCount: totalRetries,
    }));

    const timer = setTimeout(async () => {
      console.log(`[SimplePeer] Attempting reconnect ${attempt} to ${pubKey.slice(0, 20)}`);

      const currentState = safeGetConference(ctx, roomId);
      if (!currentState || currentState.ended) {
        console.log(
          `[SimplePeer] Conference ended or not found, stopping reconnection for ${pubKey.slice(0, 20)}`,
        );
        updateParticipant(ctx, roomId, pubKey, (p) => ({
          ...p,
          reconnectTimer: undefined,
        }));
        return;
      }

      if (!currentState.localStream || !currentState.cellIdB64) {
        console.log(
          `[SimplePeer] Resources cleaned up (no localStream/cellIdB64), stopping reconnection for ${pubKey.slice(0, 20)}`,
        );
        updateParticipant(ctx, roomId, pubKey, (p) => ({
          ...p,
          reconnectTimer: undefined,
          reconnectAttempts: 0,
        }));
        return;
      }

      if (
        currentState.invitationStatus === "left" ||
        currentState.invitationStatus === "rejected"
      ) {
        console.log(
          `[SimplePeer] Invitation status is "${currentState.invitationStatus}", stopping reconnection for ${pubKey.slice(0, 20)}`,
        );
        updateParticipant(ctx, roomId, pubKey, (p) => ({
          ...p,
          reconnectTimer: undefined,
          reconnectAttempts: 0,
        }));
        return;
      }

      cleanupPeer(roomId, pubKey);

      const postCleanupState = safeGetConference(ctx, roomId);
      const postCleanupParticipant = postCleanupState?.participants.get(pubKey);
      if (postCleanupParticipant?.peer && !postCleanupParticipant.peer.destroyed) {
        console.warn(`[SimplePeer] Cleanup verification failed for ${pubKey.slice(0, 20)}`);
      }

      try {
        await initiateConnections(roomId);

        const verificationState = safeGetConference(ctx, roomId);
        const verificationParticipant = verificationState?.participants.get(pubKey);
        if (verificationParticipant?.connectionStatus === "idle") {
          console.warn(
            `[SimplePeer] Connection attempt verification failed for ${pubKey.slice(0, 20)}`,
          );
        }
      } catch (error) {
        console.error(`[SimplePeer] Error during reconnection attempt:`, error);
      }
    }, delay);

    updateParticipant(ctx, roomId, pubKey, (p) => ({
      ...p,
      reconnectTimer: timer,
    }));
  }

  function startNetworkMonitoring(
    roomId: string,
    pubKey: string,
    timeoutMs: number,
  ): void {
    const state = safeGetConference(ctx, roomId);
    const participant = state?.participants.get(pubKey);

    if (participant?.networkMonitorTimeout) {
      clearTimeout(participant.networkMonitorTimeout);
    }

    const timeout = setTimeout(() => {
      console.warn(
        `[SimplePeer] Network monitoring timeout (${timeoutMs}ms) for ${pubKey.slice(0, 20)}, initiating reconnect`,
      );

      const currentState = safeGetConference(ctx, roomId);
      const currentParticipant = currentState?.participants.get(pubKey);

      if (currentParticipant?.lastIceState === "disconnected") {
        scheduleReconnect(roomId, pubKey);
      }
    }, timeoutMs);

    updateParticipant(ctx, roomId, pubKey, (p) => ({
      ...p,
      networkMonitorTimeout: timeout,
    }));

    console.log(
      `[SimplePeer] Started network monitoring for ${pubKey.slice(0, 20)} (${timeoutMs}ms grace period)`,
    );
  }

  function stopNetworkMonitoring(roomId: string, pubKey: string): void {
    const state = safeGetConference(ctx, roomId);
    const participant = state?.participants.get(pubKey);

    if (participant?.networkMonitorTimeout) {
      clearTimeout(participant.networkMonitorTimeout);
      updateParticipant(ctx, roomId, pubKey, (p) => ({
        ...p,
        networkMonitorTimeout: undefined,
      }));
      console.log(`[SimplePeer] Stopped network monitoring for ${pubKey.slice(0, 20)}`);
    }
  }

  function startConnectionHealthMonitoring(roomId: string): void {
    const state = safeGetConference(ctx, roomId);
    if (!state) return;

    if (state.healthMonitorInterval) {
      clearInterval(state.healthMonitorInterval);
    }

    const interval = setInterval(() => {
      const currentState = safeGetConference(ctx, roomId);
      if (!currentState || currentState.ended) {
        stopConnectionHealthMonitoring(roomId);
        return;
      }

      console.log(`[SimplePeer] Health check for room ${roomId.slice(0, 20)}`);
      const myPubKey = encodeHashToBase64(ctx.client.client.myPubKey);
      let healthyConnections = 0;
      let totalParticipants = 0;

      currentState.participants.forEach((participant, pubKey) => {
        if (pubKey === myPubKey) return;
        if (!participant.hasJoined) return;

        totalParticipants++;
        const isConnected = isParticipantConnected(participant);
        const iceState = participant.lastIceState;

        console.log(
          `[SimplePeer] Health: ${pubKey.slice(0, 20)} - connected: ${isConnected}, ICE: ${iceState || "unknown"}, status: ${participant.connectionStatus}`,
        );

        if (isConnected) {
          healthyConnections++;
        } else if (
          participant.connectionStatus === "idle" ||
          participant.connectionStatus === "failed"
        ) {
          console.warn(
            `[SimplePeer] Health check: reconnecting to ${pubKey.slice(0, 20)} (status: ${participant.connectionStatus})`,
          );
          scheduleReconnect(roomId, pubKey);
        }
      });

      console.log(
        `[SimplePeer] Health summary: ${healthyConnections}/${totalParticipants} connections healthy`,
      );
    }, 10000);

    ctx.conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      healthMonitorInterval: interval,
    }));

    console.log(
      `[SimplePeer] Started connection health monitoring for room ${roomId.slice(0, 20)}`,
    );
  }

  function stopConnectionHealthMonitoring(roomId: string): void {
    const state = safeGetConference(ctx, roomId);
    if (state?.healthMonitorInterval) {
      clearInterval(state.healthMonitorInterval);
      ctx.conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        healthMonitorInterval: undefined,
      }));
      console.log(
        `[SimplePeer] Stopped connection health monitoring for room ${roomId.slice(0, 20)}`,
      );
    }
  }

  return {
    scheduleReconnect,
    startNetworkMonitoring,
    stopNetworkMonitoring,
    startConnectionHealthMonitoring,
    stopConnectionHealthMonitoring,
  };
}
