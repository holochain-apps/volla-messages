<script lang="ts">
  import Avatar from "$lib/Avatar.svelte";
  import type { CellIdB64 } from "$lib/types";
  import { getContext } from "svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { page } from "$app/stores";
  import {
    type MergedProfileContactInviteJoinedStore,
    deriveCellMergedProfileContactInviteJoinedStore,
  } from "$store/MergedProfileContactInviteJoinedStore";

  const mergedProfileContactInviteJoinedStore = getContext<{
    getStore: () => MergedProfileContactInviteJoinedStore;
  }>("mergedProfileContactInviteJoinedStore").getStore();

  export let cellIdB64: CellIdB64;

  let joined = deriveCellMergedProfileContactInviteJoinedStore(
    mergedProfileContactInviteJoinedStore,
    cellIdB64,
  );
</script>

<div class="relative flex items-center justify-center">
  {#if $joined.count <= 1}
    <span
      class="bg-secondary-300 dark:bg-secondary-400 flex h-10 w-10 items-center justify-center rounded-full"
    >
      <SvgIcon icon="group" />
    </span>
  {:else if $joined.count === 2}
    <Avatar {cellIdB64} agentPubKeyB64={$joined.list[1][0]} size={40} />
  {:else if $joined.count === 3}
    {#each $joined.list.slice(1, 3) as [agentPubKeyB64], i (agentPubKeyB64)}
      <Avatar {cellIdB64} {agentPubKeyB64} size={22} moreClasses={i === 0 ? "" : "-ml-1"} />
    {/each}
  {:else}
    {#each $joined.list.slice(1, 3) as [agentPubKeyB64], i (agentPubKeyB64)}
      <Avatar
        {cellIdB64}
        {agentPubKeyB64}
        size={22}
        moreClasses={i === 0 ? "-mb-2" : "-ml-3 -mt-3"}
      />
    {/each}
    <div
      class="variant-filled-tertiary dark:variant-filled-secondary text-xxs relative -mb-3 -ml-3 flex h-5 w-5 items-center justify-center rounded-full p-2"
    >
      +{$joined.count - 3}
    </div>
  {/if}
</div>
