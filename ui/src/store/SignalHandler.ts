import { encodeHashToBase64, type Signal, SignalType } from "@holochain/client";
import { RelayClient } from "$store/RelayClient";
import { 
  type RelaySignal, 
  type MessageSignal
} from "$lib/types";
import { encodeCellIdToBase64 } from "$lib/utils";
import { type ConversationStore } from "./ConversationStore";
import { type ConferenceStore } from "./ConferenceStore";
import { isEqual } from "lodash-es";
import type { ConversationMessageStore } from "./ConversationMessageStore";
import { page } from "$app/stores";
import { get } from "svelte/store";
import _ from "lodash";

export function createSignalHandler(
  client: RelayClient,
  conversationStore: ConversationStore,
  conversationMessageStore: ConversationMessageStore,
  conferenceStore: ConferenceStore,
) {
  client.client.on("signal", _handleSignalReceived);

  async function _handleSignalReceived(signal: Signal) {
    if (!(SignalType.App in signal)) return;

    const appSignal = signal[SignalType.App].payload as RelaySignal;

    switch (appSignal.type) {
      case "Message":
        // Ignore signals for messages I sent
        if (isEqual((signal[SignalType.App].payload as MessageSignal).from, client.client.myPubKey))
          return;

        // Save recieved message
        const cellIdB64 = encodeCellIdToBase64(signal[SignalType.App].cell_id);
        await conversationMessageStore.handleMessageSignalReceived(
          cellIdB64,
          signal[SignalType.App].payload as MessageSignal,
        );

        // Mark conversation as unread
        // Unless user is currently viewing the conversation page.
        const $page = get(page);
        if ($page.params.id !== cellIdB64 || $page.route.id !== "/conversations/[id]") {
          await conversationStore.updateUnread(cellIdB64, true);
        }
        break;

      case "ConferenceInvite":
      case "ConferenceJoined":
      case "ConferenceLeft":
        _handleConferenceStateSignal(appSignal);
        break;

      case "WebRTCSignal":
        _handleWebRTCSignal(appSignal);
        break;
    }
  }

  function _handleConferenceStateSignal(signal: RelaySignal) {
    switch (signal.type) {
      case "ConferenceInvite": {
        const roomId = signal.room.room_id;
        const participants = signal.room.participants.map(p => encodeHashToBase64(p));
        conferenceStore.joinConference(roomId, participants)
          .then(() => conferenceStore.initializeWebRTC(roomId))
          .catch(error => console.error("Failed to join conference:", error));
        break;
      }

      case "ConferenceJoined": {
        conferenceStore.initializeWebRTC(signal.room_id)
          .catch(error => console.error("Failed to initialize WebRTC:", error));
        break;
      }

      case "ConferenceLeft": {
        conferenceStore.cleanupWebRTC(signal.room_id);
        break;
      }
    }
  }

  function _handleWebRTCSignal(signal: RelaySignal) {
    if (signal.type !== "WebRTCSignal") return;

    const webRTCSignal = signal.signal;
    conferenceStore.handleSignalReceived(webRTCSignal.room_id, webRTCSignal)
      .catch(error => console.error("Failed to handle WebRTC signal:", error));
  }
}
