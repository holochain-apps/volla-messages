<script lang="ts">
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext } from "svelte";
  import { derived, get } from "svelte/store";
  import { t } from "$translations";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { RelayStore } from "$store/RelayStore";
  import ConversationSummary from "$lib/ConversationSummary.svelte";

  const relayStoreContext: { getStore: () => RelayStore } =
    getContext("relayStore");
  let relayStore = relayStoreContext.getStore();

  let search = "";

  $: conversations = derived(relayStore.conversations, ($value) => {
    return $value
      .filter(
        (c) =>
          c.archived &&
          c.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())
      )
      .sort((a, b) => get(b.lastActivityAt) - get(a.lastActivityAt));
  });
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
    {#each $conversations as conversation}
      <ConversationSummary store={conversation}></ConversationSummary>
    {/each}
  </ul>
</div>
