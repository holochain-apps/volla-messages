<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { QRCodeImage } from "svelte-qrcode-image";
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import { makeFullName } from "$lib/utils";
  import { ProfilesStore } from "@holochain-open-dev/profiles";
  import { get } from "svelte/store";
  import toast from "svelte-french-toast";
  import { MIN_FIRST_NAME_LENGTH } from "$config";
  import ButtonsCopyShare from "$lib/ButtonsCopyShare.svelte";
  import ProfileNameInput from "./ProfileNameInput.svelte";
  import type { AgentPubKey, AgentPubKeyB64 } from "@holochain/client";
  import type { RelayStore } from "$store/RelayStore";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";
  import InputImageAvatar from "$lib/InputImageAvatar.svelte";

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

<div class="flex w-full grow flex-col items-center">
  <InputImageAvatar
    value={avatar}
    on:change={(event) => {
      try {
        relayStore.client.updateProfile(firstName, lastName, event.detail);
      } catch (e) {
        toast.error(`${$t("common.upload_image_error")}: ${e.message}`);
      }
    }}
  />

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

      <ButtonIconBare
        on:click={() => (editingName = true)}
        icon="write"
        moreClasses="text-gray-500"
      />
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
