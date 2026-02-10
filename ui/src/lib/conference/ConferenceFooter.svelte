<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { fade } from "svelte/transition";
  import { t } from "$translations/index";
  import ConferenceControlButton from "$lib/ConferenceControlButton.svelte";

  // Props
  export let isMuted: boolean = false;
  export let isVideoEnabled: boolean = true;
  export let callDurationSeconds: number = 0;
  export let visible: boolean = true;
  export let screenShareEnabled: boolean = false; // Future feature flag

  const dispatch = createEventDispatcher<{
    toggleMute: void;
    toggleVideo: void;
    toggleScreenShare: void;
    endCall: void;
  }>();

  // Detect if running on Mac for keyboard shortcut hints
  const isMac = typeof navigator !== "undefined" && navigator.platform?.includes("Mac");

  // Format call duration as HH:MM:SS
  function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  $: formattedDuration = formatTime(callDurationSeconds);
  $: muteLabel = isMuted ? $t("common.conference_unmute") : $t("common.conference_mute");
  $: videoLabel = isVideoEnabled
    ? $t("common.conference_stopVideo")
    : $t("common.conference_startVideo");
  $: muteShortcut = `${muteLabel} (${isMac ? "⌘" : "Ctrl"}+M)`;
  $: videoShortcut = `${videoLabel} (${isMac ? "⌘" : "Ctrl"}+V)`;
</script>

{#if visible}
  <footer
    class="from-secondary-500 via-secondary-500/95 absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t to-transparent px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 sm:px-4 sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pt-10 md:px-8"
    transition:fade={{ duration: 200 }}
  >
    <div class="mx-auto flex max-w-lg items-center justify-center gap-2 sm:gap-4 md:gap-6">
      <div
        class="bg-secondary-400/30 flex items-center gap-2 rounded-full p-1 backdrop-blur-sm sm:gap-3 sm:p-1.5 md:gap-4 md:p-2"
      >
        <ConferenceControlButton
          icon={isMuted ? "micOff" : "mic"}
          active={isMuted}
          label={muteLabel}
          title={muteShortcut}
          on:click={() => dispatch("toggleMute")}
        />

        <ConferenceControlButton
          icon={isVideoEnabled ? "videocam" : "videocamOff"}
          active={!isVideoEnabled}
          label={videoLabel}
          title={videoShortcut}
          on:click={() => dispatch("toggleVideo")}
        />

        <div class="hidden sm:block">
          <ConferenceControlButton
            icon="screenShare"
            disabled={!screenShareEnabled}
            label={screenShareEnabled ? "Share Screen" : $t("common.conference_comingSoon")}
            title={screenShareEnabled ? "Share Screen" : $t("common.conference_comingSoon")}
            on:click={() => dispatch("toggleScreenShare")}
          />
        </div>
      </div>

      <ConferenceControlButton
        icon="callEnd"
        variant="danger"
        size="lg"
        label={$t("common.conference_endCall")}
        title="{$t('common.conference_endCall')} (Esc)"
        on:click={() => dispatch("endCall")}
      />
    </div>

    <div class="mt-2 flex justify-center sm:mt-3 md:mt-4">
      <div class="bg-secondary-400/50 rounded-full px-2.5 py-0.5 backdrop-blur-sm sm:px-3 sm:py-1">
        <p class="text-tertiary-400 text-[11px] font-medium tabular-nums sm:text-xs md:text-sm">
          {formattedDuration}
        </p>
      </div>
    </div>
  </footer>
{/if}
