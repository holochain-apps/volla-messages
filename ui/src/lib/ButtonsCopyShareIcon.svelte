<script lang="ts">
  import toast from "svelte-french-toast";
  import { copyToClipboard, isMobile, shareText } from "./utils";
  import SvgIcon from "./SvgIcon.svelte";
  import { t } from "$translations";

  export let text: string;

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

<button on:click={copy}>
  <SvgIcon icon="copy" size={22} color="%23999" />
</button>

{#if isMobile()}
  <button on:click={share}>
    <SvgIcon icon="share" size={22} color="%23999" moreClasses="ml-3" />
  </button>
{/if}
