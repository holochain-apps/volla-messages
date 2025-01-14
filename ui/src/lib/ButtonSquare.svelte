<script lang="ts">
  import { getContext } from "svelte";
  import SvgIcon from "./SvgIcon.svelte";

  export let moreClasses = "";
  export let icon: string;
  export let disabled: boolean = false;
  export let label: string | undefined = undefined;
</script>

<button
  class="bg-tertiary-500 dark:bg-secondary-500 dark:text-tertiary-400 flex h-24 w-28 flex-col items-center rounded-2xl py-2 text-xs disabled:opacity-50
  {moreClasses}"
  on:click
  {disabled}
>
  <SvgIcon {icon} moreClasses="flex-grow h-[32px] w-[32px]" />

  {#if label !== undefined}
    {label}
  {/if}

  <slot></slot>
</button>
