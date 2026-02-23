import { decodeHashFromBase64, encodeHashToBase64, type AgentPubKeyB64 } from "@holochain/client";
import { type ConferenceRoom, ConferenceRole } from "$lib/types";
import {
  ConferenceLifecycleManager,
  ConferenceTransition,
  buildTransitionPayload,
  logTransition,
} from "$lib/conference/ConferenceLifecycleManager";
import {
  type ConferenceContext,
  type SimplePeerConferenceState,
  MAX_CONFERENCE_PARTICIPANTS,
  safeGetConference,
  updateParticipant,
} from "./types";

export interface ConferenceLifecycle {
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
}

export type CleanupPeerFn = (roomId: string, pubKey: string) => void;
export type CleanupWebRTCFn = (roomId: string) => void;

export function createConferenceLifecycle(
  ctx: ConferenceContext,
  cleanupPeer: CleanupPeerFn,
  cleanupWebRTC: CleanupWebRTCFn,
): ConferenceLifecycle {
  async function createConference(
    participants: AgentPubKeyB64[],
    cellIdB64?: string,
    initiatorPubKeyB64?: AgentPubKeyB64,
  ): Promise<string> {
    if (!cellIdB64) {
      throw new Error("cellIdB64 is required for creating a conference");
    }

    const totalParticipants = participants.length + 1;
    if (totalParticipants > MAX_CONFERENCE_PARTICIPANTS) {
      throw new Error(
        `Cannot create conference with ${totalParticipants} participants. Maximum is ${MAX_CONFERENCE_PARTICIPANTS} for mesh topology.`,
      );
    }

    const participantsEncoded = participants.map((p) => decodeHashFromBase64(p));
    const cellId = ctx.client.decodeCellId(cellIdB64);
    const roomId = await ctx.client.createConference(participantsEncoded, cellId);

    if (!roomId) throw new Error("Failed to create conference room");

    const room: ConferenceRoom = {
      participants: participantsEncoded,
      room_id: roomId,
    };

    const myPubKey = encodeHashToBase64(ctx.client.client.myPubKey);

    const state: SimplePeerConferenceState = {
      room,
      participants: new Map(
        participants.map((p) => [
          p,
          {
            publicKey: p,
            hasJoined: false,
            connectionStatus: "idle" as const,
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

    state.participants.set(myPubKey, {
      publicKey: myPubKey,
      hasJoined: true,
      connectionStatus: "idle",
      role: ConferenceRole.Host,
    });

    state.myRole = ConferenceRole.Host;
    state.currentHostPubKeyB64 = myPubKey;
    state.rolesFetchedAt = Date.now();

    ctx.conferences.setKeyValue(room.room_id, state);

    return room.room_id;
  }

  async function joinConference(roomId: string, participants: AgentPubKeyB64[]): Promise<void> {
    const existingState = safeGetConference(ctx, roomId);
    const participantsDecoded = participants.map((p) => decodeHashFromBase64(p));

    if (existingState) {
      if (!existingState.cellIdB64) {
        throw new Error("Conference state must have cellIdB64");
      }
      const cellId = ctx.client.decodeCellId(existingState.cellIdB64);
      await ctx.client.joinConference(roomId, participantsDecoded, cellId);
      return;
    }

    const state: SimplePeerConferenceState = {
      room: {
        room_id: roomId,
        participants: participantsDecoded,
      },
      participants: new Map(
        participants.map((p) => [
          p,
          {
            publicKey: p,
            hasJoined: false,
            connectionStatus: "idle" as const,
          },
        ]),
      ),
      isInitiator: false,
      ended: false,
    };

    ctx.conferences.setKeyValue(roomId, state);
    console.warn("[SimplePeer] joinConference called without existing conference state");
  }

  async function acceptConferenceInvitation(roomId: string): Promise<void> {
    const state = safeGetConference(ctx, roomId);
    if (!state) return;

    if (!state.cellIdB64) {
      throw new Error("Conference state must have cellIdB64");
    }

    if (state.invitationTimeoutHandle) {
      clearTimeout(state.invitationTimeoutHandle);
    }

    const isRejoining = state.invitationStatus === "left" && state.leftTimestamp !== undefined;

    if (isRejoining) {
      console.log(`[SimplePeer] Rejoining conference: ${roomId}`);
      const myPubKey = encodeHashToBase64(ctx.client.client.myPubKey);
      for (const [pubKey] of state.participants) {
        if (pubKey !== myPubKey) {
          cleanupPeer(roomId, pubKey);
        }
      }
    }

    const myPubKey = encodeHashToBase64(ctx.client.client.myPubKey);

    ctx.conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      invitationStatus: "accepted" as const,
      invitationTimeoutHandle: undefined,
      leftTimestamp: undefined,
      rejoiningTimestamp: isRejoining ? Date.now() : undefined,
      myRole: ConferenceRole.Member,
      rolesFetchedAt: Date.now(),
      cleaningUp: false,
    }));

    updateParticipant(ctx, roomId, myPubKey, (p) => ({
      ...p,
      role: ConferenceRole.Member,
    }));

    const cellId = ctx.client.decodeCellId(state.cellIdB64);
    const participants = Array.from(state.participants.keys());
    await ctx.client.joinConference(
      roomId,
      participants.map((p) => decodeHashFromBase64(p)),
      cellId,
    );
  }

  async function rejectConferenceInvitation(roomId: string): Promise<void> {
    const state = safeGetConference(ctx, roomId);
    if (!state) return;

    if (state.invitationTimeoutHandle) {
      clearTimeout(state.invitationTimeoutHandle);
    }

    if (!state.cellIdB64) {
      console.warn("Conference state missing cellIdB64, skipping reject signal");
      ctx.conferences.removeKeyValue(roomId);
      return;
    }

    ctx.conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      invitationStatus: "rejected" as const,
      invitationTimeoutHandle: undefined,
    }));

    try {
      const cellId = ctx.client.decodeCellId(state.cellIdB64);
      const participantsDecoded = Array.from(state.participants.keys()).map((p) =>
        decodeHashFromBase64(p),
      );
      await ctx.client.rejectConference(roomId, participantsDecoded, cellId);
    } catch (e) {
      console.error("Failed to send reject signal", e);
    }
    setTimeout(() => {
      ctx.conferences.removeKeyValue(roomId);
    }, 1000);
  }

  async function leaveConference(roomId: string): Promise<void> {
    const state = safeGetConference(ctx, roomId);

    if (!state?.cellIdB64) {
      console.warn("Conference state missing cellIdB64, skipping leave signal");
      cleanupWebRTC(roomId);
      return;
    }

    const myPubKey = encodeHashToBase64(ctx.client.client.myPubKey);
    const currentLifecycleState = ConferenceLifecycleManager.getLifecycleState(state);

    const validation = ConferenceLifecycleManager.validateTransition(
      state,
      ConferenceTransition.LEAVE_CONFERENCE,
      { myPubKey },
    );

    if (!validation.valid) {
      console.warn(`[SimplePeer] Cannot leave conference: ${validation.reason}`);
      return;
    }

    const cellId = ctx.client.decodeCellId(state.cellIdB64);
    await ctx.client.leaveConference(roomId, cellId);

    cleanupWebRTC(roomId);

    const canRejoin = ConferenceLifecycleManager.canRejoin(state, myPubKey);
    const remoteActiveCount = ConferenceLifecycleManager.countRemoteActiveParticipants(
      state,
      myPubKey,
    );

    if (remoteActiveCount === 0 || !canRejoin) {
      console.log(
        `[SimplePeer] No remaining participants (${remoteActiveCount}) - ending conference completely`,
      );

      const targetState = ConferenceLifecycleManager.getTargetState(
        currentLifecycleState,
        ConferenceTransition.LAST_PARTICIPANT_LEFT,
      );

      logTransition(
        roomId,
        currentLifecycleState,
        ConferenceTransition.LAST_PARTICIPANT_LEFT,
        targetState!,
        "No remaining participants after leaving",
      );

      const payload = buildTransitionPayload(ConferenceTransition.LAST_PARTICIPANT_LEFT);
      ctx.conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        ...payload,
        localStream: undefined,
        endedByMe: true,
      }));

      setTimeout(() => {
        ctx.conferences.removeKeyValue(roomId);
        console.log(`[SimplePeer] Conference ${roomId} removed - no remaining participants`);
      }, 500);
    } else {
      console.log(
        `[SimplePeer] ${remoteActiveCount} participants remain - leaving with rejoin option`,
      );

      const targetState = ConferenceLifecycleManager.getTargetState(
        currentLifecycleState,
        ConferenceTransition.LEAVE_CONFERENCE,
      );

      logTransition(
        roomId,
        currentLifecycleState,
        ConferenceTransition.LEAVE_CONFERENCE,
        targetState!,
        `${remoteActiveCount} participants remain`,
      );

      const payload = buildTransitionPayload(ConferenceTransition.LEAVE_CONFERENCE);
      ctx.conferences.updateKeyValue(roomId, (conf) => ({
        ...conf,
        ...payload,
        localStream: undefined,
        participants: new Map(
          Array.from(conf.participants.entries()).map(([key, participant]) => [
            key,
            {
              publicKey: participant.publicKey,
              hasJoined: participant.hasJoined,
              connectionStatus: "idle" as const,
              videoEnabled: participant.videoEnabled,
              audioEnabled: participant.audioEnabled,
              peer: undefined,
              connectionId: undefined,
            },
          ]),
        ),
      }));
    }

    console.log(`[SimplePeer] Left conference: ${roomId}`);
  }

  async function endConferenceForAll(roomId: string): Promise<void> {
    const conference = safeGetConference(ctx, roomId);
    if (!conference?.room?.participants) {
      console.error("[SimplePeer] Cannot end conference - no participants found");
      return;
    }

    if (!conference.cellIdB64) {
      console.error("[SimplePeer] Cannot end conference - no cellIdB64 found");
      cleanupWebRTC(roomId);
      ctx.conferences.removeKeyValue(roomId);
      return;
    }

    ctx.conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      ended: true,
      endedByMe: true,
      invitationStatus: "left" as const,
    }));

    console.log(`[SimplePeer] Marked conference ${roomId} as ended, stopping async operations`);

    const cellId = ctx.client.decodeCellId(conference.cellIdB64);

    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await ctx.client.endConferenceForAll(roomId, conference.room.participants, cellId);
        break;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes("Source chain error") && attempt < maxRetries) {
          console.warn(
            `[SimplePeer] Source chain error on endConferenceForAll (attempt ${attempt}/${maxRetries}), retrying...`,
            { roomId, error: errorMessage },
          );
          await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
          continue;
        }

        console.error(
          `[SimplePeer] Failed to notify peers about conference end after ${attempt} attempts:`,
          { roomId, error: errorMessage },
        );
        break;
      }
    }

    cleanupWebRTC(roomId);

    const postCleanupState = safeGetConference(ctx, roomId);
    if (postCleanupState) {
      const hasActiveResources =
        Array.from(postCleanupState.participants.values()).some(
          (p) => p.peer && !p.peer.destroyed,
        ) || postCleanupState.localStream;

      if (hasActiveResources) {
        console.warn(
          `[SimplePeer] Conference ${roomId} has active resources after cleanup, forcing removal`,
        );
      }
    }

    setTimeout(() => {
      ctx.conferences.removeKeyValue(roomId);
      console.log(`[SimplePeer] Conference ${roomId} removed from store after delay`);
    }, 500);

    console.log(`[SimplePeer] Conference ${roomId} fully ended and cleaned up`);
  }

  return {
    createConference,
    joinConference,
    acceptConferenceInvitation,
    rejectConferenceInvitation,
    leaveConference,
    endConferenceForAll,
  };
}
