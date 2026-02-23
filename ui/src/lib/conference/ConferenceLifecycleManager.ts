import { ConferenceRole } from "$lib/types";
import type { SimplePeerConferenceState, SimplePeerParticipant } from "$store/SimplePeerConferenceStore";

export enum ConferenceLifecycleState {
  // Creation flow
  CREATING = "creating",
  CREATED = "created",

  // Invitation flow (invitee)
  INVITED = "invited",
  PENDING_RESPONSE = "pending_response",

  // Active conference
  ACTIVE = "active",

  // Exit states
  LEFT = "left",
  REJECTED = "rejected",
  KICKED = "kicked",
  ENDED = "ended",

  // Cleanup states
  BEING_CLEANED_UP = "being_cleaned_up",
  REMOVED = "removed",

  // Error state
  ERROR = "error",
}

export enum ConferenceTransition {
  // Creation transitions
  CREATE_SUCCESS = "create_success",
  CREATE_FAILURE = "create_failure",

  // Invitation transitions
  INVITATION_RECEIVED = "invitation_received",
  ACCEPT_INVITATION = "accept_invitation",
  REJECT_INVITATION = "reject_invitation",
  INVITATION_TIMEOUT = "invitation_timeout",

  // Active transitions
  JOIN_SUCCESS = "join_success",
  PARTICIPANT_JOINED = "participant_joined",
  PARTICIPANT_LEFT = "participant_left",

  // Exit transitions
  LEAVE_CONFERENCE = "leave_conference",
  END_CONFERENCE = "end_conference",
  GET_KICKED = "get_kicked",
  ALL_PARTICIPANTS_LEFT = "all_participants_left",
  LAST_PARTICIPANT_LEFT = "last_participant_left",

  // Host transitions
  HOST_LEFT = "host_left",
  HOST_TRANSFERRED = "host_transferred",
  AUTO_PROMOTE_HOST = "auto_promote_host",

  // Cleanup transitions
  START_CLEANUP = "start_cleanup",
  CLEANUP_COMPLETE = "cleanup_complete",

  // Error transitions
  ERROR_OCCURRED = "error_occurred",
  ERROR_DISMISSED = "error_dismissed",

  // Rejoin transitions
  REJOIN_CONFERENCE = "rejoin_conference",
}

const VALID_TRANSITIONS: Record<
  ConferenceLifecycleState,
  Partial<Record<ConferenceTransition, ConferenceLifecycleState>>
> = {
  [ConferenceLifecycleState.CREATING]: {
    [ConferenceTransition.CREATE_SUCCESS]: ConferenceLifecycleState.CREATED,
    [ConferenceTransition.CREATE_FAILURE]: ConferenceLifecycleState.ERROR,
  },

  [ConferenceLifecycleState.CREATED]: {
    [ConferenceTransition.JOIN_SUCCESS]: ConferenceLifecycleState.ACTIVE,
    [ConferenceTransition.ERROR_OCCURRED]: ConferenceLifecycleState.ERROR,
  },

  [ConferenceLifecycleState.INVITED]: {
    [ConferenceTransition.INVITATION_RECEIVED]: ConferenceLifecycleState.PENDING_RESPONSE,
  },

  [ConferenceLifecycleState.PENDING_RESPONSE]: {
    [ConferenceTransition.ACCEPT_INVITATION]: ConferenceLifecycleState.ACTIVE,
    [ConferenceTransition.REJECT_INVITATION]: ConferenceLifecycleState.REJECTED,
    [ConferenceTransition.INVITATION_TIMEOUT]: ConferenceLifecycleState.REJECTED,
    [ConferenceTransition.ERROR_OCCURRED]: ConferenceLifecycleState.ERROR,
  },

  [ConferenceLifecycleState.ACTIVE]: {
    [ConferenceTransition.LEAVE_CONFERENCE]: ConferenceLifecycleState.LEFT,
    [ConferenceTransition.END_CONFERENCE]: ConferenceLifecycleState.ENDED,
    [ConferenceTransition.GET_KICKED]: ConferenceLifecycleState.KICKED,
    [ConferenceTransition.ALL_PARTICIPANTS_LEFT]: ConferenceLifecycleState.ENDED,
    [ConferenceTransition.LAST_PARTICIPANT_LEFT]: ConferenceLifecycleState.ENDED,
    [ConferenceTransition.ERROR_OCCURRED]: ConferenceLifecycleState.ERROR,
  },

  [ConferenceLifecycleState.LEFT]: {
    [ConferenceTransition.REJOIN_CONFERENCE]: ConferenceLifecycleState.ACTIVE,
    [ConferenceTransition.ALL_PARTICIPANTS_LEFT]: ConferenceLifecycleState.ENDED,
    [ConferenceTransition.START_CLEANUP]: ConferenceLifecycleState.BEING_CLEANED_UP,
  },

  [ConferenceLifecycleState.REJECTED]: {
    [ConferenceTransition.START_CLEANUP]: ConferenceLifecycleState.BEING_CLEANED_UP,
  },

  [ConferenceLifecycleState.KICKED]: {
    [ConferenceTransition.START_CLEANUP]: ConferenceLifecycleState.BEING_CLEANED_UP,
  },

  [ConferenceLifecycleState.ENDED]: {
    [ConferenceTransition.START_CLEANUP]: ConferenceLifecycleState.BEING_CLEANED_UP,
  },

  [ConferenceLifecycleState.BEING_CLEANED_UP]: {
    [ConferenceTransition.CLEANUP_COMPLETE]: ConferenceLifecycleState.REMOVED,
  },

  [ConferenceLifecycleState.ERROR]: {
    [ConferenceTransition.ERROR_DISMISSED]: ConferenceLifecycleState.BEING_CLEANED_UP,
    [ConferenceTransition.START_CLEANUP]: ConferenceLifecycleState.BEING_CLEANED_UP,
  },

  [ConferenceLifecycleState.REMOVED]: {
    // Terminal state - no transitions out
  },
};

