<script lang="ts">
  import { goto } from "$app/navigation";
  import ButtonInline from "$lib/ButtonInline.svelte";
  import { deriveAgentContactStore, type ContactStore } from "$store/ContactStore";
  import { t } from "$translations";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import Avatar from "$lib/Avatar.svelte";
  import { getContext, onDestroy, onMount } from "svelte";
  import toast from "svelte-french-toast";
  import { deriveCellConversationStore, type ConversationStore } from "$store/ConversationStore";
  import { deriveCellProfileStore, type ProfileStore } from "$store/ProfileStore";
  import { encodeCellIdToBase64 } from "./utils";
  import { POLLING_INTERVAL_SLOW } from "$config";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";

  const contactStore = getContext<{ getStore: () => ContactStore }>("contactStore").getStore();
  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();
  const profileStore = getContext<{ getStore: () => ProfileStore }>("profileStore").getStore();

  export let agentPubKeyB64: AgentPubKeyB64;
  export let selected: boolean = false;

  let contact = deriveAgentContactStore(contactStore, agentPubKeyB64);
  let profiles =
    $contact.cellId !== undefined
      ? deriveCellProfileStore(profileStore, encodeCellIdToBase64($contact.cellId))
      : undefined;

  let pollInterval: NodeJS.Timeout;
  $: hasAgentJoinedDht =
    profiles !== undefined &&
    $profiles?.list.find(([key]) => key === $contact.publicKeyB64) !== undefined;

  async function loadProfiles() {
    console.log("Running loadProfiles");
    if (!profiles) return;

    await profiles.load();
    if (!hasAgentJoinedDht) {
      pollInterval = setTimeout(() => {
        loadProfiles();
      }, POLLING_INTERVAL_SLOW);
    }
  }

  onMount(() => {
    loadProfiles();
  });

  async function handleDelete(event: MouseEvent) {
    try {
      event.stopPropagation();
      await contact.delete();
    } catch (err) {
      console.error(err);
      toast.error($t("common.delete_contact_error"));
    }
  }
  onDestroy(() => clearInterval(pollInterval));
</script>

<button
  class="-ml-1 mb-2 flex w-full items-center justify-between rounded-3xl py-1 pl-1 pr-2 {selected &&
    'bg-tertiary-500 dark:bg-secondary-500'}"
  on:click
>
  <div class="flex flex-1 items-center">
    <Avatar size={38} agentPubKeyB64={$contact.publicKeyB64} moreClasses="mr-3" />
    <p
      class="dark:text-tertiary-100 flex-1 text-start font-bold {hasAgentJoinedDht
        ? 'text-secondary-400 dark:!text-secondary-300'
        : ''}"
    >
      {$contact.fullName}
      {#if hasAgentJoinedDht}
        <span class="text-secondary-400 ml-1 text-xs">{$t("create.unconfirmed")}</span>
      {/if}
    </p>
  </div>
  <div class="flex items-center space-x-2">
    {#if selected}
      <ButtonInline
        on:click={() => goto("/contacts/" + $contact.publicKeyB64)}
        moreClasses="dark:bg-secondary-700 "
      >
        {$t("create.view")}
      </ButtonInline>
    {:else}
      <span class="text-primary-500 text-lg font-extrabold">+</span>
      <ButtonIconBare
        icon="delete"
        on:click={handleDelete}
        moreClasses="h-5 w-5 text-primary-500 transition-opacity hover:opacity-75"
      />
    {/if}
  </div>
</button>
