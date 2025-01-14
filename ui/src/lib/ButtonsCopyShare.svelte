<script lang="ts">
  import toast from "svelte-french-toast";
  import Button from "./Button.svelte";
  import { copyToClipboard, isMobile, shareText } from "./utils";
  import { t } from "$translations";

  export let text: string;
  export let copyLabel: string;
  export let shareLabel: string;
  export let moreClasses: string = "";

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

<div class="flex flex-col items-center justify-center space-y-4">
  <Button on:click={copy} icon="copy" moreClasses="px-2 text-sm {moreClasses}">
    {copyLabel}
  </Button>

  {#if isMobile()}
    <Button on:click={share} icon="share" moreClasses="px-2 text-sm {moreClasses}">
      {shareLabel}
    </Button>
  {/if}
</div>
