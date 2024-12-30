<script lang="ts">
  import { Alignment, FileStatus, type Image } from "$lib/types";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import prettyBytes from "pretty-bytes";
  import PdfThumbnail from "$lib/PdfThumbnail.svelte";
  import FileIcon from "$lib/FileIcon.svelte";
  import { isMobile } from "$lib/utils";
  import LightboxImage from "$lib/LightboxImage.svelte";
  import { createEventDispatcher } from "svelte";

  const dispatch = createEventDispatcher<{ cancel: string }>();

  export let file: Image;
  export let showCancel: boolean = false;
  export let align: Alignment = Alignment.Left;
  export let isMessage: boolean = true;
  export let maxFilenameLength: number = 10;

  function formatFileName(file: Image, maxLength: number = maxFilenameLength): string {
    const fileName = file.name.trim();
    if (fileName.length <= maxLength) {
      return fileName;
    }
    return fileName.slice(0, maxLength) + "...";
  }
</script>

{#if isMessage}
  {#if file.status === FileStatus.Loading || file.status === FileStatus.Pending}
    <div class="bg-surface-800/60 mb-2 flex h-20 w-20 items-center justify-center rounded-lg">
      <SvgIcon icon="spinner" color={$modeCurrent ? "%232e2e2e" : "white"} size={30} />
    </div>
  {:else if file.status === FileStatus.Loaded || file.status === FileStatus.Preview}
    {#if file.fileType.startsWith("image/")}
      <div class="w-full">
        <LightboxImage
          btnClass="inline w-full sm:max-w-md lg:max-w-lg transition-all duration-200"
          src={file.dataURL}
          alt={file.name}
        />
      </div>
    {:else if file.fileType === "application/pdf"}
      <div class="bg-surface-800/10 flex w-auto flex-row items-start gap-3 rounded-xl p-3">
        {#if align === Alignment.Left}
          <div class="flex flex-shrink-0 items-center justify-center">
            <PdfThumbnail
              pdfDataUrl={file.dataURL ?? ""}
              width={70}
              height={90}
              fallbackIcon="pdf"
            />
          </div>
        {/if}
        <div class="min-w-0 flex-grow">
          <div class="break-all text-sm sm:text-base">
            {isMobile() ? formatFileName(file, 20) : formatFileName(file, 50)}
          </div>
          <div class="mt-1 text-xs font-bold text-yellow-400 sm:text-sm">
            {prettyBytes(file.size)}
          </div>
        </div>
        {#if align === Alignment.Right}
          <div class="flex flex-shrink-0 items-center justify-center">
            <PdfThumbnail
              pdfDataUrl={file.dataURL ?? ""}
              width={70}
              height={90}
              fallbackIcon="pdf"
            />
          </div>
        {/if}
      </div>
    {:else}
      <div class="bg-surface-800/10 flex w-auto flex-row items-start gap-3 rounded-xl p-3">
        {#if align === Alignment.Left}
          <div class="flex flex-shrink-0 items-center justify-center">
            <FileIcon {file} size={50} />
          </div>
        {/if}

        <div class="min-w-0 flex-grow">
          <div class="break-all text-sm sm:text-base">
            {isMobile() ? formatFileName(file, 20) : formatFileName(file, 50)}
          </div>
          <div class="mt-1 text-xs font-bold text-yellow-400 sm:text-sm">
            {prettyBytes(file.size)}
          </div>
        </div>

        {#if align === Alignment.Right}
          <div class="flex flex-shrink-0 items-center justify-center">
            <FileIcon {file} size={50} />
          </div>
        {/if}
      </div>
    {/if}
  {:else}
    <div class="bg-surface-800/60 mb-2 flex h-20 w-20 items-center justify-center rounded-lg">
      <SvgIcon icon="x" color={$modeCurrent ? "%232e2e2e" : "white"} size={30} />
    </div>
  {/if}
{:else}
  <!-- Input Preview -->
  {#if file.dataURL && file.fileType.startsWith("image/")}
    <div class="relative mr-3 h-16 w-16">
      <img src={file.dataURL} class="h-16 w-16 rounded-lg object-cover" alt="thumbnail" />
      {#if showCancel}
        <button
          class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white p-1 text-white"
          on:click={() => dispatch("cancel", file.id)}
          aria-label="Cancel Upload"
        >
          <SvgIcon icon="x" size={8} />
        </button>
      {/if}
    </div>
  {:else if file.dataURL && file.fileType === "application/pdf"}
    <div
      class="bg-surface-800/10 relative mb-2 mr-2 flex flex-row items-start justify-between gap-1.5 rounded-xl p-2"
    >
      {#if showCancel}
        <button
          class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white p-1 text-white"
          on:click={() => dispatch("cancel", file.id)}
          aria-label="Cancel Upload"
        >
          <SvgIcon icon="x" size={8} />
        </button>
      {/if}
      <div class="flex flex-col break-all text-sm sm:text-base">
        <div>
          {formatFileName(file, 10)}
        </div>
        <div class="mt-1 text-xs font-bold text-yellow-400 sm:text-sm">
          {prettyBytes(file.size)}
        </div>
      </div>
      <div class="flex items-center justify-center">
        <PdfThumbnail pdfDataUrl={file.dataURL ?? ""} width={30} height={43} fallbackIcon="pdf" />
      </div>
    </div>
  {:else}
    <div
      class="bg-surface-800/10 relative mb-2 mr-2 flex flex-row items-start justify-between gap-1.5 rounded-xl p-2"
    >
      {#if showCancel}
        <button
          class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white p-1 text-white"
          on:click={() => dispatch("cancel", file.id)}
          aria-label="Cancel Upload"
        >
          <SvgIcon icon="x" size={8} />
        </button>
      {/if}
      <div class="flex flex-col break-all text-sm sm:text-base">
        <div>
          {formatFileName(file, 10)}
        </div>
        <div class="mt-1 text-xs font-bold text-yellow-400 sm:text-sm">
          {prettyBytes(file.size)}
        </div>
      </div>
      <div class="flex items-center justify-center">
        <FileIcon {file} size={50} />
      </div>
    </div>
  {/if}
{/if}
