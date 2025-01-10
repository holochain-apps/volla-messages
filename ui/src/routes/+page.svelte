<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { goto } from "$app/navigation";
  import Avatar from "$lib/Avatar.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";
  import ButtonSquare from "$lib/ButtonSquare.svelte";
  import type { ConversationStore } from "$store/ConversationStore";

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  onMount(() => {
    if ($conversationStore.count > 0) {
      goto("/conversations");
    }
  });
</script>

<Header>
  <button slot="left" on:click={() => goto("/account")} class="p-4">
    <Avatar size={24} agentPubKeyB64={myPubKeyB64} />
  </button>

  <ButtonIconBare
    slot="right"
    icon="plusCircle"
    iconSize={24}
    on:click={() => goto("/create")}
    moreClasses="text-primary-600"
    moreClassesButton="p-4"
  />
</Header>

<div class="mx-auto flex w-full grow flex-col items-center justify-center px-10 text-center">
  <SvgIcon icon="hand" moreClasses="w-[48px] h-[48px] text-primary-600" />
  <h1 class="h1 mb-4 mt-12">{$t("common.welcome")}</h1>
  <p class="mb-4">{$t("common.welcome_text_1")}</p>
  <p>{$t("common.welcome_text_2")}</p>
</div>

<div class="mb-8 flex w-full justify-between gap-4 px-4 sm:px-12">
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
