<script lang="ts">
  import { onMount, onDestroy, getContext } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import { t } from "$translations/index";
  import toast from "svelte-french-toast";
  import type { SimplePeerConferenceStore } from "$store/SimplePeerConferenceStore";
  import { type AgentPubKeyB64 } from "@holochain/client";
  import { type CellIdB64, ConferenceRole } from "$lib/types";
  import Avatar from "$lib/Avatar.svelte";
  import Dialog from "$lib/Dialog.svelte";
  import DialogConfirm from "$lib/DialogConfirm.svelte";
  import Button from "$lib/Button.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import RoleBadge from "$lib/RoleBadge.svelte";
  import ParticipantActionMenu from "$lib/ParticipantActionMenu.svelte";
  import ConferenceControlButton from "$lib/ConferenceControlButton.svelte";
  import {
    deriveCellMergedProfileContactInviteStore,
    type MergedProfileContactInviteStore,
  } from "$store/MergedProfileContactInviteStore";

  interface ConferenceParticipant {
    publicKey: string;
    hasJoined: boolean;
    connectionStatus?:
      | "idle"
      | "init-sent"
      | "init-received"
      | "connecting"
      | "connected"
      | "failed";
    videoEnabled?: boolean;
    audioEnabled?: boolean;
    reconnectAttempts?: number;
    connectionQuality?: string;
    stream?: MediaStream;
    peer?: { connected?: boolean; destroyed?: boolean; streams?: MediaStream[] };
    role?: ConferenceRole;
  }

  export let roomId: string;
  export let onClose: () => void;
  export let onConferenceEnded: ((roomId: string) => void) | undefined = undefined;

  const conferenceStoreBase = getContext<{ getStore: () => SimplePeerConferenceStore }>(
    "conferenceStore",
  ).getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();
  const mergedProfileContactInviteStore = getContext<{
    getStore: () => MergedProfileContactInviteStore;
  }>("mergedProfileContactInviteStore").getStore();
  const provisionedRelayCellIdB64 = getContext<{ getCellIdB64: () => CellIdB64 }>(
    "provisionedRelayCellId",
  ).getCellIdB64();

  const conferenceStore = conferenceStoreBase.deriveConferenceStore(roomId);

  let conferenceEndedLogged = false;

  function mediaStream(node: HTMLVideoElement, stream?: MediaStream | null) {
    let currentStream: MediaStream | null | undefined;

    const applyStream = (next?: MediaStream | null) => {
      if (currentStream === next) return;

      console.log("[Conference] mediaStream action - applying stream:", {
        nodeId: node.id || "unnamed-video",
        hadStream: !!currentStream,
        hasNewStream: !!next,
        streamId: next?.id,
        videoTracks: next?.getVideoTracks().length || 0,
        audioTracks: next?.getAudioTracks().length || 0,
        streamActive: next?.active,
      });

      currentStream = next ?? null;
      node.srcObject = currentStream ?? null;
      if (currentStream) {
        node.play().catch((error: Error) => {
          console.error("[Conference] Error playing video:", error);
          setTimeout(() => {
            node.play().catch((e: Error) => console.error("[Conference] Retry play failed:", e));
          }, 100);
        });
      }
    };

    applyStream(stream);

    return {
      update(next?: MediaStream | null) {
        applyStream(next);
      },
      destroy() {
        node.srcObject = null;
      },
    };
  }

  let isGridView = false;
  let callDurationSeconds = 0;
  let callStartTime: number | null = null;
  let durationInterval: ReturnType<typeof setInterval> | null = null;
  $: videoEnabled = $conferenceStore?.videoEnabled ?? true;
  $: audioEnabled = $conferenceStore?.audioEnabled ?? true;
  let showIncomingCallDialog = false;

  let invitationCountdown = 60;
  let countdownInterval: ReturnType<typeof setInterval> | undefined;

  let showControls = true;
  let controlsTimeout: ReturnType<typeof setTimeout> | null = null;
  const CONTROLS_HIDE_DELAY = 3000;

  function resetControlsTimer() {
    showControls = true;
    if (controlsTimeout) clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
      showControls = false;
    }, CONTROLS_HIDE_DELAY);
  }

  function handleScreenInteraction() {
    resetControlsTimer();
  }

  let conferenceAnnouncement = "";

  const isMac = typeof navigator !== "undefined" && navigator.platform?.includes("Mac");

  function getParticipantStream(participant: ConferenceParticipant): MediaStream | undefined {
    if (!participant) return undefined;
    if (participant.stream) return participant.stream;
    const streams = participant.peer?.streams;
    if (participant.peer && !participant.peer.destroyed && streams && streams.length > 0) {
      return streams[0];
    }
    return undefined;
  }

  function isParticipantConnected(
    participant: ConferenceParticipant & { isLocal?: boolean },
  ): boolean {
    if (!participant) return false;
    if (participant.isLocal) return true;
    return participant.peer?.connected === true;
  }

  function hasVideoEnabled(participant: ConferenceParticipant): boolean {
    const stream = getParticipantStream(participant);
    if (!stream) return false;

    if (participant.videoEnabled !== undefined) {
      return participant.videoEnabled;
    }

    const videoTracks = stream.getVideoTracks();
    const hasVideo =
      videoTracks.length > 0 && videoTracks.some((track: MediaStreamTrack) => track.enabled);

    return hasVideo;
  }

  $: profiles = $conferenceStore?.cellIdB64
    ? deriveCellMergedProfileContactInviteStore(
        mergedProfileContactInviteStore,
        $conferenceStore.cellIdB64,
        myPubKeyB64,
      )
    : deriveCellMergedProfileContactInviteStore(
        mergedProfileContactInviteStore,
        provisionedRelayCellIdB64,
        myPubKeyB64,
      );

  $: isMuted = !audioEnabled;
  $: isVideoEnabled = videoEnabled;

  $: allParticipants = $conferenceStore?.participants
    ? [...$conferenceStore.participants.entries()].map(([pubKey, participant]) => ({
        pubKey,
        ...participant,
        isLocal: false,
        _stream: getParticipantStream(participant),
        _connected: isParticipantConnected(participant),
        role: participant.role,
      }))
    : [];

  $: myRole = $conferenceStore?.myRole;

  $: {
    console.log("[Conference] Conference state updated:", {
      hasConference: !!$conferenceStore,
      myRole,
      canEndForAll,
      participantCount: allParticipants.length,
      participants: allParticipants.map((p) => ({
        pubKey: p.pubKey.slice(0, 20),
        hasStream: !!p._stream,
        isConnected: p._connected,
        hasJoined: p.hasJoined,
        videoEnabled: p.videoEnabled,
        streamId: p._stream?.id,
        role: p.role,
      })),
    });
  }

  $: remoteParticipants = allParticipants.filter((p) => p.pubKey !== myPubKeyB64);
  $: activeParticipant =
    remoteParticipants.find((p) => p._stream && p._connected) || remoteParticipants[0];

  $: pipParticipants = activeParticipant
    ? [
        {
          pubKey: myPubKeyB64,
          publicKey: myPubKeyB64,
          isLocal: true,
          _stream: $conferenceStore?.localStream,
          _connected: true,
          hasJoined: true,
          connectionStatus: "connected" as const,
          connectionQuality: undefined as string | undefined,
          role: myRole,
        },
        ...remoteParticipants.filter((p) => p.pubKey !== activeParticipant.pubKey),
      ]
    : [
        {
          pubKey: myPubKeyB64,
          publicKey: myPubKeyB64,
          isLocal: true,
          _stream: $conferenceStore?.localStream,
          _connected: true,
          hasJoined: true,
          connectionStatus: "connected" as const,
          connectionQuality: undefined as string | undefined,
          role: myRole,
        },
        ...remoteParticipants,
      ];

  $: gridParticipants = [
    {
      pubKey: myPubKeyB64,
      publicKey: myPubKeyB64,
      isLocal: true,
      _stream: $conferenceStore?.localStream,
      _connected: true,
      hasJoined: true,
      connectionStatus: "connected" as const,
      connectionQuality: undefined as string | undefined,
      role: myRole,
    },
    ...remoteParticipants,
  ];

  $: showIncomingCallDialog =
    $conferenceStore &&
    $conferenceStore.invitationStatus === "pending" &&
    !$conferenceStore.isInitiator;

  $: if ($conferenceStore?.invitationTimestamp && showIncomingCallDialog) {
    if (countdownInterval) clearInterval(countdownInterval);

    const elapsed = Math.floor((Date.now() - $conferenceStore.invitationTimestamp) / 1000);
    invitationCountdown = Math.max(0, 60 - elapsed);

    countdownInterval = setInterval(() => {
      if ($conferenceStore?.invitationTimestamp) {
        const elapsed = Math.floor((Date.now() - $conferenceStore.invitationTimestamp) / 1000);
        invitationCountdown = Math.max(0, 60 - elapsed);
      }
    }, 1000);
  } else if (!showIncomingCallDialog && countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = undefined;
    invitationCountdown = 60;
  }

  function handleAcceptCall() {
    conferenceStoreBase.acceptConferenceInvitation(roomId);
  }

  function handleRejectCall() {
    conferenceStoreBase.rejectConferenceInvitation(roomId);
    onClose();
  }

  $: if ($conferenceStore?.ended && !conferenceEndedLogged) {
    conferenceEndedLogged = true;
    if (onConferenceEnded && roomId) {
      onConferenceEnded(roomId);
    }
    onClose();
  }

  $: if ($conferenceStore && $conferenceStore.invitationStatus === "left") {
    onClose();
  }

  function getParticipantName(agentPubKeyB64: string): string {
    const profile = $profiles.data[agentPubKeyB64];
    if (profile?.profile?.fields) {
      const firstName = profile.profile.fields.firstName || "";
      const lastName = profile.profile.fields.lastName || "";
      return `${firstName} ${lastName}`.trim() || "Unknown";
    }
    return "Unknown";
  }

  let activeParticipantMenu: AgentPubKeyB64 | null = null;
  let showKickConfirmDialog = false;
  let showTransferHostDialog = false;
  let showPromoteDialog = false;
  let targetParticipantPubKey: AgentPubKeyB64 | null = null;
  let isPerformingAction = false;

  $: canEndForAll = conferenceStoreBase.canEndConference(roomId);

  function canKickParticipant(targetPubKeyB64: AgentPubKeyB64): boolean {
    return conferenceStoreBase.canKick(roomId, targetPubKeyB64);
  }

  function toggleParticipantMenu(pubKey: AgentPubKeyB64) {
    activeParticipantMenu = activeParticipantMenu === pubKey ? null : pubKey;
  }

  function handleBackdropClick() {
    activeParticipantMenu = null;
  }

  function initiateKick(pubKey: AgentPubKeyB64) {
    targetParticipantPubKey = pubKey;
    showKickConfirmDialog = true;
    activeParticipantMenu = null;
  }

  async function confirmKick() {
    if (!targetParticipantPubKey) return;

    isPerformingAction = true;
    try {
      await conferenceStoreBase.kickParticipant(roomId, targetParticipantPubKey);
      toast.success($t("common.conference_participantKicked") || "Participant removed");
    } catch (error) {
      console.error("[Conference] Error kicking participant:", error);
      toast.error($t("common.conference_kickFailed") || "Failed to remove participant");
    } finally {
      isPerformingAction = false;
      showKickConfirmDialog = false;
      targetParticipantPubKey = null;
    }
  }

  function initiateTransferHost(pubKey: AgentPubKeyB64) {
    targetParticipantPubKey = pubKey;
    showTransferHostDialog = true;
    activeParticipantMenu = null;
  }

  async function confirmTransferHost() {
    if (!targetParticipantPubKey) return;

    isPerformingAction = true;
    try {
      await conferenceStoreBase.transferHost(roomId, targetParticipantPubKey);
      toast.success($t("common.conference_hostTransferred") || "Host role transferred");
    } catch (error) {
      console.error("[Conference] Error transferring host:", error);
      toast.error($t("common.conference_transferFailed") || "Failed to transfer host");
    } finally {
      isPerformingAction = false;
      showTransferHostDialog = false;
      targetParticipantPubKey = null;
    }
  }

  function initiatePromote(pubKey: AgentPubKeyB64) {
    targetParticipantPubKey = pubKey;
    showPromoteDialog = true;
    activeParticipantMenu = null;
  }

  async function confirmPromote() {
    if (!targetParticipantPubKey) return;

    isPerformingAction = true;
    try {
      await conferenceStoreBase.changeParticipantRole(
        roomId,
        targetParticipantPubKey,
        ConferenceRole.CoHost,
      );
      toast.success(
        $t("common.conference_participantPromoted") || "Participant promoted to Co-Host",
      );
    } catch (error) {
      console.error("[Conference] Error promoting participant:", error);
      toast.error($t("common.conference_promoteFailed") || "Failed to promote participant");
    } finally {
      isPerformingAction = false;
      showPromoteDialog = false;
      targetParticipantPubKey = null;
    }
  }

  $: targetParticipantName = targetParticipantPubKey
    ? getParticipantName(targetParticipantPubKey)
    : "";

  function getQualityIndicatorClass(quality?: string): string {
    switch (quality) {
      case "excellent":
        return "bg-green-500";
      case "good":
        return "bg-green-400";
      case "fair":
        return "bg-yellow-500";
      case "poor":
        return "bg-orange-500";
      case "disconnected":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  }

  function getQualityLabel(quality?: string): string {
    switch (quality) {
      case "excellent":
        return "Excellent connection";
      case "good":
        return "Good connection";
      case "fair":
        return "Fair connection";
      case "poor":
        return "Poor connection";
      case "disconnected":
        return "Disconnected";
      default:
        return "Unknown";
    }
  }

  function formatTime(): string {
    if (!callStartTime) return "00:00:00";
    const minutes = Math.floor(callDurationSeconds / 60);
    const seconds = callDurationSeconds % 60;
    return `00:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  function handleKeyboardShortcuts(event: KeyboardEvent) {
    if (event.code === "Escape") endCall();
    if (event.code === "KeyM" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      toggleMute();
    }
    if (event.code === "KeyV" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      toggleVideo();
    }
  }

  onMount(() => {
    callStartTime = Date.now();
    durationInterval = setInterval(() => {
      if (callStartTime) {
        callDurationSeconds = Math.floor((Date.now() - callStartTime) / 1000);
      }
    }, 1000);

    resetControlsTimer();

    if ($conferenceStore?.cellIdB64 && $conferenceStore.invitationStatus !== "pending") {
      conferenceStoreBase.fetchRoles(roomId).catch((error) => {
        console.error("[Conference] Error fetching roles:", error);
      });
    }

    if ($conferenceStore?.localStream) {
      const storedVideoEnabled = $conferenceStore.videoEnabled ?? true;
      const storedAudioEnabled = $conferenceStore.audioEnabled ?? true;

      $conferenceStore.localStream.getVideoTracks().forEach((track: MediaStreamTrack) => {
        track.enabled = storedVideoEnabled;
      });
      $conferenceStore.localStream.getAudioTracks().forEach((track: MediaStreamTrack) => {
        track.enabled = storedAudioEnabled;
      });
    }

    return () => {
      if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
      }
    };
  });

  onDestroy(() => {
    if (roomId && $conferenceStore) {
      const shouldSendLeaveSignal =
        !$conferenceStore.ended &&
        $conferenceStore.invitationStatus !== "left" &&
        $conferenceStore.invitationStatus !== "rejected" &&
        $conferenceStore.invitationStatus !== "pending";

      if (shouldSendLeaveSignal) {
        console.log("[Conference] Component unmounting - sending leave signal to DHT");
        conferenceStoreBase.leaveConference(roomId).catch((error) => {
          console.error("[Conference] Error leaving conference on unmount:", error);
        });
      } else {
        console.log(
          "[Conference] Component unmounting - only cleaning up WebRTC (no leave signal needed)",
        );
        conferenceStoreBase.cleanupWebRTC(roomId);
      }
    }
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = undefined;
    }
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
      controlsTimeout = null;
    }
  });

  function toggleMute() {
    if ($conferenceStore?.localStream) {
      const audioTracks = $conferenceStore.localStream.getAudioTracks();
      const nextState = !audioEnabled;
      audioTracks.forEach((track: MediaStreamTrack) => {
        track.enabled = nextState;
      });

      conferenceStoreBase.setMediaEnabled(roomId, videoEnabled, nextState);
      conferenceStoreBase.sendMediaStateToAll(roomId, videoEnabled, nextState);
    }
  }

  function toggleVideo() {
    if ($conferenceStore?.localStream) {
      const videoTracks = $conferenceStore.localStream.getVideoTracks();
      const nextState = !videoEnabled;
      videoTracks.forEach((track: MediaStreamTrack) => {
        track.enabled = nextState;
      });

      conferenceStoreBase.setMediaEnabled(roomId, nextState, audioEnabled);
      conferenceStoreBase.sendMediaStateToAll(roomId, nextState, audioEnabled);
    }
  }

  function handleErrorClose() {
    suppressErrorDialog = true;
    showErrorDialog = false;

    if (roomId) {
      const existingConference = conferenceStoreBase.getConference(roomId);
      if (existingConference) {
        conferenceStoreBase.updateConference(roomId, (conf) => ({
          ...conf,
          error: undefined,
        }));
      }

      conferenceStoreBase.cleanupWebRTC(roomId);
      conferenceStoreBase.leaveConference(roomId);
    }

    onClose();
  }

  let showEndCallDialog = false;
  let showErrorDialog = false;
  let errorDialogMessage = "";
  let errorDialogTitle = "Connection Error";
  let errorDialogActionLabel = "Close Conference";
  let currentError: string | undefined;
  let suppressErrorDialog = false;

  $: currentError = $conferenceStore?.error;
  $: if (!suppressErrorDialog && currentError && currentError !== errorDialogMessage) {
    const isRejected = $conferenceStore?.invitationStatus === "rejected";
    errorDialogMessage = currentError;
    errorDialogTitle = isRejected ? "Call Declined" : "Connection Error";
    errorDialogActionLabel = isRejected ? "Close" : "Close Conference";
    showErrorDialog = true;
  }

  $: if (!currentError) {
    if (showErrorDialog) {
      showErrorDialog = false;
    }
    if (errorDialogMessage) {
      errorDialogMessage = "";
      errorDialogTitle = "Connection Error";
      errorDialogActionLabel = "Close Conference";
    }
    suppressErrorDialog = false;
  }

  function endCall() {
    if (roomId && canEndForAll) {
      showEndCallDialog = true;
    } else {
      if (roomId) {
        conferenceStoreBase.leaveConference(roomId);
        conferenceStoreBase.cleanupWebRTC(roomId);
      }
      onClose();
    }
  }

  async function confirmEndForAll() {
    showEndCallDialog = false;

    if (roomId) {
      conferenceStoreBase.cleanupWebRTC(roomId);

      try {
        await conferenceStoreBase.endConferenceForAll(roomId);
      } catch (error) {
        console.error("[Conference] Error ending conference for all:", error);
      }

      conferenceEndedLogged = true;
      if (onConferenceEnded) {
        try {
          await onConferenceEnded(roomId);
        } catch (error) {
          console.error("[Conference] Error in onConferenceEnded callback:", error);
        }
      }
    }

    onClose();
  }

  function confirmJustLeave() {
    if (roomId) {
      conferenceStoreBase.leaveConference(roomId);
      conferenceStoreBase.cleanupWebRTC(roomId);
    }
    showEndCallDialog = false;
    onClose();
  }

  function cancelEndCall() {
    showEndCallDialog = false;
  }
</script>

<svelte:window on:keydown={handleKeyboardShortcuts} />

<div aria-live="polite" class="sr-only" id="conference-announcements">
  {conferenceAnnouncement}
</div>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="bg-secondary-500 fixed inset-0 z-50"
  transition:fade={{ duration: 200 }}
  on:click={handleScreenInteraction}
  on:touchstart={handleScreenInteraction}
>
  {#if $conferenceStore && !$conferenceStore.localStream && $conferenceStore.invitationStatus === "accepted"}
    <div
      class="bg-secondary-500 absolute inset-0 z-50 flex flex-col items-center justify-center"
      transition:fade={{ duration: 200 }}
    >
      <div
        class="bg-secondary-400/50 flex flex-col items-center gap-6 rounded-3xl p-8 backdrop-blur-sm"
      >
        <div class="relative">
          <div class="bg-primary-500/20 h-20 w-20 animate-pulse rounded-full"></div>
          <div class="absolute inset-0 flex items-center justify-center">
            <SvgIcon icon="videocam" moreClasses="h-10 w-10 text-primary-500" />
          </div>
          <div
            class="bg-secondary-500 absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full"
          >
            <SvgIcon icon="spinner" moreClasses="h-5 w-5 animate-spin text-tertiary-400" />
          </div>
        </div>

        <div class="text-center">
          <p class="text-tertiary-300 text-lg font-semibold">
            {$t("common.conference_connecting")}
          </p>
          <p class="text-tertiary-500 mt-1 text-sm">Setting up your camera and microphone...</p>
        </div>
      </div>
    </div>
  {/if}

  {#if allParticipants.some((p) => p.reconnectAttempts && p.reconnectAttempts > 0)}
    {@const reconnectingParticipant = allParticipants.find(
      (p) => p.reconnectAttempts && p.reconnectAttempts > 0,
    )}
    <div
      class="absolute left-1/2 top-20 z-40 -translate-x-1/2 sm:top-24"
      transition:fade={{ duration: 200 }}
    >
      <div class="bg-warning-500 flex items-center gap-2 rounded-xl px-4 py-2.5 shadow-lg">
        <div class="relative h-3 w-3">
          <div class="bg-secondary-500/50 absolute inset-0 animate-ping rounded-full"></div>
          <div class="bg-secondary-500 relative h-3 w-3 rounded-full"></div>
        </div>
        <p class="text-secondary-500 text-sm font-medium">
          {$t("common.conference_reconnecting", {
            attempt: reconnectingParticipant?.reconnectAttempts || 0,
            max: 10,
          })}
        </p>
      </div>
    </div>
  {/if}

  {#if showControls}
    <header
      class="from-secondary-500 via-secondary-500/80 absolute left-0 right-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b to-transparent px-4 py-3 sm:px-6 sm:py-4"
      transition:fade={{ duration: 200 }}
    >
      <div class="flex items-center gap-2">
        <div
          class="bg-secondary-400/50 flex items-center gap-1.5 rounded-full px-3 py-1.5 backdrop-blur-sm"
        >
          <SvgIcon icon="group" moreClasses="h-4 w-4 text-tertiary-400" />
          <span class="text-tertiary-400 text-xs font-medium sm:text-sm"
            >{gridParticipants.length}</span
          >
        </div>
      </div>

      <div class="flex items-center gap-2 sm:gap-3">
        <button
          on:click={() => (isGridView = !isGridView)}
          class="bg-secondary-400/50 hover:bg-secondary-400 group flex items-center gap-1.5 rounded-full px-3 py-2 backdrop-blur-sm transition-all duration-150 active:scale-95 sm:gap-2 sm:px-4"
          aria-label={isGridView ? "Switch to speaker view" : "Switch to grid view"}
          title={isGridView ? "Switch to speaker view" : "Switch to grid view"}
        >
          <SvgIcon
            icon={isGridView ? "user" : "gridView"}
            moreClasses="h-4 w-4 text-tertiary-400 transition-transform group-hover:scale-110 sm:h-5 sm:w-5"
          />
          <span class="text-tertiary-400 hidden text-xs font-medium sm:inline">
            {isGridView ? "Speaker" : "Grid"}
          </span>
        </button>

        <button
          on:click={onClose}
          class="bg-secondary-400/50 hover:bg-secondary-400 group rounded-full p-2 backdrop-blur-sm transition-all duration-150 active:scale-95 sm:p-2.5"
          aria-label="Minimize conference"
          title="Minimize conference"
        >
          <SvgIcon
            icon="caretDown"
            moreClasses="h-5 w-5 text-tertiary-400 transition-transform group-hover:translate-y-0.5 sm:h-6 sm:w-6"
          />
        </button>
      </div>
    </header>
  {/if}

  <div class="h-full w-full p-2 pb-24 pt-4 sm:p-4 sm:pb-28 sm:pt-6">
    {#if isGridView}
      <div class="mx-auto grid h-full max-w-7xl grid-cols-2 gap-2 sm:gap-3">
        {#each gridParticipants.slice(0, 4) as participant (participant.pubKey)}
          <div
            class="from-secondary-400 to-secondary-500 relative overflow-hidden rounded-2xl bg-gradient-to-br"
            in:scale={{ duration: 200, start: 0.9 }}
            out:fade={{ duration: 150 }}
            animate:flip={{ duration: 250 }}
          >
            {#if participant.isLocal && $conferenceStore?.localStream && isVideoEnabled}
              <video
                use:mediaStream={$conferenceStore?.localStream}
                autoplay
                muted
                playsinline
                class="absolute inset-0 h-full w-full object-cover"
              >
                <track kind="captions" />
              </video>
            {:else if !participant.isLocal && participant._stream && hasVideoEnabled(participant)}
              <video
                use:mediaStream={participant._stream}
                autoplay
                playsinline
                class="absolute inset-0 h-full w-full object-cover"
              >
                <track kind="captions" />
              </video>
            {:else if participant.isLocal || participant._connected}
              <div
                class="from-primary-500/10 via-secondary-400 to-secondary-500 absolute inset-0 flex items-center justify-center bg-gradient-to-br"
              >
                <Avatar
                  agentPubKeyB64={participant.pubKey}
                  size={60}
                  moreClasses="sm:w-[80px] sm:h-[80px]"
                />
              </div>
            {:else}
              <div class="bg-secondary-500 absolute inset-0 flex items-center justify-center">
                <div class="text-center">
                  <div
                    class="bg-secondary-400 mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full sm:h-20 sm:w-20"
                  >
                    <SvgIcon icon="user" moreClasses="h-7 w-7 text-tertiary-500 sm:h-10 sm:w-10" />
                  </div>
                  <p class="text-tertiary-500 text-xs">Waiting...</p>
                </div>
              </div>
            {/if}

            {#if !participant.isLocal && participant.connectionStatus}
              {#if participant.connectionStatus === "connecting" || participant.connectionStatus === "init-sent" || participant.connectionStatus === "init-received"}
                <div
                  class="bg-secondary-500/80 absolute left-2 top-2 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 backdrop-blur-sm sm:left-3 sm:top-3"
                  transition:fade={{ duration: 150 }}
                >
                  <div class="relative h-2.5 w-2.5">
                    <div class="bg-warning-500/50 absolute inset-0 animate-ping rounded-full"></div>
                    <div class="bg-warning-500 relative h-2.5 w-2.5 rounded-full"></div>
                  </div>
                  <span class="text-tertiary-400 text-[10px] font-medium sm:text-xs"
                    >{$t("common.conference_statusConnecting")}</span
                  >
                </div>
              {:else if participant.connectionStatus === "failed"}
                <div
                  class="bg-error-500 absolute left-2 top-2 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 shadow-lg sm:left-3 sm:top-3"
                  transition:fade={{ duration: 150 }}
                >
                  <SvgIcon icon="alertCircle" moreClasses="h-3 w-3 text-white" />
                  <span class="text-[10px] font-medium text-white sm:text-xs"
                    >{$t("common.conference_statusFailed")}</span
                  >
                </div>
              {/if}
            {/if}

            {#if !participant.isLocal && (myRole === ConferenceRole.Host || myRole === ConferenceRole.CoHost)}
              <div class="absolute right-2 top-2 sm:right-4 sm:top-4">
                <ParticipantActionMenu
                  isOpen={activeParticipantMenu === participant.pubKey}
                  {myRole}
                  participantRole={participant.role}
                  canKick={canKickParticipant(participant.pubKey)}
                  on:toggle={() => toggleParticipantMenu(participant.pubKey)}
                  on:promote={() => initiatePromote(participant.pubKey)}
                  on:transferHost={() => initiateTransferHost(participant.pubKey)}
                  on:kick={() => initiateKick(participant.pubKey)}
                />
              </div>
            {/if}

            <div
              class="absolute bottom-2 left-2 right-2 flex items-center justify-between sm:bottom-4 sm:left-4 sm:right-4"
            >
              <div
                class="flex items-center gap-1.5 rounded-xl bg-black/60 px-2 py-1.5 backdrop-blur-md sm:gap-2 sm:px-3 sm:py-2"
              >
                {#if participant.isLocal ? isMuted : !participant._stream || !participant._connected}
                  <div
                    class="bg-error-500 flex h-5 w-5 items-center justify-center rounded-full sm:h-6 sm:w-6"
                  >
                    <SvgIcon icon="micOff" moreClasses="h-2.5 w-2.5 text-white sm:h-3 sm:w-3" />
                  </div>
                {:else}
                  <div
                    class="bg-success-500/80 flex h-5 w-5 items-center justify-center rounded-full sm:h-6 sm:w-6"
                  >
                    <SvgIcon icon="mic" moreClasses="h-2.5 w-2.5 text-white sm:h-3 sm:w-3" />
                  </div>
                {/if}

                <div class="flex flex-col">
                  <div class="flex items-center gap-1">
                    <span
                      class="max-w-[80px] truncate text-[10px] font-semibold text-white sm:max-w-[120px] sm:text-xs"
                    >
                      {getParticipantName(participant.pubKey)}{participant.isLocal ? " (You)" : ""}
                    </span>
                    <RoleBadge role={participant.role} size="sm" />
                  </div>
                </div>
              </div>

              {#if !participant.isLocal && participant.connectionQuality}
                <div
                  class="flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 backdrop-blur-md"
                  title={getQualityLabel(participant.connectionQuality)}
                >
                  <div
                    class="h-2 w-2 rounded-full {getQualityIndicatorClass(
                      participant.connectionQuality,
                    )}"
                  />
                  <span class="text-tertiary-500 hidden text-[9px] sm:inline"
                    >{participant.connectionQuality}</span
                  >
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="mx-auto flex h-full max-w-7xl flex-col gap-2 sm:flex-row sm:gap-4">
        <div
          class="from-secondary-400 to-secondary-500 relative flex-1 overflow-hidden rounded-xl bg-gradient-to-br sm:rounded-2xl"
        >
          {#if activeParticipant}
            {#if activeParticipant._stream && hasVideoEnabled(activeParticipant)}
              <video
                id="remote-video-main-{activeParticipant.pubKey.slice(0, 10)}"
                use:mediaStream={activeParticipant._stream}
                autoplay
                playsinline
                class="absolute inset-0 h-full w-full object-cover"
              >
                <track kind="captions" />
              </video>
            {:else if activeParticipant._connected}
              <div
                class="from-primary-500/10 via-secondary-400 to-secondary-500 absolute inset-0 flex items-center justify-center bg-gradient-to-br"
              >
                <Avatar
                  agentPubKeyB64={activeParticipant.pubKey}
                  size={120}
                  moreClasses="sm:w-[200px] sm:h-[200px]"
                />
              </div>
            {:else}
              <div class="bg-secondary-500 absolute inset-0 flex items-center justify-center">
                <div class="text-center">
                  <div
                    class="bg-secondary-400 mx-auto mb-4 flex h-32 w-32 items-center justify-center rounded-full sm:h-48 sm:w-48"
                  >
                    <SvgIcon
                      icon="user"
                      moreClasses="h-16 w-16 text-tertiary-500 sm:h-24 sm:w-24"
                    />
                  </div>
                  <p class="text-tertiary-500 text-sm sm:text-base">Waiting to join...</p>
                </div>
              </div>
            {/if}
            <div
              class="absolute bottom-4 left-4 right-4 flex items-center justify-between sm:bottom-6 sm:left-6 sm:right-6"
            >
              <div
                class="flex items-center gap-2 rounded-xl bg-black/60 px-3 py-2 backdrop-blur-md sm:gap-3 sm:px-4 sm:py-2.5"
              >
                <div
                  class="bg-success-500/80 flex h-6 w-6 items-center justify-center rounded-full sm:h-8 sm:w-8"
                >
                  <SvgIcon icon="mic" moreClasses="h-3 w-3 text-white sm:h-4 sm:w-4" />
                </div>
                <div class="flex items-center gap-2">
                  <span
                    class="max-w-[150px] truncate text-sm font-semibold text-white sm:max-w-[250px] sm:text-base"
                  >
                    {getParticipantName(activeParticipant.pubKey)}
                  </span>
                  <RoleBadge role={activeParticipant.role} size="md" showIcon />
                </div>
              </div>

              {#if activeParticipant.connectionQuality}
                <div
                  class="flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1.5 backdrop-blur-md"
                  title={getQualityLabel(activeParticipant.connectionQuality)}
                >
                  <div
                    class="h-2.5 w-2.5 rounded-full {getQualityIndicatorClass(
                      activeParticipant.connectionQuality,
                    )}"
                  />
                  <span class="text-tertiary-400 text-xs"
                    >{activeParticipant.connectionQuality}</span
                  >
                </div>
              {/if}
            </div>
          {:else}
            {#if $conferenceStore?.localStream && isVideoEnabled}
              <!-- Local video enabled -->
              <video
                use:mediaStream={$conferenceStore?.localStream}
                autoplay
                muted
                playsinline
                class="absolute inset-0 h-full w-full object-cover"
              >
                <track kind="captions" />
              </video>
            {:else}
              <!-- Local camera off - show avatar -->
              <div
                class="from-primary-500/10 via-secondary-400 to-secondary-500 absolute inset-0 flex items-center justify-center bg-gradient-to-br"
              >
                <Avatar
                  agentPubKeyB64={myPubKeyB64}
                  size={120}
                  moreClasses="sm:w-[200px] sm:h-[200px]"
                />
              </div>
            {/if}
            <div
              class="absolute bottom-4 left-4 right-4 flex items-center justify-between sm:bottom-6 sm:left-6 sm:right-6"
            >
              <div
                class="flex items-center gap-2 rounded-xl bg-black/60 px-3 py-2 backdrop-blur-md sm:gap-3 sm:px-4 sm:py-2.5"
              >
                {#if isMuted}
                  <div
                    class="bg-error-500 flex h-6 w-6 items-center justify-center rounded-full sm:h-8 sm:w-8"
                  >
                    <SvgIcon icon="micOff" moreClasses="h-3 w-3 text-white sm:h-4 sm:w-4" />
                  </div>
                {:else}
                  <div
                    class="bg-success-500/80 flex h-6 w-6 items-center justify-center rounded-full sm:h-8 sm:w-8"
                  >
                    <SvgIcon icon="mic" moreClasses="h-3 w-3 text-white sm:h-4 sm:w-4" />
                  </div>
                {/if}
                <div class="flex items-center gap-2">
                  <span
                    class="max-w-[150px] truncate text-sm font-semibold text-white sm:max-w-[250px] sm:text-base"
                  >
                    {getParticipantName(myPubKeyB64)} (You)
                  </span>
                  <RoleBadge role={myRole} size="md" showIcon />
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Sidebar -->
        <div
          class="flex max-h-32 w-full gap-2 overflow-x-auto sm:max-h-full sm:w-60 sm:flex-col sm:gap-4 sm:overflow-x-visible lg:w-80"
        >
          {#each pipParticipants.slice(0, 3) as participant (participant.pubKey)}
            <div
              class="from-secondary-400 to-secondary-500 relative min-w-[100px] flex-1 overflow-hidden rounded-lg bg-gradient-to-br sm:min-w-0 sm:rounded-xl"
              in:scale={{ duration: 200, start: 0.9 }}
              out:fade={{ duration: 150 }}
              animate:flip={{ duration: 250 }}
            >
              {#if participant.isLocal && $conferenceStore?.localStream && isVideoEnabled}
                <!-- Local video enabled -->
                <video
                  id="local-video-pip"
                  use:mediaStream={$conferenceStore?.localStream}
                  autoplay
                  muted
                  playsinline
                  class="absolute inset-0 h-full w-full object-cover"
                >
                  <track kind="captions" />
                </video>
              {:else if !participant.isLocal && participant._stream && hasVideoEnabled(participant)}
                <!-- Remote participant video enabled -->
                <video
                  id="remote-video-pip-{participant.pubKey.slice(0, 10)}"
                  use:mediaStream={participant._stream}
                  autoplay
                  playsinline
                  class="absolute inset-0 h-full w-full object-cover"
                >
                  <track kind="captions" />
                </video>
              {:else if participant.isLocal || participant._connected}
                <!-- Participant in call but camera off - show avatar -->
                <div
                  class="from-primary-500/10 via-secondary-400 to-secondary-500 absolute inset-0 flex items-center justify-center bg-gradient-to-br"
                >
                  <Avatar
                    agentPubKeyB64={participant.pubKey}
                    size={50}
                    moreClasses="sm:w-[80px] sm:h-[80px]"
                  />
                </div>
              {:else}
                <!-- Participant not in call yet - show dark background -->
                <div class="bg-secondary-500 absolute inset-0 flex items-center justify-center">
                  <div
                    class="bg-secondary-400 flex h-12 w-12 items-center justify-center rounded-full sm:h-20 sm:w-20"
                  >
                    <SvgIcon icon="user" moreClasses="h-6 w-6 text-tertiary-500 sm:h-10 sm:w-10" />
                  </div>
                </div>
              {/if}
              <!-- Sidebar participant name badge -->
              <div
                class="absolute bottom-1.5 left-1.5 right-1.5 flex items-center sm:bottom-2 sm:left-2 sm:right-2"
              >
                <div
                  class="flex items-center gap-1 rounded-lg bg-black/60 px-1.5 py-1 backdrop-blur-md sm:gap-1.5 sm:px-2 sm:py-1.5"
                >
                  {#if participant.isLocal ? isMuted : !participant._stream || !participant._connected}
                    <div
                      class="bg-error-500 flex h-4 w-4 items-center justify-center rounded-full sm:h-5 sm:w-5"
                    >
                      <SvgIcon icon="micOff" moreClasses="h-2 w-2 text-white sm:h-2.5 sm:w-2.5" />
                    </div>
                  {:else}
                    <div
                      class="bg-success-500/80 flex h-4 w-4 items-center justify-center rounded-full sm:h-5 sm:w-5"
                    >
                      <SvgIcon icon="mic" moreClasses="h-2 w-2 text-white sm:h-2.5 sm:w-2.5" />
                    </div>
                  {/if}
                  <span
                    class="max-w-[50px] truncate text-[9px] font-semibold text-white sm:max-w-[80px] sm:text-[10px]"
                  >
                    {getParticipantName(participant.pubKey).split(" ")[0]}{participant.isLocal
                      ? " (You)"
                      : ""}
                  </span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Bottom Controls with auto-hide -->
  {#if showControls}
    <footer
      class="from-secondary-500 via-secondary-500/95 absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t to-transparent px-3 pb-6 pt-8 sm:px-8 sm:pb-8 sm:pt-12"
      transition:fade={{ duration: 200 }}
    >
      <!-- Main Controls Container -->
      <div class="mx-auto flex max-w-lg items-center justify-center gap-4 sm:gap-6">
        <!-- Media Controls Group -->
        <div
          class="bg-secondary-400/30 flex items-center gap-3 rounded-full p-1.5 backdrop-blur-sm sm:gap-4 sm:p-2"
        >
          <ConferenceControlButton
            icon={isMuted ? "micOff" : "mic"}
            active={isMuted}
            label={isMuted ? $t("common.conference_unmute") : $t("common.conference_mute")}
            title="{isMuted ? $t('common.conference_unmute') : $t('common.conference_mute')} ({isMac
              ? '⌘'
              : 'Ctrl'}+M)"
            on:click={toggleMute}
          />

          <ConferenceControlButton
            icon={isVideoEnabled ? "videocam" : "videocamOff"}
            active={!isVideoEnabled}
            label={isVideoEnabled
              ? $t("common.conference_stopVideo")
              : $t("common.conference_startVideo")}
            title="{isVideoEnabled
              ? $t('common.conference_stopVideo')
              : $t('common.conference_startVideo')} ({isMac ? '⌘' : 'Ctrl'}+V)"
            on:click={toggleVideo}
          />

          <!-- Screen Share (Coming Soon) - Hidden on mobile -->
          <div class="hidden sm:block">
            <ConferenceControlButton
              icon="screenShare"
              disabled
              label={$t("common.conference_comingSoon")}
              title={$t("common.conference_comingSoon")}
            />
          </div>
        </div>

        <!-- End Call Button - Separated for visual emphasis -->
        <ConferenceControlButton
          icon="callEnd"
          variant="danger"
          size="lg"
          label="End call"
          title="End call (Esc)"
          on:click={endCall}
        />
      </div>

      <!-- Call Duration - Centered below controls -->
      <div class="mt-3 flex justify-center sm:mt-4">
        <div class="bg-secondary-400/50 rounded-full px-3 py-1 backdrop-blur-sm">
          <p class="text-tertiary-400 text-xs font-medium tabular-nums sm:text-sm">
            {formatTime()}
          </p>
        </div>
      </div>
    </footer>
  {/if}

  <Dialog bind:open={showEndCallDialog} title="End Call Options">
    <div class="flex flex-col items-center gap-4 text-center">
      <div class="bg-error-500/10 flex h-12 w-12 items-center justify-center rounded-full">
        <SvgIcon icon="phone" moreClasses="h-6 w-6 rotate-[135deg] text-error-500" />
      </div>
      <p class="text-secondary-500 dark:text-tertiary-500 text-sm">
        Would you like to end the call for everyone or just leave?
      </p>
    </div>

    <div class="mt-6 flex flex-col gap-3">
      <Button
        moreClasses="w-full !bg-error-500 hover:!bg-error-600 !text-white"
        on:click={confirmEndForAll}
      >
        End Call for All
      </Button>
      <Button
        moreClasses="w-full !bg-primary-500 hover:!bg-primary-600 !text-white"
        on:click={confirmJustLeave}
      >
        Just Leave
      </Button>
      <Button
        moreClasses="w-full !bg-secondary-400 hover:!bg-secondary-300 !text-white"
        on:click={cancelEndCall}
      >
        Cancel
      </Button>
    </div>
  </Dialog>

  <Dialog bind:open={showErrorDialog} title={errorDialogTitle}>
    <div class="flex flex-col items-center gap-4 text-center">
      <div class="bg-error-500/10 flex h-12 w-12 items-center justify-center rounded-full">
        <SvgIcon icon="alertTriangle" moreClasses="h-6 w-6 text-error-500" />
      </div>
      <p class="text-secondary-500 dark:text-tertiary-500 text-sm">
        {errorDialogMessage}
      </p>
    </div>

    <div class="mt-6 flex justify-center">
      <Button
        moreClasses="w-full sm:w-auto !bg-error-500 hover:!bg-error-600 !text-white"
        on:click={handleErrorClose}
      >
        {errorDialogActionLabel}
      </Button>
    </div>
  </Dialog>

  <!-- Incoming Call Dialog -->
  <Dialog bind:open={showIncomingCallDialog} title="Incoming Call">
    <div class="flex flex-col items-center gap-4 text-center">
      <div class="bg-success-500/10 flex h-16 w-16 items-center justify-center rounded-full">
        <SvgIcon icon="phone" moreClasses="h-8 w-8 animate-pulse text-success-500" />
      </div>
      {#if $conferenceStore?.invitedBy}
        <div class="flex flex-col items-center gap-2">
          <Avatar agentPubKeyB64={$conferenceStore.invitedBy} size={60} />
          <p class="text-secondary-700 dark:text-tertiary-300 text-base font-medium">
            {getParticipantName($conferenceStore.invitedBy)}
          </p>
        </div>
      {/if}
      <p class="text-secondary-500 dark:text-tertiary-500 text-sm">
        {$t("common.conference_isCalling")}
      </p>
      <p class="text-secondary-300 dark:text-tertiary-600 mt-2 text-xs">
        {$t("common.conference_autoDeclineIn", { seconds: invitationCountdown })}
      </p>
    </div>

    <div class="mt-6 flex justify-center gap-4">
      <Button
        moreClasses="!bg-error-500 hover:!bg-error-600 !text-white"
        on:click={handleRejectCall}
      >
        <div class="flex items-center gap-2">
          <SvgIcon icon="phone" moreClasses="h-5 w-5 rotate-[135deg]" />
          Decline
        </div>
      </Button>
      <Button
        moreClasses="!bg-success-500 hover:!bg-success-600 !text-white"
        on:click={handleAcceptCall}
      >
        <div class="flex items-center gap-2">
          <SvgIcon icon="phone" moreClasses="h-5 w-5" />
          Accept
        </div>
      </Button>
    </div>
  </Dialog>

  <!-- Kick Confirmation Dialog -->
  <DialogConfirm
    bind:open={showKickConfirmDialog}
    title={$t("common.conference_kickTitle") || "Remove Participant"}
    actionButtonLabel={$t("common.conference_kickConfirm") || "Remove"}
    loading={isPerformingAction}
    on:confirm={confirmKick}
    on:cancel={() => {
      showKickConfirmDialog = false;
      targetParticipantPubKey = null;
    }}
  >
    <div class="flex flex-col items-center gap-4 text-center">
      <div class="bg-error-500/10 flex h-12 w-12 items-center justify-center rounded-full">
        <SvgIcon icon="alertCircle" moreClasses="h-6 w-6 text-error-500" />
      </div>
      {#if targetParticipantPubKey}
        <div class="flex flex-col items-center gap-2">
          <Avatar agentPubKeyB64={targetParticipantPubKey} size={48} />
          <p class="text-secondary-700 dark:text-tertiary-300 font-medium">
            {targetParticipantName}
          </p>
        </div>
      {/if}
      <p class="text-secondary-500 dark:text-tertiary-500 text-sm">
        {$t("common.conference_kickMessage") ||
          "Are you sure you want to remove this participant from the call?"}
      </p>
    </div>
  </DialogConfirm>

  <!-- Transfer Host Confirmation Dialog -->
  <DialogConfirm
    bind:open={showTransferHostDialog}
    title={$t("common.conference_transferHostTitle") || "Transfer Host"}
    actionButtonLabel={$t("common.conference_transferHostConfirm") || "Transfer"}
    loading={isPerformingAction}
    on:confirm={confirmTransferHost}
    on:cancel={() => {
      showTransferHostDialog = false;
      targetParticipantPubKey = null;
    }}
  >
    <div class="flex flex-col items-center gap-4 text-center">
      <div class="bg-primary-500/10 flex h-12 w-12 items-center justify-center rounded-full">
        <SvgIcon icon="arrowUpCircle" moreClasses="h-6 w-6 text-primary-500" />
      </div>
      {#if targetParticipantPubKey}
        <div class="flex flex-col items-center gap-2">
          <Avatar agentPubKeyB64={targetParticipantPubKey} size={48} />
          <p class="text-secondary-700 dark:text-tertiary-300 font-medium">
            {targetParticipantName}
          </p>
        </div>
      {/if}
      <p class="text-secondary-500 dark:text-tertiary-500 text-sm">
        {$t("common.conference_transferHostMessage") ||
          "Transfer the host role to this participant? You will become a Co-Host."}
      </p>
    </div>
  </DialogConfirm>

  <!-- Promote to Co-Host Confirmation Dialog -->
  <DialogConfirm
    bind:open={showPromoteDialog}
    title={$t("common.conference_promoteTitle") || "Promote to Co-Host"}
    actionButtonLabel={$t("common.conference_promoteConfirm") || "Promote"}
    loading={isPerformingAction}
    on:confirm={confirmPromote}
    on:cancel={() => {
      showPromoteDialog = false;
      targetParticipantPubKey = null;
    }}
  >
    <div class="flex flex-col items-center gap-4 text-center">
      <div class="bg-warning-500/10 flex h-12 w-12 items-center justify-center rounded-full">
        <SvgIcon icon="star" moreClasses="h-6 w-6 text-warning-500" />
      </div>
      {#if targetParticipantPubKey}
        <div class="flex flex-col items-center gap-2">
          <Avatar agentPubKeyB64={targetParticipantPubKey} size={48} />
          <p class="text-secondary-700 dark:text-tertiary-300 font-medium">
            {targetParticipantName}
          </p>
        </div>
      {/if}
      <p class="text-secondary-500 dark:text-tertiary-500 text-sm">
        {$t("common.conference_promoteMessage") ||
          "Promote this participant to Co-Host? They will be able to manage participants and end the call."}
      </p>
    </div>
  </DialogConfirm>
</div>

<!-- Backdrop to close participant menu when clicking outside -->
{#if activeParticipantMenu}
  <button
    class="fixed inset-0 z-40 cursor-default bg-black/10"
    on:click={handleBackdropClick}
    aria-label="Close menu"
    tabindex="-1"
    transition:fade={{ duration: 150 }}
  ></button>
{/if}
