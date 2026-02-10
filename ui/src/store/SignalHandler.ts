import { encodeHashToBase64, type Signal, SignalType } from "@holochain/client";
import { RelayClient } from "$store/RelayClient";
import { type RelaySignal, type MessageSignal, SimplePeerSignalType, ConferenceRole } from "$lib/types";
import { encodeCellIdToBase64 } from "$lib/utils";
import { type ConversationStore } from "./ConversationStore";
import type { ConversationMessageStore } from "./ConversationMessageStore";
import {
  type SimplePeerConferenceStore,
  type SimplePeerConferenceState,
  INVITATION_TIMEOUT_MS,
} from "./SimplePeerConferenceStore";
import {
  ConferenceLifecycleManager,
  ConferenceTransition,
  logTransition,
} from "$lib/conference/ConferenceLifecycleManager";
import { page } from "$app/stores";
import { get } from "svelte/store";

export function createSignalHandler(
  client: RelayClient,
  conversationStore: ConversationStore,
  conversationMessageStore: ConversationMessageStore,
  conferenceStore: SimplePeerConferenceStore,
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
      payload.type === "ConferenceEnded" ||
      payload.type === "RoleChanged" ||
      payload.type === "Kicked" ||
      payload.type === "HostTransfer"
    ) {
      _handleConferenceStateSignal(payload, cellIdB64);
    } else if (payload.type === "WebRTCSignal") {
      _handleSimplePeerSignal(payload);
    }
    // Note: SignalAck handling removed - SimplePeer doesn't need acknowledgments
  }

  function _handleConferenceStateSignal(signal: RelaySignal, cellIdB64: string) {
    switch (signal.type) {
      case "ConferenceInvite": {
        const roomId = signal.room.room_id;
        const invitedBy = encodeHashToBase64(signal.agent);
        const participants = signal.room.participants.map((p) => encodeHashToBase64(p));
        const allParticipants = [invitedBy, ...participants];

        // Create timeout to auto-reject invitation after 60 seconds
        const invitationTimeoutHandle = setTimeout(() => {
          try {
            const currentConference = conferenceStore.getConference(roomId);
            if (currentConference && currentConference.invitationStatus === "pending") {
              console.log(
                `[SignalHandler] Invitation timeout for room ${roomId.slice(0, 20)}, auto-rejecting`,
              );
              conferenceStore.rejectConferenceInvitation(roomId).catch((error) => {
                console.error("[SignalHandler] Failed to auto-reject invitation:", error);
              });
            }
          } catch {
            console.log(
              `[SignalHandler] Invitation timeout fired but conference ${roomId.slice(0, 20)} already removed`,
            );
          }
        }, INVITATION_TIMEOUT_MS);

        const state: SimplePeerConferenceState = {
          room: signal.room,
          participants: new Map(
            allParticipants.map((p) => [
              p,
              {
                publicKey: p,
                hasJoined: p === invitedBy,
                connectionStatus: "idle" as const,
              },
            ]),
          ),
          isInitiator: false,
          ended: false,
          invitationStatus: "pending",
          invitedBy: invitedBy,
          invitationTimestamp: Date.now(),
          invitationTimeoutHandle: invitationTimeoutHandle,
          cellIdB64: cellIdB64,
          initiatorPubKeyB64: invitedBy,
          startTime: Date.now(),
        };

        conferenceStore.setConference(roomId, state);

        console.log("[SignalHandler] Incoming call invitation received:", {
          roomId,
          invitedBy: invitedBy.slice(0, 20),
          totalParticipants: allParticipants.length,
          allParticipants: allParticipants.map((p) => p.slice(0, 20)),
          cellIdB64,
          timeoutMs: INVITATION_TIMEOUT_MS,
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
              hasJoined: true,
              connectionStatus: "idle",
            });
          }

          return conf;
        });

        let conference;
        try {
          conference = conferenceStore.getConference(roomId);
        } catch {
          console.warn("[SignalHandler] Conference not found for room:", roomId);
          return;
        }

        if (conference.invitationStatus === "pending") {
          console.log("[SignalHandler] Skipping WebRTC - invitation still pending");
          return;
        }

        if (joinedAgent === myPubKey) {
          if (!conference.localStream) {
            console.log("[SignalHandler] Initializing WebRTC for self");
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
          if (conference.localStream) {
            console.log(
              "[SignalHandler] Initiating connections to newly joined participant:",
              joinedAgent.slice(0, 20),
            );

            conferenceStore.initiateConnections(roomId).catch((error) => {
              console.error("[SignalHandler] Failed to initiate connections:", error);
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

        if (leftAgent !== myPubKey) {
          console.log(`[SignalHandler] Participant ${leftAgent.slice(0, 20)} left`);

          conferenceStore.cleanupPeer(roomId, leftAgent);

          conferenceStore.updateConference(roomId, (conf) => {
            if (!conf) return conf;

            const participant = conf.participants.get(leftAgent);
            if (participant) {
              conf.participants.set(leftAgent, {
                ...participant,
                hasJoined: false,
                connectionStatus: "idle",
                pendingInitRequest: undefined,
              });
            }

            return conf;
          });

          let conference;
          try {
            conference = conferenceStore.getConference(roomId);
          } catch {
            return;
          }
          if (conference && !conference.ended) {
            const currentState = ConferenceLifecycleManager.getLifecycleState(conference);

            const edgeCaseResult = ConferenceLifecycleManager.evaluateEdgeCases({
              roomId,
              myPubKey,
              conference,
              trigger: `ConferenceLeft:${leftAgent.slice(0, 20)}`,
            });

            if (edgeCaseResult.shouldHandle && edgeCaseResult.actions) {
              console.log(
                `[SignalHandler] Edge case detected: ${edgeCaseResult.reason}`,
                { transition: edgeCaseResult.transition },
              );

              if (edgeCaseResult.transition) {
                const targetState = ConferenceLifecycleManager.getTargetState(
                  currentState,
                  edgeCaseResult.transition,
                );
                if (targetState) {
                  logTransition(
                    roomId,
                    currentState,
                    edgeCaseResult.transition,
                    targetState,
                    edgeCaseResult.reason,
                  );
                }
              }

              for (const action of edgeCaseResult.actions) {
                switch (action.type) {
                  case "update_state":
                    conferenceStore.updateConference(roomId, (conf) => ({
                      ...conf,
                      ...(action.payload as Record<string, unknown>),
                    }));
                    break;

                  case "auto_promote":
                    conferenceStore.updateConference(roomId, (conf) => ({
                      ...conf,
                      myRole: ConferenceRole.Host,
                      currentHostPubKeyB64: action.payload?.newHostPubKey as string,
                      rolesFetchedAt: undefined, // Invalidate cache
                    }));
                    console.log(
                      "[SignalHandler] Auto-promoted to Host (local state only - host failover)",
                    );
                    break;

                  case "cleanup":
                    conferenceStore.cleanupWebRTC(roomId);
                    break;

                  case "remove":
                    setTimeout(() => {
                      conferenceStore.removeConference(roomId);
                      console.log("[SignalHandler] Conference removed from store via lifecycle manager");
                    }, 500);
                    break;

                  case "notify_user":
                    console.log(`[SignalHandler] User notification: ${action.payload?.message}`);
                    break;
                }
              }
            }
          }
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

        conferenceStore.cleanupWebRTC(roomId);

        conferenceStore.updateConference(roomId, (conf) => ({
          ...conf,
          ended: true,
          invitationStatus: "left" as const,
        }));

        setTimeout(() => {
          conferenceStore.removeConference(roomId);
          console.log("[SignalHandler] Conference removed from store after delay");
        }, 1000);

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
              connectionStatus: "idle",
            });
          }
          return conf;
        });
        console.log("Participant rejected the call:", rejectedAgent);
        break;
      }

      case "RoleChanged": {
        const roomId = signal.room_id;
        const newRole = signal.new_role;
        const changedBy = encodeHashToBase64(signal.from);

        console.log("[SignalHandler] RoleChanged signal received:", {
          roomId,
          newRole,
          changedBy: changedBy.slice(0, 20),
        });

        conferenceStore.updateConference(roomId, (conf) => {
          if (!conf) return conf;
          return {
            ...conf,
            myRole: newRole,
            rolesFetchedAt: undefined, // Invalidate cache to force refresh
          };
        });
        break;
      }

      case "Kicked": {
        const roomId = signal.room_id;
        const kickedBy = encodeHashToBase64(signal.kicked_by);

        console.log("[SignalHandler] Kicked signal received:", {
          roomId,
          kickedBy: kickedBy.slice(0, 20),
        });

        conferenceStore.cleanupWebRTC(roomId);

        conferenceStore.updateConference(roomId, (conf) => {
          if (!conf) return conf;
          return {
            ...conf,
            ended: true,
            error: "You were removed from the conference",
          };
        });

        setTimeout(() => {
          conferenceStore.removeConference(roomId);
        }, 3000);
        break;
      }

      case "HostTransfer": {
        const roomId = signal.room_id;
        const newHost = encodeHashToBase64(signal.new_host);
        const transferredBy = encodeHashToBase64(signal.from);
        const myPubKey = encodeHashToBase64(client.client.myPubKey);

        console.log("[SignalHandler] HostTransfer signal received:", {
          roomId,
          newHost: newHost.slice(0, 20),
          transferredBy: transferredBy.slice(0, 20),
          isMe: newHost === myPubKey,
        });

        conferenceStore.updateConference(roomId, (conf) => {
          if (!conf) return conf;

          const updatedParticipants = new Map(conf.participants);

          const newHostParticipant = updatedParticipants.get(newHost);
          if (newHostParticipant) {
            updatedParticipants.set(newHost, {
              ...newHostParticipant,
              role: ConferenceRole.Host,
            });
          }

          const oldHostParticipant = updatedParticipants.get(transferredBy);
          if (oldHostParticipant) {
            updatedParticipants.set(transferredBy, {
              ...oldHostParticipant,
              role: ConferenceRole.CoHost,
            });
          }

          return {
            ...conf,
            currentHostPubKeyB64: newHost,
            myRole: newHost === myPubKey ? ConferenceRole.Host : conf.myRole,
            rolesFetchedAt: undefined, // Invalidate cache
            participants: updatedParticipants,
          };
        });
        break;
      }
    }
  }

  function _handleSimplePeerSignal(signal: RelaySignal) {
    if (signal.type !== "WebRTCSignal") return;

    console.log("[SignalHandler] Received SimplePeer signal:", signal);

    if (!signal.from || !signal.to) {
      console.error("[SignalHandler] Invalid WebRTC signal: missing from/to", signal);
      return;
    }

    const fromB64 = typeof signal.from === "string" ? signal.from : encodeHashToBase64(signal.from);
    const toB64 = typeof signal.to === "string" ? signal.to : encodeHashToBase64(signal.to);

    const signalType = _mapToSimplePeerSignalType(signal.payload_type);

    let connectionId = `legacy_${Date.now()}`; // Fallback for legacy signals
    try {
      const parsedData = JSON.parse(signal.data);
      if (parsedData.connection_id) {
        connectionId = parsedData.connection_id;
      }
    } catch {
      console.warn(
        "[SignalHandler] Could not parse data for connection_id:",
        signal.data?.slice(0, 50),
      );
    }

    const simplePeerSignal = {
      room_id: signal.room_id,
      signal_type: signalType,
      data: signal.data,
      from: fromB64,
      to: toB64,
      connection_id: connectionId,
    };

    console.log("[SignalHandler] Mapped to SimplePeer signal:", {
      ...simplePeerSignal,
      data: simplePeerSignal.data?.slice(0, 100) + "...",
    });

    try {
      conferenceStore.handleSimplePeerSignal(simplePeerSignal.room_id, simplePeerSignal);
    } catch (error) {
      console.error("[SignalHandler] Error handling SimplePeer signal:", error, {
        roomId: simplePeerSignal.room_id,
        signalType: simplePeerSignal.signal_type,
        from: simplePeerSignal.from?.slice(0, 20),
      });
    }
  }

  function _mapToSimplePeerSignalType(payloadType: string): SimplePeerSignalType {
    switch (payloadType) {
      case "InitRequest":
        return SimplePeerSignalType.InitRequest;
      case "InitAccept":
        return SimplePeerSignalType.InitAccept;
      case "SdpData":
        return SimplePeerSignalType.SdpData;
      case "MediaState":
        return SimplePeerSignalType.MediaState;
      default:
        console.warn("[SignalHandler] Unknown signal type:", payloadType);
        return SimplePeerSignalType.SdpData;
    }
  }
}
