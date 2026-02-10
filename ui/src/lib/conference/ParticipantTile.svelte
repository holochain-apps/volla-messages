<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { t } from "$translations/index";
  import { ConferenceRole } from "$lib/types";
  import Avatar from "$lib/Avatar.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import RoleBadge from "$lib/RoleBadge.svelte";
  import ParticipantActionMenu from "$lib/ParticipantActionMenu.svelte";
  import type { ParticipantData } from "./types";

  export let participant: ParticipantData;
  export let variant: "grid" | "main" | "sidebar" | "pip" = "grid";
  export let localStream: MediaStream | null | undefined = undefined;
  export let isLocalVideoEnabled: boolean = true;
  export let isLocalMuted: boolean = false;
  export let myRole: ConferenceRole | undefined = undefined;
  export let getName: (pubKey: string) => string = () => "Unknown";
  export let canKick: (pubKey: string) => boolean = () => false;
  export let activeMenuPubKey: string | null = null;
  export let cellIdB64: string | undefined = undefined;

  const dispatch = createEventDispatcher<{
    toggleMenu: { pubKey: string };
    promote: { pubKey: string };
    transferHost: { pubKey: string };
    kick: { pubKey: string };
  }>();

  function mediaStream(node: HTMLVideoElement, stream?: MediaStream | null) {
    let currentStream: MediaStream | null | undefined;

    const applyStream = (next?: MediaStream | null) => {
      if (currentStream === next) return;
      currentStream = next ?? null;
      node.srcObject = currentStream ?? null;
      if (currentStream) {
        node.play().catch(() => {
          setTimeout(() => node.play().catch(() => {}), 100);
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

  function hasVideoEnabled(p: ParticipantData): boolean {
    if (!p._stream) return false;
    if (p.videoEnabled !== undefined) return p.videoEnabled;
    const videoTracks = p._stream.getVideoTracks();
    return videoTracks.length > 0 && videoTracks.some((track) => track.enabled);
  }

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

  $: showLocalVideo = participant.isLocal && localStream && isLocalVideoEnabled;
  $: showRemoteVideo = !participant.isLocal && participant._stream && hasVideoEnabled(participant);

  $: showAvatar =
    (participant.isLocal && !showLocalVideo) ||
    (!participant.isLocal && participant.hasJoined && !showRemoteVideo);

  $: showWaiting = !participant.isLocal && !participant.hasJoined && !showRemoteVideo;

  $: isMuted = participant.isLocal
    ? isLocalMuted
    : participant.audioEnabled === false || !participant._stream || !participant._connected;

  $: isConnecting =
    participant.connectionStatus === "connecting" ||
    participant.connectionStatus === "init-sent" ||
    participant.connectionStatus === "init-received" ||
    (!participant.isLocal && participant.hasJoined && !participant._connected);
  $: isFailed = participant.connectionStatus === "failed";
  $: showMenu =
    !participant.isLocal && (myRole === ConferenceRole.Host || myRole === ConferenceRole.CoHost);
  $: isMenuOpen = activeMenuPubKey === participant.pubKey;

  $: avatarSize =
    variant === "main" ? 120 : variant === "pip" ? 40 : variant === "sidebar" ? 48 : 64;
  $: avatarClasses = "";

  $: containerClasses =
    variant === "main"
      ? "relative h-full w-full overflow-hidden rounded-xl bg-gradient-to-br from-secondary-400 to-secondary-500 sm:rounded-2xl"
      : variant === "pip"
        ? "relative aspect-[4/3] h-full w-full overflow-hidden rounded-lg bg-gradient-to-br from-secondary-400 to-secondary-500"
        : variant === "sidebar"
          ? "relative aspect-[4/3] h-full w-full overflow-hidden rounded-lg bg-gradient-to-br from-secondary-400 to-secondary-500 sm:aspect-video sm:rounded-xl"
          : "relative aspect-[4/3] h-full w-full overflow-hidden rounded-xl bg-gradient-to-br from-secondary-400 to-secondary-500 sm:aspect-video sm:rounded-2xl";

  $: displayName = getName(participant.pubKey);
  $: truncatedName = variant === "sidebar" ? displayName.split(" ")[0] : displayName;
</script>

<div class={containerClasses} in:scale={{ duration: 200, start: 0.9 }} out:fade={{ duration: 150 }}>
  {#if showLocalVideo}
    <video
      use:mediaStream={localStream}
      autoplay
      muted
      playsinline
      class="absolute inset-0 h-full w-full object-cover"
      style="transform: scaleX(-1);"
    >
      <track kind="captions" />
    </video>
  {:else if showRemoteVideo}
    <video
      use:mediaStream={participant._stream}
      autoplay
      playsinline
      class="absolute inset-0 h-full w-full object-cover"
    >
      <track kind="captions" />
    </video>
  {:else if showAvatar}
    <div
      class="from-primary-500/10 via-secondary-400 to-secondary-500 absolute inset-0 flex items-center justify-center bg-gradient-to-br"
    >
      <Avatar
        agentPubKeyB64={participant.pubKey}
        size={avatarSize}
        moreClasses={avatarClasses}
        {cellIdB64}
      />
    </div>
  {:else if showWaiting}
    <div class="bg-secondary-500 absolute inset-0 flex items-center justify-center p-2">
      <div class="text-center">
        {#if variant === "main"}
          <div
            class="bg-secondary-400 mx-auto mb-3 flex h-[clamp(80px,20vw,192px)] w-[clamp(80px,20vw,192px)] items-center justify-center rounded-full"
          >
            <SvgIcon
              icon="user"
              moreClasses="h-[clamp(40px,10vw,96px)] w-[clamp(40px,10vw,96px)] text-tertiary-500"
            />
          </div>
          <p class="text-tertiary-500 text-xs sm:text-sm md:text-base">
            {$t("common.conference_waitingToJoin") || "Waiting to join..."}
          </p>
        {:else if variant === "pip"}
          <div
            class="bg-secondary-400 flex h-[clamp(28px,8vw,40px)] w-[clamp(28px,8vw,40px)] items-center justify-center rounded-full"
          >
            <SvgIcon
              icon="user"
              moreClasses="h-[clamp(14px,4vw,20px)] w-[clamp(14px,4vw,20px)] text-tertiary-500"
            />
          </div>
        {:else if variant === "sidebar"}
          <div
            class="bg-secondary-400 flex h-[clamp(40px,12vw,80px)] w-[clamp(40px,12vw,80px)] items-center justify-center rounded-full"
          >
            <SvgIcon
              icon="user"
              moreClasses="h-[clamp(20px,6vw,40px)] w-[clamp(20px,6vw,40px)] text-tertiary-500"
            />
          </div>
        {:else}
          <div
            class="bg-secondary-400 mx-auto mb-1.5 flex h-[clamp(48px,14vw,80px)] w-[clamp(48px,14vw,80px)] items-center justify-center rounded-full sm:mb-2"
          >
            <SvgIcon
              icon="user"
              moreClasses="h-[clamp(24px,7vw,40px)] w-[clamp(24px,7vw,40px)] text-tertiary-500"
            />
          </div>
          <p class="text-tertiary-500 text-[10px] sm:text-xs">
            {$t("common.conference_waiting") || "Waiting..."}
          </p>
        {/if}
      </div>
    </div>
  {/if}

  {#if !participant.isLocal && (isConnecting || isFailed)}
    <div
      class="absolute left-2 top-2 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 backdrop-blur-sm sm:left-3 sm:top-3
        {isFailed ? 'bg-error-500 shadow-lg' : 'bg-secondary-500/80'}"
      transition:fade={{ duration: 150 }}
    >
      {#if isConnecting}
        <div class="relative h-2.5 w-2.5">
          <div class="bg-warning-500/50 absolute inset-0 animate-ping rounded-full"></div>
          <div class="bg-warning-500 relative h-2.5 w-2.5 rounded-full"></div>
        </div>
        <span class="text-tertiary-400 text-[10px] font-medium sm:text-xs">
          {$t("common.conference_statusConnecting")}
        </span>
      {:else if isFailed}
        <SvgIcon icon="alertCircle" moreClasses="h-3 w-3 text-white" />
        <span class="text-[10px] font-medium text-white sm:text-xs">
          {$t("common.conference_statusFailed")}
        </span>
      {/if}
    </div>
  {/if}

  {#if showMenu}
    <div class="absolute right-2 top-2 sm:right-4 sm:top-4">
      <ParticipantActionMenu
        isOpen={isMenuOpen}
        {myRole}
        participantRole={participant.role}
        canKick={canKick(participant.pubKey)}
        on:toggle={() => dispatch("toggleMenu", { pubKey: participant.pubKey })}
        on:promote={() => dispatch("promote", { pubKey: participant.pubKey })}
        on:transferHost={() => dispatch("transferHost", { pubKey: participant.pubKey })}
        on:kick={() => dispatch("kick", { pubKey: participant.pubKey })}
      />
    </div>
  {/if}

  {#if variant === "main"}
    <div
      class="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2 sm:bottom-4 sm:left-4 sm:right-4 md:bottom-6 md:left-6 md:right-6"
    >
      <div
        class="flex max-w-[70%] items-center gap-1.5 rounded-lg bg-black/60 px-2 py-1.5 backdrop-blur-md sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2 md:gap-3 md:px-4 md:py-2.5"
      >
        <div
          class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full sm:h-6 sm:w-6 md:h-8 md:w-8
          {isMuted ? 'bg-error-500' : 'bg-success-500/80'}"
        >
          <SvgIcon
            icon={isMuted ? "micOff" : "mic"}
            moreClasses="h-2.5 w-2.5 text-white sm:h-3 sm:w-3 md:h-4 md:w-4"
          />
        </div>
        <div class="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <span class="truncate text-xs font-semibold text-white sm:text-sm md:text-base">
            {displayName}{participant.isLocal ? " (You)" : ""}
          </span>
          <RoleBadge role={participant.role} size="sm" showIcon />
        </div>
      </div>

      {#if !participant.isLocal && participant.connectionQuality}
        <div
          class="flex flex-shrink-0 items-center gap-1 rounded-md bg-black/60 px-1.5 py-1 backdrop-blur-md sm:gap-1.5 sm:rounded-lg sm:px-2.5 sm:py-1.5"
          title={getQualityLabel(participant.connectionQuality)}
        >
          <div
            class="h-2 w-2 rounded-full sm:h-2.5 sm:w-2.5 {getQualityIndicatorClass(
              participant.connectionQuality,
            )}"
          />
          <span class="text-tertiary-400 hidden text-[10px] sm:inline sm:text-xs"
            >{participant.connectionQuality}</span
          >
        </div>
      {/if}
    </div>
  {:else if variant === "pip"}
    <div class="absolute bottom-1 left-1 right-1 flex items-center justify-between">
      <div
        class="flex h-5 w-5 items-center justify-center rounded-full {isMuted
          ? 'bg-error-500'
          : 'bg-success-500/80'}"
      >
        <SvgIcon icon={isMuted ? "micOff" : "mic"} moreClasses="h-2.5 w-2.5 text-white" />
      </div>
      {#if participant.isLocal}
        <span class="rounded bg-black/60 px-1 py-0.5 text-[8px] font-medium text-white">You</span>
      {/if}
    </div>
  {:else if variant === "sidebar"}
    <div
      class="absolute bottom-1.5 left-1.5 right-1.5 flex items-center sm:bottom-2 sm:left-2 sm:right-2"
    >
      <div
        class="flex items-center gap-1 rounded-lg bg-black/60 px-1.5 py-1 backdrop-blur-md sm:gap-1.5 sm:px-2 sm:py-1.5"
      >
        <div
          class="flex h-4 w-4 items-center justify-center rounded-full sm:h-5 sm:w-5
          {isMuted ? 'bg-error-500' : 'bg-success-500/80'}"
        >
          <SvgIcon
            icon={isMuted ? "micOff" : "mic"}
            moreClasses="h-2 w-2 text-white sm:h-2.5 sm:w-2.5"
          />
        </div>
        <span
          class="max-w-[50px] truncate text-[9px] font-semibold text-white sm:max-w-[80px] sm:text-[10px]"
        >
          {truncatedName}{participant.isLocal ? " (You)" : ""}
        </span>
      </div>
    </div>
  {:else}
    <div
      class="absolute bottom-1.5 left-1.5 right-1.5 flex flex-wrap items-end justify-between gap-1 sm:bottom-2 sm:left-2 sm:right-2 sm:gap-1.5 md:bottom-3 md:left-3 md:right-3"
    >
      <div
        class="flex min-w-0 flex-1 items-center gap-1 rounded-lg bg-black/60 px-1.5 py-1 backdrop-blur-md sm:gap-1.5 sm:px-2 sm:py-1.5 md:rounded-xl md:px-3 md:py-2"
      >
        <div
          class="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full sm:h-5 sm:w-5 md:h-6 md:w-6
          {isMuted ? 'bg-error-500' : 'bg-success-500/80'}"
        >
          <SvgIcon
            icon={isMuted ? "micOff" : "mic"}
            moreClasses="h-2 w-2 text-white sm:h-2.5 sm:w-2.5 md:h-3 md:w-3"
          />
        </div>
        <div class="flex min-w-0 items-center gap-1">
          <span
            class="min-w-0 truncate text-[9px] font-semibold text-white sm:text-[10px] md:text-xs"
          >
            {displayName}{participant.isLocal ? " (You)" : ""}
          </span>
          <RoleBadge role={participant.role} size="sm" />
        </div>
      </div>

      {#if !participant.isLocal && participant.connectionQuality}
        <div
          class="flex flex-shrink-0 items-center gap-0.5 rounded-md bg-black/60 px-1 py-0.5 backdrop-blur-md sm:gap-1 sm:rounded-lg sm:px-1.5 sm:py-1"
          title={getQualityLabel(participant.connectionQuality)}
        >
          <div
            class="h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 {getQualityIndicatorClass(
              participant.connectionQuality,
            )}"
          />
          <span class="text-tertiary-500 hidden text-[8px] sm:inline sm:text-[9px]"
            >{participant.connectionQuality}</span
          >
        </div>
      {/if}
    </div>
  {/if}
</div>
