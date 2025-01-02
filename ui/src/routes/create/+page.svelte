<script lang="ts">
  import { getContext } from "svelte";
  import { get } from "svelte/store";
  import { goto } from "$app/navigation";
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import { RelayStore } from "$store/RelayStore";
  import { Privacy } from "$lib/types";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import { xor } from "lodash-es";
  import toast from "svelte-french-toast";
  import ButtonSquare from "$lib/ButtonSquare.svelte";
  import ButtonFilledNumbered from "$lib/ButtonFilledNumbered.svelte";
  import InputSearch from "$lib/InputSearch.svelte";
  import { deriveContactListStore, type ContactStore } from "$store/ContactStore";
  import ContactListItem from "./ContactListItem.svelte";

  const relayStore = getContext<{ getStore: () => RelayStore }>("relayStore").getStore();
  const contactStore = getContext<{ getStore: () => ContactStore }>("contactStore").getStore();

  let selectedAgentPubKeyB64s: AgentPubKeyB64[] = [];
  let searchQuery = "";
  let pendingCreate = false;
  let existingConversationStore = false;

  const tAny = t as any;

  $: contactListStore = deriveContactListStore(contactStore);

  $: searchQueryNormalized = searchQuery.trim().toLowerCase();

  $: selectedContactExtendeds = selectedAgentPubKeyB64s
    .map((agentPubKeyB64) => $contactStore[agentPubKeyB64])
    .filter((c) => c !== undefined);

  let selectedContactNames = "";
  $: {
    if (selectedContactExtendeds.length === 1) {
      selectedContactNames = selectedContactExtendeds[0].fullName;
    } else if (selectedContactExtendeds.length === 2) {
      selectedContactNames = selectedContactExtendeds.map((c) => c.contact.first_name).join(" & ");
    } else if (selectedContactExtendeds.length > 2) {
      selectedContactNames = selectedContactExtendeds.map((c) => c.contact.first_name).join(", ");
    }
  }

  $: searchFilteredAgentPubKeyB64s = $contactListStore
    .filter(
      ([agentPubKeyB64, contactExtended]) =>
        contactExtended.contact.first_name.toLowerCase().includes(searchQueryNormalized) ||
        contactExtended.contact.first_name.toLowerCase().includes(searchQueryNormalized) ||
        (searchQueryNormalized.length > 2 &&
          agentPubKeyB64.toLowerCase().includes(searchQueryNormalized)),
    )
    .sort(([, contactExtendedA], [, contactExtendedB]) =>
      contactExtendedA.contact.first_name.localeCompare(contactExtendedB.contact.first_name),
    )
    .map(([agentPubKeyB64]) => agentPubKeyB64);

  async function createConversation() {
    // TODO if conversation already exists, navigate to it

    pendingCreate = true;
    try {
      const conversationStore = await relayStore.createConversation(
        selectedContactNames,
        "",
        Privacy.Private,
        selectedAgentPubKeyB64s,
      );
      await goto(`/conversations/${get(conversationStore).conversation.dnaHashB64}/details`);
    } catch (e) {
      toast.error(`${$t("common.create_conversation_error")}: ${e.message}`);
    }
    pendingCreate = false;
  }
</script>

<Header backUrl="/welcome" title={$t("create.page_title")} />

<div class="flex w-full flex-col items-center p-5">
  <InputSearch bind:value={searchQuery} />

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

  {#if searchFilteredAgentPubKeyB64s.length === 0}
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
      {#each searchFilteredAgentPubKeyB64s as agentPubKeyB64, i}
        <ContactListItem
          {agentPubKeyB64}
          selected={selectedAgentPubKeyB64s.includes(agentPubKeyB64)}
          displayFirstCharacter={i === 0 ||
            $contactStore[searchFilteredAgentPubKeyB64s[i - 1]].contact.first_name
              .charAt(0)
              .toLowerCase() !==
              $contactStore[agentPubKeyB64].contact.first_name.charAt(0).toLowerCase()}
          on:click={() =>
            (selectedAgentPubKeyB64s = xor(selectedAgentPubKeyB64s, [agentPubKeyB64]))}
        />
      {/each}
    </div>

    {#if selectedContactExtendeds.length > 0}
      <ButtonFilledNumbered
        icon="person"
        number={selectedContactExtendeds.length}
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
            with {selectedContactNames}
          </div>
        </div>
      </ButtonFilledNumbered>
    {/if}
  {/if}
</div>
