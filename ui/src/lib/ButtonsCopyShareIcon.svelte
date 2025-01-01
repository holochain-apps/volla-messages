<script lang="ts">
  import toast from "svelte-french-toast";
  import { copyToClipboard, isMobile, shareText } from "./utils";
  import { t } from "$translations";
  import ButtonIconBare from "./ButtonIconBare.svelte";

  export let text: string;
  export let iconColor: string = "gray";

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

<ButtonIconBare on:click={copy} icon="copy" {iconColor} />

{#if isMobile()}
  <ButtonIconBare on:click={share} icon="share" moreClasses="ml-3" {iconColor} />
{/if}
