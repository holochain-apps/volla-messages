<script lang="ts">
  import { createEventDispatcher, getContext } from "svelte";
  import { decodeHashFromBase64, encodeHashToBase64, type AgentPubKeyB64 } from "@holochain/client";
  import Button from "$lib/Button.svelte";
  import { t } from "$translations";
  import InputImageAvatar from "$lib/InputImageAvatar.svelte";
  import type { Contact } from "$lib/types";
  import { MIN_FIRST_NAME_LENGTH } from "$config";
  import type { ContactStore } from "$store/ContactStore";

  const contactStore = getContext<{ getStore: () => ContactStore }>("contactStore").getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  const dispatch = createEventDispatcher<{
    cancel: null;
    change: Contact;
  }>();

  export let value: Contact | undefined = undefined;

  let contact: Contact = value
    ? value
    : {
        first_name: "",
        last_name: "",
        avatar: "",
        public_key: new Uint8Array(),
      };
  let agentPubKeyB64 = value?.public_key ? encodeHashToBase64(value.public_key) : "";
  let saving = false;

  $: isFirstNameValid = contact.first_name.trim().length >= MIN_FIRST_NAME_LENGTH;
  $: isAgentPubKeyB64Valid = checkIsAgentPubKeyB64Valid();
  $: isContactUniqueAgent = agentPubKeyB64 && $contactStore[agentPubKeyB64] === undefined;
  $: isContactOtherAgent = myPubKeyB64 === agentPubKeyB64;
  $: valid =
    isFirstNameValid && isAgentPubKeyB64Valid && isContactUniqueAgent && isContactOtherAgent;

  function checkIsAgentPubKeyB64Valid() {
    try {
      decodeHashFromBase64(agentPubKeyB64);
      return true;
    } catch (e) {
      return false;
    }
  }

  function save() {
    if (!valid) return;
    if (!saving) return;

    saving = true;
    value = {
      ...contact,
      first_name: contact.first_name.trim(),
      last_name: contact.last_name.trim(),
      public_key: decodeHashFromBase64(agentPubKeyB64),
    };
    dispatch("change", value);
    saving = false;
  }
</script>

<div class="flex flex-1 flex-col items-center p-4">
  <InputImageAvatar bind:value={contact.avatar} />

  <div class="flex w-full grow flex-col justify-start px-8">
    <h3 class="h3">{$t("common.first_name")} *</h3>
    <input
      autofocus
      class="bg-surface-900 border-none pl-0.5 outline-none focus:outline-none focus:ring-0"
      type="text"
      placeholder={$t("contacts.enter_first_name")}
      name="name"
      bind:value={contact.first_name}
      minlength={1}
    />

    <h3 class="h3 mt-4">{$t("common.last_name")}</h3>
    <input
      class="bg-surface-900 border-none pl-0.5 outline-none focus:outline-none focus:ring-0"
      type="text"
      placeholder={$t("contacts.enter_last_name")}
      name="name"
      bind:value={contact.last_name}
    />

    <h3 class="h3 mt-4">{$t("contacts.contact_code")} *</h3>
    <input
      class="bg-surface-900 border-none pl-0.5 outline-none focus:outline-none focus:ring-0"
      type="text"
      placeholder={$t("contacts.enter_contact_code")}
      name="publicKey"
      bind:value={agentPubKeyB64}
      minlength={1}
    />

    {#if !isAgentPubKeyB64Valid}
      <p class="text-error-500 ml-1 mt-1 text-xs">$t("contacts.invalid_contact_code")</p>
    {:else if !isContactUniqueAgent}
      <p class="text-error-500 ml-1 mt-1 text-xs">$t("contacts.contact_already_exist")</p>
    {:else if !isContactOtherAgent}
      <p class="text-error-500 ml-1 mt-1 text-xs">$t("contacts.cant_add_yourself")</p>
    {/if}

    {#if !agentPubKeyB64}
      <p class="text-secondary-600 dark:text-tertiary-700 mb-4 mt-4 text-xs">
        {$t("contacts.request_contact_code")}
      </p>
    {/if}
  </div>

  <div class="my-4 flex flex-wrap justify-center">
    <Button
      on:click={() => dispatch("cancel")}
      moreClasses=" !variant-filled-tertiary dark:!variant-filled-secondary m-2"
    >
      {$t("common.cancel")}
    </Button>
    <Button on:click={save} disabled={!valid || saving} loading={saving} moreClasses="m-2">
      {$t("common.save")}
    </Button>
  </div>
</div>
