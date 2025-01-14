<script lang="ts">
  import { getContext } from "svelte";
  import Button from "$lib/Button.svelte";
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import toast from "svelte-french-toast";
  import HiddenFileInput from "$lib/HiddenFileInput.svelte";
  import type { ProfileStore } from "$store/ProfileStore";
  import type { CreateProfileInputUI } from "$lib/types";

  const profileStore = getContext<{ getStore: () => ProfileStore }>("profileStore").getStore();

  export let value: CreateProfileInputUI = {
    firstName: "",
    lastName: "",
    avatar: "",
  };
  let loading = false;

  async function createAccount() {
    loading = true;
    try {
      await profileStore.createProfile(value);
    } catch (e) {
      toast.error(`${$t("common.create_account_error")}: ${e}`);
    }
    loading = false;
  }
</script>

<Header>
  <div slot="left" class="p-4">
    <div class="bg-appLogo h-[16px] w-[16px] bg-contain bg-center bg-no-repeat"></div>
  </div>
</Header>

<div class="flex grow flex-col items-center justify-center">
  <h1 class="h1 mb-10">{$t("common.select_an_avatar")}</h1>

  <HiddenFileInput accept="image/*" id="avatarInput" bind:value={value.avatar} />

  <!-- Label styled as a big clickable icon -->
  <label
    for="avatarInput"
    class="file-icon-label bg-secondary-300 hover:bg-secondary-400 flex h-32 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-full"
  >
    {#if value.avatar}
      <img src={value.avatar} alt="Avatar" class="h-32 w-32 rounded-full object-cover" />
    {:else}
      <img src="/image-placeholder.png" alt="Avatar Uploader" class="h-16 w-16 rounded-full" />
    {/if}
  </label>
</div>

<div class="items-right my-8 flex w-full justify-end pr-4">
  <Button on:click={createAccount} icon="hand" {loading}>
    {$t("common.jump_in")}
  </Button>
</div>
