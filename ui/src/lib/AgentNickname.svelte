<script lang="ts">
  import type { CellIdB64 } from "$lib/types";
  import {
    deriveCellMergedProfileContactInviteStore,
    type MergedProfileContactInviteStore,
  } from "$store/MergedProfileContactInviteStore";
  import { t } from "$translations";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import { getContext } from "svelte";

  const mergedProfileContactInviteStore = getContext<{
    getStore: () => MergedProfileContactInviteStore;
  }>("mergedProfileContactInviteStore").getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  export let agentPubKeyB64: AgentPubKeyB64;
  export let cellIdB64: CellIdB64;

  let profile = deriveCellMergedProfileContactInviteStore(
    mergedProfileContactInviteStore,
    cellIdB64,
    myPubKeyB64,
  );

  $: isMe = agentPubKeyB64 === myPubKeyB64;
  $: nickname =
    $profile.data[agentPubKeyB64] !== undefined
      ? $profile.data[agentPubKeyB64].profile.nickname
      : undefined;
  $: agentPubKeyB64Sliced = agentPubKeyB64.slice(4, 14);
</script>

<div>
  {#if isMe}
    <span class="font-bold">{$t("common.you")}</span>
  {:else if nickname !== undefined}
    <span class="font-bold">{nickname}</span>
  {:else}
    <span><code>{agentPubKeyB64Sliced}</code>...</span>
  {/if}
</div>
