import { encodeHashToBase64, type Signal, SignalType } from "@holochain/client";
import { RelayClient } from "$store/RelayClient";
import { type RelaySignal, type MessageSignal, type ConferenceState } from "$lib/types";
import { encodeCellIdToBase64 } from "$lib/utils";
import { type ConversationStore } from "./ConversationStore";
import type { ConversationMessageStore } from "./ConversationMessageStore";
import { type ConferenceStore } from "./ConferenceStore";
import { page } from "$app/stores";
import { get } from "svelte/store";

export function createSignalHandler(
  client: RelayClient,
  conversationStore: ConversationStore,
  conversationMessageStore: ConversationMessageStore,
  conferenceStore: ConferenceStore,
) {
  client.client.on("signal", _handleSignalReceived);

  async function _handleSignalReceived(signal: Signal) {
    if (signal.type !== SignalType.App) return;

    const payload = signal.value.payload as RelaySignal;
    const cellIdB64 = encodeCellIdToBase64(signal.value.cell_id);

    if (payload.type === "Message") {
      await conversationMessageStore.handleMessageSignalReceived(
        cellIdB64,
        signal.value.payload as MessageSignal,
      );
      // Mark conversation as unread
      // Unless user is currently viewing the conversation page.
      const $page = get(page);
      if ($page.params.id !== cellIdB64 || $page.route.id !== "/conversations/[id]") {
        await conversationStore.updateUnread(cellIdB64, true);
      }
    } else if (payload.type === "MessageDeleted") {
      const originalActionHash = payload.original_action;
      const originalActionHashB64 = encodeHashToBase64(originalActionHash);
      conversationMessageStore.handleMessageDeletedSignalReceived(cellIdB64, originalActionHashB64);
    } else if (
      payload.type === "ConferenceInvite" ||
      payload.type === "ConferenceJoined" ||
      payload.type === "ConferenceLeft" ||
      payload.type === "ConferenceRejected"
    ) {
      _handleConferenceStateSignal(payload);
    } else if (payload.type === "WebRTCSignal") {
      _handleWebRTCSignal(payload);
    }
  }

  function _handleConferenceStateSignal(signal: RelaySignal) {
    switch (signal.type) {
      case "ConferenceInvite": {
        const roomId = signal.room.room_id;
        const participants = signal.room.participants.map(p => encodeHashToBase64(p));

        const state: ConferenceState = {
          room: signal.room,
          participants: new Map(
            participants.map(p => [p, {
              publicKey: p,
              isConnected: false,
              hasJoined: false
            }])
          ),
          isInitiator: false,
          ended: false,
          invitationStatus: 'pending',
          invitedBy: encodeHashToBase64(signal.agent),
          invitationTimestamp: Date.now()
        };

        conferenceStore.setConference(roomId, state);

        console.log('Incoming call invitation received:', roomId);
        break;
      }

      case "ConferenceJoined": {
        const joinedAgent = encodeHashToBase64(signal.agent);
        const roomId = signal.room_id;
        
        conferenceStore.updateConference(roomId, (conf) => {
          if (!conf) return conf;
          
          const participant = conf.participants.get(joinedAgent);
          if (participant) {
            participant.hasJoined = true;
            conf.participants.set(joinedAgent, participant);
          }
          
          return conf;
        });
        
        const conference = conferenceStore.getConference(roomId);
        if (conference?.isInitiator) {
          conferenceStore.initializeWebRTC(roomId)
            .catch(error => {
              console.error("Failed to initialize WebRTC:", error);
              conferenceStore.updateConference(roomId, (conf) => ({
                ...conf,
                error: error instanceof Error ? error.message : 'Failed to initialize WebRTC'
              }));
            });
        }
        break;
      }

      case "ConferenceLeft": {
        conferenceStore.cleanupWebRTC(signal.room_id);
        break;
      }

      case "ConferenceRejected": {
        const rejectedAgent = encodeHashToBase64(signal.agent);
        const roomId = signal.room_id;

        conferenceStore.updateConference(roomId, (conf) => {
          if (!conf) return conf;
          const participant = conf.participants.get(rejectedAgent);
          if (participant) {
            conf.participants.set(rejectedAgent, {
              ...participant,
              isConnected: false,
            });
          }
          return conf;
        });
        console.log('Participant rejected the call:', rejectedAgent);
        break;
      }
    }
  }

  function _handleWebRTCSignal(signal: RelaySignal) {
    if (signal.type !== "WebRTCSignal") return;

    const webRTCSignal = signal.signal;
    const fromB64 = typeof webRTCSignal.from === 'string'
      ? webRTCSignal.from
      : encodeHashToBase64(webRTCSignal.from);
    const toB64 = typeof webRTCSignal.to === 'string'
      ? webRTCSignal.to
      : encodeHashToBase64(webRTCSignal.to);

    const normalized = {
      ...webRTCSignal,
      from: fromB64,
      to: toB64
    };

    conferenceStore.handleSignalReceived(normalized.room_id, normalized)
      .catch(error => console.error("Failed to handle WebRTC signal:", error));
  }
}
