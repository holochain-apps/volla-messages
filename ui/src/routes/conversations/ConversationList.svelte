<script lang="ts">
  import { getContext } from "svelte";
  import ConversationSummary from "./ConversationSummary.svelte";
  import InputSearch from "$lib/InputSearch.svelte";
  import { type ConversationStore } from "$store/ConversationStore";
  import type { ConversationTitleStore } from "$store/ConversationTitleStore";
  import type { ConversationLatestMessageStore } from "$store/ConversationLatestMessageStore";

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();
  const conversationLatestMessageStore = getContext<{
    getStore: () => ConversationLatestMessageStore;
  }>("conversationLatestMessageStore").getStore();
  const conversationTitleStore = getContext<{ getStore: () => ConversationTitleStore }>(
    "conversationTitleStore",
  ).getStore();

  export let enabled: boolean;

  let searchQuery = "";

  $: searchQueryNormalized = searchQuery.trim().toLocaleLowerCase();
  $: conversationCellIdB64s = $conversationLatestMessageStore.list
    .filter(
      ([cellIdB64]) =>
        enabled === $conversationStore.data[cellIdB64].cellInfo.enabled &&
        $conversationTitleStore[cellIdB64].toLocaleLowerCase().includes(searchQueryNormalized),
    )
    .map((c) => c[0]);
</script>

<div class="mx-auto flex h-full w-full flex-col px-2">
  <InputSearch bind:value={searchQuery} />

  <slot></slot>

  <ul class="flex-1">
    {#each conversationCellIdB64s as cellIdB64 (cellIdB64)}
      <ConversationSummary {cellIdB64} />
    {/each}
  </ul>
</div>
