<script lang="ts">
  import HiddenFileInput from "$lib/HiddenFileInput.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher<{ change: string }>();

  export let value: string = "";
  export let loading: boolean = false;
  export let disabled: boolean = false;

  $: disabledClasses = disabled ? "" : "hover:bg-tertiary-600 dark:hover:bg-secondary-400 ";
</script>

<div class="mb-5 mt-6 flex flex-col items-center justify-center">
  <HiddenFileInput
    id="avatarInput"
    accept="image/jpeg, image/png, image/gif"
    {disabled}
    bind:value
    on:change={(e) => {
      dispatch("change", e.detail);
    }}
  />

  <!-- Label styled as a big clickable icon -->
  <div class="relative">
    {#if loading}
      <label
        for="avatarInput"
        class="bg-tertiary-500 dark:bg-secondary-500 flex h-32 w-32 cursor-pointer items-center justify-center rounded-full rounded-full"
      >
        <SvgIcon icon="spinner" moreClasses="h-[44px] w-[44px] text-base" />
      </label>
    {:else if value.length > 0}
      <img src={value} alt="Avatar" class="h-32 w-32 rounded-full object-cover" />
    {:else}
      <label
        for="avatarInput"
        class="bg-tertiary-500 dark:bg-secondary-500 flex h-32 w-32 cursor-pointer items-center justify-center rounded-full rounded-full {disabledClasses}"
      >
        <SvgIcon icon="image" moreClasses="h-[44px] w-[44px] text-base" />
      </label>
    {/if}

    {#if value.length > 0}
      <label
        for="avatarInput"
        class="bg-tertiary-500 dark:bg-secondary-500 absolute bottom-0 right-0 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full pl-1 {disabledClasses}"
      >
        <SvgIcon icon="image" moreClasses="text-base" />
      </label>
    {/if}
  </div>
</div>
