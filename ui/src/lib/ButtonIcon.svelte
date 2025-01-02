<script lang="ts">
  import SvgIcon from "./SvgIcon.svelte";

  export let moreClasses = "";
  export let moreClassesButton = "";
  export let icon: string;
  export let disabled: boolean = false;
</script>

<button
  class="bg-tertiary-500 dark:bg-secondary-500 dark:text-tertiary-400 flex cursor-pointer items-center rounded-md p-1 disabled:opacity-50
  {moreClassesButton} h-[24px] w-[24px]"
  {disabled}
  on:click
  {...$$restProps}
>
  <SvgIcon {icon} moreClasses="h-[13px] w-[13px] {moreClasses}" />
</button>
