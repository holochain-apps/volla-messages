<script lang="ts">
  import prettyBytes from "pretty-bytes";

  export let name: string;
  export let size: number;
  export let maxFilenameLength = 20;
  export let moreClassesName = "";

  $: nameTrimmed = name.trim();
  $: nameFormatted =
    nameTrimmed.length <= maxFilenameLength
      ? nameTrimmed
      : `${nameTrimmed.slice(0, maxFilenameLength)}...`;
  $: sizeFormatted = prettyBytes(size);
</script>

<div class="min-w-0 flex-grow">
  <div class="break-all text-sm {moreClassesName}">{nameFormatted}</div>
  <div class="mt-1 text-xs font-bold text-yellow-400 sm:text-sm">
    {sizeFormatted}
  </div>
</div>
