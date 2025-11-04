<script lang="ts">
  import { onMount, onDestroy, getContext } from "svelte";
  import { fade } from "svelte/transition";
  import type { ConferenceStore } from "$store/ConferenceStore";
  import { type AgentPubKeyB64 } from "@holochain/client";

  export let participants: AgentPubKeyB64[] = [];
  export let isGroupCall: boolean = false;
  export let onClose: () => void;
  export let roomId: string | null = null;

  const conferenceStore = getContext<{ getStore: () => ConferenceStore }>(
    "conferenceStore",
  ).getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  let currentRoomId: string;
  let showControls = true;
  let controlsTimeout: NodeJS.Timeout;
  let localVideo: HTMLVideoElement;
  let conference: any = null;
  let interactionContainer: HTMLDivElement;
  let isInitializing = true;

  $: isMuted = !conference?.localStream
    ?.getAudioTracks()
    .some((track: MediaStreamTrack) => track.enabled);
  $: isVideoEnabled = conference?.localStream
    ?.getVideoTracks()
    .some((track: MediaStreamTrack) => track.enabled);
  $: connectedParticipants = conference?.participants
    ? [...conference.participants.values()].filter((p: any) => p.isConnected).length
    : 0;
  $: gridColumns = isGroupCall ? Math.ceil(Math.sqrt((connectedParticipants || 0) + 1)) : 1;

  onMount(() => {
    const initializeConference = async () => {
      try {
        if (roomId) {
          // joining existing conference
          console.log("Joining existing conference with roomId:", roomId);
          currentRoomId = roomId;
          await conferenceStore.initializeWebRTC(roomId);
          console.log("WebRTC initialized for existing conference");
        } else {
          // creating new conference
          console.log("Creating conference with participants:", participants);
          currentRoomId = await conferenceStore.createConference(participants);
          console.log("Conference room ID:", currentRoomId);
          await conferenceStore.joinConference(currentRoomId, participants);
          console.log("Joined conference room:", currentRoomId);
          // WebRTC will be initialized by SignalHandler when ConferenceJoined is received
          console.log("Waiting for participant to join before initializing WebRTC...");
        }

        // mark initialization as complete after WebRTC setup
        isInitializing = false;

        const unsubscribe = conferenceStore.subscribe((conferences) => {
          const currentConference = conferences.data[currentRoomId];
          if (!currentConference) return;

          conference = currentConference;

          if (conference.localStream && localVideo && !localVideo.srcObject) {
            localVideo.srcObject = conference.localStream;
          }

          // update remote video elements
          if (conference.participants) {
            conference.participants.forEach((participant: any, pubKey: string) => {
              if (pubKey !== myPubKeyB64 && participant.stream) {
                const videoElement = document.querySelector(
                  `[data-participant="${pubKey}"]`,
                ) as HTMLVideoElement;
                if (videoElement) {
                  if (participant.isConnected && !videoElement.srcObject) {
                    videoElement.srcObject = participant.stream;
                  } else if (!participant.isConnected && videoElement.srcObject) {
                    videoElement.srcObject = null;
                  }
                }
              }
            });
          }
        });

        const handleGlobalKeydown = (event: KeyboardEvent) => {
          if (document.activeElement === interactionContainer) {
            switch (event.code) {
              case "Space":
                event.preventDefault();
                handleInteraction();
                break;
              case "KeyM":
                if (event.ctrlKey || event.metaKey) {
                  event.preventDefault();
                  toggleMute();
                }
                break;
              case "KeyV":
                if (event.ctrlKey || event.metaKey) {
                  event.preventDefault();
                  toggleVideo();
                }
                break;
              case "Escape":
                endCall();
                break;
            }
          }
        };

        document.addEventListener("keydown", handleGlobalKeydown);

        return () => {
          document.removeEventListener("keydown", handleGlobalKeydown);
          unsubscribe();
          if (currentRoomId) {
            conferenceStore.cleanupWebRTC(currentRoomId);
            conferenceStore.leaveConference(currentRoomId);
          }
        };
      } catch (error) {
        console.error("Failed to initialize conference:", error);
        onClose();
      }
    };

    initializeConference();
  });

  function handleInteraction() {
    showControls = true;
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
      showControls = false;
    }, 3000);
  }

  function toggleMute() {
    if (conference?.localStream) {
      const audioTracks = conference.localStream.getAudioTracks();
      audioTracks.forEach((track: MediaStreamTrack) => {
        track.enabled = !track.enabled;
      });
    }
  }

  function toggleVideo() {
    if (conference?.localStream) {
      const videoTracks = conference.localStream.getVideoTracks();
      videoTracks.forEach((track: MediaStreamTrack) => {
        track.enabled = !track.enabled;
      });
    }
  }

  function handleErrorClose() {
    if (currentRoomId) {
      conferenceStore.cleanupWebRTC(currentRoomId);
      conferenceStore.leaveConference(currentRoomId);
    }
    onClose();
  }

  function endCall() {
    if (currentRoomId) {
      conferenceStore.cleanupWebRTC(currentRoomId);
      conferenceStore.leaveConference(currentRoomId);
    }
    onClose();
  }
