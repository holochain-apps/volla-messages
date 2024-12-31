<script lang="ts">
  import type { Message, Image } from "../../../types";
  import ButtonInline from "$lib/ButtonInline.svelte";
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
        filters: [
          {
            name: "Image",
            extensions: ["png", "jpg", "gif"],
          },
        ],
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

<div class="my-1 flex w-full items-center justify-center space-x-2">
  {#if hasText}
    <ButtonInline on:click={copy} icon="copy" big={false}>
      <span class="text-xs md:text-sm">{$t("conversations.copy_text")}</span>
    </ButtonInline>
  {/if}

  {#if hasImages}
    <ButtonInline on:click={download} icon="download" iconSize={25} big={false}>
      <span class="text-xs md:text-sm">{$t("conversations.download")}</span>
    </ButtonInline>
  {/if}
</div>
