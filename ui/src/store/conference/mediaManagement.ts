import { decodeHashFromBase64, encodeHashToBase64 } from "@holochain/client";
import { type SimplePeerSignalPayload } from "$lib/types";
import {
  type ConferenceContext,
  type CleanupReport,
  type PeerCleanupReport,
  MEDIA_STATE_DEBOUNCE_MS,
  safeGetConference,
  updateParticipant,
} from "./types";

export interface MediaManager {
  getUserMediaWithFallback: () => Promise<MediaStream>;
  sendMediaStateToAll: (
    roomId: string,
    videoEnabled: boolean,
    audioEnabled: boolean,
  ) => Promise<void>;
  initializeWebRTC: (roomId: string) => Promise<void>;
  cleanupWebRTC: (roomId: string) => void;
}

export type CleanupPeerFn = (roomId: string, pubKey: string) => void;
export type CleanupPeerWithVerificationFn = (roomId: string, pubKey: string) => PeerCleanupReport;
export type HandleInitRequestFn = (roomId: string, signal: SimplePeerSignalPayload) => void;
export type InitiateConnectionsFn = (roomId: string) => Promise<void>;
export type StartConnectionHealthMonitoringFn = (roomId: string) => void;
export type StopConnectionHealthMonitoringFn = (roomId: string) => void;

