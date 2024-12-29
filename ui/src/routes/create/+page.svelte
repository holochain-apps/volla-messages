<script lang="ts">
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext } from "svelte";
  import { derived, get } from "svelte/store";
  import { goto } from "$app/navigation";
  import Avatar from "$lib/Avatar.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { RelayStore } from "$store/RelayStore";
  import { Privacy } from "$lib/types";
  import { makeFullName } from "$lib/utils";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import { xor } from "lodash-es";

  const relayStoreContext: { getStore: () => RelayStore } = getContext("relayStore");
  let relayStore = relayStoreContext.getStore();

  let selectedContacts: AgentPubKeyB64[] = [];
  let search = "";
  let pendingCreate = false;

  const tAny = t as any;

  $: selectedContactStores = selectedContacts
    .map((s) => relayStore.contacts.find((c) => s === get(c).publicKeyB64))
    .filter((c) => c !== undefined);

  $: selectedContactsNames = selectedContactStores.map((c) => get(c).firstName).join(", ");

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
          c.firstName.toLowerCase().includes(test) ||
          c.lastName.toLowerCase().includes(test) ||
          (test.length > 2 && c.publicKeyB64.toLowerCase().includes(test)),
      )
      .sort((a, b) => a.firstName.localeCompare(b.firstName))
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

    let title = "";
    if (selectedContactStores.length === 1) {
      const c = get(selectedContactStores[0]);
      title = makeFullName(c.firstName, c.lastName);
    } else if (selectedContacts.length === 2) {
      title = selectedContactStores.map((c) => get(c).firstName).join(" & ");
    } else if (selectedContacts.length > 2) {
      title = selectedContactStores.map((c) => get(c).firstName).join(", ");
    }

    const conversationStore = await relayStore.createConversation(
      title,
      "",
      Privacy.Private,
      selectedContacts,
    );
    if (conversationStore) {
      goto(`/conversations/${get(conversationStore).conversation.dnaHashB64}/details`);
    }
    pendingCreate = false;
  }
</script>

<Header backUrl="/welcome" title={$t("create.page_title")} />

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
      size={24}
      color={$modeCurrent ? "%232e2e2e" : "%23ccc"}
      moreClasses="absolute top-3 left-3"
    />
  </div>

  <div class="mb-5 flex w-full justify-between gap-4">
    <button
      class="bg-tertiary-500 dark:bg-secondary-500 dark:text-tertiary-400 flex h-24 w-28 flex-col items-center rounded-2xl py-2 text-xs disabled:opacity-50"
      on:click={() => goto("/conversations/join")}
    >
      <SvgIcon
        icon="ticket"
        size={32}
        color={$modeCurrent ? "%232e2e2e" : "white"}
        moreClasses="flex-grow"
      />
      <p class="">{$t("common.use_invite_code")}</p>
    </button>

    <button
      class="bg-tertiary-500 dark:bg-secondary-500 dark:text-tertiary-400 flex h-24 w-28 flex-col items-center rounded-2xl py-2 text-xs disabled:opacity-50"
      on:click={() => goto("/contacts/new")}
    >
      <SvgIcon
        icon="newPerson"
        size={32}
        color={$modeCurrent ? "%232e2e2e" : "white"}
        moreClasses="flex-grow"
      />
      <p>{$t("common.new_contact")}</p>
    </button>

    <button
      class="bg-tertiary-500 dark:bg-secondary-500 dark:text-tertiary-400 flex h-24 w-28 flex-col items-center rounded-2xl py-2 text-xs disabled:opacity-50"
      on:click={() => goto("/conversations/new")}
    >
      <SvgIcon
        icon="people"
        size={32}
        color={$modeCurrent ? "%232e2e2e" : "white"}
        moreClasses="flex-grow"
      />
      <p>{$t("common.new_group")}</p>
    </button>
  </div>

  {#if contactsFilteredStores.length === 0}
    <img
      src={$modeCurrent ? "/clear-skies-gray.png" : "/clear-skies-white.png"}
      alt="No contacts"
      class="mb-4 mt-10 h-32 w-32"
    />
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

        {#if prevContact === undefined || contact.firstName
            .charAt(0)
            .toUpperCase() !== prevContact?.firstName.charAt(0).toUpperCase()}
          <p class="text-secondary-300 mb-1 mt-2 pl-0">
            {contact.firstName[0].toUpperCase()}
          </p>
        {/if}

        <button
          class="-ml-1 mb-2 flex w-full items-center justify-between rounded-3xl py-1 pl-1 pr-2 {selected &&
            'bg-tertiary-500 dark:bg-secondary-500'}"
          on:click={() => toggleSelectContact(contact.publicKeyB64)}
        >
          <Avatar
            size={38}
            image={contact.avatar}
            agentPubKey={contact.publicKeyB64}
            moreClasses="mr-3"
          />
          <p
            class="dark:text-tertiary-100 flex-1 text-start font-bold {contactStore.getIsPendingConnection()
              ? 'text-secondary-400 dark:!text-secondary-300'
              : ''}"
          >
            {makeFullName(contact.firstName, contact.lastName)}
            {#if contactStore.getIsPendingConnection()}<span class="text-secondary-400 ml-1 text-xs"
                >{$t("create.unconfirmed")}</span
              >{/if}
          </p>
          {#if selected}
            <button
              class="text-secondary-700 flex h-8 items-center justify-center rounded-full bg-white px-2 font-bold"
              on:click={() => goto("/contacts/" + contact.publicKeyB64)}
            >
              <span class="mx-2 text-xs">{$t("create.view")}</span>
            </button>
          {:else}
            <span class="text-primary-500 text-lg font-extrabold">+</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if selectedContacts.length > 0}
      <button
        class="max-w-2/3 bg-primary-500 fixed bottom-5 right-5 flex items-center justify-center rounded-full border-0 py-1 pl-2 pr-4 text-white"
        disabled={pendingCreate}
        on:click={() => createConversation()}
      >
        <span
          class="bg-surface-500 text-primary-500 mr-2 flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold"
        >
          <SvgIcon
            icon={pendingCreate ? "spinner" : "person"}
            size={12}
            color="%23FD3524"
            moreClasses="mr-1"
          />
          {selectedContacts.length}
        </span>
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
      </button>
    {/if}
  {/if}
</div>
