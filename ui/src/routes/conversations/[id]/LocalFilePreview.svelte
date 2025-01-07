<script lang="ts">
  import { type LocalFile } from "$lib/types";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { createEventDispatcher } from "svelte";
  import FilePreviewFile from "./FilePreviewFile.svelte";
  import FilePreviewImage from "./FilePreviewImage.svelte";
  import FilePreviewFileDescription from "./FilePreviewFileDescription.svelte";
  import { INPUT_MAX_FILENAME_LENGTH } from "$config";

  const dispatch = createEventDispatcher<{ cancel: null }>();

  export let file: LocalFile;
  export let moreClasses = "";

  $: isImage = file.file.type.startsWith("image/");
</script>

<div class="relative {moreClasses}">
  <button
    class="absolute -right-1 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-white p-1 text-black hover:bg-gray-100"
    on:click|preventDefault|stopPropagation={() => dispatch("cancel")}
    aria-label="Cancel Upload"
  >
    <SvgIcon icon="x" moreClasses="h-[8px] w-[8px]" />
  </button>

  {#if isImage}
    <div class="h-16 w-16">
      <FilePreviewImage src={file.dataURL} alt={file.file.name} showLightbox={false} />
    </div>
  {:else}
    <FilePreviewFile
      src={file.dataURL}
      name={file.file.name}
      moreClasses="p-2 gap-2"
      width={30}
      height={43}
    >
      <FilePreviewFileDescription
        name={file.file.name}
        size={file.file.size}
        maxFilenameLength={INPUT_MAX_FILENAME_LENGTH}
      />
    </FilePreviewFile>
  {/if}
</div>
