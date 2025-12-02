<script lang="ts">
  import { getContext } from "svelte";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import type { CellIdB64, ConferenceLog } from "$lib/types";
  import Avatar from "$lib/Avatar.svelte";
  import AgentNickname from "$lib/AgentNickname.svelte";
  import Time from "svelte-time";

  export let log: ConferenceLog;
  export let cellIdB64: CellIdB64;

  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  $: isInitiator = log.initiator === myPubKeyB64;
  $: isStarted = log.event === "started";

  function formatDuration(seconds?: number): string {
    if (!seconds) return "";

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    if (mins === 0) {
      return `${secs}s`;
    } else if (secs === 0) {
      return `${mins}m`;
    } else {
      return `${mins}m ${secs}s`;
    }
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutesStr = minutes < 10 ? "0" + minutes : minutes;
    return `${hours}:${minutesStr} ${ampm}`;
  }
</script>

<div class="my-2 flex justify-center px-2">
  <div
    class="bg-surface-700/20 dark:bg-surface-800/20 inline-flex w-full max-w-lg items-center justify-center
            gap-1.5 rounded-full px-3 py-1.5 text-xs sm:w-fit sm:gap-2 sm:px-5 sm:py-2 sm:text-sm"
  >
    <!-- Avatar -->
    <div class="flex-shrink-0">
      <Avatar {cellIdB64} agentPubKeyB64={log.initiator} size={20} moreClasses="sm:w-6 sm:h-6" />
    </div>

    <!-- Clock icon -->
    <svg
      class="text-surface-400 h-3 w-3 flex-shrink-0 sm:h-4 sm:w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>

    <!-- Text content -->
    <div class="text-surface-300 flex items-center gap-1 truncate">
      <span class="font-medium">
        {#if isInitiator}
          You
        {:else}
          <AgentNickname {cellIdB64} agentPubKeyB64={log.initiator} />
        {/if}
      </span>

      <span class="hidden sm:inline">
        {isStarted ? "started a conference at" : "ended the conference at"}
      </span>
      <span class="sm:hidden">
        {isStarted ? "started conference" : "ended conference"}
      </span>

      <span class="whitespace-nowrap">{formatTime(log.timestamp)}</span>
    </div>

    <!-- Participant count -->
    <span class="text-surface-500 flex-shrink-0 whitespace-nowrap text-[10px] sm:text-xs">
      ({log.participant_count})
    </span>

    <!-- Duration for ended events -->
    {#if !isStarted && log.duration_seconds}
      <span
        class="text-surface-500 hidden flex-shrink-0 whitespace-nowrap text-[10px] sm:inline sm:text-xs"
      >
        • {formatDuration(log.duration_seconds)}
      </span>
    {/if}
  </div>
</div>
