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
      payload.type === "ConferenceRejected" ||
      payload.type === "ConferenceEnded"
    ) {
      _handleConferenceStateSignal(payload, cellIdB64);
    } else if (payload.type === "WebRTCSignal") {
      _handleWebRTCSignal(payload);
    } else if (payload.type === "SignalAck") {
      _handleSignalAck(payload);
    }
  }

  function _handleConferenceStateSignal(signal: RelaySignal, cellIdB64: string) {
    switch (signal.type) {
      case "ConferenceInvite": {
        const roomId = signal.room.room_id;
        const invitedBy = encodeHashToBase64(signal.agent);
        const participants = signal.room.participants.map((p) => encodeHashToBase64(p));
        const allParticipants = [invitedBy, ...participants];

        const state: ConferenceState = {
          room: signal.room,
          participants: new Map(
            allParticipants.map((p) => [
              p,
              {
                publicKey: p,
                isConnected: false,
                hasJoined: p === invitedBy,
              },
            ]),
          ),
          isInitiator: false,
          ended: false,
          invitationStatus: "pending",
          invitedBy: invitedBy,
          invitationTimestamp: Date.now(),
          cellIdB64: cellIdB64, // Store the cellId from the signal
        };

        conferenceStore.setConference(roomId, state);

        console.log("[SignalHandler] Incoming call invitation received:", {
          roomId,
          invitedBy: invitedBy.slice(0, 20),
          totalParticipants: allParticipants.length,
          allParticipants: allParticipants.map((p) => p.slice(0, 20)),
          cellIdB64,
        });
        break;
      }

      case "ConferenceJoined": {
        const joinedAgent = encodeHashToBase64(signal.agent);
        const roomId = signal.room_id;
        const myPubKey = encodeHashToBase64(client.client.myPubKey);

        console.log("[SignalHandler] ConferenceJoined signal received:", {
          joinedAgent: joinedAgent.slice(0, 20),
          roomId,
          isMe: joinedAgent === myPubKey,
        });

        conferenceStore.updateConference(roomId, (conf) => {
          if (!conf) return conf;

          const participant = conf.participants.get(joinedAgent);
          if (participant) {
            participant.hasJoined = true;
            conf.participants.set(joinedAgent, participant);
          } else {
            console.warn(
              "[SignalHandler] Participant joined but not in participants map, adding:",
              joinedAgent.slice(0, 20),
            );
            conf.participants.set(joinedAgent, {
              publicKey: joinedAgent,
              isConnected: false,
              hasJoined: true,
            });
          }

          return conf;
        });

        const conference = conferenceStore.getConference(roomId);

        if (!conference) {
          console.warn("[SignalHandler] Conference not found for room:", roomId);
          return;
        }

        if (conference.invitationStatus === "pending") {
          console.log("[SignalHandler] Skipping WebRTC - invitation still pending");
          return;
        }

        if (joinedAgent === myPubKey) {
          if (!conference.localStream) {
            console.log("[SignalHandler] [ANDROID FIX] Initializing WebRTC for self (participant)");
            conferenceStore.initializeWebRTC(roomId).catch((error) => {
              console.error("[SignalHandler] Failed to initialize WebRTC:", error);
              conferenceStore.updateConference(roomId, (conf) => ({
                ...conf,
                error: error instanceof Error ? error.message : "Failed to initialize WebRTC",
              }));
            });
          } else {
            console.log("[SignalHandler] WebRTC already initialized for self");
          }
        } else {
          // Check if this participant was previously in the call (rejoin scenario)
          const participant = conference.participants.get(joinedAgent);
          const wasInCall = participant && participant.peerConnection !== undefined;
          const isRejoining =
            wasInCall ||
            (participant && participant.hasJoined === false && participant.isConnected === false);

          // Handle rejoining asynchronously
          (async () => {
            if (isRejoining || (participant?.peerConnection && !participant.isConnected)) {
              console.log(
                "[SignalHandler] Participant is rejoining, cleaning up old connection first:",
                joinedAgent.slice(0, 20),
              );

              // Close old connection completely before creating new one
              if (participant?.peerConnection) {
                try {
                  participant.peerConnection.close();
                } catch (e) {
                  console.warn("Error closing old peer connection:", e);
                }
              }

              // Clear old state
              conferenceStore.updateConference(roomId, (conf) => {
                if (!conf) return conf;
                const participants = new Map(conf.participants);
                const p = participants.get(joinedAgent);
                if (p) {
                  participants.set(joinedAgent, {
                    ...p,
                    peerConnection: undefined,
                    stream: undefined,
                    isConnected: false,
                    pendingSignals: [],
                    pendingIceCandidates: [],
                    makingOffer: false,
                    ignoreOffer: false,
                    isSettingRemoteAnswerPending: false,
                  });
                }
                return { ...conf, participants };
              });

              // Small delay to ensure cleanup completes
              await new Promise((resolve) => setTimeout(resolve, 150));
            }

            if (conference.localStream) {
              console.log(
                isRejoining
                  ? "[SignalHandler] Creating new peer connection to rejoined participant:"
                  : "[SignalHandler] Creating peer connection to newly joined participant:",
                joinedAgent.slice(0, 20),
              );

              // Add small jitter delay for rejoins to help avoid offer collisions
              if (isRejoining) {
                const jitter = Math.random() * 300;
                await new Promise((resolve) => setTimeout(resolve, jitter));
              }

              conferenceStore
                .createPeerConnectionToParticipant(roomId, joinedAgent)
                .catch((error) => {
                  console.error(
                    "[SignalHandler] Failed to create peer connection to participant:",
                    error,
                  );
                });
            } else {
              console.warn(
                "[SignalHandler] Other participant joined but we have no stream, initializing WebRTC",
              );
              conferenceStore.initializeWebRTC(roomId).catch((error) => {
                console.error("[SignalHandler] Failed to initialize WebRTC:", error);
                conferenceStore.updateConference(roomId, (conf) => ({
                  ...conf,
                  error: error instanceof Error ? error.message : "Failed to initialize WebRTC",
                }));
              });
            }
          })();
        }
        break;
      }

      case "ConferenceLeft": {
        const roomId = signal.room_id;
        const leftAgent = encodeHashToBase64(signal.agent);
        const myPubKey = encodeHashToBase64(client.client.myPubKey);

        console.log("[SignalHandler] ConferenceLeft signal received:", {
          roomId,
          leftAgent: leftAgent.slice(0, 20),
          isMe: leftAgent === myPubKey,
        });

        // If I left, clean up everything (this is handled by leaveConference)
        // If someone else left, just clean up their connection
        if (leftAgent !== myPubKey) {
          console.log(
            `[SignalHandler] Participant ${leftAgent.slice(0, 20)} left, cleaning up their connection`,
          );

          // Update their state to mark they've left
          conferenceStore.updateConference(roomId, (conf) => {
            if (!conf) return conf;

            const participant = conf.participants.get(leftAgent);
            if (participant) {
              // Mark as not joined and disconnect
              conf.participants.set(leftAgent, {
                ...participant,
                hasJoined: false,
                isConnected: false,
              });
            }

            return conf;
          });

          // Note: cleanupParticipantConnection is called internally by ConferenceStore
          // We don't call cleanupWebRTC here as that would affect all participants
        }
        break;
      }

      case "ConferenceEnded": {
        const roomId = signal.room_id;
        const endedBy = encodeHashToBase64(signal.ended_by);

        console.log("[SignalHandler] ConferenceEnded signal received:", {
          roomId,
          endedBy,
        });

        // Clean up WebRTC resources
        conferenceStore.cleanupWebRTC(roomId);

        // Remove conference from store
        conferenceStore.removeConference(roomId);

        console.log("[SignalHandler] Conference ended and cleaned up");
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
        console.log("Participant rejected the call:", rejectedAgent);
        break;
      }
    }
  }

  function _handleWebRTCSignal(signal: RelaySignal) {
    if (signal.type !== "WebRTCSignal") return;

    console.log("[SignalHandler] Received WebRTC signal:", signal);

    const fromB64 = typeof signal.from === "string" ? signal.from : encodeHashToBase64(signal.from);
    const toB64 = typeof signal.to === "string" ? signal.to : encodeHashToBase64(signal.to);

    const normalized = {
      room_id: signal.room_id,
      payload_type: signal.payload_type,
      data: signal.data,
      from: fromB64,
      to: toB64,
      signal_id: signal.signal_id,
    };

    console.log("[SignalHandler] Normalized signal:", normalized);

    conferenceStore
      .handleSignalReceived(normalized.room_id, normalized)
      .catch((error) => console.error("Failed to handle WebRTC signal:", error));
  }

  function _handleSignalAck(signal: RelaySignal) {
    if (signal.type !== "SignalAck") return;

    console.log("[SignalHandler] Received acknowledgment for signal:", signal.signal_id);

    const fromB64 = typeof signal.from === "string" ? signal.from : encodeHashToBase64(signal.from);

    // Find which room this acknowledgment is for by checking all conferences
    // The signal_id should help us identify the correct conference
    const conferences = conferenceStore.subscribe((data) => {
      Object.entries(data.data).forEach(([roomId, conference]) => {
        if (conference) {
          conferenceStore.handleAckReceived(roomId, signal.signal_id, fromB64);
        }
      });
    });
    conferences(); // Unsubscribe immediately after processing
  }
}
