<script lang="ts">
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext } from "svelte";
  import { goto } from "$app/navigation";
  import Avatar from "$lib/Avatar.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";

  import { RelayClient } from "$store/RelayClient";
  import { RelayStore } from "$store/RelayStore";
  import type { AgentPubKey } from "@holochain/client";

  const relayStoreContext: { getStore: () => RelayStore } = getContext("relayStore");
  let relayStore = relayStoreContext.getStore();

  const myPubKey = getContext<{ getMyPubKey: () => AgentPubKey }>("myPubKey").getMyPubKey();

  $: if (relayStore.conversations.length > 0) {
    goto("/conversations");
  }
</script>

<Header>
  <button on:click={() => goto("/account")}>
    <Avatar size={24} agentPubKey={myPubKey} />
  </button>

  <button on:click={() => goto("/create")} class="absolute right-4">
    <SvgIcon icon="plusCircle" size={24} />
  </button>
</Header>

<div class="container mx-auto flex grow flex-col items-center justify-center px-10 text-center">
  <SvgIcon icon="hand" size={48} />
  <h1 class="h1 mb-4 mt-12">{$t("common.welcome")}</h1>
  <p class="mb-4">{$t("common.welcome_text_1")}</p>
  <p>{$t("common.welcome_text_2")}</p>
</div>

<footer class="flex w-full justify-between gap-4 px-10 pb-10">
  <button
    class="bg-tertiary-500 dark:bg-secondary-500 flex h-24 w-28 flex-col items-center rounded-2xl py-2 text-xs disabled:opacity-50"
    on:click={() => goto("/conversations/join")}
  >
    <SvgIcon
      icon="ticket"
      size={32}
      color={$modeCurrent ? "%23FD3524" : "white"}
      moreClasses="flex-grow"
    />
    <p class="">{$t("common.use_invite_code")}</p>
  </button>

  <button
    class="bg-tertiary-500 dark:bg-secondary-500 flex h-24 w-28 flex-col items-center rounded-2xl py-2 text-xs disabled:opacity-50"
    on:click={() => goto("/contacts/new")}
  >
    <SvgIcon
      icon="newPerson"
      size={32}
      color={$modeCurrent ? "%23FD3524" : "white"}
      moreClasses="flex-grow"
    />
    <p>{$t("common.new_contact")}</p>
  </button>

  <button
    class="bg-tertiary-500 dark:bg-secondary-500 flex h-24 w-28 flex-col items-center rounded-2xl py-2 text-xs disabled:opacity-50"
    on:click={() => goto("/conversations/new")}
  >
    <SvgIcon
      icon="people"
      size={32}
      color={$modeCurrent ? "%23FD3524" : "white"}
      moreClasses="flex-grow"
    />
    <p>{$t("common.new_group")}</p>
  </button>
</footer>
