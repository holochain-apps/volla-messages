<script lang="ts">
  import Button from "$lib/Button.svelte";
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import { MIN_FIRST_NAME_LENGTH } from "$config";
  import { Alignment, type CreateProfileInputUI } from "$lib/types";
  import toast from "svelte-french-toast";

  export let value: CreateProfileInputUI = {
    firstName: "",
    lastName: "",
    avatar: "",
  };
  let inputValue = value;
  let saving = false;

  $: isFirstNameValid = inputValue.firstName.trim().length >= MIN_FIRST_NAME_LENGTH;

  async function saveName() {
    if (!isFirstNameValid) return;

    saving = true;
    try {
      value = {
        ...inputValue,
        avatar: inputValue.avatar,
      };
    } catch (e) {
      toast.error("Failed to set name");
    }
    saving = false;
  }
</script>

<Header>
  <div slot="left" class="p-4">
    <div class="bg-appLogo h-[16px] w-[16px] bg-contain bg-center bg-no-repeat"></div>
  </div>
</Header>

<form on:submit|preventDefault={saveName} class="contents">
  <div class="flex grow flex-col justify-center">
    <h1 class="h1">{$t("common.what_is_your_name")}</h1>
    <input
      autofocus
      class="bg-surface-500 dark:bg-surface-900 mt-2 border-none pl-0.5 outline-none focus:outline-none focus:ring-0"
      type="text"
      placeholder={$t("common.first_name") + " *"}
      name="firstName"
      bind:value={inputValue.firstName}
      minlength={MIN_FIRST_NAME_LENGTH}
    />
    <input
      class="bg-surface-500 dark:bg-surface-900 mt-2 border-none pl-0.5 outline-none focus:outline-none focus:ring-0"
      type="text"
      placeholder={$t("common.last_name")}
      name="lastName"
      bind:value={inputValue.lastName}
    />
  </div>

  <div class="items-right my-8 flex w-full justify-end pr-4">
    <Button
      on:click={saveName}
      disabled={!isFirstNameValid || saving}
      icon="arrowRight"
      iconAlign={Alignment.Right}
      moreClasses="!font-normal"
    >
      {@html $t("common.next_avatar")}
    </Button>
  </div>
</form>
