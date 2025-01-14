<script lang="ts">
  import toast from "svelte-french-toast";
  import ButtonInline from "$lib/ButtonInline.svelte";
  import { copyToClipboard, isMobile, shareText } from "./utils";
  import { t } from "$translations";

  export let text: string;
  export let copyLabel: string;
  export let shareLabel: string;

  async function copy() {
    try {
      await copyToClipboard(text);
      toast.success(`${$t("common.copy_success")}`);
    } catch (e) {
      toast.error(`${$t("common.copy_error")}: ${e.message}`);
    }
  }

  async function share() {
    try {
      await shareText(text);
    } catch (e) {
      toast.error(`${$t("common.share_code_error")}: ${e.message}`);
    }
  }
</script>

<div class="flex items-center justify-center space-x-2">
  <ButtonInline
    on:click={copy}
    icon="copy"
    moreClassesButton="h-8 px-1 sm:px-3 text-xs !space-x-1 sm:space-x-4"
  >
    {copyLabel}
  </ButtonInline>

  {#if isMobile()}
    <ButtonInline
      on:click={share}
      icon="share"
      moreClassesButton="h-8 px-1 sm:px-3 text-xs !space-x-0 sm:space-x-4"
    >
      {shareLabel}
    </ButtonInline>
  {/if}
</div>
