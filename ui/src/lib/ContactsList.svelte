<script lang="ts">
  import { type ContactStore, deriveContactListStore } from "$store/ContactStore";
  import { t } from "$translations";
  import { xor } from "lodash-es";
  import { getContext } from "svelte";
  import ContactListItem from "./ContactListItem.svelte";
  import type { AgentPubKeyB64 } from "@holochain/client";

  const contactStore = getContext<{ getStore: () => ContactStore }>("contactStore").getStore();
  let contactListStore = deriveContactListStore(contactStore);

  export let searchQuery: string = "";
  export let selectedAgentPubKeyB64s: AgentPubKeyB64[] = [];
  export let excludedAgentPubKeyB64s: AgentPubKeyB64[] = [];

  $: searchQueryNormalized = searchQuery.trim().toLowerCase();

  $: searchResultsExclude = $contactListStore.filter(
    ([agentPubKeyB64]) => !excludedAgentPubKeyB64s.includes(agentPubKeyB64),
  );

  // Derive the list of contacts to display, filtered by the search input
  $: searchResults =
    searchQueryNormalized.length > 0
      ? searchResultsExclude.filter(([agentPubKeyB64, contactExtended]) =>
          contactExtended.fullName.toLowerCase().includes(searchQueryNormalized),
        )
      : searchResultsExclude;
</script>

{#if searchResults.length === 0}
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
    {#each searchResults as [agentPubKeyB64, contactExtended], i (agentPubKeyB64)}
      {@const prevSearchResult = i === 0 ? undefined : searchResults[i - 1]}

      {#if prevSearchResult === undefined || contactExtended.contact.first_name.charAt(0) !== prevSearchResult[1].contact.first_name.charAt(0)}
        <p class="text-secondary-300 mb-1 mt-2 pl-0">
          {contactExtended.contact.first_name.charAt(0).toUpperCase()}
        </p>
      {/if}

      <ContactListItem
        {agentPubKeyB64}
        selected={selectedAgentPubKeyB64s.includes(agentPubKeyB64)}
        on:click={() => (selectedAgentPubKeyB64s = xor(selectedAgentPubKeyB64s, [agentPubKeyB64]))}
      />
    {/each}
  </div>
{/if}