export interface EdgeCaseContext {
  roomId: string;
  myPubKey: string;
  conference: SimplePeerConferenceState;
  trigger: string;
}

export interface EdgeCaseResult {
  shouldHandle: boolean;
  transition?: ConferenceTransition;
  reason?: string;
  actions?: EdgeCaseAction[];
}

export interface EdgeCaseAction {
  type:
    | "end_conference"
    | "cleanup"
    | "remove"
    | "auto_promote"
    | "notify_user"
    | "update_state";
  payload?: Record<string, unknown>;
}

export class ConferenceLifecycleManager {
  
  static getLifecycleState(conference: SimplePeerConferenceState | undefined): ConferenceLifecycleState {
    if (!conference) {
      return ConferenceLifecycleState.REMOVED;
    }

    if (conference.cleaningUp) {
      return ConferenceLifecycleState.BEING_CLEANED_UP;
    }

    if (conference.error && conference.ended) {
      return ConferenceLifecycleState.ERROR;
    }

    if (conference.ended) {
      return ConferenceLifecycleState.ENDED;
    }

    switch (conference.invitationStatus) {
      case "pending":
        return conference.isInitiator
          ? ConferenceLifecycleState.CREATED
          : ConferenceLifecycleState.PENDING_RESPONSE;

      case "accepted":
        return ConferenceLifecycleState.ACTIVE;

      case "rejected":
        return ConferenceLifecycleState.REJECTED;

      case "left":
        return ConferenceLifecycleState.LEFT;

      default:
        // Check if we're in creating state (no cellIdB64 yet)
        if (!conference.cellIdB64 && conference.isInitiator) {
          return ConferenceLifecycleState.CREATING;
        }
        return ConferenceLifecycleState.PENDING_RESPONSE;
    }
  }

  static canTransition(
    currentState: ConferenceLifecycleState,
    transition: ConferenceTransition,
  ): boolean {
    const validTransitions = VALID_TRANSITIONS[currentState];
    return validTransitions !== undefined && transition in validTransitions;
  }

  static getTargetState(
    currentState: ConferenceLifecycleState,
    transition: ConferenceTransition,
  ): ConferenceLifecycleState | null {
    const validTransitions = VALID_TRANSITIONS[currentState];
    if (!validTransitions) return null;
    return validTransitions[transition] ?? null;
  }

