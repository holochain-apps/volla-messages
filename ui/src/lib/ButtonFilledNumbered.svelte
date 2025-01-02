<script lang="ts">
  import SvgIcon from "./SvgIcon.svelte";

  export let moreClasses = "";
  export let icon: string;
  export let disabled: boolean = false;
  export let loading: boolean = false;
  export let number: number | undefined = undefined;
</script>

<button
  class="bg-primary-500 dark:text-tertiary-400 flex items-center justify-center space-x-2 rounded-full border-0 py-1 pl-2 pr-4
  {moreClasses}"
  {disabled}
  on:click
>
  <div class="bg-surface-500 flex h-9 w-9 items-center justify-center rounded-full">
    {#if loading}
      <SvgIcon icon="spinner" moreClasses="text-primary-600 w-[10px] h-[10px]" />
    {:else}
      <SvgIcon {icon} moreClasses="text-primary-600 w-[13px] h-[13px]" />
    {/if}

    {#if number !== undefined}
      <div class="text-primary-500 ml-1 text-sm font-extrabold">
        {number}
      </div>
    {/if}
  </div>

  <slot></slot>
</button>
