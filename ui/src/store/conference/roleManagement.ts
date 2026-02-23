import { decodeHashFromBase64, encodeHashToBase64, type AgentPubKeyB64 } from "@holochain/client";
import { ConferenceRole } from "$lib/types";
import {
  type ConferenceContext,
  ROLE_CACHE_TTL_MS,
  safeGetConference,
  updateParticipant,
} from "./types";

export interface RoleManager {
  fetchRoles: (roomId: string) => Promise<void>;
  transferHost: (roomId: string, newHostPubKeyB64: AgentPubKeyB64) => Promise<void>;
  kickParticipant: (roomId: string, targetPubKeyB64: AgentPubKeyB64) => Promise<void>;
  changeParticipantRole: (
    roomId: string,
    targetPubKeyB64: AgentPubKeyB64,
    newRole: ConferenceRole,
  ) => Promise<void>;
  canEndConference: (roomId: string) => boolean;
  canKick: (roomId: string, targetPubKeyB64: AgentPubKeyB64) => boolean;
}

export function createRoleManager(
  ctx: ConferenceContext,
  cleanupPeer: (roomId: string, pubKey: string) => void,
): RoleManager {
  async function fetchRoles(roomId: string): Promise<void> {
    const state = safeGetConference(ctx, roomId);
    if (!state?.cellIdB64) {
      console.warn("[SimplePeer] Cannot fetch roles - no cellIdB64");
      return;
    }

    if (
      state.myRole !== undefined &&
      state.rolesFetchedAt &&
      Date.now() - state.rolesFetchedAt < ROLE_CACHE_TTL_MS
    ) {
      console.log("[SimplePeer] Using cached role:", state.myRole);
      return;
    }

    console.log("[SimplePeer] Fetching roles from DHT");
    const cellId = ctx.client.decodeCellId(state.cellIdB64);

    try {
      const myRole = await ctx.client.getMyConferenceRole(roomId, cellId);
      const participants = await ctx.client.getConferenceParticipants(roomId, cellId);

      const hostRecord = participants.find((p) => p.role === ConferenceRole.Host);
      const currentHostPubKeyB64 = hostRecord
        ? encodeHashToBase64(hostRecord.agent)
        : undefined;

      ctx.conferences.updateKeyValue(roomId, (conf) => {
        if (!conf) return conf;

        const updatedParticipants = new Map(conf.participants);

        for (const record of participants) {
          const pubKeyB64 = encodeHashToBase64(record.agent);
          const existing = updatedParticipants.get(pubKeyB64);
          if (existing) {
            updatedParticipants.set(pubKeyB64, {
              ...existing,
              role: record.role,
            });
          }
        }

        return {
          ...conf,
          myRole: myRole ?? undefined,
          currentHostPubKeyB64,
          rolesFetchedAt: Date.now(),
          participants: updatedParticipants,
        };
      });

      console.log("[SimplePeer] Roles fetched successfully:", { myRole, currentHostPubKeyB64 });
    } catch (error) {
      console.error("[SimplePeer] Error fetching roles:", error);
    }
  }

  async function transferHost(
    roomId: string,
    newHostPubKeyB64: AgentPubKeyB64,
  ): Promise<void> {
    const state = safeGetConference(ctx, roomId);
    if (!state?.cellIdB64) {
      throw new Error("Cannot transfer host - no cellIdB64");
    }

    const cellId = ctx.client.decodeCellId(state.cellIdB64);
    const newHost = decodeHashFromBase64(newHostPubKeyB64);

    await ctx.client.transferHost(roomId, newHost, cellId);

    ctx.conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      rolesFetchedAt: undefined,
    }));
    await fetchRoles(roomId);
  }

  async function kickParticipant(
    roomId: string,
    targetPubKeyB64: AgentPubKeyB64,
  ): Promise<void> {
    const state = safeGetConference(ctx, roomId);
    if (!state?.cellIdB64) {
      throw new Error("Cannot kick participant - no cellIdB64");
    }

    const cellId = ctx.client.decodeCellId(state.cellIdB64);
    const target = decodeHashFromBase64(targetPubKeyB64);

    await ctx.client.kickParticipant(roomId, target, cellId);

    cleanupPeer(roomId, targetPubKeyB64);

    ctx.conferences.updateKeyValue(roomId, (conf) => {
      if (!conf) return conf;
      const updatedParticipants = new Map(conf.participants);
      updatedParticipants.delete(targetPubKeyB64);
      return {
        ...conf,
        participants: updatedParticipants,
      };
    });
  }

  async function changeParticipantRole(
    roomId: string,
    targetPubKeyB64: AgentPubKeyB64,
    newRole: ConferenceRole,
  ): Promise<void> {
    const state = safeGetConference(ctx, roomId);
    if (!state?.cellIdB64) {
      throw new Error("Cannot change role - no cellIdB64");
    }

    const cellId = ctx.client.decodeCellId(state.cellIdB64);
    const target = decodeHashFromBase64(targetPubKeyB64);

    await ctx.client.changeParticipantRole(roomId, target, newRole, cellId);

    updateParticipant(ctx, roomId, targetPubKeyB64, (p) => ({
      ...p,
      role: newRole,
    }));
  }

  function canEndConference(roomId: string): boolean {
    const state = safeGetConference(ctx, roomId);
    if (state?.myRole === undefined) {
      return state?.isInitiator ?? false;
    }
    return state.myRole <= ConferenceRole.CoHost;
  }

  function canKick(roomId: string, targetPubKeyB64: AgentPubKeyB64): boolean {
    const state = safeGetConference(ctx, roomId);
    if (state?.myRole === undefined) return false;

    const targetParticipant = state.participants.get(targetPubKeyB64);
    if (targetParticipant?.role === undefined) return false;

    return state.myRole < targetParticipant.role;
  }

  return {
    fetchRoles,
    transferHost,
    kickParticipant,
    changeParticipantRole,
    canEndConference,
    canKick,
  };
}
