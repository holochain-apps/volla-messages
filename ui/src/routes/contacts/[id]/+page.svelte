<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import Button from "$lib/Button.svelte";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";
  import ButtonsCopyShare from "$lib/ButtonsCopyShare.svelte";
  import ButtonsCopyShareIcon from "$lib/ButtonsCopyShareIcon.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { deriveOneContactStore, type ContactStore } from "$store/ContactStore";
  import { getContext, onDestroy, onMount } from "svelte";
  import { t } from "$translations";
  import { encodeHashToBase64 } from "@holochain/client";
  import type { RelayStore } from "$store/RelayStore";

  // Silly thing to get around typescript issues with sveltekit-i18n
  const tAny = t as any;

  const contactStore = getContext<{ getStore: () => ContactStore }>("contactStore").getStore();
  const relayStore = getContext<{ getStore: () => RelayStore }>("relayStore").getStore();

  $: contact = deriveOneContactStore(contactStore, $page.params.id);
  $: conversationStore = relayStore.getConversation(encodeHashToBase64($contact.cellId[0]));

  let pollInterval: NodeJS.Timeout;
  let hasAgentJoinedDht: boolean = false;
  onMount(() => {
    pollInterval = setInterval(
      async () => (hasAgentJoinedDht = await contact.getHasAgentJoinedDht()),
      5000,
    );
  });
  onDestroy(() => clearInterval(pollInterval));
</script>

<Header back />

<div class="flex flex-1 flex-col items-center">
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

{#if hasAgentJoinedDht}
  <div class="bg-tertiary-500 dark:bg-secondary-500 mx-8 flex flex-col items-center rounded-xl p-4">
    <SvgIcon icon="handshake" moreClasses="w-[36px] h-[36px]" />
    <h1 class="text-secondary-500 dark:text-tertiary-100 mt-2 text-xl font-bold">
      {$t("contacts.pending_connection_header")}
    </h1>
    <p class="text-secondary-400 dark:text-tertiary-700 mb-6 mt-4 text-center text-sm">
      {$tAny("contacts.pending_connection_description", {
        name: $contact?.contact.first_name,
      })}
    </p>
    {#await conversationStore?.makeInviteCodeForAgent($contact.publicKeyB64) then res}
      {#if res}
        <div class="flex justify-center">
          <ButtonsCopyShare
            text={res}
            copyLabel={$t("contacts.copy_invite_code")}
            shareLabel={$t("contacts.share_invite_code")}
          />
        </div>
      {/if}
    {/await}
  </div>
{:else}
  <div class="my-4">
    <Button
      icon="speechBubble"
      on:click={() => {
        goto(`/conversations/${encodeHashToBase64($contact.cellId[0])}`);
      }}
    >
      {$t("contacts.send_message")}
    </Button>
  </div>
{/if}
