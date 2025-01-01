<script lang="ts">
  import SvgIcon from "./SvgIcon.svelte";
  import { modeCurrent } from "@skeletonlabs/skeleton";

  export let moreClasses = "";
  export let icon: string;
  export let iconSize: number = 32;
  export let iconColor: string | undefined = undefined;
  export let disabled: boolean = false;
  export let label: string | undefined = undefined;

  function getColor() {
    if (iconColor !== undefined) {
      return iconColor;
    } else if ($modeCurrent) {
      return "%232e2e2e";
    } else {
      return "white";
    }
  }
  $: color = getColor();
</script>

<button
  class="bg-tertiary-500 dark:bg-secondary-500 dark:text-tertiary-400 flex h-24 w-28 flex-col items-center rounded-2xl py-2 text-xs disabled:opacity-50
  {moreClasses}"
  on:click
  {disabled}
>
  <SvgIcon {icon} size={iconSize} {color} moreClasses="flex-grow" />

  {#if label !== undefined}
    {label}
  {/if}

  <slot></slot>
</button>
