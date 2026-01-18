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
    variant === "main" ? 120 : variant === "pip" ? 40 : variant === "sidebar" ? 50 : 60;
  $: avatarClasses =
    variant === "main"
      ? "sm:w-[200px] sm:h-[200px]"
      : variant === "pip"
        ? "sm:w-[60px] sm:h-[60px]"
        : variant === "sidebar"
          ? "sm:w-[80px] sm:h-[80px]"
          : "sm:w-[80px] sm:h-[80px]";

  $: containerClasses =
    variant === "main"
      ? "relative flex-1 overflow-hidden rounded-xl bg-gradient-to-br from-secondary-400 to-secondary-500 sm:rounded-2xl"
      : variant === "pip"
        ? "relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-secondary-400 to-secondary-500"
        : variant === "sidebar"
          ? "relative min-w-[100px] aspect-square flex-1 overflow-hidden rounded-lg bg-gradient-to-br from-secondary-400 to-secondary-500 sm:min-w-0 sm:aspect-video sm:rounded-xl"
          : "relative aspect-video overflow-hidden rounded-2xl bg-gradient-to-br from-secondary-400 to-secondary-500";

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
    <div class="bg-secondary-500 absolute inset-0 flex items-center justify-center">
      <div class="text-center">
        {#if variant === "main"}
          <div
            class="bg-secondary-400 mx-auto mb-4 flex h-32 w-32 items-center justify-center rounded-full sm:h-48 sm:w-48"
          >
            <SvgIcon icon="user" moreClasses="h-16 w-16 text-tertiary-500 sm:h-24 sm:w-24" />
          </div>
          <p class="text-tertiary-500 text-sm sm:text-base">
            {$t("common.conference_waitingToJoin") || "Waiting to join..."}
          </p>
        {:else if variant === "pip"}
          <div class="bg-secondary-400 flex h-10 w-10 items-center justify-center rounded-full">
            <SvgIcon icon="user" moreClasses="h-5 w-5 text-tertiary-500" />
          </div>
        {:else if variant === "sidebar"}
          <div
            class="bg-secondary-400 flex h-12 w-12 items-center justify-center rounded-full sm:h-20 sm:w-20"
          >
            <SvgIcon icon="user" moreClasses="h-6 w-6 text-tertiary-500 sm:h-10 sm:w-10" />
          </div>
        {:else}
          <div
            class="bg-secondary-400 mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full sm:h-20 sm:w-20"
          >
            <SvgIcon icon="user" moreClasses="h-7 w-7 text-tertiary-500 sm:h-10 sm:w-10" />
          </div>
          <p class="text-tertiary-500 text-xs">{$t("common.conference_waiting") || "Waiting..."}</p>
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
      class="absolute bottom-4 left-4 right-4 flex items-center justify-between sm:bottom-6 sm:left-6 sm:right-6"
    >
      <div
        class="flex items-center gap-2 rounded-xl bg-black/60 px-3 py-2 backdrop-blur-md sm:gap-3 sm:px-4 sm:py-2.5"
      >
        <div
          class="flex h-6 w-6 items-center justify-center rounded-full sm:h-8 sm:w-8
          {isMuted ? 'bg-error-500' : 'bg-success-500/80'}"
        >
          <SvgIcon
            icon={isMuted ? "micOff" : "mic"}
            moreClasses="h-3 w-3 text-white sm:h-4 sm:w-4"
          />
        </div>
        <div class="flex items-center gap-2">
          <span
            class="max-w-[150px] truncate text-sm font-semibold text-white sm:max-w-[250px] sm:text-base"
          >
            {displayName}{participant.isLocal ? " (You)" : ""}
          </span>
          <RoleBadge role={participant.role} size="md" showIcon />
        </div>
      </div>

      {#if !participant.isLocal && participant.connectionQuality}
        <div
          class="flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1.5 backdrop-blur-md"
          title={getQualityLabel(participant.connectionQuality)}
        >
          <div
            class="h-2.5 w-2.5 rounded-full {getQualityIndicatorClass(
              participant.connectionQuality,
            )}"
          />
          <span class="text-tertiary-400 text-xs">{participant.connectionQuality}</span>
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
      class="absolute bottom-2 left-2 right-2 flex items-center justify-between sm:bottom-4 sm:left-4 sm:right-4"
    >
      <div
        class="flex items-center gap-1.5 rounded-xl bg-black/60 px-2 py-1.5 backdrop-blur-md sm:gap-2 sm:px-3 sm:py-2"
      >
        <div
          class="flex h-5 w-5 items-center justify-center rounded-full sm:h-6 sm:w-6
          {isMuted ? 'bg-error-500' : 'bg-success-500/80'}"
        >
          <SvgIcon
            icon={isMuted ? "micOff" : "mic"}
            moreClasses="h-2.5 w-2.5 text-white sm:h-3 sm:w-3"
          />
        </div>
        <div class="flex flex-col">
          <div class="flex items-center gap-1">
            <span
              class="max-w-[80px] truncate text-[10px] font-semibold text-white sm:max-w-[120px] sm:text-xs"
            >
              {displayName}{participant.isLocal ? " (You)" : ""}
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
            class="h-2 w-2 rounded-full {getQualityIndicatorClass(participant.connectionQuality)}"
          />
          <span class="text-tertiary-500 hidden text-[9px] sm:inline"
            >{participant.connectionQuality}</span
          >
        </div>
      {/if}
    </div>
  {/if}
</div>
