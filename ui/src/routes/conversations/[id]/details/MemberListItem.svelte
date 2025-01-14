<script lang="ts">
  import Avatar from "$lib/Avatar.svelte";
  import type { CellIdB64 } from "$lib/types";
  import { type ConversationStore, deriveCellConversationStore } from "$store/ConversationStore";
  import { t } from "$translations";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import { getContext } from "svelte";
  import AgentNickname from "$lib/AgentNickname.svelte";

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();

  export let cellIdB64: CellIdB64;
  export let agentPubKeyB64: AgentPubKeyB64;

  let conversation = deriveCellConversationStore(conversationStore, cellIdB64);

  $: isAdmin = agentPubKeyB64 === $conversation.dnaProperties.progenitor;
</script>

<li class="mb-4 flex flex-row items-center px-2 text-xl">
  <Avatar {cellIdB64} {agentPubKeyB64} size={38} />

  <span class="ml-4 flex-1 text-sm font-bold">
    <AgentNickname {cellIdB64} {agentPubKeyB64} />
  </span>

  {#if isAdmin}
    <span class="text-secondary-300 ml-2 text-xs">{$t("common.admin")}</span>
  {/if}

  <slot></slot>
</li>
