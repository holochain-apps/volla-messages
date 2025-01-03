<script lang="ts">
  import { createEventDispatcher, getContext } from "svelte";
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import ContactsList from "$lib/ContactsList.svelte";
  import ButtonFilledNumbered from "$lib/ButtonFilledNumbered.svelte";
  import type { ContactStore } from "$store/ContactStore";

  const tAny = t as any;

  const contactStore = getContext<{ getStore: () => ContactStore }>("contactStore").getStore();
  const dispatch = createEventDispatcher<{
    change: {
      selectedAgentPubKeyB64s: AgentPubKeyB64[];
      selectedContactNames: string;
    };
  }>();

  export let value: AgentPubKeyB64[] = [];
  export let searchQuery = "";
  export let loading = false;
  export let disabled = false;
  export let buttonLabel: string;

  let existingConversationStore = false;

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

<Header backUrl="/welcome" title={$t("create.page_title")} />

<div class="flex w-full flex-col items-center p-5">
  <ContactsList {searchQuery} bind:selectedAgentPubKeyB64s={value} />

  {#if value.length > 0}
    <ButtonFilledNumbered
      icon="person"
      number={value.length}
      moreClasses="fixed bottom-5 right-5"
      {disabled}
      {loading}
      on:click={() =>
        dispatch("change", {
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
