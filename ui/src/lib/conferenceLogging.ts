import { encodeHashToBase64, type AgentPubKeyB64 } from "@holochain/client";
import type { ConferenceLog, ConferenceLogEvent } from "$lib/types";
import { createConferenceLogMessage } from "$lib/types";
import type { ConversationMessageStore } from "$store/ConversationMessageStore";
import type { CellIdB64 } from "$lib/types";

/**
 * Helper functions for creating and sending conference log messages to the chat
 */

export async function sendConferenceStartedLog(
  messageStore: ConversationMessageStore,
  cellIdB64: CellIdB64,
  conferenceId: string,
  initiatorPubKeyB64: AgentPubKeyB64,
  participantPubKeys: AgentPubKeyB64[],
): Promise<void> {
  const log: ConferenceLog = {
    type: "conference_log",
    event: "started",
    conference_id: conferenceId,
    initiator: initiatorPubKeyB64,
    timestamp: Date.now(),
    participants: participantPubKeys,
    participant_count: participantPubKeys.length,
  };

  const content = createConferenceLogMessage(log);

  try {
    await messageStore.sendMessage(cellIdB64, content, []);
    console.log("[ConferenceLog] Sent conference started log to chat");
  } catch (error) {
    console.error("[ConferenceLog] Failed to send conference started log:", error);
  }
}

export async function sendConferenceEndedLog(
  messageStore: ConversationMessageStore,
  cellIdB64: CellIdB64,
  conferenceId: string,
  initiatorPubKeyB64: AgentPubKeyB64,
  participantPubKeys: AgentPubKeyB64[],
  durationSeconds: number,
): Promise<void> {
  const log: ConferenceLog = {
    type: "conference_log",
    event: "ended",
    conference_id: conferenceId,
    initiator: initiatorPubKeyB64,
    timestamp: Date.now(),
    participants: participantPubKeys,
    participant_count: participantPubKeys.length,
    duration_seconds: durationSeconds,
  };

  const content = createConferenceLogMessage(log);

  try {
    await messageStore.sendMessage(cellIdB64, content, []);
    console.log("[ConferenceLog] Sent conference ended log to chat");
  } catch (error) {
    console.error("[ConferenceLog] Failed to send conference ended log:", error);
  }
}
