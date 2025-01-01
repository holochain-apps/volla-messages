<script lang="ts">
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext } from "svelte";
  import { goto } from "$app/navigation";
  import Avatar from "$lib/Avatar.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { RelayStore } from "$store/RelayStore";
  import type { AgentPubKey } from "@holochain/client";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";
  import ButtonSquare from "$lib/ButtonSquare.svelte";

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

  <ButtonIconBare
    icon="plusCircle"
    on:click={() => goto("/create")}
    moreClasses="absolute right-4"
  />
</Header>

<div class="mx-auto flex w-full grow flex-col items-center justify-center px-10 text-center">
  <SvgIcon icon="hand" size={48} />
  <h1 class="h1 mb-4 mt-12">{$t("common.welcome")}</h1>
  <p class="mb-4">{$t("common.welcome_text_1")}</p>
  <p>{$t("common.welcome_text_2")}</p>
</div>

<div class="mb-8 flex w-full justify-between gap-4 px-12">
  <ButtonSquare
    on:click={() => goto("/conversations/join")}
    icon="ticket"
    label={$t("common.use_invite_code")}
  />

  <ButtonSquare
    on:click={() => goto("/contacts/new")}
    icon="newPerson"
    label={$t("common.new_contact")}
  />

  <ButtonSquare
    on:click={() => goto("/conversations/new")}
    icon="people"
    label={$t("common.new_group")}
  />
</div>
