<script lang="ts">
  import { getContext } from "svelte";
  import { derived, get } from "svelte/store";
  import { goto } from "$app/navigation";
  import Avatar from "$lib/Avatar.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { RelayStore } from "$store/RelayStore";
  import ConversationSummary from "./ConversationSummary.svelte";
  import type { AgentPubKey } from "@holochain/client";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";
  import InputSearch from "$lib/InputSearch.svelte";

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
  <button slot="left" on:click={() => goto("/account")}>
    <Avatar size={24} agentPubKey={myPubKey} />
  </button>

  <ButtonIconBare
    slot="right"
    on:click={() => goto("/create")}
    icon="plusCircle"
    moreClasses="text-primary-600"
  />
</Header>

<div class="mx-auto flex h-full w-full flex-col px-2">
  <InputSearch bind:value={search} />

  <ul class="flex-1">
    {#if $hasArchive}
      <li
        class="hover:bg-tertiary-500 dark:hover:bg-secondary-500 flex items-center rounded-lg py-2"
      >
        <button
          on:click={() => goto("/conversations/archive")}
          class="mx-4 flex w-full items-center justify-start space-x-6"
        >
          <SvgIcon icon="archive" />
          <div>Archived</div>
        </button>
      </li>
    {/if}
    {#each conversationStores2 as conversationStore}
      <ConversationSummary {conversationStore} />
    {/each}
  </ul>
</div>
