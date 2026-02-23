<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { scale, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { t } from "$translations/index";
  import { ConferenceRole } from "$lib/types";
  import SvgIcon from "$lib/SvgIcon.svelte";

  export let isOpen: boolean = false;
  export let myRole: ConferenceRole | undefined = undefined;
  export let participantRole: ConferenceRole | undefined = undefined;
  export let canKick: boolean = false;

  const dispatch = createEventDispatcher<{
    toggle: void;
    promote: void;
    transferHost: void;
    kick: void;
  }>();

  $: isHost = myRole === ConferenceRole.Host;
  $: isParticipantMember = participantRole === ConferenceRole.Member;
  $: showPromote = isHost && isParticipantMember;
  $: showTransferHost = isHost;
  $: showKick = canKick;
  $: hasAnyAction = showPromote || showTransferHost || showKick;
</script>

{#if hasAnyAction}
  <div class="relative" transition:fade={{ duration: 150 }}>
    <button
      on:click|stopPropagation={() => dispatch("toggle")}
      class="flex h-8 w-8 items-center justify-center rounded-lg bg-black/40 text-white/80 backdrop-blur-md transition-all duration-200 hover:bg-black/60 hover:text-white active:scale-95"
      aria-label="Participant options"
    >
      <SvgIcon icon="moreVert" moreClasses="h-5 w-5" />
    </button>

    {#if isOpen}
      <div
        class="absolute right-0 top-full z-50 mt-1 min-w-[160px] origin-top-right overflow-hidden rounded-xl bg-secondary-500 shadow-xl ring-1 ring-black/5"
        transition:scale={{ duration: 150, start: 0.9, easing: cubicOut }}
      >
        {#if showPromote}
          <button
            on:click={() => dispatch("promote")}
            class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-tertiary-500 transition-colors hover:bg-secondary-400"
          >
            <SvgIcon icon="star" moreClasses="h-4 w-4" />
            {$t("common.conference_makeCoHost") || "Make Co-Host"}
          </button>
        {/if}

        {#if showTransferHost}
          <button
            on:click={() => dispatch("transferHost")}
            class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-amber-400 transition-colors hover:bg-secondary-400"
          >
            <SvgIcon icon="crown" moreClasses="h-4 w-4" />
            {$t("common.conference_transferHost") || "Transfer Host"}
          </button>
        {/if}

        {#if showKick}
          <button
            on:click={() => dispatch("kick")}
            class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-error-500 transition-colors hover:bg-secondary-400"
          >
            <SvgIcon icon="userRemove" moreClasses="h-4 w-4" />
            {$t("common.conference_removeFromCall") || "Remove from Call"}
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}
