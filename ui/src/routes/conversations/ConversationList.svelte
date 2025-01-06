<script lang="ts">
  import { getContext } from "svelte";
  import ConversationSummary from "./ConversationSummary.svelte";
  import InputSearch from "$lib/InputSearch.svelte";
  import { deriveConversationListStore, type ConversationStore } from "$store/ConversationStore";
  import type { CellIdB64 } from "$lib/types";

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();

  export let enabled: boolean;

  let conversationList = deriveConversationListStore(conversationStore);
  let searchQuery = "";

  $: searchQueryNormalized = searchQuery.trim().toLocaleLowerCase();
  $: conversationCellIdB64s = $conversationList
    .filter(
      (c) =>
        enabled === c[1].cellInfo.enabled &&
        c[1].title.toLocaleLowerCase().includes(searchQueryNormalized),
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
