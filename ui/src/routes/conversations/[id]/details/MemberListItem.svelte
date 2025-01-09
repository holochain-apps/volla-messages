<script lang="ts">
  import Avatar from "$lib/Avatar.svelte";
  import type { CellIdB64 } from "$lib/types";
  import type { ContactStore } from "$store/ContactStore";
  import { type ConversationStore, deriveCellConversationStore } from "$store/ConversationStore";
  import {
    type MergedProfileContactInviteStore,
    deriveCellMergedProfileContactInviteStore,
  } from "$store/MergedProfileContactInviteStore";
  import { t } from "$translations";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import { getContext } from "svelte";

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();
  const mergedProfileContactStore = getContext<{ getStore: () => MergedProfileContactInviteStore }>(
    "mergedProfileContactStore",
  ).getStore();
  const contactStore = getContext<{ getStore: () => ContactStore }>("contactStore").getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  export let cellIdB64: CellIdB64;
  export let agentPubKeyB64: AgentPubKeyB64;

  let conversation = deriveCellConversationStore(conversationStore, cellIdB64);
  let mergedProfileContact = deriveCellMergedProfileContactInviteStore(
    mergedProfileContactStore,
    cellIdB64,
  );

  $: isAdmin = agentPubKeyB64 === $conversation.conversation.dnaProperties.progenitor;
  $: isMe = agentPubKeyB64 === myPubKeyB64;
</script>

<li class="mb-4 flex flex-row items-center px-2 text-xl">
  <Avatar {cellIdB64} {agentPubKeyB64} size={38} />

  <span class="ml-4 flex-1 text-sm font-bold">
    {#if isMe}
      {$t("common.you")}
    {:else if $mergedProfileContact[agentPubKeyB64] !== undefined}
      {$mergedProfileContact[agentPubKeyB64].profile.nickname}
    {:else if $contactStore[agentPubKeyB64] !== undefined}
      {$contactStore[agentPubKeyB64].fullName}
    {/if}
  </span>

  {#if isAdmin}
    <span class="text-secondary-300 ml-2 text-xs">{$t("common.admin")}</span>
  {/if}

  <slot></slot>
</li>
