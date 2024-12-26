<script lang="ts">
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext } from "svelte";
  import { derived, writable } from "svelte/store";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import Avatar from "$lib/Avatar.svelte";
  import Button from "$lib/Button.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { RelayStore } from "$store/RelayStore";
  import { copyToClipboard, isMobile, makeFullName, shareText } from "$lib/utils";
  import { Privacy } from "../../../../types";
  import toast from "svelte-french-toast";
  import type { AgentPubKeyB64 } from "@holochain/client";

  const tAny = t as any;

  const relayStoreContext: { getStore: () => RelayStore } = getContext("relayStore");
  let relayStore = relayStoreContext.getStore();

  let conversationStore = relayStore.getConversation($page.params.id);

  let selectedContacts: AgentPubKeyB64[] = [];
  let search = "";

  $: contacts = derived(relayStore.contacts, ($contacts) => {
    const test = search.trim().toLowerCase();
    return $contacts
      .filter(
        (c) =>
          c.firstName.toLowerCase().includes(test) ||
          c.lastName.toLowerCase().includes(test) ||
          (test.length > 2 && c.publicKeyB64.toLowerCase().includes(test)),
      )
      .sort((a, b) => a.firstName.localeCompare(b.firstName));
  });

  function selectContact(publicKeyB64: string) {
    const contact = $contacts.find((c) => c.publicKeyB64 === publicKeyB64);
    if (contact) {
      if (selectedContacts.find((c) => c === contact.publicKeyB64)) {
        // If already selected then unselect
        selectedContacts = selectedContacts.filter((c) => c !== contact.publicKeyB64);
      } else {
        // otherwise select the contact
        selectedContacts = [...selectedContacts, contact.publicKeyB64];
      }
    }
  }

  async function addContactsToConversation() {
    // TODO: update config.title?
    try {
      if (conversationStore) {
        conversationStore.addContacts(selectedContacts);
        goto(`/conversations/${$conversationStore?.conversation.dnaHashB64}/details`);
      }
    } catch (e) {
      toast.error(`${$t("common.add_contact_to_conversation_error")}: ${e.message}`);
    }
  }
</script>

<Header
  back
  title={$tAny("conversations.add_people", {
    public: $conversationStore?.conversation.privacy === Privacy.Public,
  })}
/>

