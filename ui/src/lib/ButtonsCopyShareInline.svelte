<script lang="ts">
  import toast from "svelte-french-toast";
  import ButtonInline from "$lib/ButtonInline.svelte";
  import { copyToClipboard, isMobile, shareText } from "./utils";
  import { t } from "$translations";

  export let text: string;
  export let copyLabel: string;
  export let shareLabel: string;
  export let big: boolean = true;

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
  <ButtonInline on:click={copy} icon="copy" {big} moreClasses="h-8 px-[0.3rem] sm:px-3 text-xs">
    {copyLabel}
  </ButtonInline>

  {#if isMobile()}
    <ButtonInline on:click={share} icon="share" {big} moreClasses="h-8 px-[0.3rem] sm:px-3 text-xs">
      {shareLabel}
    </ButtonInline>
  {/if}
</div>
