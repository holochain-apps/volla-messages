<script lang="ts">
  import { getContext } from "svelte";
  import { goto } from "$app/navigation";
  import Avatar from "$lib/Avatar.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";
  import { type ConversationStore } from "$store/ConversationStore";
  import ConversationList from "./ConversationList.svelte";
  import { t } from "$translations";

  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();
  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();

  $: hasArchivedConversations =
    $conversationStore.list.filter(([, c]) => !c.cellInfo.enabled).length > 0;
</script>

<Header>
  <button slot="left" on:click={() => goto("/account")} class="p-4">
    <Avatar size={24} agentPubKeyB64={myPubKeyB64} />
  </button>

  <ButtonIconBare
    slot="right"
    on:click={() => goto("/create")}
    icon="plusCircle"
    moreClasses="text-primary-600"
    moreClassesButton="p-4"
  />
</Header>

<ConversationList enabled={true}>
  {#if hasArchivedConversations}
    <li class="hover:bg-tertiary-500 dark:hover:bg-secondary-500 flex items-center rounded-lg py-2">
      <button
        on:click={() => goto("/conversations/archive")}
        class="mx-4 flex w-full items-center justify-start space-x-6"
      >
        <SvgIcon icon="archive" />
        <div>{$t("common.archive")}</div>
      </button>
    </li>
  {/if}
</ConversationList>
