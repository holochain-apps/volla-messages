<script lang="ts">
  import { MIN_FIRST_NAME_LENGTH, MIN_TITLE_LENGTH } from "$config";
  import ButtonIcon from "$lib/ButtonIcon.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";

  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher<{
    save: { firstName: string; lastName: string };
    cancel: null;
  }>();

  export let initialFirstName: string;
  export let initialLastName: string;
  export let disabled: boolean = false;
  export let loading: boolean = false;

  let firstName: string = initialFirstName;
  let lastName: string = initialLastName;

  $: isFirstNameValid = firstName.trim().length >= MIN_FIRST_NAME_LENGTH;
</script>

<div class="flex flex-row flex-wrap items-center justify-center">
  <div class="flext-wrap flex items-center justify-center">
    <input
      autofocus
      class="bg-surface-900 max-w-40 border-none p-0 pl-0.5 text-start text-3xl outline-none focus:outline-none focus:ring-0"
      type="text"
      placeholder={$t("common.first") + " *"}
      name="firstName"
      bind:value={firstName}
      minlength={MIN_FIRST_NAME_LENGTH}
      on:keydown={(event) => {
        if (event.key === "Escape") dispatch("cancel");
      }}
      {disabled}
    />
    <input
      class="bg-surface-900 max-w-40 border-none p-0 text-start text-3xl outline-none focus:outline-none focus:ring-0"
      type="text"
      placeholder={$t("common.last")}
      name="lastName"
      bind:value={lastName}
      on:keydown={(event) => {
        if (event.key === "Enter") dispatch("save", { firstName, lastName });
        if (event.key === "Escape") dispatch("cancel");
      }}
      {disabled}
    />
  </div>
  {#if loading}
    <SvgIcon icon="spinner" />
  {:else}
    <div class="flex flex-none items-center justify-center space-x-2">
      <ButtonIcon
        moreClasses="!text-primary-600"
        on:click={() => dispatch("save", { firstName, lastName })}
        icon="checkMark"
        disabled={!isFirstNameValid || disabled}
      />
      <ButtonIcon moreClasses="text-gray" {disabled} on:click={() => dispatch("cancel")} icon="x" />
    </div>
  {/if}
</div>
