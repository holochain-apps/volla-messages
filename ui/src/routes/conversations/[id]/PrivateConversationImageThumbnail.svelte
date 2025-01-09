<script lang="ts">
  import Avatar from "$lib/Avatar.svelte";
  import type { CellIdB64 } from "$lib/types";
  ("$store/ConversationStore");
  import {
    deriveCellMergedProfileContactInviteStore,
    type MergedProfileContactInviteStore,
  } from "$store/MergedProfileContactInviteStore";
  import { getContext } from "svelte";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import SvgIcon from "$lib/SvgIcon.svelte";

  const mergedProfileContactStore = getContext<{ getStore: () => MergedProfileContactInviteStore }>(
    "mergedProfileContactStore",
  ).getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  export let cellIdB64: CellIdB64;

  let mergedProfileContact = deriveCellMergedProfileContactInviteStore(
    mergedProfileContactStore,
    cellIdB64,
    myPubKeyB64,
  );
</script>

<div class="relative flex items-center justify-center">
  {#if $mergedProfileContact.count <= 1}
    <span
      class="bg-secondary-300 dark:bg-secondary-400 flex h-10 w-10 items-center justify-center rounded-full"
    >
      <SvgIcon icon="group" />
    </span>
  {:else if $mergedProfileContact.count === 2}
    <Avatar {cellIdB64} agentPubKeyB64={$mergedProfileContact.list[1][0]} size={40} />
  {:else if $mergedProfileContact.count === 3}
    {#each $mergedProfileContact.list.slice(1, 3) as [agentPubKeyB64], i (agentPubKeyB64)}
      <Avatar {cellIdB64} {agentPubKeyB64} size={22} moreClasses={i === 0 ? "" : "-ml-1"} />
    {/each}
  {:else}
    {#each $mergedProfileContact.list.slice(1, 3) as [agentPubKeyB64], i (agentPubKeyB64)}
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
      +{$mergedProfileContact.count - 3}
    </div>
  {/if}
</div>
