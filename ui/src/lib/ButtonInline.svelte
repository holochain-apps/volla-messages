<script lang="ts">
  import { Alignment } from "$lib/types";
  import SvgIcon from "$lib/SvgIcon.svelte";

  export let moreClasses = "";
  export let loading = false;
  export let icon: string | undefined = undefined;
  export let iconSize: number = 18;
  export let iconAlign: Alignment = Alignment.Left;
</script>

<button
  class="bg-tertiary-500 dark:bg-secondary-500 dark:text-tertiary-400 flex cursor-pointer items-center space-x-1 rounded-full bg-black/5 px-5 py-2 text-xs disabled:opacity-50 sm:space-x-2
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
