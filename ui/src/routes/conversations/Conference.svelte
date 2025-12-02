<script lang="ts">
  import { onMount, onDestroy, getContext } from "svelte";
  import { fade } from "svelte/transition";
  import type { ConferenceStore } from "$store/ConferenceStore";
  import { type AgentPubKeyB64 } from "@holochain/client";
  import { type CellIdB64 } from "$lib/types";
  import Avatar from "$lib/Avatar.svelte";
  import Dialog from "$lib/Dialog.svelte";
  import Button from "$lib/Button.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import {
    deriveCellMergedProfileContactInviteStore,
    type MergedProfileContactInviteStore,
  } from "$store/MergedProfileContactInviteStore";

  export let roomId: string;
  export let onClose: () => void;
  export let onConferenceEnded: ((roomId: string) => void) | undefined = undefined;

  const conferenceStoreBase = getContext<{ getStore: () => ConferenceStore }>(
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

  let isGridView = true;
  let callDurationSeconds = 0;
  let callStartTime: number | null = null;
  let durationInterval: ReturnType<typeof setInterval> | null = null;
  let videoEnabled = true;
  let audioEnabled = true;
  let hasAcceptedOnce = false;

  function hasVideoEnabled(participant: any): boolean {
    if (!participant || !participant.stream) {
      return false;
    }

    if (participant.videoEnabled !== undefined) {
      return participant.videoEnabled;
    }

    const videoTracks = participant.stream.getVideoTracks();
    const hasVideo =
      videoTracks.length > 0 && videoTracks.some((track: MediaStreamTrack) => track.enabled);

    return hasVideo;
  }

  let profiles = deriveCellMergedProfileContactInviteStore(
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
        isLocal: false, // Remote participants
      }))
    : [];

  $: {
    console.log("[Conference] Conference state updated:", {
      hasConference: !!$conferenceStore,
      participantCount: allParticipants.length,
      participants: allParticipants.map((p) => ({
        pubKey: p.pubKey.slice(0, 20),
        hasStream: !!p.stream,
        isConnected: p.isConnected,
        hasJoined: p.hasJoined,
        videoEnabled: p.videoEnabled,
        streamId: p.stream?.id,
      })),
    });
  }

  $: remoteParticipants = allParticipants.filter((p) => p.pubKey !== myPubKeyB64);
  $: activeParticipant =
    remoteParticipants.find((p) => p.stream && p.isConnected) || remoteParticipants[0];

  $: pipParticipants = activeParticipant
    ? [
        {
          pubKey: myPubKeyB64,
          isLocal: true,
          stream: $conferenceStore?.localStream,
          isConnected: true,
        },
        ...remoteParticipants.filter((p) => p.pubKey !== activeParticipant.pubKey),
      ]
    : [
        {
          pubKey: myPubKeyB64,
          isLocal: true,
          stream: $conferenceStore?.localStream,
          isConnected: true,
        },
        ...remoteParticipants,
      ];

  $: gridParticipants = [
    {
      pubKey: myPubKeyB64,
      isLocal: true,
      stream: $conferenceStore?.localStream,
      isConnected: true,
    },
    ...remoteParticipants,
  ];

  $: if (
    $conferenceStore &&
    $conferenceStore.invitationStatus === "pending" &&
    !$conferenceStore.isInitiator &&
    !hasAcceptedOnce
  ) {
    conferenceStoreBase.acceptConferenceInvitation(roomId);
    hasAcceptedOnce = true;
  }

  $: if ($conferenceStore?.ended) {
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
    return () => {
      if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
      }
    };
  });

  onDestroy(() => {
    // Cleanup media streams when component unmounts
    if (roomId && $conferenceStore) {
      conferenceStoreBase.cleanupWebRTC(roomId);
    }
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }
  });

  function toggleMute() {
    if ($conferenceStore?.localStream) {
      const audioTracks = $conferenceStore.localStream.getAudioTracks();
      const nextState = !audioEnabled;
      audioTracks.forEach((track: MediaStreamTrack) => {
        track.enabled = nextState;
      });
      audioEnabled = nextState;

      // Broadcast the new media state to all participants
      conferenceStoreBase.sendMediaStateToAll(roomId, videoEnabled, audioEnabled);
    }
  }

  function toggleVideo() {
    if ($conferenceStore?.localStream) {
      const videoTracks = $conferenceStore.localStream.getVideoTracks();
      const nextState = !videoEnabled;
      videoTracks.forEach((track: MediaStreamTrack) => {
        track.enabled = nextState;
      });
      videoEnabled = nextState;

      // Broadcast the new media state to all participants
      conferenceStoreBase.sendMediaStateToAll(roomId, videoEnabled, audioEnabled);
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
    if (roomId && $conferenceStore?.isInitiator) {
      showEndCallDialog = true;
    } else {
      if (roomId) {
        conferenceStoreBase.cleanupWebRTC(roomId);
        conferenceStoreBase.leaveConference(roomId);
      }
      onClose();
    }
  }

  function confirmEndForAll() {
    if (roomId) {
      if (onConferenceEnded) {
        onConferenceEnded(roomId);
      }
      conferenceStoreBase.cleanupWebRTC(roomId);
      conferenceStoreBase.endConferenceForAll(roomId);
    }
    showEndCallDialog = false;
    onClose();
  }

  function confirmJustLeave() {
    if (roomId) {
      conferenceStoreBase.cleanupWebRTC(roomId);
      conferenceStoreBase.leaveConference(roomId);
    }
    showEndCallDialog = false;
    onClose();
  }

  function cancelEndCall() {
    showEndCallDialog = false;
  }
</script>

<svelte:window on:keydown={handleKeyboardShortcuts} />

<div class="fixed inset-0 z-50 bg-black" transition:fade={{ duration: 200 }}>
  <header
    class="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-3 py-3 sm:px-6 sm:py-4"
  >
    <div>
      <h1 class="text-xs font-normal text-white sm:text-sm">Team Conference</h1>
      <p class="text-[10px] text-gray-500 sm:text-xs">{formatTime()}</p>
    </div>
    <div class="flex items-center gap-1 sm:gap-3">
      <button
        on:click={() => (isGridView = !isGridView)}
        class="rounded-lg p-1.5 transition-colors hover:bg-white/10 sm:p-2"
        aria-label="Toggle view"
      >
        <SvgIcon icon="gridView" moreClasses="h-4 w-4 text-white sm:h-5 sm:w-5" />
      </button>
      <button
        class="hidden rounded-lg p-2 transition-colors hover:bg-white/10 sm:block"
        aria-label="Participants"
      >
        <SvgIcon icon="group" moreClasses="h-5 w-5 text-white" />
      </button>
      <button
        on:click={onClose}
        class="rounded-lg p-1.5 transition-colors hover:bg-white/10 sm:p-2"
        aria-label="Close"
      >
        <SvgIcon icon="close" moreClasses="h-4 w-4 text-white sm:h-5 sm:w-5" />
      </button>
    </div>
  </header>

  <div class="h-full w-full p-2 pb-20 pt-14 sm:p-4 sm:pb-24 sm:pt-20">
    {#if isGridView}
      <div class="mx-auto grid h-full max-w-7xl grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
        {#each gridParticipants as participant, index}
          <div
            class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900"
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
            {:else if !participant.isLocal && participant.stream && participant.isConnected && hasVideoEnabled(participant)}
              <video
                use:mediaStream={participant.stream}
                autoplay
                playsinline
                class="absolute inset-0 h-full w-full object-cover"
              >
                <track kind="captions" />
              </video>
            {:else if participant.isLocal || participant.isConnected}
              <div
                class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-600/20 via-blue-600/20 to-teal-600/20"
              >
                <Avatar
                  agentPubKeyB64={participant.pubKey}
                  size={80}
                  moreClasses="sm:w-[120px] sm:h-[120px]"
                />
              </div>
            {:else}
              <div
                class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900"
              >
                <div class="text-center">
                  <div
                    class="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-zinc-700/50 sm:h-32 sm:w-32"
                  >
                    <svg
                      class="h-10 w-10 text-zinc-600 sm:h-16 sm:w-16"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </div>
                  <p class="text-xs text-zinc-500 sm:text-sm">Waiting to join...</p>
                </div>
              </div>
            {/if}

            <!-- Name Badge -->
            <div
              class="absolute bottom-2 left-2 flex items-center gap-1 rounded-lg bg-black/70 px-2 py-1 backdrop-blur-sm sm:bottom-4 sm:left-4 sm:gap-2 sm:px-3 sm:py-2"
            >
              {#if participant.isLocal ? isMuted : !participant.stream || !participant.isConnected}
                <div class="rounded bg-red-500 p-0.5 sm:p-1">
                  <SvgIcon icon="micOff" moreClasses="h-2.5 w-2.5 text-white sm:h-3.5 sm:w-3.5" />
                </div>
              {:else}
                <SvgIcon icon="mic" moreClasses="h-2.5 w-2.5 text-white sm:h-3.5 sm:w-3.5" />
              {/if}
              <span
                class="max-w-[120px] truncate text-[10px] font-medium text-white sm:max-w-none sm:text-sm"
              >
                {getParticipantName(participant.pubKey)}{participant.isLocal ? " (You)" : ""}
              </span>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <!-- Speaker View -->
      <div class="mx-auto flex h-full max-w-7xl flex-col gap-2 sm:flex-row sm:gap-4">
        <!-- Main Speaker -->
        <div
          class="relative flex-1 overflow-hidden rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 sm:rounded-2xl"
        >
          {#if activeParticipant}
            {#if activeParticipant.stream && hasVideoEnabled(activeParticipant)}
              <!-- Remote participant with video -->
              <video
                id="remote-video-main-{activeParticipant.pubKey.slice(0, 10)}"
                use:mediaStream={activeParticipant.stream}
                autoplay
                playsinline
                class="absolute inset-0 h-full w-full object-cover"
              >
                <track kind="captions" />
              </video>
            {:else if activeParticipant.isConnected}
              <!-- Remote participant in call but camera off - show avatar -->
              <div
                class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-600/20 via-blue-600/20 to-teal-600/20"
              >
                <Avatar
                  agentPubKeyB64={activeParticipant.pubKey}
                  size={120}
                  moreClasses="sm:w-[200px] sm:h-[200px]"
                />
              </div>
            {:else}
              <!-- Remote participant not in call yet - show dark background -->
              <div
                class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900"
              >
                <div class="text-center">
                  <div
                    class="mx-auto mb-4 flex h-32 w-32 items-center justify-center rounded-full bg-zinc-700/50 sm:h-48 sm:w-48"
                  >
                    <svg
                      class="h-16 w-16 text-zinc-600 sm:h-24 sm:w-24"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </div>
                  <p class="text-sm text-zinc-500 sm:text-base">Waiting to join...</p>
                </div>
              </div>
            {/if}
            <div
              class="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 backdrop-blur-sm sm:bottom-6 sm:left-6 sm:gap-2 sm:px-4 sm:py-2"
            >
              <svg class="h-3 w-3 text-white sm:h-4 sm:w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                  clip-rule="evenodd"
                />
              </svg>
              <span class="max-w-[200px] truncate text-xs font-medium text-white sm:text-base"
                >{getParticipantName(activeParticipant.pubKey)}</span
              >
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
                class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-600/20 via-blue-600/20 to-teal-600/20"
              >
                <Avatar
                  agentPubKeyB64={myPubKeyB64}
                  size={120}
                  moreClasses="sm:w-[200px] sm:h-[200px]"
                />
              </div>
            {/if}
            <div
              class="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 backdrop-blur-sm sm:bottom-6 sm:left-6 sm:gap-2 sm:px-4 sm:py-2"
            >
              {#if isMuted}
                <div class="rounded bg-red-500 p-0.5 sm:p-1">
                  <svg
                    class="h-3 w-3 text-white sm:h-4 sm:w-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </div>
              {:else}
                <svg
                  class="h-3 w-3 text-white sm:h-4 sm:w-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                    clip-rule="evenodd"
                  />
                </svg>
              {/if}
              <span class="max-w-[200px] truncate text-xs font-medium text-white sm:text-base"
                >{getParticipantName(myPubKeyB64)} (You)</span
              >
            </div>
          {/if}
        </div>

        <!-- Sidebar -->
        <div
          class="flex max-h-32 w-full gap-2 overflow-x-auto sm:max-h-full sm:w-60 sm:flex-col sm:gap-4 sm:overflow-x-visible lg:w-80"
        >
          {#each pipParticipants.slice(0, 3) as participant, index}
            <div
              class="relative min-w-[100px] flex-1 overflow-hidden rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-900 sm:min-w-0 sm:rounded-xl"
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
              {:else if !participant.isLocal && participant.stream && hasVideoEnabled(participant)}
                <!-- Remote participant video enabled -->
                <video
                  id="remote-video-pip-{participant.pubKey.slice(0, 10)}"
                  use:mediaStream={participant.stream}
                  autoplay
                  playsinline
                  class="absolute inset-0 h-full w-full object-cover"
                >
                  <track kind="captions" />
                </video>
              {:else if participant.isLocal || participant.isConnected}
                <!-- Participant in call but camera off - show avatar -->
                <div
                  class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-600/20 via-blue-600/20 to-teal-600/20"
                >
                  <Avatar
                    agentPubKeyB64={participant.pubKey}
                    size={50}
                    moreClasses="sm:w-[80px] sm:h-[80px]"
                  />
                </div>
              {:else}
                <!-- Participant not in call yet - show dark background -->
                <div
                  class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900"
                >
                  <div
                    class="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-700/50 sm:h-20 sm:w-20"
                  >
                    <svg
                      class="h-6 w-6 text-zinc-600 sm:h-10 sm:w-10"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              {/if}
              <div
                class="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-lg bg-black/70 px-1.5 py-1 backdrop-blur-sm sm:bottom-3 sm:left-3 sm:gap-2 sm:px-2.5 sm:py-1.5"
              >
                {#if participant.isLocal ? isMuted : !participant.stream || !participant.isConnected}
                  <div class="rounded bg-red-500 p-0.5">
                    <svg
                      class="h-2 w-2 text-white sm:h-3 sm:w-3"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </div>
                {:else}
                  <svg
                    class="h-2 w-2 text-white sm:h-3 sm:w-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                      clip-rule="evenodd"
                    />
                  </svg>
                {/if}
                <span
                  class="max-w-[60px] truncate text-[9px] font-medium text-white sm:max-w-none sm:text-xs"
                  >{getParticipantName(participant.pubKey).split(" ")[0]}</span
                >
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Bottom Controls -->
  <footer
    class="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-3 py-3 sm:px-8 sm:py-6"
  >
    <div></div>
    <!-- Center: Main Controls -->
    <div class="mx-auto flex items-center gap-2 sm:mx-0 sm:gap-4">
      <button
        on:click={toggleMute}
        class="rounded-full p-3 transition-all sm:p-4 {isMuted
          ? 'bg-red-500 hover:bg-red-600'
          : 'bg-gray-700 hover:bg-gray-600'}"
        aria-label={isMuted ? "Unmute" : "Mute"}
      >
        {#if isMuted}
          <SvgIcon icon="micOff" moreClasses="h-4 w-4 text-white sm:h-5 sm:w-5" />
        {:else}
          <SvgIcon icon="mic" moreClasses="h-4 w-4 text-white sm:h-5 sm:w-5" />
        {/if}
      </button>

      <button
        on:click={toggleVideo}
        class="rounded-full p-3 transition-all sm:p-4 {isVideoEnabled
          ? 'bg-gray-700 hover:bg-gray-600'
          : 'bg-red-500 hover:bg-red-600'}"
        aria-label={isVideoEnabled ? "Stop video" : "Start video"}
      >
        {#if isVideoEnabled}
          <SvgIcon icon="videocam" moreClasses="h-4 w-4 text-white sm:h-5 sm:w-5" />
        {:else}
          <SvgIcon icon="videocamOff" moreClasses="h-4 w-4 text-white sm:h-5 sm:w-5" />
        {/if}
      </button>

      <button
        class="hidden rounded-full bg-gray-700 p-4 transition-all hover:bg-gray-600 sm:block"
        aria-label="Share screen"
      >
        <SvgIcon icon="screenShare" moreClasses="h-5 w-5 text-white" />
      </button>

      <button
        on:click={endCall}
        class="rounded-full bg-red-500 p-3 transition-all hover:bg-red-600 sm:p-4"
        aria-label="End call"
      >
        <SvgIcon icon="callEnd" moreClasses="h-4 w-4 text-white sm:h-5 sm:w-5" />
      </button>
    </div>

    <!-- Right: Secondary Controls -->
    <div class="hidden items-center gap-2 sm:flex sm:gap-3">
      <button
        class="rounded-lg bg-gray-700 p-2 transition-all hover:bg-gray-600 sm:p-2.5"
        aria-label="Participants"
      >
        <SvgIcon icon="group" moreClasses="h-4 w-4 text-white sm:h-5 sm:w-5" />
      </button>
      <button
        class="rounded-lg bg-gray-700 p-2 transition-all hover:bg-gray-600 sm:p-2.5"
        aria-label="Settings"
      >
        <SvgIcon icon="settings" moreClasses="h-4 w-4 text-white sm:h-5 sm:w-5" />
      </button>
    </div>
  </footer>

  <Dialog bind:open={showEndCallDialog} title="End Call Options">
    <div class="flex flex-col items-center gap-4 text-center">
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
        <svg
          class="h-6 w-6 rotate-[135deg] transform text-red-500"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"
          />
        </svg>
      </div>
      <p class="text-secondary-500 dark:text-tertiary-500 text-sm">
        Would you like to end the call for everyone or just leave?
      </p>
    </div>

    <div class="mt-6 flex flex-col gap-3">
      <Button
        moreClasses="w-full !bg-red-600 hover:!bg-red-500 !text-white"
        on:click={confirmEndForAll}
      >
        End Call for All
      </Button>
      <Button
        moreClasses="w-full !bg-blue-600 hover:!bg-blue-500 !text-white"
        on:click={confirmJustLeave}
      >
        Just Leave
      </Button>
      <Button
        moreClasses="w-full !bg-zinc-700 hover:!bg-zinc-600 !text-white"
        on:click={cancelEndCall}
      >
        Cancel
      </Button>
    </div>
  </Dialog>

  <Dialog bind:open={showErrorDialog} title={errorDialogTitle}>
    <div class="flex flex-col items-center gap-4 text-center">
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
        <svg class="h-6 w-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <p class="text-secondary-500 dark:text-tertiary-500 text-sm">
        {errorDialogMessage}
      </p>
    </div>

    <div class="mt-6 flex justify-center">
      <Button
        moreClasses="w-full sm:w-auto !bg-red-600 hover:!bg-red-500 !text-white"
        on:click={handleErrorClose}
      >
        {errorDialogActionLabel}
      </Button>
    </div>
  </Dialog>
</div>
