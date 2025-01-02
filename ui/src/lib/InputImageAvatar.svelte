<script lang="ts">
  import HiddenFileInput from "$lib/HiddenFileInput.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher<{ change: string }>();

  export let value: string = "";
</script>

<div class="mb-5 mt-6 flex flex-col items-center justify-center">
  <HiddenFileInput
    id="avatarInput"
    accept="image/jpeg, image/png, image/gif"
    on:change={(e) => {
      value = e.detail;
      dispatch("change", e.detail);
    }}
  />

  <!-- Label styled as a big clickable icon -->
  {#if value.length > 0}
    <div class="relative">
      <img src={value} alt="Avatar" class="h-32 w-32 rounded-full object-cover" />
      <label
        for="avatarInput"
        class="bg-tertiary-500 hover:bg-tertiary-600 dark:bg-secondary-500 dark:hover:bg-secondary-400 absolute bottom-0 right-0 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full pl-1"
      >
        <SvgIcon icon="image" moreClasses="text-base" />
      </label>
    </div>
  {:else}
    <label
      for="avatarInput"
      class="bg-tertiary-500 hover:bg-tertiary-600 dark:bg-secondary-500 dark:hover:bg-secondary-400 flex h-32 w-32 cursor-pointer items-center justify-center rounded-full rounded-full"
    >
      <SvgIcon icon="image" moreClasses="h-[44px] w-[44px] text-base" />
    </label>
  {/if}
</div>
