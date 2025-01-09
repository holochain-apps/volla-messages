<script lang="ts">
  import Avatar from "$lib/Avatar.svelte";
  import type { CellIdB64 } from "$lib/types";
  ("$store/ConversationStore");
  import {
    deriveCellMergedProfileContactInviteListStore,
    type MergedProfileContactInviteStore,
  } from "$store/MergedProfileContactInviteStore";
  import { getContext } from "svelte";
  import type { AgentPubKeyB64 } from "@holochain/client";

  const mergedProfileContactStore = getContext<{ getStore: () => MergedProfileContactInviteStore }>(
    "mergedProfileContactStore",
  ).getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  export let cellIdB64: CellIdB64;

  let mergedProfileContactList = deriveCellMergedProfileContactInviteListStore(
    mergedProfileContactStore,
    cellIdB64,
    myPubKeyB64,
  );
</script>

<div class="flex items-center justify-center gap-4">
  {#each $mergedProfileContactList.slice(1, 3) as [agentPubKeyB64] (agentPubKeyB64)}
    <Avatar {cellIdB64} {agentPubKeyB64} size={120} moreClasses="mb-5 -ml-1" />
  {/each}

  {#if $mergedProfileContactList.length > 3}
    <div
      class="variant-filled-tertiary dark:variant-filled-secondary mb-5 flex h-10 min-h-10 w-10 items-center justify-center rounded-full"
    >
      <span class="text-xl">+{$mergedProfileContactList.length - 3}</span>
    </div>
  {/if}
</div>
