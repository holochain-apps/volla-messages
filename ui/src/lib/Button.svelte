<script lang="ts">
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import SvgIcon from "./SvgIcon.svelte";

  export let moreClasses = "";
  export let loading = false;
  export let icon: string | undefined = undefined;
</script>

<button
  class={`variant-filled-primary dark:variant-filled-tertiary mb-4 flex h-12 items-center rounded-full px-5 py-2 disabled:opacity-50 ${moreClasses}`}
  on:click
  {...$$restProps}
>
  {#if loading}
    <SvgIcon icon="spinner" size="20" color="%23FD3524" />
  {:else if icon !== undefined}
    <SvgIcon {icon} size="20" color="%23FD3524" />
  {/if}

  <slot></slot>
</button>
