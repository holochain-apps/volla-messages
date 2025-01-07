<script lang="ts">
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { find } from "lodash-es";

  export let extension: string | undefined;
  export let style: string = "";

  const commonFileTypes: { [key: string]: string[] } = {
    document: ["doc", "docx", "rtf", "txt", "odt"],
    spreadsheet: ["xls", "xlsx", "csv", "ods"],
    presentation: ["ppt", "pptx", "odp"],
    audio: ["mp3", "wav", "ogg", "flac"],
    video: ["mp4", "avi", "mkv", "mov"],
    archivefile: ["zip", "rar", "7z", "tar", "gz"],
    pdf: ["pdf"],
  };

  function getIconName(ext: string): string {
    const fileType = find(Object.entries(commonFileTypes), ([, extensions]) =>
      extensions.includes(ext),
    );
    if (fileType === undefined) return "file";

    return fileType[0];
  }

  $: iconName = extension === undefined ? "file" : getIconName(extension);
</script>

<SvgIcon icon={iconName} {style} />
