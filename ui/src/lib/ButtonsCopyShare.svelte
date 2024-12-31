<script lang="ts">
  import toast from "svelte-french-toast";
  import Button from "./Button.svelte";
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

<Button
  on:click={copy}
  icon="copy"
  {big}
  moreClasses="{big ? 'px-2' : 'px-1.5 h-8 text-xs space-x-2'} 
    text-sm variant-filled-tertiary dark:!bg-tertiary-200"
>
  {copyLabel}
</Button>

{#if isMobile()}
  <Button
    on:click={share}
    icon="share"
    {big}
    moreClasses="{big ? 'px-2' : 'px-1.5 h-8 text-xs space-x-2'} 
      text-sm variant-filled-tertiary dark:!bg-tertiary-200"
  >
    <div class="flex w-full justify-center {big ? 'font-bold' : ''}">
      {shareLabel}
    </div>
  </Button>
{/if}
