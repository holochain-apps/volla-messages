<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import Button from "$lib/Button.svelte";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";
  import ButtonsCopyShareIcon from "$lib/ButtonsCopyShareIcon.svelte";
  import Header from "$lib/Header.svelte";
  import { deriveAgentContactStore, type ContactStore } from "$store/ContactStore";
  import { getContext, onDestroy, onMount } from "svelte";
  import { t } from "$translations";
  import Avatar from "$lib/Avatar.svelte";
  import { deriveCellConversationStore, type ConversationStore } from "$store/ConversationStore";
  import { encodeCellIdToBase64 } from "$lib/utils";
  import {
    deriveCellProfileStore,
    type CellProfileStore,
    type ProfileStore,
  } from "$store/ProfileStore";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import { POLLING_INTERVAL_SLOW } from "$config";
  import NoticeContactNotJoined from "$lib/NoticeContactNotJoined.svelte";
  import Dialog from "$lib/Dialog.svelte";
  import toast from "svelte-french-toast";

  const contactStore = getContext<{ getStore: () => ContactStore }>("contactStore").getStore();
  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();
  const provisionedRelayCellProfileStore = getContext<{
    getProvisionedRelayCellProfileStore: () => CellProfileStore;
  }>("profileStore").getProvisionedRelayCellProfileStore();
  const profileStore = getContext<{ getStore: () => ProfileStore }>("profileStore").getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  let isLoading = true;
  let isDeletingContact = false;

  $: myProfile = $provisionedRelayCellProfileStore.data[myPubKeyB64];

  let contact = deriveAgentContactStore(contactStore, $page.params.id);
  let conversation =
    $contact.cellId !== undefined
      ? deriveCellConversationStore(conversationStore, encodeCellIdToBase64($contact.cellId))
      : undefined;
  let profiles =
    $contact.cellId !== undefined
      ? deriveCellProfileStore(profileStore, encodeCellIdToBase64($contact.cellId))
      : undefined;

  let showDeleteDialog = false;

  let pollInterval: NodeJS.Timeout;
  $: hasAgentJoinedDht =
    profiles !== undefined &&
    $profiles?.list.find(([key]) => key === $contact?.publicKeyB64) !== undefined;

  async function loadProfiles() {
    if (!profiles) return;

    try {
      await profiles.load();
      if (!hasAgentJoinedDht) {
        pollInterval = setTimeout(() => {
          loadProfiles();
        }, POLLING_INTERVAL_SLOW);
      }
    } finally {
      isLoading = false;
    }
  }

  async function handleDeleteContact() {
    if (isDeletingContact) return;

    isDeletingContact = true;

    try {
      await contact.delete();
      toast.success($t("common.delete_contact_success"));
      await goto("/create");
    } catch (err) {
      console.error("Error deleting contact:", err);
      toast.error($t("common.delete_contact_error"));
    }
    isDeletingContact = false;
  }

  onMount(() => {
    loadProfiles();
  });

  onDestroy(() => {
    clearInterval(pollInterval);
  });
</script>

<Header back />

{#if isLoading}
  <div class="flex h-64 items-center justify-center">
    <div class="h-12 w-12 animate-spin rounded-full border-b-2 border-gray-900"></div>
  </div>
{:else if $contact}
  <div class="flex flex-col items-center justify-center space-y-20">
    <div class="flex flex-1 flex-col items-center space-y-4">
      <Avatar agentPubKeyB64={$contact.publicKeyB64} size={128} />

      <div class="flex flex-row justify-center">
        <h1 class="mr-2 flex-shrink-0 text-3xl">{$contact.fullName}</h1>

        <ButtonIconBare
          on:click={() => goto(`/contacts/${$page.params.id}/edit`)}
          icon="write"
          iconColor="gray"
        />
      </div>
      <div class="mt-2 flex items-center justify-center">
        <span
          class="text-secondary-400 dark:text-tertiary-700 mr-1 w-64 overflow-hidden text-ellipsis text-nowrap"
        >
          {$contact.publicKeyB64}
        </span>
        <ButtonsCopyShareIcon text={$contact.publicKeyB64} />
      </div>
    </div>

    <div class="my-4">
      {#if $contact.cellId !== undefined && conversation !== undefined}
        {#if hasAgentJoinedDht}
          <div class="my-4">
            <Button
              icon="speechBubble"
              on:click={() => {
                if ($contact.cellId === undefined) return;
                goto(`/conversations/${encodeCellIdToBase64($contact.cellId)}`);
              }}
            >
              {$t("common.send_message")}
            </Button>
          </div>
        {:else}
          <NoticeContactNotJoined
            cellIdB64={$page.params.id}
            agentPubKeyB64={$contact.publicKeyB64}
          />
        {/if}
      {/if}
      <Button
        icon="delete"
        loading={isDeletingContact}
        on:click={() => (showDeleteDialog = true)}
        disabled={isDeletingContact}
      >
        {$t("common.delete_contact")}
      </Button>
    </div>
  </div>
{/if}

<Dialog
  bind:open={showDeleteDialog}
  title={$t("common.delete_contact_title")}
  actionButtonLabel={$t("common.delete")}
  on:confirm={handleDeleteContact}
>
  <p>{$t("common.delete_contact_dialog_message")}</p>
</Dialog>
