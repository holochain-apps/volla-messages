<script lang="ts">
  import SvgIcon from "./SvgIcon.svelte";

  export let moreClasses = "";
  export let icon: string;
  export let iconSize: number = 22;
  export let iconColor: string = "%23FD3524";
  export let disabled: boolean = false;
</script>

<button
  class="flex cursor-pointer cursor-pointer items-center rounded-full
  {moreClasses}"
  {disabled}
  on:click
  {...$$restProps}
>
  <SvgIcon {icon} size={iconSize} color={iconColor} />
</button>
