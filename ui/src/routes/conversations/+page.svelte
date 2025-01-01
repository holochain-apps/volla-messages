<script lang="ts">
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext } from "svelte";
  import { derived, get } from "svelte/store";
  import { goto } from "$app/navigation";
  import { t } from "$translations";
  import Avatar from "$lib/Avatar.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { RelayStore } from "$store/RelayStore";
  import ConversationSummary from "$lib/ConversationSummary.svelte";
  import type { AgentPubKey } from "@holochain/client";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";

  const relayStore = getContext<{ getStore: () => RelayStore }>("relayStore").getStore();
  const myPubKey = getContext<{ getMyPubKey: () => AgentPubKey }>("myPubKey").getMyPubKey();

  let search = "";

  $: hasArchive = derived(
    relayStore.conversations,
    ($conversations) => $conversations.filter((c) => c.archived).length > 0,
  );
  $: conversationStores = derived(relayStore.conversations, ($conversations) =>
    $conversations
      .filter((c) => {
        const conversationStore = relayStore.conversations.find(
          (conversationStore) =>
            get(conversationStore).conversation.dnaHashB64 === c.conversation.dnaHashB64,
        );
        if (!conversationStore) return false;

        return (
          !c.archived &&
          conversationStore.getTitle().toLocaleLowerCase().includes(search.toLocaleLowerCase())
        );
      })
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt),
  );
  $: conversationStores2 = relayStore.conversations.filter((conversationStore) =>
    $conversationStores.includes(get(conversationStore)),
  );
</script>

<Header>
  <button on:click={() => goto("/account")} class="flex flex-1 items-start">
    <Avatar size={24} agentPubKey={myPubKey} />
  </button>

  <ButtonIconBare on:click={() => goto("/create")} icon="plusCircle" />
</Header>

<div class="mx-auto flex h-full w-full flex-col px-2">
  <div class="relative mb-3 mt-5 flex w-full">
    <input
      type="text"
      class="!bg-tertiary-500 dark:!bg-secondary-500 dark:text-tertiary-500 text-md h-12 w-full rounded-full border-0 pl-10 pr-4"
      placeholder={$t("conversations.search_placeholder")}
      bind:value={search}
    />
    <SvgIcon
      icon="search"
      size={24}
      color={$modeCurrent ? "%232e2e2e" : "%23ccc"}
      moreClasses="absolute top-3 left-3"
    />
  </div>
  <ul class="flex-1">
    {#if $hasArchive}
      <li
        class="hover:bg-tertiary-500 dark:hover:bg-secondary-500 flex items-center rounded-lg py-2"
      >
        <button on:click={() => goto("/conversations/archive")} class="flex w-full items-center">
          <SvgIcon
            icon="archive"
            size={24}
            color={$modeCurrent ? "%232e2e2e" : "%23ccc"}
            moreClasses="ml-4 mr-6"
          />
          Archived
        </button>
      </li>
    {/if}
    {#each conversationStores2 as conversationStore}
      <ConversationSummary {conversationStore}></ConversationSummary>
    {/each}
  </ul>
</div>