</script>

<main role="application" aria-label="Video conference" class="fixed inset-0 flex flex-col bg-black">
  <div
    bind:this={interactionContainer}
    class="relative flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
    role="button"
    tabindex="0"
    aria-label="Click or press space to toggle controls"
    on:click={handleInteraction}
    on:keydown={(e) => e.code === "Space" && handleInteraction()}
  >
    <section
      class="grid h-full w-full gap-2 p-4"
      style="grid-template-columns: repeat({gridColumns}, 1fr);"
      aria-label="Conference participants"
    >
      <article class="relative overflow-hidden rounded-lg bg-gray-800" aria-label="Your video">
        <video bind:this={localVideo} autoplay muted playsinline class="h-full w-full object-cover">
          <track kind="captions" />
        </video>
        {#if !isVideoEnabled}
          <div
            class="absolute inset-0 flex items-center justify-center bg-gray-800"
            aria-label="Your avatar"
          >
            <div class="text-white text-4xl">You</div>
          </div>
        {/if}
      </article>

      {#each [...(conference?.participants || [])] as [pubKey, participant]}
        {#if pubKey !== myPubKeyB64}
          <article
            class="relative overflow-hidden rounded-lg bg-gray-800"
            aria-label="Participant video"
          >
            {#if participant.stream && participant.isConnected}
              <video
                data-participant={pubKey}
                autoplay
                playsinline
                class="h-full w-full object-cover"
              >
                <track kind="captions" />
              </video>
            {:else}
              <div
                class="absolute inset-0 flex items-center justify-center bg-gray-800"
                aria-label="Participant avatar"
              >
                <div class="text-white text-4xl">Participant</div>
                {#if participant.isConnected === false}
                  <div
                    class="absolute bottom-2 right-2 h-3 w-3 rounded-full bg-red-500"
                    title="Disconnected"
                  ></div>
                {:else}
                  <div
                    class="absolute bottom-2 right-2 h-3 w-3 animate-pulse rounded-full bg-yellow-500"
                    title="Connecting..."
                  ></div>
                {/if}
              </div>
            {/if}
          </article>
        {/if}
      {/each}
    </section>
  </div>

  {#if isInitializing}
    <div class="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div class="rounded-lg bg-gray-900 p-6 text-center text-white">
        <div class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-white"></div>
        <p>Initializing conference...</p>
      </div>
    </div>
  {/if}

  {#if showControls}
    <nav
      class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4"
      transition:fade
      aria-label="Conference controls"
    >
      <div class="flex justify-center space-x-8" role="toolbar" aria-label="Call controls">
        <button
          on:click={toggleMute}
          class="rounded-full bg-gray-700 p-4 text-white hover:bg-gray-600"
          aria-label={isMuted ? "Unmute microphone (Ctrl+M)" : "Mute microphone (Ctrl+M)"}
        >
          {isMuted ? "🔇" : "🎤"}
        </button>
        <button
          on:click={endCall}
          class="rounded-full bg-red-600 p-4 text-white hover:bg-red-500"
          aria-label="End call (Esc)"
        >
          📞
        </button>
        <button
          on:click={toggleVideo}
          class="rounded-full bg-gray-700 p-4 text-white hover:bg-gray-600"
          aria-label={isVideoEnabled ? "Turn off camera (Ctrl+V)" : "Turn on camera (Ctrl+V)"}
        >
          {isVideoEnabled ? "📹" : "🚫"}
        </button>
      </div>
    </nav>
  {/if}

  {#if conference?.error}
    <div class="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div class="rounded-lg bg-gray-900 p-6 text-center text-white">
        <p class="mb-4">Error: {conference.error}</p>
        <button
          on:click={handleErrorClose}
          class="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-500"
        >
          Close
        </button>
      </div>
    </div>
  {/if}
</main>
