<script lang="ts">
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext, onMount } from "svelte";
  import { QRCodeImage } from "svelte-qrcode-image";
  import Avatar from "$lib/Avatar.svelte";
  import Button from "$lib/Button.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { makeFullName } from "$lib/utils";
  import { RelayClient } from "$store/RelayClient";
  import { ProfilesStore } from "@holochain-open-dev/profiles";
  import { get } from "svelte/store";
  import toast from "svelte-french-toast";
  import HiddenFileInput from "$lib/HiddenFileInput.svelte";
  import { MIN_FIRST_NAME_LENGTH } from "$config";
  import ButtonsCopyShare from "$lib/ButtonsCopyShare.svelte";

  const relayClientContext: { getClient: () => RelayClient } = getContext("relayClient");
  let relayClient = relayClientContext.getClient();

  const profilesContext: { getStore: () => ProfilesStore } = getContext("profiles");
  let profilesStore = profilesContext.getStore();
  $: prof = profilesStore ? profilesStore.myProfile : undefined;
  $: profileData = $prof?.status === "complete" ? $prof.value?.entry : undefined;

  const agentPublicKey64 = relayClient.myPubKeyB64;

  $: firstName = profileData?.fields.firstName || "";
  $: lastName = profileData?.fields.lastName || "";
  $: isFirstNameValid = firstName.trim().length >= MIN_FIRST_NAME_LENGTH;

  let editingName = false;
  let firstNameElem: HTMLInputElement;
  let lastNameElem: HTMLInputElement;

  $: saveName = async () => {
    if (profileData && firstNameElem.value?.length >= MIN_FIRST_NAME_LENGTH) {
      try {
        const firstName = firstNameElem.value;
        const lastName = lastNameElem.value;
        await relayClient.updateProfile(firstName, lastName, profileData.fields.avatar);
        editingName = false;
      } catch (e) {
        toast.error(`${$t("common.update_profile_error")}: ${e.message}`);
      }
    }
  };

  $: cancelEditName = () => {
    editingName = false;
    firstName = profileData?.fields.firstName || "";
    lastName = profileData?.fields.lastName || "";
  };

  onMount(() => {
    // Trigger refetching profile if not already in profilesStore
    get(profilesStore.myProfile);
  });
</script>

<Header back />

{#if $prof && $prof.status === "complete" && $prof.value}
  <div class="flex w-full grow flex-col items-center pt-10">
    <HiddenFileInput
      id="avatarInput"
      accept="image/jpeg, image/png, image/gif"
      on:change={(event) => {
        try {
          relayClient.updateProfile(firstName, lastName, event.detail);
        } catch (e) {
          toast.error(`${$t("common.upload_image_error")}: ${e.message}`);
        }
      }}
    />

    <div style="position:relative">
      <Avatar agentPubKey={relayClient.myPubKey} size={128} moreClasses="mb-4" />
      <label
        for="avatarInput"
        class="bg-tertiary-500 hover:bg-secondary-300 dark:bg-secondary-500 dark:hover:bg-secondary-400 absolute bottom-5 right-0 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full pl-1"
      >
        <SvgIcon icon="image" color={$modeCurrent ? "%232e2e2e" : "white"} size={26} />
      </label>
    </div>

    {#if editingName}
      <div class="flex flex-row items-center justify-center">
        <input
          autofocus
          class="bg-surface-900 max-w-40 border-none pl-0.5 pt-0 text-start text-3xl outline-none focus:outline-none focus:ring-0"
          type="text"
          placeholder={$t("common.first") + " *"}
          name="firstName"
          bind:this={firstNameElem}
          value={firstName}
          minlength={MIN_FIRST_NAME_LENGTH}
          on:keydown={(event) => {
            if (event.key === "Escape") cancelEditName();
          }}
        />
        <input
          class="bg-surface-900 max-w-40 border-none pl-0.5 pt-0 text-start text-3xl outline-none focus:outline-none focus:ring-0"
          type="text"
          placeholder={$t("common.last")}
          name="lastName"
          bind:this={lastNameElem}
          value={lastName}
          on:keydown={(event) => {
            if (event.key === "Enter") saveName();
            if (event.key === "Escape") cancelEditName();
          }}
        />
        <Button
          moreClasses="h-6 w-6 rounded-md py-0 !px-0 mb-0 mr-2 bg-primary-100 flex items-center justify-center"
          on:click={() => saveName()}
          disabled={!isFirstNameValid}
        >
          <SvgIcon icon="checkMark" color="%23FD3524" size={12} />
        </Button>
        <Button
          moreClasses="h-6 w-6 !px-0 py-0 mb-0 rounded-md bg-surface-400 flex items-center justify-center"
          on:click={() => cancelEditName()}
        >
          <SvgIcon icon="x" color="gray" size={12} />
        </Button>
      </div>
    {:else}
      <div class="row mb-10 flex items-center justify-center">
        <h1 class="mr-2 flex-shrink-0 text-3xl">
          {makeFullName(firstName, lastName)}
        </h1>

        <button on:click={() => (editingName = true)}>
          <SvgIcon icon="write" size={24} color="gray" moreClasses="cursor-pointer" />
        </button>
      </div>
    {/if}

    <QRCodeImage text={agentPublicKey64} width={7} />

    <p
      class="text-secondary-400 dark:text-tertiary-700 mb-4 mt-8 w-64 overflow-hidden text-ellipsis text-nowrap"
    >
      {agentPublicKey64}
    </p>

    <ButtonsCopyShare
      text={agentPublicKey64}
      copyLabel={$t("common.copy_your_contact_code")}
      shareLabel={$t("common.share_your_contact_code")}
    />
  </div>
{/if}