export function createMediaManager(
  ctx: ConferenceContext,
  cleanupPeer: CleanupPeerFn,
  cleanupPeerWithVerification: CleanupPeerWithVerificationFn,
  handleInitRequest: HandleInitRequestFn,
  initiateConnections: InitiateConnectionsFn,
  startConnectionHealthMonitoring: StartConnectionHealthMonitoringFn,
  stopConnectionHealthMonitoring: StopConnectionHealthMonitoringFn,
): MediaManager {
  async function getUserMediaWithFallback(): Promise<MediaStream> {
    const constraints = [
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
      {
        video: {
          width: { ideal: 320, max: 640 },
          height: { ideal: 240, max: 480 },
        },
        audio: true,
      },
      {
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      },
      { audio: true },
    ];

    let lastError: Error | null = null;
    const attemptedConstraints: string[] = [];

    for (let i = 0; i < constraints.length; i++) {
      const constraint = constraints[i];
      attemptedConstraints.push(
        `Attempt ${i + 1}: ${constraint.video ? "video+audio" : "audio-only"}`,
      );

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraint);

        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();
        console.log(
          `[SimplePeer] Media access granted: ${videoTracks.length} video, ${audioTracks.length} audio tracks`,
        );

        return stream;
      } catch (error) {
        lastError = error as Error;
        console.warn(`[SimplePeer] Attempt ${i + 1} failed:`, constraint, "Error:", error);
      }
    }

    console.error(
      `[SimplePeer] All media access attempts failed. Tried: ${attemptedConstraints.join(", ")}`,
    );

    if (lastError instanceof DOMException) {
      switch (lastError.name) {
        case "NotAllowedError":
          throw new Error(
            "Camera/microphone access denied. Please click the lock icon in your browser's address bar and allow camera and microphone permissions, then try again.",
          );

        case "NotFoundError":
          throw new Error(
            "No camera or microphone found. Please connect a camera/microphone to your device and refresh the page.",
          );

        case "NotReadableError":
          throw new Error(
            "Camera/microphone is already in use by another application. Please close other apps using your camera/microphone and try again.",
          );

        case "OverconstrainedError":
          throw new Error(
            "Your camera/microphone doesn't support the required settings. Please try with a different device.",
          );

        case "SecurityError":
          throw new Error(
            "Camera/microphone access blocked due to security settings. Please ensure you're using HTTPS and check your browser security settings.",
          );

        case "AbortError":
          throw new Error("Camera/microphone access was interrupted. Please try again.");

        default:
          throw new Error(
            `Unable to access camera/microphone: ${lastError.message}. Please check your device settings and browser permissions.`,
          );
      }
    }

    throw new Error(
      "Unable to access camera or microphone. Please check your device and browser permissions, then try again.",
    );
  }

  async function sendMediaStateToAll(
    roomId: string,
    videoEnabled: boolean,
    audioEnabled: boolean,
  ): Promise<void> {
    const existingTimer = ctx.mediaStateDebounceTimers.get(roomId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      ctx.mediaStateDebounceTimers.delete(roomId);

      const state = safeGetConference(ctx, roomId);
      if (!state?.cellIdB64) return;

      const selfPubKeyB64 = encodeHashToBase64(ctx.client.client.myPubKey);
      const cellId = ctx.client.decodeCellId(state.cellIdB64);

      console.log(
        `[SimplePeer] Sending debounced MediaState: video=${videoEnabled}, audio=${audioEnabled}`,
      );

      const sendPromises: Promise<void>[] = [];
      state.participants.forEach((participant, pubKey) => {
        if (pubKey === selfPubKeyB64) return;
        if (!participant.connectionId) return;

        const targetDecoded = decodeHashFromBase64(pubKey);
        sendPromises.push(
          ctx.client.sendMediaStateSignal(
            roomId,
            targetDecoded,
            participant.connectionId,
            videoEnabled,
            audioEnabled,
            cellId,
          ),
        );
      });

      await Promise.all(sendPromises);
    }, MEDIA_STATE_DEBOUNCE_MS);

    ctx.mediaStateDebounceTimers.set(roomId, timer);
  }

  async function initializeWebRTC(roomId: string): Promise<void> {
    const state = safeGetConference(ctx, roomId);
    if (!state) {
      console.error("[SimplePeer] initializeWebRTC: No conference state found for room:", roomId);
      return;
    }

    const isRejoining =
      state.rejoiningTimestamp !== undefined && Date.now() - state.rejoiningTimestamp < 10000;

    if (state.localStream && !isRejoining) {
      console.log("[SimplePeer] initializeWebRTC: WebRTC already initialized for room:", roomId);
      return;
    }

    if ((isRejoining || state.localStream) && state.localStream) {
      console.log("[SimplePeer] initializeWebRTC: Detected rejoin, cleaning up old state first");

      state.localStream.getTracks().forEach((track) => track.stop());

      const myPubKey = encodeHashToBase64(ctx.client.client.myPubKey);
      for (const [pubKey] of state.participants) {
        if (pubKey !== myPubKey) {
          cleanupPeer(roomId, pubKey);
        }
      }

      ctx.conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        localStream: undefined,
      }));

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log("[SimplePeer] initializeWebRTC: Starting initialization for room:", roomId, {
      isInitiator: state.isInitiator,
      participantCount: state.participants.size,
      isRejoining,
    });

    try {
      const stream = await getUserMediaWithFallback();
      console.log("[SimplePeer] initializeWebRTC: Got local media stream", {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
      });

      ctx.conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        localStream: stream,
      }));

      const updatedState = safeGetConference(ctx, roomId);
      const videoEnabled = updatedState?.videoEnabled ?? true;
      const audioEnabled = updatedState?.audioEnabled ?? true;

      console.log("[SimplePeer] initializeWebRTC: Read stored media state from store", {
        storedVideoEnabled: updatedState?.videoEnabled,
        storedAudioEnabled: updatedState?.audioEnabled,
        resolvedVideoEnabled: videoEnabled,
        resolvedAudioEnabled: audioEnabled,
      });

      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();

      console.log("[SimplePeer] initializeWebRTC: Track counts before applying state", {
        videoTracks: videoTracks.length,
        audioTracks: audioTracks.length,
      });

      videoTracks.forEach((track) => {
        console.log(`[SimplePeer] Setting video track ${track.id} enabled=${videoEnabled}`);
        track.enabled = videoEnabled;
      });
      audioTracks.forEach((track) => {
        console.log(`[SimplePeer] Setting audio track ${track.id} enabled=${audioEnabled}`);
        track.enabled = audioEnabled;
      });

      console.log("[SimplePeer] initializeWebRTC: Applied stored media state", {
        videoEnabled,
        audioEnabled,
        videoTracksAfter: videoTracks.map((t) => ({ id: t.id, enabled: t.enabled })),
        audioTracksAfter: audioTracks.map((t) => ({ id: t.id, enabled: t.enabled })),
      });

      if (updatedState) {
        for (const [pubKey, participant] of updatedState.participants.entries()) {
          if (participant.pendingInitRequest) {
            console.log(`[SimplePeer] Processing buffered InitRequest from ${pubKey.slice(0, 20)}`);
            const bufferedSignal = participant.pendingInitRequest;
            updateParticipant(ctx, roomId, pubKey, (p) => ({
              ...p,
              pendingInitRequest: undefined,
            }));
            handleInitRequest(roomId, bufferedSignal);
          }
        }
      }

      await sendMediaStateToAll(roomId, videoEnabled, audioEnabled);

      await initiateConnections(roomId);

      startConnectionHealthMonitoring(roomId);

      console.log("[SimplePeer] initializeWebRTC: Initialization complete");

      ctx.conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        rejoiningTimestamp: undefined,
      }));
    } catch (error) {
      console.error("[SimplePeer] Error initializing WebRTC:", error);

      stopConnectionHealthMonitoring(roomId);

      ctx.conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        error: error instanceof Error ? error.message : "Failed to initialize WebRTC",
        rejoiningTimestamp: undefined,
      }));
    }
  }

  function cleanupWebRTC(roomId: string): void {
    const state = safeGetConference(ctx, roomId);
    if (!state) return;

    if (state.cleaningUp) {
      console.log(`[SimplePeer] Cleanup already in progress for room: ${roomId}, skipping`);
      return;
    }

    ctx.conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      cleaningUp: true,
    }));

    console.log(`[SimplePeer] Starting comprehensive cleanup for room: ${roomId}`);

    stopConnectionHealthMonitoring(roomId);

    const mediaStateTimer = ctx.mediaStateDebounceTimers.get(roomId);
    if (mediaStateTimer) {
      clearTimeout(mediaStateTimer);
      ctx.mediaStateDebounceTimers.delete(roomId);
    }

    const cleanupReport: CleanupReport = {
      localStreamsStopped: 0,
      peersDestroyed: 0,
      timersCleared: 0,
      buffersCleared: 0,
      errors: [],
    };

    if (state.localStream) {
      const tracks = state.localStream.getTracks();
      cleanupReport.localStreamsStopped = tracks.length;

      tracks.forEach((track, index) => {
        try {
          track.onended = null;
          track.onmute = null;
          track.onunmute = null;

          track.stop();
          console.log(
            `[SimplePeer] Stopped local track ${index}: ${track.kind} (${track.readyState})`,
          );
        } catch (e) {
          const error = `[SimplePeer] Error stopping local track ${index}: ${e}`;
          console.warn(error);
          cleanupReport.errors.push(error);
        }
      });
    }

    for (const [pubKey] of state.participants.entries()) {
      const peerCleanupReport = cleanupPeerWithVerification(roomId, pubKey);
      cleanupReport.peersDestroyed += peerCleanupReport.peersDestroyed;
      cleanupReport.timersCleared += peerCleanupReport.timersCleared;
      cleanupReport.buffersCleared += peerCleanupReport.buffersCleared;
      cleanupReport.errors.push(...peerCleanupReport.errors);
    }

    ctx.conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      localStream: undefined,
      cleaningUp: false,
    }));

    console.log(`[SimplePeer] Cleanup verification report for ${roomId}:`, cleanupReport);

    if (cleanupReport.errors.length > 0) {
      console.warn(
        `[SimplePeer] Cleanup completed with ${cleanupReport.errors.length} issues for room ${roomId}`,
      );
    }
  }

  return {
    getUserMediaWithFallback,
    sendMediaStateToAll,
    initializeWebRTC,
    cleanupWebRTC,
  };
}
