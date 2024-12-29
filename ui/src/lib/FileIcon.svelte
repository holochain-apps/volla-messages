<script lang="ts">
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import type { Image } from "$lib/types";

  export let file: Image;
  export let size = 50;

  const commonFileTypes: { [key: string]: string[] } = {
    document: ["doc", "docx", "rtf", "txt", "odt"],
    spreadsheet: ["xls", "xlsx", "csv", "ods"],
    presentation: ["ppt", "pptx", "odp"],
    audio: ["mp3", "wav", "ogg", "flac"],
    video: ["mp4", "avi", "mkv", "mov"],
    archivefile: ["zip", "rar", "7z", "tar", "gz"],
    pdf: ["pdf"],
  };

  function getIconName(file: Image): string {
    if (file.name) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension) {
        for (const [type, extensions] of Object.entries(commonFileTypes)) {
          if (extensions.includes(extension)) {
            return type;
          }
        }
      }
    }
    return "file";
  }

  $: iconName = getIconName(file);
</script>

<SvgIcon icon={iconName} color={$modeCurrent ? "black" : "white"} size={size.toString()} />
