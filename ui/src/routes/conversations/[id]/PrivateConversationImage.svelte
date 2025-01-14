<script lang="ts">
  import Avatar from "$lib/Avatar.svelte";
  import type { CellIdB64 } from "$lib/types";
  ("$store/ConversationStore");
  import { getContext } from "svelte";
  import {
    deriveCellMergedProfileContactInviteJoinedStore,
    type MergedProfileContactInviteJoinedStore,
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

<div class="flex items-center justify-center gap-4">
  {#each $joined.list.slice(1, 3) as [agentPubKeyB64] (agentPubKeyB64)}
    <Avatar {cellIdB64} {agentPubKeyB64} size={120} moreClasses="mb-5 -ml-1" />
  {/each}

  {#if $joined.count > 3}
    <div
      class="variant-filled-tertiary dark:variant-filled-secondary mb-5 flex h-10 min-h-10 w-10 items-center justify-center rounded-full"
    >
      <span class="text-xl">+{$joined.count - 3}</span>
    </div>
  {/if}
</div>