{#if $conversationStore}
  {#if $conversationStore.conversation.privacy === Privacy.Public}
    <div class="container mx-auto flex grow flex-col items-center justify-center px-10">
      <img src="/share-public-invite.png" alt="Share Key" class="mb-4" />
      <h1 class="h1 mb-2">{$t("conversations.open_invite_code")}</h1>
      <p class="mb-5">{$t("conversations.share_with_people")}</p>
    </div>

    <footer>
      <Button
        moreClasses="w-64"
        on:click={async () => {
          try {
            await copyToClipboard($conversationStore.publicInviteCode);
            toast.success(`${$t("common.copy_success")}`);
          } catch (e) {
            toast.error(`${$t("common.copy_error")}: ${e.message}`);
          }
        }}
      >
        <p class="w-64 overflow-hidden text-ellipsis text-nowrap">
          {$conversationStore.publicInviteCode}
        </p>
        <img src="/copy.svg" alt="Copy Icon" width="16" />&nbsp;<span
          class="text-tertiary-500 text-xs">{$t("common.copy")}</span
        >
      </Button>
      {#if isMobile()}
        <Button
          on:click={async () => {
            try {
              await shareText($conversationStore.publicInviteCode);
            } catch (e) {
              toast.error(`${$t("common.share_code_error")}: ${e.message}`);
            }
          }}
          moreClasses="w-64"
        >
          <p class="w-64 overflow-hidden text-ellipsis text-nowrap">
            {$conversationStore.publicInviteCode}
          </p>
          <img src="/share.svg" alt="Share Icon" width="16" />&nbsp;<span
            class="text-tertiary-500 text-xs">{$t("common.share")}</span
          >
        </Button>
      {/if}
      <Button
        moreClasses="bg-surface-400 text-secondary-50 w-64 justify-center"
        on:click={() => goto(`/conversations/${$page.params.id}`)}>{$t("common.done")}</Button
      >
    </footer>
  {:else}
    <div
      class="text-secondary-500 container relative mx-auto flex w-full flex-1 flex-col items-center p-5"
    >
      <div class="relative my-5 w-full">
        <input
          type="text"
          class="text-md !bg-tertiary-500 dark:!bg-secondary-500 dark:text-tertiary-500 h-12 w-full rounded-full border-0 pl-10 pr-4"
          placeholder={$t("create.search_placeholder")}
          bind:value={search}
        />
        <SvgIcon
          icon="search"
          size="24"
          color={$modeCurrent ? "%232e2e2e" : "%23ccc"}
          moreClasses="absolute top-3 left-3"
        />
      </div>

      {#if $contacts.length === 0}
        <img
          src={$modeCurrent ? "/clear-skies-gray.png" : "/clear-skies-white.png"}
          alt="No contacts"
          class="mb-4 mt-10 h-32 w-32"
        />
        <h2 class="text-primary-200 text-lg">
          {$t("create.no_contacts_header")}
        </h2>
        <p class="text-center text-xs">{$t("create.no_contacts_text")}</p>
      {:else}
        <div class="w-full font-light">
          {#each $contacts as contact, i}
            {#if i === 0 || contact.firstName.charAt(0).toUpperCase() !== $contacts[i - 1].firstName
                  .charAt(0)
                  .toUpperCase()}
              <p class="text-secondary-300 mb-1 mt-2 pl-0">
                {contact.firstName[0].toUpperCase()}
              </p>
            {/if}
            {@const selected = selectedContacts.find((c) => c === contact.publicKeyB64)}
            {@const alreadyInvited = !!$conversationStore.invitedContactKeys.find(
              (k) => k === contact.publicKeyB64,
            )}
            {@const alreadyInConversation = conversationStore
              ? !!conversationStore
                  .getMemberList()
                  .find((m) => m?.publicKeyB64 === contact.publicKeyB64)
              : false}
            <button
              class="-ml-1 mb-2 flex w-full items-center justify-between rounded-3xl p-2 {selected &&
                'bg-tertiary-500 dark:bg-secondary-500'} dark:disabled:text-tertiary-700 font-normal disabled:font-light"
              on:click={() => selectContact(contact.publicKeyB64)}
              disabled={alreadyInConversation || alreadyInvited}
            >
              <Avatar
                size={38}
                image={contact.avatar}
                agentPubKey={contact.publicKeyB64}
                moreClasses="mr-3"
              />
              <p class="text-secondary-500 dark:text-tertiary-100 flex-1 text-start">
                {makeFullName(contact.firstName, contact.lastName)}
              </p>
              {#if alreadyInConversation}
                <span class="text-xs font-extralight">{$t("conversations.already_member")}</span>
              {:else if alreadyInvited}
                <span class="text-xs font-extralight">{$t("conversations.already_invited")}</span>
              {:else}
                <span class="text-primary-500 text-lg font-extrabold">+</span>
              {/if}
            </button>
          {/each}
        </div>

        {#if selectedContacts.length > 0}
          <button
            class="max-w-2/3 bg-primary-500 fixed bottom-5 right-5 flex items-center justify-center rounded-full border-0 py-1 pl-2 pr-4 text-white"
            on:click={() => addContactsToConversation()}
          >
            <span
              class="bg-surface-500 text-primary-500 mr-2 flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold"
            >
              <SvgIcon icon="person" size="12" color="%23FD3524" moreClasses="mr-1" />
              {selectedContacts.length}
            </span>
            <div class="nowrap overflow-hidden text-ellipsis">
              <div class="text-md text-start">
                {$t("conversations.add_contact_to_conversation")}
              </div>
              <div class="pb-1 text-start text-xs font-light">
                with {selectedContacts
                  .map((c) => $contacts.find((contact) => c === contact.publicKeyB64)?.firstName)
                  .join(", ")}
              </div>
            </div>
          </button>
        {/if}
      {/if}
    </div>
  {/if}
{/if}
