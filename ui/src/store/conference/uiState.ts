import { type ConferenceContext, type SimplePeerConferenceState, safeGetConference } from "./types";
import { type GenericKeyValueStoreData } from "../generic/GenericKeyValueStore";

export interface UIStateManager {
  setShowPreJoinScreen: (roomId: string, show: boolean) => void;
  setMinimized: (roomId: string, minimized: boolean) => void;
  setMediaEnabled: (roomId: string, video: boolean, audio: boolean) => void;
  getIncomingInvitations: () => SimplePeerConferenceState[];
}

export function createUIStateManager(ctx: ConferenceContext): UIStateManager {
  function setShowPreJoinScreen(roomId: string, show: boolean): void {
    const state = safeGetConference(ctx, roomId);
    if (!state) return;

    ctx.conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      showPreJoinScreen: show,
    }));
  }

  function setMinimized(roomId: string, minimized: boolean): void {
    const state = safeGetConference(ctx, roomId);
    if (!state) return;

    ctx.conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      isMinimized: minimized,
    }));
  }

  function setMediaEnabled(roomId: string, video: boolean, audio: boolean): void {
    const state = safeGetConference(ctx, roomId);
    if (!state) {
      console.warn(
        `[SimplePeer] setMediaEnabled: No conference state for room ${roomId}, cannot set media state`,
      );
      return;
    }

    console.log(
      `[SimplePeer] setMediaEnabled: Setting video=${video}, audio=${audio} for room ${roomId.slice(0, 20)}`,
    );

    ctx.conferences.updateKeyValue(roomId, (conf) => ({
      ...conf,
      videoEnabled: video,
      audioEnabled: audio,
    }));

    const updatedState = safeGetConference(ctx, roomId);
    console.log(
      `[SimplePeer] setMediaEnabled: Verified state - video=${updatedState?.videoEnabled}, audio=${updatedState?.audioEnabled}`,
    );
  }

  function getIncomingInvitations(): SimplePeerConferenceState[] {
    let currentData: GenericKeyValueStoreData<SimplePeerConferenceState> = {};
    const unsubscribe = ctx.conferences.subscribe((data) => {
      currentData = data.data;
    });
    unsubscribe();

    return Object.values(currentData).filter(
      (conf: SimplePeerConferenceState) =>
        conf.invitationStatus === "pending" && !conf.isInitiator,
    );
  }

  return {
    setShowPreJoinScreen,
    setMinimized,
    setMediaEnabled,
    getIncomingInvitations,
  };
}
