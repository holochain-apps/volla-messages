<script lang="ts">
  import ButtonInline from "$lib/ButtonInline.svelte";
  import { FileStatus, type MessageExtended, type MessageFileExtended } from "$lib/types";
  import { t } from "$translations";
  import { convertDataURIToUint8Array, copyToClipboard } from "$lib/utils";
  import { save } from "@tauri-apps/plugin-dialog";
  import { writeFile } from "@tauri-apps/plugin-fs";
  import { downloadDir } from "@tauri-apps/api/path";
  import toast from "svelte-french-toast";

  export let message: MessageExtended;

  $: hasText = message.message.content.trim().length > 0;
  $: hasLoadedFiles = message.messageFileExtendeds.some((f) => f.status === FileStatus.Loaded);

  async function downloadFile(file: MessageFileExtended) {
    if (file.dataURL === undefined) return;

    try {
      const defaultDir = await downloadDir();
      const savePath = await save({
        title: "Save Image",
        defaultPath: `${defaultDir}/${file.messageFile.name}`,
      });

      if (!savePath) return;

      try {
        const imageBlob = convertDataURIToUint8Array(file.dataURL);
        await writeFile(savePath, imageBlob, { create: true });
        toast.success($t("common.download_file_success"));
      } catch (e) {
        console.error("Saving file failed", e);
      }
    } catch (e) {
      console.error("Download failed", e);
      toast.error(`${$t("common.download_file_error")}: ${e.message}`);
    }
  }

  async function copy() {
    if (!hasText) return;

    try {
      await copyToClipboard(message.message.content);
      toast.success($t("common.copy_success"));
    } catch (e) {
      toast.error(`${$t("common.copy_error")}: ${e}`);
    }
  }

  async function download() {
    if (!hasLoadedFiles) return;

    for (const file of message.messageFileExtendeds) {
      if (file.status === FileStatus.Loaded && file.dataURL !== undefined) {
        //Downloads only the loaded images sequentially
        await downloadFile(file);
      }
    }
  }
</script>

<div class="my-1 flex w-full items-center justify-center space-x-2">
  {#if hasText}
    <ButtonInline
      on:click={copy}
      icon="copy"
      moreClassesButton="bg-tertiary-600 dark:bg-secondary-700 dark:text-tertiary-400"
    >
      <span class="text-xs md:text-sm">{$t("conversations.copy_text")}</span>
    </ButtonInline>
  {/if}

  {#if hasLoadedFiles}
    <ButtonInline
      on:click={download}
      icon="download"
      moreClassesButton="bg-tertiary-600 dark:bg-secondary-700 dark:text-tertiary-400"
      moreClasses="w-[30px]"
    >
      <span class="text-xs md:text-sm">{$t("conversations.download")}</span>
    </ButtonInline>
  {/if}
</div>
