<script lang="ts">
  import { Alignment, FileStatus, Size, type Image } from "$lib/types";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import prettyBytes from "pretty-bytes";
  import PdfThumbnail from "$lib/PdfThumbnail.svelte";
  import FileIcon from "$lib/FileIcon.svelte";
  import LightboxImage from "$lib/LightboxImage.svelte";
  import { createEventDispatcher } from "svelte";

  const dispatch = createEventDispatcher<{ cancel: string }>();

  export let file: Image;
  export let align: Alignment = Alignment.Left;
  export let size: Size = Size.Large;
  export let imageLightbox: boolean = true;
  export let showCancel = false;
  export let className = "";
  export let maxFilenameLength = 20;

  const sizeConfig = {
    [Size.Small]: {
      imageClass: "h-16 w-16",
      spacing: "p-2 gap-2",
      thumbnailSize: { width: 30, height: 43 },
      iconSize: 43,
      textClass: "text-sm",
    },
    [Size.Large]: {
      imageClass: "w-full sm:max-w-md lg:max-w-lg",
      spacing: "p-3 gap-3",
      thumbnailSize: { width: 50, height: 70 },
      iconSize: 50,
      textClass: "text-sm sm:text-base",
    },
  };

  function formatFileName(fileName: string): string {
    fileName = fileName.trim();
    return fileName.length <= maxFilenameLength
      ? fileName
      : `${fileName.slice(0, maxFilenameLength)}...`;
  }

  $: config = sizeConfig[size];
  $: isImage = file.fileType.startsWith("image/");
  $: isPdf = file.fileType === "application/pdf";
  $: isLoading = file.status === FileStatus.Loading || file.status === FileStatus.Pending;
  $: hasError = file.status === FileStatus.Error;
</script>

<div class="relative {className}">
  {#if showCancel}
    <button
      class="absolute -right-1 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-white p-1 text-black hover:bg-gray-100"
      on:click={() => dispatch("cancel", file.id)}
      aria-label="Cancel Upload"
    >
      <SvgIcon icon="x" size={8} />
    </button>
  {/if}

  {#if hasError}
    <div class="bg-surface-800/60 mb-2 flex h-20 w-20 items-center justify-center rounded-lg">
      <SvgIcon icon="x" color={$modeCurrent ? "%232e2e2e" : "white"} size={30} />
    </div>
  {:else if isLoading}
    <div class="bg-surface-800/60 mb-2 flex h-20 w-20 items-center justify-center rounded-lg">
      <SvgIcon icon="spinner" color={$modeCurrent ? "%232e2e2e" : "white"} size={30} />
    </div>
  {:else if isImage}
    <div class={config.imageClass}>
      {#if imageLightbox}
        <LightboxImage
          btnClass="inline w-full transition-all duration-200"
          src={file.dataURL}
          alt={file.name}
        />
      {:else}
        <img src={file.dataURL} class="h-full w-full rounded-lg object-cover" alt={file.name} />
      {/if}
    </div>
  {:else}
    <div
      class="bg-surface-800/10 flex items-start rounded-xl
      {config.spacing} 
      {align === Alignment.Left ? 'flex-row' : 'flex-row-reverse'}"
    >
      <div class="flex-shrink-0">
        {#if isPdf}
          <PdfThumbnail
            pdfDataUrl={file.dataURL ?? ""}
            width={config.thumbnailSize.width}
            height={config.thumbnailSize.height}
            fallbackIcon="pdf"
          />
        {:else}
          <FileIcon {file} size={config.iconSize} />
        {/if}
      </div>

      <div class="min-w-0 flex-grow">
        <div class="break-all {config.textClass}">
          {formatFileName(file.name)}
        </div>
        <div class="mt-1 text-xs font-bold text-yellow-400 sm:text-sm">
          {prettyBytes(file.size)}
        </div>
      </div>
    </div>
  {/if}
</div>
