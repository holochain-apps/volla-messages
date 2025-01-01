<script lang="ts">
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { Alignment } from "$lib/types";

  export let moreClasses = "";
  export let loading = false;
  export let icon: string | undefined = undefined;
  export let iconSize: number = 22;
  export let iconAlign: Alignment = Alignment.Left;
</script>

<button
  class="bg-tertiary-500 dark:bg-secondary-500 dark:text-tertiary-400 flex h-12 min-w-32 cursor-pointer items-center space-x-4 rounded-full px-5 py-2 font-bold disabled:opacity-50 sm:min-w-48
  {iconAlign === Alignment.Left ? 'flex-row' : 'flex-row-reverse'}
  {moreClasses}"
  on:click
  {...$$restProps}
>
  {#if loading}
    <SvgIcon icon="spinner" size={iconSize} color="%23FD3524" />
  {:else if icon !== undefined}
    <SvgIcon {icon} size={iconSize} color="%23FD3524" />
  {/if}

  <div class="flex w-full justify-center">
    <slot></slot>
  </div>
</button>
