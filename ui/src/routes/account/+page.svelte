<script lang="ts">
  import { getContext } from "svelte";
  import { QRCodeImage } from "svelte-qrcode-image";
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import toast from "svelte-french-toast";
  import { MIN_FIRST_NAME_LENGTH } from "$config";
  import ButtonsCopyShare from "$lib/ButtonsCopyShare.svelte";
  import ProfileNameInput from "./ProfileNameInput.svelte";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";
  import InputImageAvatar from "$lib/InputImageAvatar.svelte";
  import { type CellProfileStore, type ProfileStore } from "$store/ProfileStore";
  import { invoke } from "@tauri-apps/api/core";
  import Button from "$lib/Button.svelte";

  type UserNetworkSettings = {
    bootstrapUrl: string | undefined;
    signalUrl: string | undefined;
    iceServers: Array<string> | undefined;
  };

  const profileStore = getContext<{ getStore: () => ProfileStore }>("profileStore").getStore();
  const provisionedRelayCellProfileStore = getContext<{
    getProvisionedRelayCellProfileStore: () => CellProfileStore;
  }>("profileStore").getProvisionedRelayCellProfileStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  $: myProfileExtended = $provisionedRelayCellProfileStore.data[myPubKeyB64];

  let saving = false;
  let editingName = false;

  async function save(firstNameVal: string, lastNameVal: string, avatarVal: string) {
    if (firstNameVal.length < MIN_FIRST_NAME_LENGTH) return;
    if (saving) return;

    saving = true;
    try {
      await profileStore.updateProfile({
        firstName: firstNameVal,
        lastName: lastNameVal,
        avatar: avatarVal,
      });
    } catch (e) {
      toast.error(`${$t("common.update_profile_error")}: ${e.message}`);
    }
    saving = false;
    editingName = false;
  }
  async function setUserNetworkConfig(settings: UserNetworkSettings) {
    return invoke("set_user_network_config", settings);
  }
  async function getUserNetworkConfig(): Promise<UserNetworkSettings> {
    return invoke("get_user_network_config");
  }
  async function defaultUserNetworkConfig(): Promise<UserNetworkSettings> {
    return invoke("default_user_network_config");
  }

  // TODO: remove this and create actual UI for updating the setting along with notification
  // that doing so will restart the app.
  async function testUpdateSettings() {
    let currentSettings: UserNetworkSettings | null = await getUserNetworkConfig();
    if (currentSettings === null) {
      console.log("no user settings have been set, getting defaults");
      currentSettings = await defaultUserNetworkConfig();
      console.log("setting defaults as custom setting for testing purposes");
      await setUserNetworkConfig(currentSettings);
    }
    console.log(JSON.stringify(currentSettings));
  }
</script>

<Header back />

<div class="flex w-full grow flex-col items-center">
  <InputImageAvatar
    value={myProfileExtended.profile.fields.avatar}
    loading={saving}
    disabled={saving}
    on:change={(e) =>
      save(
        myProfileExtended.profile.fields.firstName,
        myProfileExtended.profile.fields.lastName,
        e.detail,
      )}
  />

  <div class="mb-10 flex flex-row items-center justify-center py-2">
    {#if editingName}
      <ProfileNameInput
        initialFirstName={myProfileExtended.profile.fields.firstName}
        initialLastName={myProfileExtended.profile.fields.lastName}
        on:save={(e) =>
          save(e.detail.firstName, e.detail.lastName, myProfileExtended.profile.fields.avatar)}
        on:cancel={() => (editingName = false)}
        disabled={saving}
        loading={saving}
      />
    {:else}
      <h1 class="mr-2 flex-shrink-0 text-3xl">
        {myProfileExtended.profile.nickname}
      </h1>

      <ButtonIconBare
        on:click={() => (editingName = true)}
        disabled={saving}
        icon="write"
        moreClasses="text-gray-500"
      />
    {/if}
  </div>

  <QRCodeImage text={myPubKeyB64} width={7} />

  <p
    class="text-secondary-400 dark:text-tertiary-700 mb-4 mt-8 w-64 overflow-hidden text-ellipsis text-nowrap"
  >
    {myPubKeyB64}
  </p>

  <div class="mb-8">
    <ButtonsCopyShare
      text={myPubKeyB64}
      copyLabel={$t("common.copy_your_contact_code")}
      shareLabel={$t("common.share_your_contact_code")}
    />
    <Button style="margin-top:5px" on:click={async () => await testUpdateSettings()}
      >Settings</Button
    >
  </div>
</div>