  static validateTransition(
    conference: SimplePeerConferenceState,
    transition: ConferenceTransition,
    context: { myPubKey: string },
  ): { valid: boolean; reason?: string } {
    const currentState = this.getLifecycleState(conference);

    // Check if transition is valid from current state
    if (!this.canTransition(currentState, transition)) {
      return {
        valid: false,
        reason: `Invalid transition ${transition} from state ${currentState}`,
      };
    }

    // Additional pre-condition checks based on transition type
    switch (transition) {
      case ConferenceTransition.END_CONFERENCE: {
        // Only Host or CoHost can end conference
        const role = conference.myRole;
        if (role === undefined || role > ConferenceRole.CoHost) {
          return {
            valid: false,
            reason: "Only Host or CoHost can end conference",
          };
        }
        break;
      }

      case ConferenceTransition.ACCEPT_INVITATION: {
        // Check invitation hasn't expired
        if (conference.invitationTimestamp) {
          const elapsed = Date.now() - conference.invitationTimestamp;
          if (elapsed > 60000) {
            return {
              valid: false,
              reason: "Invitation has expired (60s timeout)",
            };
          }
        }
        break;
      }

      case ConferenceTransition.REJOIN_CONFERENCE: {
        // Check if there are other participants to rejoin to
        const otherParticipants = Array.from(conference.participants.entries()).filter(
          ([pubKey, p]) => pubKey !== context.myPubKey && p.hasJoined,
        );
        if (otherParticipants.length === 0) {
          return {
            valid: false,
            reason: "No other participants to rejoin - conference should end",
          };
        }
        break;
      }
    }

    return { valid: true };
  }

  static evaluateEdgeCases(ctx: EdgeCaseContext): EdgeCaseResult {
    const checks = [
      this.checkLastParticipantLeft,
      this.checkAllParticipantsLeft,
      this.checkHostLeft,
      this.checkOrphanedConference,
      this.checkStaleConference,
    ];

    for (const check of checks) {
      const result = check.call(this, ctx);
      if (result.shouldHandle) {
        return result;
      }
    }

    return { shouldHandle: false };
  }

  /**
   * Edge Case: Last remote participant left
   * Scenario: 2-person call, one person leaves
   * Action: End conference for the remaining person
   */
  private static checkLastParticipantLeft(ctx: EdgeCaseContext): EdgeCaseResult {
    const { conference, myPubKey } = ctx;

    // Only check if we're in ACTIVE state
    if (conference.invitationStatus !== "accepted" || conference.ended) {
      return { shouldHandle: false };
    }

    // Count remaining remote participants who have joined
    const remoteJoinedParticipants = Array.from(conference.participants.entries()).filter(
      ([pubKey, p]) => pubKey !== myPubKey && p.hasJoined,
    );

    if (remoteJoinedParticipants.length === 0) {
      return {
        shouldHandle: true,
        transition: ConferenceTransition.LAST_PARTICIPANT_LEFT,
        reason: "All other participants have left - ending conference",
        actions: [
          // User is still in the call when everyone else left - they should log
          { type: "update_state", payload: { ended: true, endedByMe: true, invitationStatus: "left" } },
          { type: "cleanup" },
          { type: "remove" },
        ],
      };
    }

    return { shouldHandle: false };
  }

  /**
   * Edge Case: All participants (including self) marked as not joined
   * Scenario: Conference orphaned after errors
   * Action: Clean up and remove
   */
  private static checkAllParticipantsLeft(ctx: EdgeCaseContext): EdgeCaseResult {
    const { conference } = ctx;

    // Check if NO participants have joined
    const joinedParticipants = Array.from(conference.participants.values()).filter(
      (p) => p.hasJoined,
    );

    if (joinedParticipants.length === 0 && conference.invitationStatus === "accepted") {
      return {
        shouldHandle: true,
        transition: ConferenceTransition.ALL_PARTICIPANTS_LEFT,
        reason: "No participants in conference - cleaning up",
        actions: [
          { type: "update_state", payload: { ended: true } },
          { type: "cleanup" },
          { type: "remove" },
        ],
      };
    }

    return { shouldHandle: false };
  }

