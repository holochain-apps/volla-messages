<script lang="ts">
  import { isEmpty } from "lodash-es";
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext, onMount } from "svelte";
  import { decodeHashFromBase64, type AgentPubKeyB64, type HoloHash } from "@holochain/client";
  import { goto } from "$app/navigation";
  import Button from "$lib/Button.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { RelayStore } from "$store/RelayStore";
  import HiddenFileInput from "$lib/HiddenFileInput.svelte";
  import { get } from "svelte/store";
  import ButtonsCopyShare from "$lib/ButtonsCopyShare.svelte";
  import ButtonsCopyShareIcon from "$lib/ButtonsCopyShareIcon.svelte";

  // Silly thing to get around typescript issues with sveltekit-i18n
  const tAny = t as any;

  const relayStoreContext: { getStore: () => RelayStore } = getContext("relayStore");
  let relayStore = relayStoreContext.getStore();

  export let agentPubKeyB64: AgentPubKeyB64 | null = null;
  export let creating = false;

  let contact = agentPubKeyB64 ? relayStore.getContact(agentPubKeyB64) : undefined;
  let firstName = $contact?.firstName || "";
  let lastName = $contact?.lastName || "";
  let publicKeyB64 = agentPubKeyB64 || "";
  let imageUrl = $contact?.avatar || "";

  let editing = !agentPubKeyB64 || creating;
  let pendingSave = false;
  let valid = false;
  let error = "";
  let decodedPublicKey: HoloHash;

  $: contacts = relayStore.contacts;
  $: if (!pendingSave) {
    try {
      decodedPublicKey = decodeHashFromBase64(publicKeyB64);
      if (firstName.trim().length === 0 || publicKeyB64.trim().length === 0) {
        valid = false;
        error = "";
      } else if (decodedPublicKey.length !== 39) {
        valid = false;
        error = $t("contacts.invalid_contact_code");
      } else if (!agentPubKeyB64 && contacts.find((c) => get(c).publicKeyB64 === publicKeyB64)) {
        valid = false;
        error = $t("contacts.contact_already_exist");
      } else if (relayStore.client.myPubKeyB64 === publicKeyB64) {
        valid = false;
        error = $t("contacts.cant_add_yourself");
      } else {
        valid = true;
        error = "";
      }
    } catch (e) {
      valid = false;
      error = $t("contacts.invalid_contact_code");
    }
  }

  async function saveContact() {
    pendingSave = true;
    try {
      const newContactData = {
        avatar: imageUrl,
        firstName,
        lastName,
        publicKeyB64,
      };
      const newContact = $contact
        ? await relayStore.updateContact({ ...$contact, ...newContactData })
        : await relayStore.createContact(newContactData);
      if (newContact) {
        if (!agentPubKeyB64) {
          const conversationStore = newContact.getPrivateConversation();
          if (conversationStore) {
            return goto(`/conversations/${get(conversationStore).conversation.dnaHashB64}`);
          } else {
            // XXX: this shouldn't happen, but is a backup if the private conversation doesn't get created for some reason
            goto(`/contacts/${get(newContact).publicKeyB64}`);
          }
        }
        agentPubKeyB64 = get(newContact).publicKeyB64;
        contact = newContact;
      }
      pendingSave = false;
      editing = false;
    } catch (e) {
      console.error(e);
      error = $tAny("contacts.error_saving", { updating: !!agentPubKeyB64 });
      pendingSave = false;
    }
  }

  function cancel() {
    imageUrl = $contact?.avatar || "";
    firstName = $contact?.firstName || "";
    lastName = $contact?.lastName || "";

    if (!agentPubKeyB64 || creating) {
      history.back();
    } else {
      editing = false;
    }
  }
</script>

