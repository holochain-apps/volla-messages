<script lang="ts">
  import { Privacy, type CellIdB64 } from "$lib/types";
  import { getContext } from "svelte";
  import { type ConversationStore, deriveCellConversationStore } from "$store/ConversationStore";
  import PrivateConversationImage from "./PrivateConversationImage.svelte";
  import {
    type ConversationTitleStore,
    deriveCellConversationTitleStore,
  } from "$store/ConversationTitleStore";

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();
  const conversationTitleStore = getContext<{
    getStore: () => ConversationTitleStore;
  }>("conversationTitleStore").getStore();

  export let cellIdB64: CellIdB64;

  let conversation = deriveCellConversationStore(conversationStore, cellIdB64);
  let conversationTitle = deriveCellConversationTitleStore(conversationTitleStore, cellIdB64);
</script>

<div class="flex flex-col items-center">
  {#if $conversation.dnaProperties.privacy === Privacy.Private}
    <PrivateConversationImage {cellIdB64} />
  {:else if $conversation.config?.image}
    <img
      src={$conversation.config.image}
      alt="Conversation"
      class="mb-5 h-32 min-h-32 w-32 rounded-full object-cover"
    />
  {/if}

  <h1 class="b-1 break-all text-3xl">{$conversationTitle}</h1>
</div>
