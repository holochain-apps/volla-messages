import { type Signal, SignalType } from "@holochain/client";
import { RelayClient } from "$store/RelayClient";
import { 
  type RelaySignal, 
  type MessageSignal
} from "$lib/types";
import { encodeCellIdToBase64 } from "$lib/utils";
import { deriveCellConversationStore, type ConversationStore } from "./ConversationStore";
import { type ConferenceStore } from "./ConferenceStore";
import { isEqual } from "lodash-es";

export function createSignalHandler(
  client: RelayClient, 
  conversationStore: ConversationStore,
  conferenceStore: ConferenceStore
) {
  client.client.on("signal", _handleSignalReceived);

  function _handleSignalReceived(signal: Signal) {
    if (!(SignalType.App in signal)) return;
    
    const appSignal = signal[SignalType.App].payload as RelaySignal;
    
    // Routing the signal based on its type
    switch (appSignal.type) {
      case "Message":
        if (isEqual((signal[SignalType.App].payload as MessageSignal).from, client.client.myPubKey))
          return;
    
        const conversation = deriveCellConversationStore(
          conversationStore,
          encodeCellIdToBase64(signal[SignalType.App].cell_id),
        );
        conversation.handleMessageSignalReceived(signal[SignalType.App].payload as MessageSignal);

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
        conferenceStore.joinConference(roomId)
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