<script lang="ts">
  import { getContext } from "svelte";
  import { derived, get } from "svelte/store";
  import { t } from "$translations";
  import Header from "$lib/Header.svelte";
  import { RelayStore } from "$store/RelayStore";
  import ConversationSummary from "../ConversationSummary.svelte";
  import InputSearch from "$lib/InputSearch.svelte";

  const relayStore = getContext<{ getStore: () => RelayStore }>("relayStore").getStore();

  let search = "";

  $: conversationStores = derived(relayStore.conversations, ($conversations) =>
    $conversations
      .filter((c) => {
        const conversationStore = relayStore.conversations.find(
          (conversationStore) =>
            get(conversationStore).conversation.dnaHashB64 === c.conversation.dnaHashB64,
        );
        if (!conversationStore) return false;

        return (
          c.archived &&
          conversationStore.getTitle().toLocaleLowerCase().includes(search.toLocaleLowerCase())
        );
      })
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt),
  );
  $: conversationStores2 = relayStore.conversations.filter((conversationStore) =>
    $conversationStores.includes(get(conversationStore)),
  );
</script>

<Header backUrl="/conversations" title={$t("conversations.archive")}></Header>

<div class="mx-auto flex h-full w-full flex-col px-2">
  <InputSearch bind:value={search} />

  <ul class="flex-1">
    {#each conversationStores2 as conversationStore}
      <ConversationSummary {conversationStore} />
    {/each}
  </ul>
</div>
