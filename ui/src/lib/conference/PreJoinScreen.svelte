<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { t } from "$translations/index";
  import Button from "$lib/Button.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import ConferenceControlButton from "$lib/ConferenceControlButton.svelte";

  export let callerName: string = "";
  export let participantCount: number = 0;

  const dispatch = createEventDispatcher<{
    join: { videoEnabled: boolean; audioEnabled: boolean };
    cancel: void;
  }>();

  let videoEnabled = true;
  let audioEnabled = true;
  let localStream: MediaStream | null = null;
  let videoElement: HTMLVideoElement;
  let audioLevel = 0;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let animationFrameId: number | null = null;
  let devices: MediaDeviceInfo[] = [];
  let selectedVideoDevice = "";
  let selectedAudioDevice = "";
  let isLoadingDevices = true;
  let permissionError = "";

  $: if (videoElement && localStream && videoEnabled) {
    videoElement.srcObject = localStream;
    videoElement.play().catch((e) => console.warn("[PreJoin] Video autoplay failed:", e));
  }

  onMount(async () => {
    await loadDevices();
    await initializeStream();
  });

  onDestroy(() => {
    cleanup();
  });

  async function loadDevices() {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      tempStream.getTracks().forEach((track) => track.stop());

      devices = await navigator.mediaDevices.enumerateDevices();

      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      const audioDevices = devices.filter((d) => d.kind === "audioinput");

      if (videoDevices.length > 0) {
        selectedVideoDevice = videoDevices[0].deviceId;
      }
      if (audioDevices.length > 0) {
        selectedAudioDevice = audioDevices[0].deviceId;
      }

      isLoadingDevices = false;
    } catch (error) {
      console.error("[PreJoin] Error loading devices:", error);
      permissionError = "Camera/microphone permission denied. Please allow access to continue.";
      isLoadingDevices = false;
    }
  }

  async function initializeStream() {
    try {
      cleanup();

      const constraints: MediaStreamConstraints = {
        video: videoEnabled
          ? { deviceId: selectedVideoDevice ? { exact: selectedVideoDevice } : undefined }
          : false,
        audio: audioEnabled
          ? { deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined }
          : false,
      };

      localStream = await navigator.mediaDevices.getUserMedia(constraints);

      if (videoElement && localStream) {
        videoElement.srcObject = localStream;
      }

      if (audioEnabled && localStream) {
        setupAudioMeter(localStream);
      }

      permissionError = "";
    } catch (error) {
      console.error("[PreJoin] Error initializing stream:", error);
      permissionError = "Failed to access camera/microphone. Please check permissions.";
    }
  }

  function setupAudioMeter(stream: MediaStream) {
    try {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      function updateLevel() {
        if (!analyser) return;

        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        audioLevel = Math.min(100, (average / 128) * 100);

        animationFrameId = requestAnimationFrame(updateLevel);
      }

      updateLevel();
    } catch (error) {
      console.error("[PreJoin] Error setting up audio meter:", error);
    }
  }

  function cleanup() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    if (audioContext) {
      audioContext.close();
      audioContext = null;
      analyser = null;
    }

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }

    audioLevel = 0;
  }

  async function toggleVideo() {
    videoEnabled = !videoEnabled;

    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      if (videoEnabled && videoTracks.length === 0) {
        // Need to get a new stream with video
        await initializeStream();
      } else {
        videoTracks.forEach((track) => {
          track.enabled = videoEnabled;
        });
      }
    } else if (videoEnabled) {
      await initializeStream();
    }
  }

  async function toggleAudio() {
    audioEnabled = !audioEnabled;

    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = audioEnabled;
      });

      if (!audioEnabled) {
        audioLevel = 0;
      }
    }
  }

  async function handleDeviceChange(kind: "video" | "audio", deviceId: string) {
    if (kind === "video") {
      selectedVideoDevice = deviceId;
    } else {
      selectedAudioDevice = deviceId;
    }
    await initializeStream();
  }

  function handleJoin() {
    cleanup();
    dispatch("join", { videoEnabled, audioEnabled });
  }

  function handleCancel() {
    cleanup();
    dispatch("cancel");
  }

  $: videoDevices = devices.filter((d) => d.kind === "videoinput");
  $: audioDevices = devices.filter((d) => d.kind === "audioinput");
  $: hasAudio = audioLevel > 5;
</script>

<div
  class="bg-secondary-500/95 fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 backdrop-blur-md sm:p-4"
  transition:fade={{ duration: 200 }}
