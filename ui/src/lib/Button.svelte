<script lang="ts">
  import SvgIcon from "$lib/SvgIcon.svelte";

  export let moreClasses = "";
  export let loading = false;
  export let icon: string | undefined = undefined;
  export let big: boolean = true;
  export let iconSize: number = big ? 22 : 18;
  export let iconAlign: "right" | "left" = "left";
</script>

<button
  class="variant-filled-primary dark:variant-filled-tertiary flex items-center rounded-full px-5 py-2 disabled:opacity-50
  {big ? 'h-12 w-72' : ' space-x-2'} 
  {moreClasses}"
  on:click
  {...$$restProps}
>
  {#if iconAlign === "left"}
    {#if loading}
      <SvgIcon icon="spinner" size={iconSize} color="%23FD3524" />
    {:else if icon !== undefined}
      <SvgIcon {icon} size={iconSize} color="%23FD3524" />
    {/if}
  {/if}

  <div class="flex w-full justify-center {big ? 'font-bold' : ''}">
    <slot></slot>
  </div>

  {#if iconAlign === "right"}
    {#if loading}
      <SvgIcon icon="spinner" size={iconSize} color="%23FD3524" />
    {:else if icon !== undefined}
      <SvgIcon {icon} size={iconSize} color="%23FD3524" />
    {/if}
  {/if}
</button>
