<script lang="ts">
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext } from "svelte";
  import { writable } from "svelte/store";
  import { goto } from "$app/navigation";
  import Button from "$lib/Button.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { RelayClient } from "$store/RelayClient";
  import { ProfileCreateStore } from "$store/ProfileCreateStore";
  import toast from "svelte-french-toast";
  import HiddenFileInput from "$lib/HiddenFileInput.svelte";

  const relayClientContext: { getClient: () => RelayClient } =
    getContext("relayClient");
  let relayClient = relayClientContext.getClient();

  let firstName = "";
  let lastName = "";
  let avatarDataUrl = "";

  $: {
    // Subscribe to the store and update local state
    ProfileCreateStore.subscribe(($profile) => {
      firstName = $profile.firstName;
      lastName = $profile.lastName;
      avatarDataUrl = $profile.avatar;
    });
  }

  async function createAccount() {
    try {
      await relayClient.createProfile(firstName, lastName, avatarDataUrl);
      goto("/welcome");
    } catch (e) {
      toast.error(`${$t("common.create_account_error")}: ${e.message}`);
    }
  }
</script>

<Header>
  <img src="/icon.png" alt="Logo" width="16" />
</Header>

<div class="flex grow flex-col items-center justify-center">
  <h1 class="h1 mb-10">{$t("common.select_an_avatar")}</h1>

  <HiddenFileInput
    accept="image/*"
    id="avatarInput"
    on:change={(e) =>
      ProfileCreateStore.update((current) => {
        return { firstName, lastName, avatar: e.detail };
      })}
  />

  <!-- Label styled as a big clickable icon -->
  <label
    for="avatarInput"
    class="file-icon-label bg-secondary-300 hover:bg-secondary-400 flex h-32 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-full"
  >
    {#if avatarDataUrl}
      <img
        src={avatarDataUrl}
        alt="Avatar"
        class="h-32 w-32 rounded-full object-cover"
      />
    {:else}
      <img
        src="/image-placeholder.png"
        alt="Avatar Uploader"
        class="h-16 w-16 rounded-full"
      />
    {/if}
  </label>
</div>

<div class="items-right flex w-full justify-end pr-4">
  <Button on:click={createAccount}>
    <SvgIcon
      icon="hand"
      size="20"
      color={$modeCurrent ? "white" : "%23FD3524"}
    />
    <strong class="ml-2">{$t("common.jump_in")}</strong>
  </Button>
</div>
