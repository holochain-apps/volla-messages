<script lang="ts">
  import ButtonInline from "$lib/ButtonInline.svelte";
  import { FileStatus, type MessageExtended } from "$lib/types";
  import { t } from "$translations";
  import { copyToClipboard } from "$lib/utils";
  import { save } from "@tauri-apps/plugin-dialog";
  import { writeFile } from "@tauri-apps/plugin-fs";
  import { downloadDir } from "@tauri-apps/api/path";
  import toast from "svelte-french-toast";
  import { deriveCellFileStore, type FileStore } from "$store/FileStore";
  import { getContext } from "svelte";
  import { page } from "$app/stores";
  import { encodeHashToBase64 } from "@holochain/client";
  const fileStore = getContext<{
    getStore: () => FileStore;
  }>("fileStore").getStore();
  let cellFileStore = deriveCellFileStore(fileStore, $page.params.id);

  export let message: MessageExtended;

  $: hasText = message.message.content.trim().length > 0;
  $: hasLoadedFiles = message.message.images.some(
    (f) =>
      $cellFileStore.data[encodeHashToBase64(f.storage_entry_hash)] &&
      $cellFileStore.data[encodeHashToBase64(f.storage_entry_hash)].status === FileStatus.Loaded,
  );

  async function downloadFile(file: File) {
    try {
      const defaultDir = await downloadDir();
      const savePath = await save({
        title: "Save Image",
        defaultPath: `${defaultDir}/${file.name}`,
      });

      if (!savePath) return;

      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await writeFile(savePath, bytes, { create: true });
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

    for (const { storage_entry_hash } of message.message.images) {
      if ($cellFileStore.data[encodeHashToBase64(storage_entry_hash)] === undefined) return;
      if ($cellFileStore.data[encodeHashToBase64(storage_entry_hash)].file === undefined) return;
      if ($cellFileStore.data[encodeHashToBase64(storage_entry_hash)]?.status !== FileStatus.Loaded)
        return;

      // Downloads only the loaded images sequentially
      await downloadFile($cellFileStore.data[encodeHashToBase64(storage_entry_hash)].file as File);
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
      <span class="text-xs md:text-sm">{$t("common.copy_text")}</span>
    </ButtonInline>
  {/if}

  {#if hasLoadedFiles}
    <ButtonInline
      on:click={download}
      icon="download"
      moreClassesButton="bg-tertiary-600 dark:bg-secondary-700 dark:text-tertiary-400"
      moreClasses="w-[30px]"
    >
      <span class="text-xs md:text-sm">{$t("common.download")}</span>
    </ButtonInline>
  {/if}
</div>
