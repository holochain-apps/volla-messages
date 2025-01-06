<script lang="ts">
  import { createEventDispatcher, getContext } from "svelte";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import ContactsList from "$lib/ContactsList.svelte";
  import ButtonFilledNumbered from "$lib/ButtonFilledNumbered.svelte";
  import type { ContactStore } from "$store/ContactStore";

  const dispatch = createEventDispatcher<{
    clickAction: {
      selectedAgentPubKeyB64s: AgentPubKeyB64[];
      selectedContactNames: string;
    };
  }>();

  const contactStore = getContext<{ getStore: () => ContactStore }>("contactStore").getStore();

  export let value: AgentPubKeyB64[] = [];
  export let excludedAgentPubKeyB64s: AgentPubKeyB64[] = [];
  export let searchQuery = "";
  export let loading = false;
  export let disabled = false;
  export let buttonLabel: string;

  $: selectedContactExtendeds = value
    .map((agentPubKeyB64) => $contactStore[agentPubKeyB64])
    .filter((c) => c !== undefined);

  // Derive a string with the names of the selected contacts
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
</script>

<div class="flex w-full flex-col items-center p-5">
  <ContactsList {excludedAgentPubKeyB64s} {searchQuery} bind:selectedAgentPubKeyB64s={value} />

  {#if value.length > 0}
    <ButtonFilledNumbered
      icon="person"
      number={value.length}
      moreClasses="fixed bottom-5 right-5"
      {disabled}
      {loading}
      on:click={() =>
        dispatch("clickAction", {
          selectedAgentPubKeyB64s: value,
          selectedContactNames,
        })}
    >
      <div class="nowrap overflow-hidden text-ellipsis">
        <div class="text-md text-start">
          {buttonLabel}
        </div>
        <div class="pb-1 text-start text-xs font-light">
          with {selectedContactNames}
        </div>
      </div>
    </ButtonFilledNumbered>
  {/if}
</div>