<div class="flex flex-1 flex-col items-center p-4">
  <div class="mb-5 mt-6 flex flex-col items-center justify-center">
    <HiddenFileInput
      id="avatarInput"
      accept="image/jpeg, image/png, image/gif"
      on:change={(event) => {
        editing = true;
        imageUrl = event.detail;
      }}
    />

    <!-- Label styled as a big clickable icon -->
    {#if imageUrl}
      <div class="relative">
        <img src={imageUrl} alt="Avatar" class="h-32 w-32 rounded-full object-cover" />
        <label
          for="avatarInput"
          class="bg-tertiary-500 hover:bg-tertiary-600 dark:bg-secondary-500 dark:hover:bg-secondary-400 absolute bottom-0 right-0 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full pl-1"
        >
          <SvgIcon icon="image" color={$modeCurrent ? "%232e2e2e" : "white"} />
        </label>
      </div>
    {:else}
      <label
        for="avatarInput"
        class="bg-tertiary-500 hover:bg-tertiary-600 dark:bg-secondary-500 dark:hover:bg-secondary-400 flex h-32 w-32 cursor-pointer items-center justify-center rounded-full rounded-full"
      >
        <SvgIcon icon="image" size={44} color={$modeCurrent ? "%232e2e2e" : "white"} />
      </label>
    {/if}
  </div>

  {#if editing}
    <div class="flex w-full grow flex-col justify-start px-8">
      <h3 class="h3">{$t("common.first_name")} *</h3>
      <input
        autofocus
        class="bg-surface-900 border-none pl-0.5 outline-none focus:outline-none focus:ring-0"
        type="text"
        placeholder={$t("contacts.enter_first_name")}
        name="name"
        bind:value={firstName}
        minlength={1}
      />

      <h3 class="h3 mt-4">{$t("common.last_name")}</h3>
      <input
        class="bg-surface-900 border-none pl-0.5 outline-none focus:outline-none focus:ring-0"
        type="text"
        placeholder={$t("contacts.enter_last_name")}
        name="name"
        bind:value={lastName}
      />

      <h3 class="h3 mt-4">{$t("contacts.contact_code")} *</h3>
      <input
        class="bg-surface-900 border-none pl-0.5 outline-none focus:outline-none focus:ring-0"
        type="text"
        placeholder={$t("contacts.enter_contact_code")}
        name="publicKey"
        bind:value={publicKeyB64}
        minlength={1}
      />
      {#if !isEmpty(error)}
        <p class="text-error-500 ml-1 mt-1 text-xs">{error}</p>
      {/if}
      {#if !agentPubKeyB64}
        <p class="text-secondary-600 dark:text-tertiary-700 mb-4 mt-4 text-xs">
          {$t("contacts.request_contact_code")}
        </p>
      {/if}
    </div>

    <div class="my-4 flex justify-center">
      <Button
        moreClasses="w-36 justify-center !variant-filled-tertiary dark:!variant-filled-secondary"
        on:click={() => {
          cancel();
        }}
      >
        <strong class="">{$t("common.cancel")}</strong>
      </Button>
      <Button
        moreClasses="w-48 ml-4 justify-center !variant-filled-secondary dark:!variant-filled-tertiary disabled:border disabled:!border-tertiary-700 disabled:!bg-surface-500 disabled:!text-tertiary-700 disabled:!opacity-100 dark:disabled:!bg-secondary-900 dark:disabled:!text-tertiary-700"
        on:click={() => {
          saveContact();
        }}
        disabled={!valid || pendingSave}
      >
        <strong class=""
          >{#if agentPubKeyB64}{$t("common.save")}{:else}{$t("common.done")}{/if}</strong
        >
      </Button>
    </div>
  {:else}
    <div class="flex flex-1 flex-col items-center">
      <div class="flex flex-row justify-center">
        <h1 class="mr-2 flex-shrink-0 text-3xl">{$contact?.name}</h1>

        <button on:click={() => (editing = true)}>
          <SvgIcon icon="write" size={24} color="gray" moreClasses="cursor-pointer" />
        </button>
      </div>
      <div class="mt-2 flex items-center justify-center">
        <span
          class="text-secondary-400 dark:text-tertiary-700 mr-1 w-64 overflow-hidden text-ellipsis text-nowrap"
        >
          {$contact?.publicKeyB64}
        </span>
        {#if $contact}
          <ButtonsCopyShareIcon text={$contact.publicKeyB64} />
        {/if}
      </div>
    </div>

    {#if contact?.getIsPendingConnection()}
      <div
        class="bg-tertiary-500 dark:bg-secondary-500 mx-8 flex flex-col items-center rounded-xl p-4"
      >
        <SvgIcon icon="handshake" size={36} color={$modeCurrent ? "%23232323" : "white"} />
        <h1 class="text-secondary-500 dark:text-tertiary-100 mt-2 text-xl font-bold">
          {$t("contacts.pending_connection_header")}
        </h1>
        <p class="text-secondary-400 dark:text-tertiary-700 mb-6 mt-4 text-center text-sm">
          {$tAny("contacts.pending_connection_description", {
            name: $contact?.firstName,
          })}
        </p>
        {#if $contact}
          {#await contact
            .getPrivateConversation()
            ?.makeInviteCodeForAgent($contact.publicKeyB64) then res}
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
        {/if}
      </div>
    {:else}
      <div class="my-4">
        <Button
          moreClasses="variant-filled-tertiary text-sm font-bold w-auto"
          on:click={() => {
            const conversationStore = contact?.getPrivateConversation();
            if (conversationStore) {
              goto(`/conversations/${get(conversationStore).conversation.dnaHashB64}`);
            }
          }}
        >
          <SvgIcon icon="speechBubble" size={20} color="%23FD3524" moreClasses="mr-2" />
          {$t("contacts.send_message")}
        </Button>
      </div>
    {/if}
  {/if}
</div>
