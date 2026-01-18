<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { fade } from "svelte/transition";
  import { t } from "$translations/index";
  import SvgIcon from "$lib/SvgIcon.svelte";

  export let participantCount: number = 0;
  export let maxParticipants: number = 6;
  export let isGridView: boolean = false;
  export let visible: boolean = true;

  const dispatch = createEventDispatcher<{
    toggleView: void;
    minimize: void;
  }>();

  $: isAtCapacity = participantCount >= maxParticipants;
  $: isNearCapacity = participantCount >= maxParticipants - 1;
  $: capacityClass = isAtCapacity
    ? "text-error-500"
    : isNearCapacity
      ? "text-warning-500"
      : "text-tertiary-400";
  $: iconCapacityClass = isAtCapacity
    ? "text-error-500"
    : isNearCapacity
      ? "text-warning-500"
      : "text-tertiary-400";
</script>

{#if visible}
  <header
    class="from-secondary-500 via-secondary-500/80 absolute left-0 right-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b to-transparent px-4 py-3 sm:px-6 sm:py-4"
    transition:fade={{ duration: 200 }}
  >
    <div class="flex items-center gap-2">
      <div
        class="bg-secondary-400/50 flex items-center gap-1.5 rounded-full px-3 py-1.5 backdrop-blur-sm"
        title={$t("common.conference_participants")}
      >
        <SvgIcon icon="group" moreClasses="h-4 w-4 {iconCapacityClass}" />
        <span class="text-xs font-medium {capacityClass} sm:text-sm">
          {participantCount}/{maxParticipants}
        </span>
      </div>

      {#if isAtCapacity}
        <div
          class="bg-error-500/20 flex items-center gap-1 rounded-full px-2 py-1"
          transition:fade={{ duration: 150 }}
        >
          <SvgIcon icon="alertCircle" moreClasses="h-3 w-3 text-error-500" />
          <span class="text-error-500 text-[10px] font-medium sm:text-xs">Full</span>
        </div>
      {/if}
    </div>

    <div class="flex items-center gap-2 sm:gap-3">
      <button
        on:click={() => dispatch("toggleView")}
        class="bg-secondary-400/50 hover:bg-secondary-400 group flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full px-3 py-2 backdrop-blur-sm transition-all duration-150 active:scale-95 sm:gap-2 sm:px-4"
        aria-label={isGridView
          ? $t("common.conference_switchToSpeaker")
          : $t("common.conference_switchToGrid")}
        title={isGridView
          ? $t("common.conference_switchToSpeaker")
          : $t("common.conference_switchToGrid")}
      >
        <SvgIcon
          icon={isGridView ? "user" : "gridView"}
          moreClasses="h-4 w-4 text-tertiary-400 transition-transform group-hover:scale-110 sm:h-5 sm:w-5"
        />
        <span class="text-tertiary-400 hidden text-xs font-medium sm:inline">
          {isGridView ? $t("common.conference_speaker") : $t("common.conference_grid")}
        </span>
      </button>

      <button
        on:click={() => dispatch("minimize")}
        class="bg-secondary-400/50 hover:bg-secondary-400 group flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-2 backdrop-blur-sm transition-all duration-150 active:scale-95 sm:p-2.5"
        aria-label={$t("common.conference_minimize")}
        title={$t("common.conference_minimize")}
      >
        <SvgIcon
          icon="caretDown"
          moreClasses="h-5 w-5 text-tertiary-400 transition-transform group-hover:translate-y-0.5 sm:h-6 sm:w-6"
        />
      </button>
    </div>
  </header>
{/if}
