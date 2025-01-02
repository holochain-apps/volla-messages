<script lang="ts">
  import { getContext } from "svelte";
  import { derived, get } from "svelte/store";
  import { goto } from "$app/navigation";
  import Avatar from "$lib/Avatar.svelte";
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import { RelayStore } from "$store/RelayStore";
  import { Privacy } from "$lib/types";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import { xor } from "lodash-es";
  import toast from "svelte-french-toast";
  import ButtonSquare from "$lib/ButtonSquare.svelte";
  import ButtonInline from "$lib/ButtonInline.svelte";
  import ButtonFilledNumbered from "$lib/ButtonFilledNumbered.svelte";
  import InputSearch from "$lib/InputSearch.svelte";

  const relayStore = getContext<{ getStore: () => RelayStore }>("relayStore").getStore();

  let selectedContacts: AgentPubKeyB64[] = [];
  let search = "";
  let pendingCreate = false;

  const tAny = t as any;

  $: selectedContactStores = selectedContacts
    .map((s) => relayStore.contacts.find((c) => s === get(c).publicKeyB64))
    .filter((c) => c !== undefined);

  $: selectedContactsNames = selectedContactStores.map((c) => get(c).contact.first_name).join(", ");

  $: existingConversationStore =
    selectedContacts.length === 0
      ? undefined
      : relayStore.conversations
          .sort((a, b) =>
            get(b).conversation.privacy === Privacy.Private
              ? 1
              : get(a).conversation.privacy === Privacy.Private
                ? -1
                : 0,
          )
          .find(
            (c) =>
              c.getAllMembers().length === selectedContacts.length &&
              c.getAllMembers().every((k) => selectedContacts.find((c) => c === k.publicKeyB64)),
          );

  $: contactsFiltered = derived(relayStore.contacts, ($contacts) => {
    const test = search.trim().toLowerCase();
    return $contacts
      .filter(
        (c) =>
          c.contact.first_name.toLowerCase().includes(test) ||
          c.contact.first_name.toLowerCase().includes(test) ||
          (test.length > 2 && c.publicKeyB64.toLowerCase().includes(test)),
      )
      .sort((a, b) => a.contact.first_name.localeCompare(b.contact.first_name))
      .map((c) => c.publicKeyB64);
  });

  $: contactsFilteredStores = relayStore.contacts.filter((c) =>
    $contactsFiltered.includes(get(c).publicKeyB64),
  );

  function toggleSelectContact(publicKey: string) {
    selectedContacts = xor(selectedContacts, [publicKey]);
  }

  async function createConversation() {
    if (existingConversationStore) {
      goto(`/conversations/${get(existingConversationStore).conversation.dnaHashB64}`);
      return;
    }

    pendingCreate = true;
    try {
      let title = "";
      if (selectedContactStores.length === 1) {
        const c = get(selectedContactStores[0]);
        title = c.fullName;
      } else if (selectedContacts.length === 2) {
        title = selectedContactStores.map((c) => get(c).contact.first_name).join(" & ");
      } else if (selectedContacts.length > 2) {
        title = selectedContactStores.map((c) => get(c).contact.first_name).join(", ");
      }
      const conversationStore = await relayStore.createConversation(
        title,
        "",
        Privacy.Private,
        selectedContacts,
      );
      await goto(`/conversations/${get(conversationStore).conversation.dnaHashB64}/details`);
    } catch (e) {
      toast.error(`${$t("common.create_conversation_error")}: ${e.message}`);
    }
    pendingCreate = false;
  }
</script>

<Header backUrl="/welcome" title={$t("create.page_title")} />

<div class="relative mx-auto flex w-full flex-1 flex-col items-center p-5">
  <InputSearch bind:value={search} />

  <div class="mb-5 flex w-full justify-between gap-4">
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

  {#if contactsFilteredStores.length === 0}
    <div
      class="bg-clearSkiesGray dark:bg-clearSkiesWhite mb-4 mt-10 h-32 w-32 bg-contain bg-center bg-no-repeat"
    ></div>
    <h2 class="text-secondary-500 dark:text-tertiary-500 mb-1 text-lg font-bold">
      {$t("create.no_contacts_header")}
    </h2>
    <p class="text-secondary-400 dark:text-tertiary-700 text-center text-xs">
      {$t("create.no_contacts_text")}
    </p>
  {:else}
    <div class="w-full">
      {#each contactsFilteredStores as contactStore, i}
        {@const contact = get(contactStore)}
        {@const selected = selectedContacts.includes(contact.publicKeyB64)}
        {@const prevContact = i === 0 ? undefined : get(contactsFilteredStores[i - 1])}

        {#if prevContact === undefined || contact.contact.first_name
            .charAt(0)
            .toUpperCase() !== prevContact?.contact.first_name.charAt(0).toUpperCase()}
          <p class="text-secondary-300 mb-1 mt-2 pl-0">
            {contact.contact.first_name[0].toUpperCase()}
          </p>
        {/if}

        <button
          class="-ml-1 mb-2 flex w-full items-center justify-between rounded-3xl py-1 pl-1 pr-2 {selected &&
            'bg-tertiary-500 dark:bg-secondary-500'}"
          on:click={() => toggleSelectContact(contact.publicKeyB64)}
        >
          <Avatar
            size={38}
            image={contact.contact.avatar}
            agentPubKey={contact.publicKeyB64}
            moreClasses="mr-3"
          />
          <p
            class="dark:text-tertiary-100 flex-1 text-start font-bold {contactStore.getIsPendingConnection()
              ? 'text-secondary-400 dark:!text-secondary-300'
              : ''}"
          >
            {contact.fullName}
            {#if contactStore.getIsPendingConnection()}<span class="text-secondary-400 ml-1 text-xs"
                >{$t("create.unconfirmed")}</span
              >{/if}
          </p>
          {#if selected}
            <ButtonInline
              on:click={() => goto("/contacts/" + contact.publicKeyB64)}
              moreClasses="dark:bg-secondary-700 "
            >
              {$t("create.view")}
            </ButtonInline>
          {:else}
            <span class="text-primary-500 text-lg font-extrabold">+</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if selectedContacts.length > 0}
      <ButtonFilledNumbered
        icon="person"
        number={selectedContacts.length}
        moreClasses="fixed bottom-5 right-5"
        disabled={pendingCreate}
        on:click={createConversation}
        loading={pendingCreate}
      >
        <div class="nowrap overflow-hidden text-ellipsis">
          <div class="text-md text-start">
            {$tAny("create.open_conversation", {
              existingConversation: !!existingConversationStore,
            })}
          </div>
          <div class="pb-1 text-start text-xs font-light">
            with {selectedContactsNames}
          </div>
        </div>
      </ButtonFilledNumbered>
    {/if}
  {/if}
</div>
