<script lang="ts">
  import { onMount, onDestroy, getContext } from "svelte";
  import { fade } from "svelte/transition";
  import type { ConferenceStore } from "$store/ConferenceStore";
  import { type AgentPubKeyB64 } from "@holochain/client";
  import Avatar from "$lib/Avatar.svelte";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";
  import { t } from "$translations";
  import Button from "$lib/Button.svelte";

  export let participants: AgentPubKeyB64[] = [];
  export let isGroupCall: boolean = false;
  export let title: string = "";
  export let onClose: () => void;

  const conferenceStore = getContext<{ getStore: () => ConferenceStore }>(
    "conferenceStore",
  ).getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  let roomId: string;
  let showControls = true;
  let controlsTimeout: NodeJS.Timeout;
  let isMuted = false;
  let isVideoEnabled = true;
  let localVideo: HTMLVideoElement;
  let conference: any;
  let interactionContainer: HTMLDivElement;

  onMount(() => {
    const initializeConference = async () => {
      try {
        console.log("Creating conference with participants:", participants);
        roomId = await conferenceStore.createConference(title, participants);
        console.log("Conference room ID:", roomId);
        await conferenceStore.joinConference(roomId);
        console.log("Joined conference room:", roomId);
        await conferenceStore.initializeWebRTC(roomId);

        const unsubscribe = conferenceStore.subscribe((conferences) => {
          conference = conferences.data[roomId];

          if (conference?.localStream && localVideo) {
            localVideo.srcObject = conference.localStream;
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
          if (roomId) {
            conferenceStore.cleanupWebRTC(roomId);
            conferenceStore.leaveConference(roomId);
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
      conference.localStream.getAudioTracks().forEach((track: MediaStreamTrack) => {
        track.enabled = !track.enabled;
      });
      isMuted = !isMuted;
    }
  }

  function toggleVideo() {
    if (conference?.localStream) {
      conference.localStream.getVideoTracks().forEach((track: MediaStreamTrack) => {
        track.enabled = !track.enabled;
      });
      isVideoEnabled = !isVideoEnabled;
    }
  }

  function endCall() {
    if (roomId) {
      conferenceStore.leaveConference(roomId);
    }
    onClose();
  }

  $: gridColumns = isGroupCall ? Math.ceil(Math.sqrt(participants.length + 1)) : 1;
</script>

<main
  role="application"
  aria-label="Video conference {title}"
  class="fixed inset-0 flex flex-col bg-black"
>
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
        <video
          bind:this={localVideo}
          autoplay
          muted
          playsinline
          class="h-full w-full object-cover"
        />
        {#if !isVideoEnabled}
          <div class="absolute inset-0 flex items-center justify-center" aria-label="Your avatar">
            <Avatar size={64} agentPubKeyB64={myPubKeyB64} />
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
                src={participant.stream}
                autoplay
                playsinline
                class="h-full w-full object-cover"
              >
                <track kind="captions" />
              </video>
            {:else}
              <div
                class="absolute inset-0 flex items-center justify-center"
                aria-label="Participant avatar"
              >
                <Avatar size={64} agentPubKeyB64={pubKey} />
              </div>
            {/if}
          </article>
        {/if}
      {/each}
    </section>
  </div>

  {#if showControls}
    <nav
      class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4"
      transition:fade
      aria-label="Conference controls"
    >
      <div class="flex justify-center space-x-8" role="toolbar" aria-label="Call controls">
        <!-- <ButtonIconBare
          icon={isMuted ? "microphoneOff" : "microphone"}
          on:click={toggleMute}
          moreClasses="text-white"
          aria-label={isMuted ? "Unmute microphone (Ctrl+M)" : "Mute microphone (Ctrl+M)"}
        />
        <ButtonIconBare
          icon="phoneOff"
          on:click={endCall}
          moreClasses="text-red-500"
          aria-label="End call (Esc)"
        />
        <ButtonIconBare
          icon={isVideoEnabled ? "video" : "videoOff"}
          on:click={toggleVideo}
          moreClasses="text-white"
          aria-label={isVideoEnabled ? "Turn off camera (Ctrl+V)" : "Turn on camera (Ctrl+V)"}
        /> -->
        <Button on:click={toggleMute}>
          {isMuted ? "Unmute" : "Mute"}
        </Button>
        <Button on:click={endCall}>End Call</Button>
        <Button on:click={toggleVideo}>
          {isVideoEnabled ? "Turn off camera" : "Turn on camera"}
        </Button>
      </div>
    </nav>
  {/if}
</main>
