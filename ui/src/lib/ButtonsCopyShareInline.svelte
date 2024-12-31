<script lang="ts">
  import toast from "svelte-french-toast";
  import ButtonInline from "./ButtonInline.svelte";
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
    async () => {
      try {
        await shareText(text);
      } catch (e) {
        toast.error(`${$t("common.share_code_error")}: ${e.message}`);
      }
    };
  }
</script>

<div class="flex items-center justify-center space-x-4">
  <ButtonInline
    on:click={copy}
    icon="copy"
    {big}
    moreClasses="px-1.5 h-8 text-xs space-x-2 text-sm variant-filled-tertiary dark:!bg-tertiary-200"
  >
    {copyLabel}
  </ButtonInline>

  {#if isMobile()}
    <ButtonInline
      on:click={share}
      icon="share"
      {big}
      moreClasses="px-1.5 h-8 text-xs space-x-2 text-sm variant-filled-tertiary dark:!bg-tertiary-200"
    >
      <div class="flex w-full justify-center">
        {shareLabel}
      </div>
    </ButtonInline>
  {/if}
</div>
