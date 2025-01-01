<script lang="ts">
  import SvgIcon from "./SvgIcon.svelte";

  export let moreClasses = "";
  export let icon: string;
  export let iconSize: number = 12;
  export let iconColor: string = "%23FD3524";
  export let disabled: boolean = false;
  export let loading: boolean = false;
  export let number: number | undefined = undefined;
</script>

<button
  class="max-w-2/3 bg-primary-500 flex items-center justify-center space-x-2 rounded-full border-0 py-1 pl-2 pr-4 text-white
  {moreClasses}"
  {disabled}
  on:click
>
  <div class="bg-surface-500 flex h-9 w-9 items-center justify-center rounded-full">
    {#if loading}
      <SvgIcon icon="spinner" size={iconSize} color={iconColor} />
    {:else}
      <SvgIcon {icon} size={iconSize} color={iconColor} />
    {/if}

    {#if number !== undefined}
      <div class="text-primary-500 ml-1 text-sm font-extrabold">
        {number}
      </div>
    {/if}
  </div>

  <slot></slot>
</button>
