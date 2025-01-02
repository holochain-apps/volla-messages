<script lang="ts">
  import { getContext } from "svelte";
  import { goto } from "$app/navigation";
  import Button from "$lib/Button.svelte";
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import { ProfileCreateStore } from "$store/ProfileCreateStore";
  import toast from "svelte-french-toast";
  import HiddenFileInput from "$lib/HiddenFileInput.svelte";
  import type { RelayStore } from "$store/RelayStore";

  const relayStore = getContext<{ getStore: () => RelayStore }>("relayStore").getStore();

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
      await relayStore.client.createProfile(firstName, lastName, avatarDataUrl);
      goto("/welcome");
    } catch (e) {
      toast.error(`${$t("common.create_account_error")}: ${e.message}`);
    }
  }
</script>

<Header>
  <div slot="left" class="bg-appLogo h-auto w-[16px] bg-contain bg-center bg-no-repeat" />
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
      <img src={avatarDataUrl} alt="Avatar" class="h-32 w-32 rounded-full object-cover" />
    {:else}
      <img src="/image-placeholder.png" alt="Avatar Uploader" class="h-16 w-16 rounded-full" />
    {/if}
  </label>
</div>

<div class="items-right my-8 flex w-full justify-end pr-4">
  <Button on:click={createAccount} icon="hand">
    {$t("common.jump_in")}
  </Button>
</div>
