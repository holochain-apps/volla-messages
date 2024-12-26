<script lang="ts">
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext } from "svelte";
  import { derived, get } from "svelte/store";
  import { t } from "$translations";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { RelayStore } from "$store/RelayStore";
  import ConversationSummary from "$lib/ConversationSummary.svelte";

  const relayStoreContext: { getStore: () => RelayStore } = getContext("relayStore");
  let relayStore = relayStoreContext.getStore();

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

<div class="container mx-auto flex h-full flex-col px-2">
  <div class="relative my-2 my-5 w-full">
    <input
      type="text"
      class="text-md !bg-tertiary-500 dark:!bg-secondary-500 dark:text-tertiary-500 h-12 w-full rounded-full border-0 pl-10 pr-4"
      placeholder={$t("conversations.search_placeholder")}
      bind:value={search}
    />
    <SvgIcon
      icon="search"
      size="24"
      color={$modeCurrent ? "%232e2e2e" : "%23ccc"}
      moreClasses="absolute top-3 left-3"
    />
  </div>
  <ul class="flex-1">
    {#each conversationStores2 as conversationStore}
      <ConversationSummary {conversationStore}></ConversationSummary>
    {/each}
  </ul>
</div>
