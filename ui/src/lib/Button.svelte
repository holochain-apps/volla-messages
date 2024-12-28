<script lang="ts">
  import SvgIcon from "./SvgIcon.svelte";

  export let moreClasses = "";
  export let loading = false;
  export let icon: string | undefined = undefined;
  export let big: boolean = true;

  $: iconSize = big ? 22 : 18;
</script>

<button
  class={`variant-filled-primary dark:variant-filled-tertiary flex items-center rounded-full px-5 py-2 disabled:opacity-50 ${moreClasses}`}
  on:click
  {...$$restProps}
>
  {#if loading}
    <SvgIcon icon="spinner" size={iconSize} color="%23FD3524" />
  {:else if icon !== undefined}
    <SvgIcon {icon} size={iconSize} color="%23FD3524" />
  {/if}

  <div class="flex w-full justify-center {big ? 'font-bold' : ''}">
    <slot></slot>
  </div>
</button>
