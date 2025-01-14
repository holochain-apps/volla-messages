<script lang="ts">
  import { t } from "$translations";
  import SvgIcon from "$lib/SvgIcon.svelte";

  export let value = "";
</script>

<div class="relative my-5 w-full">
  <input
    type="text"
    class="text-md !bg-tertiary-500 dark:!bg-secondary-500 dark:text-tertiary-500 h-12 w-full rounded-full border-0 pl-10 pr-4"
    placeholder={$t("common.search_placeholder") || $t("common.search_placeholder")}
    bind:value
  />
  <SvgIcon icon="search" moreClasses="absolute top-3 left-3 text-base" />
</div>