  /**
   * Edge Case: Host left without ending conference
   * Scenario: Host clicks "Just Leave" in 3+ person call
   * Action: Auto-promote next eligible participant to Host
   */
  private static checkHostLeft(ctx: EdgeCaseContext): EdgeCaseResult {
    const { conference, myPubKey } = ctx;

    // Only relevant if we're active and not the host
    if (conference.ended || conference.invitationStatus !== "accepted") {
      return { shouldHandle: false };
    }

    // Check if current host is still in the call
    const currentHost = conference.currentHostPubKeyB64;
    if (!currentHost) {
      return { shouldHandle: false };
    }

    const hostParticipant = conference.participants.get(currentHost);
    if (hostParticipant?.hasJoined) {
      return { shouldHandle: false }; // Host is still here
    }

    // Host has left - need to auto-promote
    // Determine if I should become the new host
    const shouldIBecomeHost = this.shouldAutoPromoteToHost(conference, myPubKey);

    if (shouldIBecomeHost) {
      return {
        shouldHandle: true,
        transition: ConferenceTransition.AUTO_PROMOTE_HOST,
        reason: "Host left - auto-promoting to Host",
        actions: [
          {
            type: "auto_promote",
            payload: { newRole: ConferenceRole.Host, newHostPubKey: myPubKey },
          },
          { type: "notify_user", payload: { message: "You are now the host" } },
        ],
      };
    }

    return { shouldHandle: false };
  }

  /**
   * Edge Case: Conference in LEFT state with no remaining participants
   * Scenario: User left, others also left while user was in LEFT state
   * Action: End conference (no rejoin available)
   */
  private static checkOrphanedConference(ctx: EdgeCaseContext): EdgeCaseResult {
    const { conference, myPubKey } = ctx;

    if (conference.invitationStatus !== "left" || conference.ended) {
      return { shouldHandle: false };
    }

    // Check if there are any other joined participants
    const otherJoinedParticipants = Array.from(conference.participants.entries()).filter(
      ([pubKey, p]) => pubKey !== myPubKey && p.hasJoined,
    );

    if (otherJoinedParticipants.length === 0) {
      return {
        shouldHandle: true,
        transition: ConferenceTransition.ALL_PARTICIPANTS_LEFT,
        reason: "No remaining participants - ending orphaned conference",
        actions: [
          { type: "update_state", payload: { ended: true } },
          { type: "cleanup" },
          { type: "remove" },
        ],
      };
    }

    return { shouldHandle: false };
  }

  /**
   * Edge Case: Conference stale for too long
   * Scenario: Conference in error or left state for > 5 minutes
   * Action: Clean up and remove
   */
  private static checkStaleConference(ctx: EdgeCaseContext): EdgeCaseResult {
    const { conference } = ctx;
    const STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

    // Check if LEFT state for too long
    if (conference.invitationStatus === "left" && conference.leftTimestamp) {
      const elapsed = Date.now() - conference.leftTimestamp;
      if (elapsed > STALE_TIMEOUT_MS) {
        return {
          shouldHandle: true,
          transition: ConferenceTransition.START_CLEANUP,
          reason: `Conference stale for ${Math.floor(elapsed / 1000)}s - removing`,
          actions: [
            { type: "update_state", payload: { ended: true } },
            { type: "cleanup" },
            { type: "remove" },
          ],
        };
      }
    }

    return { shouldHandle: false };
  }

  private static shouldAutoPromoteToHost(
    conference: SimplePeerConferenceState,
    myPubKey: string,
  ): boolean {
    const myRole = conference.myRole;

    // Get all remaining joined participants (excluding current host who left)
    const remainingParticipants = Array.from(conference.participants.entries())
      .filter(([pubKey, p]) => p.hasJoined && pubKey !== conference.currentHostPubKeyB64)
      .map(([pubKey, p]) => ({ pubKey, role: p.role }));

    // Include self
    remainingParticipants.push({ pubKey: myPubKey, role: myRole });

    // Sort by role (lower is higher privilege), then by pubkey for determinism
    remainingParticipants.sort((a, b) => {
      const roleA = a.role ?? ConferenceRole.Member;
      const roleB = b.role ?? ConferenceRole.Member;

      if (roleA !== roleB) {
        return roleA - roleB; // Lower role number = higher privilege
      }

      return a.pubKey.localeCompare(b.pubKey); // Alphabetical pubkey for determinism
    });

    // First participant after sorting should become host
    return remainingParticipants[0]?.pubKey === myPubKey;
  }

  /**
   * Count active (joined) participants excluding self
   */
  static countRemoteActiveParticipants(
    conference: SimplePeerConferenceState,
    myPubKey: string,
  ): number {
    return Array.from(conference.participants.entries()).filter(
      ([pubKey, p]) => pubKey !== myPubKey && p.hasJoined,
    ).length;
  }

