<script lang="ts">
  import SvgIcon from "./SvgIcon.svelte";

  export let moreClassesButton = "";
  export let moreClasses = "";
  export let icon: string;
  export let disabled: boolean = false;
</script>

<button
  class="flex cursor-pointer items-center justify-center
  {moreClassesButton}"
  {disabled}
  on:click
  {...$$restProps}
>
  <SvgIcon {icon} {moreClasses} />
</button>
