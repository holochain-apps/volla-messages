<script lang="ts">
  import { Alignment, FileStatus, type MessageFileExtended } from "$lib/types";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import FilePreviewFile from "./FilePreviewFile.svelte";
  import FilePreviewImage from "./FilePreviewImage.svelte";
  import FilePreviewFileDescription from "./FilePreviewFileDescription.svelte";
  import { MESSAGE_MAX_FILENAME_LENGTH } from "$config";

  export let file: MessageFileExtended;
  export let align: Alignment = Alignment.Left;
  export let moreClasses = "";

  $: isImage = file.messageFile.file_type.startsWith("image/");
  $: isLoading = file.status === FileStatus.Loading || file.status === FileStatus.Pending;
  $: hasError = file.status === FileStatus.Error;
</script>

<div class="relative {moreClasses}">
  {#if isLoading}
    <div class="bg-surface-800/60 mb-2 flex h-20 w-20 items-center justify-center rounded-lg">
      <SvgIcon icon="spinner" moreClasses="h-[30px] w-[30px]" />
    </div>
  {:else if hasError || file.dataURL === undefined}
    <div class="bg-surface-800/60 mb-2 flex h-20 w-20 items-center justify-center rounded-lg">
      <SvgIcon icon="x" moreClasses="h-[30px] w-[30px]" />
    </div>
  {:else if isImage}
    <div class="w-full sm:max-w-md lg:max-w-lg">
      <FilePreviewImage src={file.dataURL} alt={file.messageFile.name} showLightbox={true} />
    </div>
  {:else}
    <FilePreviewFile
      src={file.dataURL}
      name={file.messageFile.name}
      moreClasses="p-3 gap-3"
      width={50}
      height={70}
      {align}
    >
      <FilePreviewFileDescription
        name={file.messageFile.name}
        size={file.messageFile.size}
        maxFilenameLength={MESSAGE_MAX_FILENAME_LENGTH}
        moreClassesName="sm:text-base"
      />
    </FilePreviewFile>
  {/if}
</div>