>
  <div
    class="bg-secondary-400 my-auto w-full max-w-lg rounded-2xl p-4 shadow-2xl sm:rounded-3xl sm:p-6 md:p-8"
    transition:scale={{ duration: 200, start: 0.95 }}
  >
    <div class="mb-4 text-center sm:mb-6">
      <h2 class="text-tertiary-300 text-lg font-bold sm:text-xl md:text-2xl">
        {$t("common.conference_preJoinTitle")}
      </h2>
      {#if callerName}
        <p class="text-tertiary-500 mt-1.5 text-xs sm:mt-2 sm:text-sm">
          {callerName}
          {participantCount > 1 ? `and ${participantCount - 1} others` : ""}
          {$t("common.conference_isCalling")}
        </p>
      {:else}
        <p class="text-tertiary-500 mt-1.5 text-xs sm:mt-2 sm:text-sm">
          {$t("common.conference_preJoinSubtitle")}
        </p>
      {/if}
    </div>

    <div
      class="bg-secondary-500 relative mb-4 aspect-[4/3] w-full overflow-hidden rounded-xl sm:mb-6 sm:aspect-video sm:rounded-2xl"
    >
      {#if videoEnabled && localStream}
        <video
          bind:this={videoElement}
          autoplay
          muted
          playsinline
          class="h-full w-full object-cover"
          style="transform: scaleX(-1);"
        >
          <track kind="captions" />
        </video>
      {:else}
        <div class="flex h-full w-full items-center justify-center">
          <div
            class="bg-secondary-400 flex h-[clamp(64px,18vw,128px)] w-[clamp(64px,18vw,128px)] items-center justify-center rounded-full"
          >
            <SvgIcon
              icon="videocamOff"
              moreClasses="h-[clamp(32px,9vw,64px)] w-[clamp(32px,9vw,64px)] text-tertiary-500"
            />
          </div>
        </div>
      {/if}

      {#if permissionError}
        <div class="bg-secondary-500/90 absolute inset-0 flex items-center justify-center p-4">
          <div class="text-center">
            <SvgIcon icon="alertCircle" moreClasses="mx-auto h-12 w-12 text-error-500" />
            <p class="text-tertiary-400 mt-3 text-sm">{permissionError}</p>
          </div>
        </div>
      {/if}

      {#if isLoadingDevices}
        <div class="bg-secondary-500/90 absolute inset-0 flex items-center justify-center">
          <div class="text-center">
            <SvgIcon icon="spinner" moreClasses="mx-auto h-10 w-10 animate-spin text-primary-500" />
            <p class="text-tertiary-400 mt-3 text-sm">Loading devices...</p>
          </div>
        </div>
      {/if}
    </div>

    <div class="mb-4 sm:mb-6">
      <div class="flex items-center justify-between">
        <span class="text-tertiary-400 text-[10px] font-medium sm:text-xs">
          {$t("common.conference_audioInput")}
        </span>
        <span class="text-[10px] sm:text-xs {hasAudio ? 'text-success-500' : 'text-tertiary-500'}">
          {hasAudio ? $t("common.conference_audioWorking") : $t("common.conference_noAudio")}
        </span>
      </div>
      <div class="bg-secondary-500 mt-1.5 h-1.5 w-full overflow-hidden rounded-full sm:mt-2 sm:h-2">
        <div
          class="h-full rounded-full transition-all duration-75 {hasAudio
            ? 'bg-success-500'
            : 'bg-tertiary-600'}"
          style="width: {audioEnabled ? audioLevel : 0}%"
        />
      </div>
    </div>

    {#if !isLoadingDevices && !permissionError}
      <div class="mb-4 space-y-3 sm:mb-6 sm:space-y-4">
        {#if videoDevices.length > 1}
          <div>
            <label
              for="video-device"
              class="text-tertiary-400 mb-1 block text-[10px] font-medium sm:text-xs"
            >
              {$t("common.conference_videoInput")}
            </label>
            <select
              id="video-device"
              class="bg-secondary-500 text-tertiary-300 focus:ring-primary-500 w-full rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm"
              bind:value={selectedVideoDevice}
              on:change={(e) => handleDeviceChange("video", e.currentTarget.value)}
            >
              {#each videoDevices as device}
                <option value={device.deviceId}>
                  {device.label || `Camera ${videoDevices.indexOf(device) + 1}`}
                </option>
              {/each}
            </select>
          </div>
        {/if}

        {#if audioDevices.length > 1}
          <div>
            <label
              for="audio-device"
              class="text-tertiary-400 mb-1 block text-[10px] font-medium sm:text-xs"
            >
              {$t("common.conference_audioInput")}
            </label>
            <select
              id="audio-device"
              class="bg-secondary-500 text-tertiary-300 focus:ring-primary-500 w-full rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm"
              bind:value={selectedAudioDevice}
              on:change={(e) => handleDeviceChange("audio", e.currentTarget.value)}
            >
              {#each audioDevices as device}
                <option value={device.deviceId}>
                  {device.label || `Microphone ${audioDevices.indexOf(device) + 1}`}
                </option>
              {/each}
            </select>
          </div>
        {/if}
      </div>
    {/if}

    <div class="mb-4 flex justify-center gap-3 sm:mb-6 sm:gap-4">
      <ConferenceControlButton
        icon={audioEnabled ? "mic" : "micOff"}
        active={!audioEnabled}
        label={audioEnabled ? $t("common.conference_mute") : $t("common.conference_unmute")}
        size="md"
        on:click={toggleAudio}
      />
      <ConferenceControlButton
        icon={videoEnabled ? "videocam" : "videocamOff"}
        active={!videoEnabled}
        label={videoEnabled ? $t("common.conference_cameraOn") : $t("common.conference_cameraOff")}
        size="md"
        on:click={toggleVideo}
      />
    </div>

    <div class="flex gap-2 sm:gap-3">
      <Button
        moreClasses="flex-1 !bg-secondary-500 hover:!bg-secondary-300 !text-tertiary-300 !text-xs sm:!text-sm !py-2.5 sm:!py-3"
        on:click={handleCancel}
      >
        {$t("common.cancel")}
      </Button>
      <Button
        moreClasses="flex-1 !bg-success-500 hover:!bg-success-600 !text-white !text-xs sm:!text-sm !py-2.5 sm:!py-3"
        on:click={handleJoin}
        disabled={!!permissionError}
      >
        <div class="flex items-center justify-center gap-1.5 sm:gap-2">
          <SvgIcon icon="phone" moreClasses="h-4 w-4 sm:h-5 sm:w-5" />
          <span>{$t("common.conference_joinCall")}</span>
        </div>
      </Button>
    </div>
  </div>
</div>
