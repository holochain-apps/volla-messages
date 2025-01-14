<script lang="ts">
  import { Alignment, FileStatus } from "$lib/types";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import FilePreviewFile from "./FilePreviewFile.svelte";
  import FilePreviewImage from "./FilePreviewImage.svelte";
  import FilePreviewFileDescription from "./FilePreviewFileDescription.svelte";
  import { MESSAGE_MAX_FILENAME_LENGTH } from "$config";
  import type { EntryHashB64 } from "@holochain/client";
  import { page } from "$app/stores";
  import { type FileStore, deriveCellFileStore } from "$store/FileStore";
  import { getContext } from "svelte";
  const fileStore = getContext<{
    getStore: () => FileStore;
  }>("fileStore").getStore();
  let cellFileStore = deriveCellFileStore(fileStore, $page.params.id);

  export let entryHashB64: EntryHashB64;
  export let align: Alignment = Alignment.Left;
  export let moreClasses = "";

  $: fileExtended = $cellFileStore.data[entryHashB64];

  $: isLoaded = fileExtended.status === FileStatus.Loaded && fileExtended?.file !== undefined;
  $: isImage =
    fileExtended !== undefined &&
    fileExtended.file !== undefined &&
    fileExtended.file.type.startsWith("image/");
  $: isLoading =
    fileExtended.status === FileStatus.Loading || fileExtended.status === FileStatus.Pending;
  $: isError = fileExtended.status === FileStatus.Error;
  $: objectUrl = fileExtended?.file !== undefined ? URL.createObjectURL(fileExtended.file) : "";
</script>

<div class="relative {moreClasses}">
  {#if isLoaded && fileExtended?.file !== undefined}
    {#if isImage}
      <div class="w-full sm:max-w-md lg:max-w-lg">
        <FilePreviewImage src={objectUrl} alt={fileExtended.file.name} showLightbox={true} />
      </div>
    {:else}
      <FilePreviewFile
        src={objectUrl}
        name={fileExtended.file.name}
        moreClasses="p-3 gap-3"
        width={50}
        height={70}
        {align}
      >
        <FilePreviewFileDescription
          name={fileExtended.file.name}
          size={fileExtended.file.size}
          maxFilenameLength={MESSAGE_MAX_FILENAME_LENGTH}
          moreClassesName="sm:text-base"
        />
      </FilePreviewFile>
    {/if}
  {:else if isLoading}
    <div class="bg-surface-800/60 mb-2 flex h-20 w-20 items-center justify-center rounded-lg">
      <SvgIcon icon="spinner" moreClasses="h-[30px] w-[30px]" />
    </div>
  {:else if isError}
    <div class="bg-surface-800/60 mb-2 flex h-20 w-20 items-center justify-center rounded-lg">
      <SvgIcon icon="x" moreClasses="h-[30px] w-[30px]" />
    </div>
  {/if}
</div>
