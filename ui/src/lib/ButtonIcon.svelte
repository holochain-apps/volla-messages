<script lang="ts">
  import SvgIcon from "./SvgIcon.svelte";

  export let moreClasses = "";
  export let icon: string;
  export let iconSize: number = 22;
  export let iconColor: string = "%23FD3524";
  export let disabled: boolean = false;
</script>

<button
  class="variant-filled-primary dark:variant-filled-tertiary flex cursor-pointer items-center rounded-full px-5 py-2 disabled:opacity-50
  {moreClasses}"
  {disabled}
  on:click
  {...$$restProps}
>
  <SvgIcon {icon} size={iconSize} color={iconColor} />
</button>
