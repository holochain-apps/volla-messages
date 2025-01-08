<script lang="ts">
  import { goto } from "$app/navigation";
  import ButtonInline from "$lib/ButtonInline.svelte";
  import { deriveOneContactStore, type ContactStore } from "$store/ContactStore";
  import { t } from "$translations";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import Avatar from "$lib/Avatar.svelte";
  import { getContext, onMount } from "svelte";
  import ButtonDelete from "./ButtonDelete.svelte";

  const contactStore = getContext<{ getStore: () => ContactStore }>("contactStore").getStore();

  export let agentPubKeyB64: AgentPubKeyB64;
  export let selected: boolean = false;

  $: contact = deriveOneContactStore(contactStore, agentPubKeyB64);

  let hasAgentJoinedDht = false;
  onMount(async () => {
    hasAgentJoinedDht = await contactStore.getHasAgentJoinedDht(agentPubKeyB64);
  });

  async function handleDelete(event: MouseEvent) {
    // Prevents the click from triggering the parent button
    event.stopPropagation();
    await contact.delete();
  }
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
      <ButtonDelete moreClasses="h-5 w-5" onDelete={handleDelete} />
    {/if}
  </div>
</button>
