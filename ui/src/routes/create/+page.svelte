<script lang="ts">
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext } from "svelte";
  import { derived, get, writable } from "svelte/store";
  import { goto } from "$app/navigation";
  import Avatar from "$lib/Avatar.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { ConversationStore } from "$store/ConversationStore";
  import { RelayStore } from "$store/RelayStore";
  import { type Contact, Privacy } from "../../types";
  import { makeFullName } from "$lib/utils";

  const relayStoreContext: { getStore: () => RelayStore } =
    getContext("relayStore");
  let relayStore = relayStoreContext.getStore();

  let selectedContacts: Contact[] = [];
  let search = "";
  let existingConversation: ConversationStore | undefined = undefined;
  let pendingCreate = false;

  const tAny = t as any;

  $: {
    if (selectedContacts.length > 0) {
      existingConversation = get(relayStore.conversations)
        .sort((a, b) =>
          b.privacy === Privacy.Private
            ? 1
            : a.privacy === Privacy.Private
              ? -1
              : 0
        )
        .find(
          (c) =>
            c.allMembers.length === selectedContacts.length &&
            c.allMembers.every((k) =>
              selectedContacts.find((c) => c.publicKeyB64 === k.publicKeyB64)
            )
        );
    } else {
      existingConversation = undefined;
    }
  }

  $: contacts = derived(relayStore.contacts, ($contacts) => {
    const test = search.trim().toLowerCase();
    return $contacts
      .filter(
        (c) =>
          c.data.firstName.toLowerCase().includes(test) ||
          c.data.lastName.toLowerCase().includes(test) ||
          (test.length > 2 && c.data.publicKeyB64.toLowerCase().includes(test))
      )
      .sort((a, b) => a.data.firstName.localeCompare(b.data.firstName));
  });

  function selectContact(publicKey: string) {
    const contact = $contacts.find((c) => c.data.publicKeyB64 === publicKey);
    if (contact) {
      if (
        selectedContacts.find(
          (c) => c.publicKeyB64 === contact.data.publicKeyB64
        )
      ) {
        // If already selected then unselect
        selectedContacts = selectedContacts.filter(
          (c) => c.publicKeyB64 !== contact.data.publicKeyB64
        );
      } else {
        // otherwise select the contact
        selectedContacts = [...selectedContacts, contact];
      }
    }
  }

  async function createConversation() {
    if (existingConversation) {
      goto(`/conversations/${existingConversation.data.dnaHashB64}`);
      return;
    }

    pendingCreate = true;

    const title =
      selectedContacts.length == 1
        ? makeFullName(
            selectedContacts[0].firstName,
            selectedContacts[0].lastName
          )
        : selectedContacts.length == 2
          ? selectedContacts.map((c) => c.firstName).join(" & ")
          : selectedContacts.map((c) => c.firstName).join(", ");

    const conversation = await relayStore.createConversation(
      title,
      "",
      Privacy.Private,
      selectedContacts
    );
    if (conversation) {
      goto(`/conversations/${conversation.data.dnaHashB64}/details`);
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
      class="!bg-tertiary-500 dark:!bg-secondary-500 dark:text-tertiary-500 text-md h-12 w-full rounded-full border-0 pl-10 pr-4"
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

  <div class="mb-5 flex w-full justify-between gap-4">
    <button
      class="bg-tertiary-500 dark:bg-secondary-500 dark:text-tertiary-400 flex h-24 w-28 flex-col items-center rounded-2xl py-2 text-xs disabled:opacity-50"
      on:click={() => goto("/conversations/join")}
    >
      <SvgIcon
        icon="ticket"
        size="32"
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
        size="32"
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
        size="32"
        color={$modeCurrent ? "%232e2e2e" : "white"}
        moreClasses="flex-grow"
      />
      <p>{$t("common.new_group")}</p>
    </button>
  </div>

  {#if $contacts.length === 0}
    <img
      src={$modeCurrent ? "/clear-skies-gray.png" : "/clear-skies-white.png"}
      alt="No contacts"
      class="mb-4 mt-10 h-32 w-32"
    />
    <h2
      class="text-secondary-500 dark:text-tertiary-500 mb-1 text-lg font-bold"
    >
      {$t("create.no_contacts_header")}
    </h2>
    <p class="text-secondary-400 dark:text-tertiary-700 text-center text-xs">
      {$t("create.no_contacts_text")}
    </p>
  {:else}
    <div class="w-full">
      {#each $contacts as contact, i}
        {#if i === 0 || contact.firstName
            .charAt(0)
            .toUpperCase() !== $contacts[i - 1].firstName
              .charAt(0)
              .toUpperCase()}
          <p class="text-secondary-300 mb-1 mt-2 pl-0">
            {contact.firstName[0].toUpperCase()}
          </p>
        {/if}
        {@const selected = selectedContacts.find(
          (c) => c.publicKeyB64 === contact.data.publicKeyB64
        )}
        <button
          class="-ml-1 mb-2 flex w-full items-center justify-between rounded-3xl py-1 pl-1 pr-2 {selected &&
            'bg-tertiary-500 dark:bg-secondary-500'}"
          on:click={() => selectContact(contact.data.publicKeyB64)}
        >
          <Avatar
            size={38}
            image={contact.avatar}
            agentPubKey={contact.publicKeyB64}
            moreClasses="mr-3"
          />
          <p
            class="dark:text-tertiary-100 flex-1 text-start font-bold {contact.pendingConnection
              ? 'text-secondary-400 dark:!text-secondary-300'
              : ''}"
          >
            {makeFullName(contact.firstName, contact.lastName)}
            {#if contact.pendingConnection}<span
                class="text-secondary-400 ml-1 text-xs"
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
        class="bg-primary-500 max-w-2/3 fixed bottom-5 right-5 flex items-center justify-center rounded-full border-0 py-1 pl-2 pr-4 text-white"
        disabled={pendingCreate}
        on:click={() => createConversation()}
      >
        <span
          class="bg-surface-500 text-primary-500 mr-2 flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold"
        >
          <SvgIcon
            icon={pendingCreate ? "spinner" : "person"}
            size="12"
            color="%23FD3524"
            moreClasses="mr-1"
          />
          {selectedContacts.length}
        </span>
        <div class="nowrap overflow-hidden text-ellipsis">
          <div class="text-md text-start">
            {$tAny("create.open_conversation", {
              existingConversation: !!existingConversation,
            })}
          </div>
          <div class="pb-1 text-start text-xs font-light">
            with {selectedContacts.map((c) => c.firstName).join(", ")}
          </div>
        </div>
      </button>
    {/if}
  {/if}
</div>
