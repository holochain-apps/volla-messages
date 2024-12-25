<script lang="ts">
  import { isEmpty } from "lodash-es";
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext } from "svelte";
  import { writable, get } from "svelte/store";
  import { decodeHashFromBase64, type HoloHash } from "@holochain/client";
  import { goto } from "$app/navigation";
  import Button from "$lib/Button.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { copyToClipboard, isMobile, shareText } from "$lib/utils";
  import { RelayStore } from "$store/RelayStore";
  import toast from "svelte-french-toast";
  import HiddenFileInput from "$lib/HiddenFileInput.svelte";

  // Silly thing to get around typescript issues with sveltekit-i18n
  const tAny = t as any;

  const relayStoreContext: { getStore: () => RelayStore } =
    getContext("relayStore");
  let relayStore = relayStoreContext.getStore();

  export let editContactId: string | null = null;
  export let creating = false;

  let contact = editContactId ? relayStore.getContact(editContactId) : null;
  let firstName = contact?.data.firstName || "";
  let lastName = contact?.data.lastName || "";
  let publicKeyB64 = editContactId || "";
  let imageUrl = writable(contact?.data.avatar || "");

  let editing = !editContactId || creating;
  let pendingSave = false;
  let valid = false;
  let error = writable("");
  let decodedPublicKey: HoloHash;

  $: contacts = relayStore.contacts;
  $: if (!pendingSave) {
    try {
      decodedPublicKey = decodeHashFromBase64(publicKeyB64);
      if (firstName.trim().length === 0 || publicKeyB64.trim().length === 0) {
        valid = false;
        error.set("");
      } else if (decodedPublicKey.length !== 39) {
        valid = false;
        error.set($t("contacts.invalid_contact_code"));
      } else if (
        !editContactId &&
        $contacts.find((c) => c.data.publicKeyB64 === publicKeyB64)
      ) {
        valid = false;
        error.set($t("contacts.contact_already_exist"));
      } else if (relayStore.client.myPubKeyB64 === publicKeyB64) {
        valid = false;
        error.set($t("contacts.cant_add_yourself"));
      } else {
        valid = true;
        error.set("");
      }
    } catch (e) {
      valid = false;
      error.set($t("contacts.invalid_contact_code"));
    }
  }

  async function saveContact() {
    pendingSave = true;
    try {
      const newContactData = {
        avatar: get(imageUrl),
        firstName,
        lastName,
        publicKeyB64,
      };
      const newContact = contact
        ? await relayStore.updateContact({ ...contact, ...newContactData })
        : await relayStore.createContact(newContactData);
      if (newContact) {
        if (!editContactId) {
          if (newContact.privateConversation) {
            return goto(`/conversations/${newContact.privateConversation?.id}`);
          } else {
            // XXX: this shouldn't happen, but is a backup if the private conversation doesn't get created for some reason
            goto(`/contacts/${newContact.publicKeyB64}`);
          }
        }
        editContactId = newContact.publicKeyB64;
        contact = newContact;
      }
      pendingSave = false;
      editing = false;
    } catch (e) {
      console.error(e);
      error.set($tAny("contacts.error_saving", { updating: !!editContactId }));
      pendingSave = false;
    }
  }

  function cancel() {
    if (!editContactId || creating) {
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
        imageUrl.set(event.detail);
      }}
    />

    <!-- Label styled as a big clickable icon -->
    {#if $imageUrl}
      <div class="relative">
        <img
          src={$imageUrl}
          alt="Avatar"
          class="h-32 w-32 rounded-full object-cover"
        />
        <label
          for="avatarInput"
          class="absolute bottom-0 right-0 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-tertiary-500 pl-1 hover:bg-tertiary-600 dark:bg-secondary-500 dark:hover:bg-secondary-400"
        >
          <SvgIcon icon="image" color={$modeCurrent ? "%232e2e2e" : "white"} />
        </label>
      </div>
    {:else}
      <label
        for="avatarInput"
        class="flex h-32 w-32 cursor-pointer items-center justify-center rounded-full rounded-full bg-tertiary-500 hover:bg-tertiary-600 dark:bg-secondary-500 dark:hover:bg-secondary-400"
      >
        <SvgIcon
          icon="image"
          size="44"
          color={$modeCurrent ? "%232e2e2e" : "white"}
        />
      </label>
    {/if}
  </div>

  {#if editing}
    <div class="flex w-full grow flex-col justify-start px-8">
      <h3 class="h3">{$t("common.first_name")} *</h3>
      <input
        autofocus
        class="border-none bg-surface-900 pl-0.5 outline-none focus:outline-none focus:ring-0"
        type="text"
        placeholder={$t("contacts.enter_first_name")}
        name="name"
        bind:value={firstName}
        minlength={1}
      />

      <h3 class="h3 mt-4">{$t("common.last_name")}</h3>
      <input
        class="border-none bg-surface-900 pl-0.5 outline-none focus:outline-none focus:ring-0"
        type="text"
        placeholder={$t("contacts.enter_last_name")}
        name="name"
        bind:value={lastName}
      />

      <h3 class="h3 mt-4">{$t("contacts.contact_code")} *</h3>
      <input
        class="border-none bg-surface-900 pl-0.5 outline-none focus:outline-none focus:ring-0"
        type="text"
        placeholder={$t("contacts.enter_contact_code")}
        name="publicKey"
        bind:value={publicKeyB64}
        minlength={1}
      />
      {#if !isEmpty($error)}
        <p class="ml-1 mt-1 text-xs text-error-500">{$error}</p>
      {/if}
      {#if !editContactId}
        <p class="mb-4 mt-4 text-xs text-secondary-600 dark:text-tertiary-700">
          {$t("contacts.request_contact_code")}
        </p>
      {/if}
    </div>

    <footer class="flex justify-center">
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
          >{#if editContactId}{$t("common.save")}{:else}{$t(
              "common.done"
            )}{/if}</strong
        >
      </Button>
    </footer>
  {:else}
    <div class="flex flex-1 flex-col items-center">
      <div class="flex flex-row justify-center">
        <h1 class="mr-2 flex-shrink-0 text-3xl">{contact?.name}</h1>

        <button on:click={() => (editing = true)}>
          <SvgIcon
            icon="write"
            size="24"
            color="gray"
            moreClasses="cursor-pointer"
          />
        </button>
      </div>
      <div class="mt-2 flex items-center justify-center">
        <span
          class="mr-1 w-64 overflow-hidden text-ellipsis text-nowrap text-secondary-400 dark:text-tertiary-700"
        >
          {contact?.publicKeyB64}
        </span>
        <button
          on:click={async () => {
            try {
              if (!contact?.publicKeyB64)
                throw new Error("Contact Public Key not found");
              await copyToClipboard(contact.publicKeyB64);
              toast.success(`${$t("common.copy_success")}`);
            } catch (e) {
              toast.error(`${$t("common.copy_error")}: ${e.message}`);
            }
          }}
        >
          <SvgIcon icon="copy" size="20" color="%23999" />
        </button>
        {#if isMobile()}
          <button
            on:click={async () => {
              try {
                if (!contact?.publicKeyB64)
                  throw new Error("Contact Pub Key not found");
                await shareText(contact.publicKeyB64);
              } catch (e) {
                toast.error(`${$t("common.share_code_error")}: ${e.message}`);
              }
            }}
          >
            <SvgIcon icon="share" size="20" color="%23999" />
          </button>
        {/if}
      </div>
    </div>

    {#if contact?.pendingConnection}
      <div
        class="mx-8 flex flex-col items-center rounded-xl bg-tertiary-500 p-4 dark:bg-secondary-500"
      >
        <SvgIcon
          icon="handshake"
          size="36"
          color={$modeCurrent ? "%23232323" : "white"}
        />
        <h1
          class="mt-2 text-xl font-bold text-secondary-500 dark:text-tertiary-100"
        >
          {$t("contacts.pending_connection_header")}
        </h1>
        <p
          class="mb-6 mt-4 text-center text-sm text-secondary-400 dark:text-tertiary-700"
        >
          {$tAny("contacts.pending_connection_description", {
            name: contact?.firstName,
          })}
        </p>
        <div class="flex justify-center">
          <Button
            moreClasses="bg-surface-100 text-sm text-secondary-500 dark:text-tertiary-100 font-bold dark:bg-secondary-900"
            on:click={async () => {
              try {
                const inviteCode =
                  await contact?.privateConversation?.inviteCodeForAgent(
                    contact?.publicKeyB64
                  );
                if (!inviteCode)
                  throw new Error("Failed to generate invite code");
                await copyToClipboard(inviteCode);
                toast.success(`${$t("common.copy_success")}`);
              } catch (e) {
                toast.error(`${$t("common.copy_error")}: ${e.message}`);
              }
            }}
          >
            <SvgIcon
              icon="copy"
              size="20"
              color="%23FD3524"
              moreClasses="mr-2"
            />
            {$t("contacts.copy_invite_code")}
          </Button>
          {#if isMobile()}
            <Button
              moreClasses="bg-surface-100 text-sm text-secondary-500 dark:text-tertiary-100 font-bold dark:bg-secondary-900"
              on:click={async () => {
                try {
                  const inviteCode =
                    await contact?.privateConversation?.inviteCodeForAgent(
                      contact?.publicKeyB64
                    );
                  if (!inviteCode)
                    throw new Error("Failed to generate invite code");
                  await shareText(inviteCode);
                } catch (e) {
                  toast.error(`${$t("common.share_code_error")}: ${e.message}`);
                }
              }}
            >
              <SvgIcon
                icon="copy"
                size="20"
                color="%23FD3524"
                moreClasses="mr-2"
              />
              <strong>{$t("contacts.share_invite_code")}</strong>
            </Button>
          {/if}
        </div>
      </div>
    {:else}
      <Button
        moreClasses="variant-filled-tertiary text-sm font-bold w-auto"
        on:click={() =>
          goto(`/conversations/${contact?.privateConversation?.id}`)}
      >
        <SvgIcon
          icon="speechBubble"
          size="20"
          color="%23FD3524"
          moreClasses="mr-2"
        />
        {$t("contacts.send_message")}
      </Button>
    {/if}
  {/if}
</div>
