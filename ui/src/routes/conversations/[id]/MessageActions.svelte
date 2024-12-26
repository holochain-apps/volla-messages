<script lang="ts">
  import type { Message, Image } from "../../../types";
  import Button from "$lib/Button.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { convertDataURIToUint8Array, copyToClipboard } from "$lib/utils";
  import { save } from "@tauri-apps/plugin-dialog";
  import { writeFile } from "@tauri-apps/plugin-fs";
  import { downloadDir } from "@tauri-apps/api/path";
  import toast from "svelte-french-toast";

  export let message: Message;

  $: hasText = !!message?.content && message.content.trim() !== "";
  $: hasImages = message?.images ? message.images.some((img) => img.status === "loaded") : false;

  const downloadImage = async (image: Image) => {
    if (!image || image.status !== "loaded" || !image.dataURL) {
      console.error("Invalid image for download", image);
      return;
    }
    try {
      const defaultDir = await downloadDir();
      const savePath = await save({
        title: "Save Image",
        defaultPath: `${defaultDir}/${image.name}`,
      });

      if (!savePath) return;

      try {
        const imageBlob = convertDataURIToUint8Array(image.dataURL);
        await writeFile(savePath, imageBlob, { create: true });
        toast.success($t("common.download_file_success"));
      } catch (e) {
        console.error("Saving file failed", e);
      }
    } catch (e) {
      console.error("Download failed", e);
      toast.error(`${$t("common.download_file_error")}: ${e.message}`);
    }
  };

  const copy = async () => {
    if (message?.content) {
      try {
        await copyToClipboard(message.content);
        toast.success($t("common.copy_success"));
      } catch (e) {
        toast.error(`${$t("common.copy_error")}: ${e.message}`);
      }
    }
  };

  const download = async () => {
    if (message?.images) {
      for (const image of message.images) {
        if (image.status === "loaded") {
          //Downloads only the loaded images sequentially
          await downloadImage(image);
        }
      }
    }
  };
</script>

<div class="flex w-full items-center justify-center space-x-2">
  {#if hasText}
    <Button
      on:click={copy}
      moreClasses="flex items-center gap-1 px-2 sm:px-3 md:px-4 py-1 sm:py-2 rounded-full text-xs sm:text-sm dark:variant-filled-tertiary bg-tertiary-200"
    >
      <SvgIcon icon="copy" size="15" color="%23FD3524" moreClasses="w-3 h-3 sm:w-4 sm:h-4" />
      <span class="text-secondary-500 text-xs sm:text-sm">
        {$t("conversations.copy_text")}
      </span>
    </Button>
  {/if}

  {#if hasImages}
    <Button
      on:click={download}
      moreClasses="flex items-center gap-1 px-2 sm:px-3 md:px-4 py-1 sm:py-2 rounded-full text-xs sm:text-sm dark:variant-filled-tertiary bg-tertiary-200"
    >
      <SvgIcon icon="download" size="15" color="%23FD3524" moreClasses="w-3 h-3 sm:w-4 sm:h-4" />
      <span class="text-secondary-500 text-xs sm:text-sm">{$t("conversations.download")}</span>
    </Button>
  {/if}
</div>