  static canRejoin(conference: SimplePeerConferenceState, myPubKey: string): boolean {
    // Can't rejoin if ended or rejected
    if (conference.ended) return false;
    if (conference.invitationStatus === "rejected") return false;

    // Check if there are other participants to rejoin to
    // This works both for:
    // 1. Checking "can I rejoin?" when status is already "left"
    // 2. Checking "should leaving allow rejoin?" when status is still "accepted"
    const otherJoinedParticipants = Array.from(conference.participants.entries()).filter(
      ([pubKey, p]) => pubKey !== myPubKey && p.hasJoined,
    );

    return otherJoinedParticipants.length > 0;
  }

  static getDiagnostics(
    conference: SimplePeerConferenceState | undefined,
    myPubKey: string,
  ): Record<string, unknown> {
    if (!conference) {
      return { state: "REMOVED", exists: false };
    }

    const lifecycleState = this.getLifecycleState(conference);
    const remoteActiveCount = this.countRemoteActiveParticipants(conference, myPubKey);
    const canRejoin = this.canRejoin(conference, myPubKey);

    return {
      state: lifecycleState,
      exists: true,
      ended: conference.ended,
      invitationStatus: conference.invitationStatus,
      isInitiator: conference.isInitiator,
      myRole: conference.myRole,
      participantCount: conference.participants.size,
      remoteActiveCount,
      canRejoin,
      hasLocalStream: !!conference.localStream,
      cleaningUp: conference.cleaningUp,
      error: conference.error,
      leftTimestamp: conference.leftTimestamp,
    };
  }
}

export interface TransitionPayload {
  ended?: boolean;
  endedByMe?: boolean;
  invitationStatus?: "pending" | "accepted" | "rejected" | "left";
  error?: string;
  myRole?: ConferenceRole;
  currentHostPubKeyB64?: string;
  cleaningUp?: boolean;
  leftTimestamp?: number;
}

export function buildTransitionPayload(
  transition: ConferenceTransition,
  context?: Record<string, unknown>,
): TransitionPayload {
  switch (transition) {
    case ConferenceTransition.ACCEPT_INVITATION:
      return { invitationStatus: "accepted" };

    case ConferenceTransition.REJECT_INVITATION:
    case ConferenceTransition.INVITATION_TIMEOUT:
      // Rejecting/timeout is not "ending" a conference - don't set endedByMe
      return { invitationStatus: "rejected", ended: true };

    case ConferenceTransition.LEAVE_CONFERENCE:
      return {
        invitationStatus: "left",
        leftTimestamp: Date.now(),
      };

    // Only explicit user actions should set endedByMe
    case ConferenceTransition.END_CONFERENCE:
      // User explicitly clicked "End For All"
      return { ended: true, endedByMe: true, invitationStatus: "left" };

    case ConferenceTransition.LAST_PARTICIPANT_LEFT:
      // User clicked "Leave" and was the last participant - they ended it
      return { ended: true, endedByMe: true, invitationStatus: "left" };

    case ConferenceTransition.ALL_PARTICIPANTS_LEFT:
      // Automatic detection - conference ended but not by explicit user action
      return { ended: true, invitationStatus: "left" };

    case ConferenceTransition.GET_KICKED:
      return { ended: true, error: "You were removed from the conference" };

    case ConferenceTransition.AUTO_PROMOTE_HOST:
      return {
        myRole: ConferenceRole.Host,
        currentHostPubKeyB64: context?.newHostPubKey as string,
      };

    case ConferenceTransition.START_CLEANUP:
      return { cleaningUp: true };

    case ConferenceTransition.ERROR_OCCURRED:
      // Errors are not explicit user actions - don't set endedByMe
      return { ended: true, error: context?.error as string };

    default:
      return {};
  }
}

export function logTransition(
  roomId: string,
  fromState: ConferenceLifecycleState,
  transition: ConferenceTransition,
  toState: ConferenceLifecycleState,
  reason?: string,
): void {
  console.log(`[ConferenceLifecycle] ${roomId.slice(0, 20)}:`, {
    from: fromState,
    transition,
    to: toState,
    reason,
    timestamp: new Date().toISOString(),
  });
}
