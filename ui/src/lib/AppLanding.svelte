<script lang="ts">
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
</script>

<div class="flex grow flex-col items-center justify-center">
  <div class="bg-appLogo mb-4 h-[58px] w-[58px] bg-contain bg-center bg-no-repeat"></div>

  <h1 class="text-2xl font-bold">{$t("common.app_name")}</h1>

  <div class="mt-3 flex items-center text-xs">
    <div>v{window.__APP_VERSION__}</div>
    <SvgIcon icon="betaTag" moreClasses="ml-1" />
  </div>

  <p class="mt-10">{$t("common.tagline")}</p>
</div>

<div class="mb-10 mt-4 h-10 text-center">
  <slot />
</div>

<div class="mb-10 flex flex-col items-center justify-center">
  <p class="mb-2 text-xs">{$t("common.secured_by")}</p>
  <div
    class="bg-holochainLogoCharcoal dark:bg-holochainLogoWhite h-[28px] w-[200px] bg-contain bg-center bg-no-repeat"
  ></div>
</div>
