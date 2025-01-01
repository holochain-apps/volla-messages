<script lang="ts">
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext, onMount } from "svelte";
  import { QRCodeImage } from "svelte-qrcode-image";
  import Avatar from "$lib/Avatar.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { makeFullName } from "$lib/utils";
  import { ProfilesStore } from "@holochain-open-dev/profiles";
  import { get } from "svelte/store";
  import toast from "svelte-french-toast";
  import HiddenFileInput from "$lib/HiddenFileInput.svelte";
  import { MIN_FIRST_NAME_LENGTH } from "$config";
  import ButtonsCopyShare from "$lib/ButtonsCopyShare.svelte";
  import ProfileNameInput from "./ProfileNameInput.svelte";
  import type { AgentPubKey, AgentPubKeyB64 } from "@holochain/client";
  import type { RelayStore } from "$store/RelayStore";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";

  const relayStore = getContext<{ getStore: () => RelayStore }>("relayStore").getStore();

  const profilesContext: { getStore: () => ProfilesStore } = getContext("profiles");
  let profilesStore = profilesContext.getStore();

  const agentPublicKey64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  const myPubKey = getContext<{ getMyPubKey: () => AgentPubKey }>("myPubKey").getMyPubKey();

  let firstName = get(profilesStore.myProfile).value?.entry.fields.firstName || "";
  let lastName = get(profilesStore.myProfile).value?.entry.fields.lastName || "";
  let avatar = get(profilesStore.myProfile).value?.entry.fields.avatar || "";

  let editingName = false;

  async function saveName(newFirstName: string, newLastName: string) {
    if (newFirstName.length < MIN_FIRST_NAME_LENGTH) return;

    try {
      await relayStore.client.updateProfile(newFirstName, newLastName, avatar);
      firstName = newFirstName;
      lastName = newLastName;
    } catch (e) {
      toast.error(`${$t("common.update_profile_error")}: ${e.message}`);
    }
    editingName = false;
  }

  onMount(() => {
    // Trigger refetching profile if not already in profilesStore
    get(profilesStore.myProfile);
  });
</script>

<Header back />

<div class="flex w-full grow flex-col items-center pt-10">
  <HiddenFileInput
    id="avatarInput"
    accept="image/jpeg, image/png, image/gif"
    on:change={(event) => {
      try {
        relayStore.client.updateProfile(firstName, lastName, event.detail);
      } catch (e) {
        toast.error(`${$t("common.upload_image_error")}: ${e.message}`);
      }
    }}
  />

  <div style="position:relative">
    <Avatar agentPubKey={myPubKey} size={128} moreClasses="mb-4" />
    <label
      for="avatarInput"
      class="bg-tertiary-500 hover:bg-secondary-300 dark:bg-secondary-500 dark:hover:bg-secondary-400 absolute bottom-5 right-0 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full pl-1"
    >
      <SvgIcon icon="image" color={$modeCurrent ? "%232e2e2e" : "white"} size={26} />
    </label>
  </div>
  <div class="mb-10 flex flex-row items-center justify-center py-2">
    {#if editingName}
      <ProfileNameInput
        initialFirstName={firstName}
        initialLastName={lastName}
        on:save={(e) => saveName(e.detail.firstName, e.detail.lastName)}
        on:cancel={() => (editingName = false)}
      />
    {:else}
      <h1 class="mr-2 flex-shrink-0 text-3xl">
        {makeFullName(firstName, lastName)}
      </h1>

      <ButtonIconBare on:click={() => (editingName = true)} icon="write" iconColor="gray" />
    {/if}
  </div>

  <QRCodeImage text={agentPublicKey64} width={7} />

  <p
    class="text-secondary-400 dark:text-tertiary-700 mb-4 mt-8 w-64 overflow-hidden text-ellipsis text-nowrap"
  >
    {agentPublicKey64}
  </p>

  <div class="mb-8">
    <ButtonsCopyShare
      text={agentPublicKey64}
      copyLabel={$t("common.copy_your_contact_code")}
      shareLabel={$t("common.share_your_contact_code")}
    />
  </div>
</div>
