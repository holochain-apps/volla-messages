<script lang="ts">
  import { Alignment } from "$lib/types";
  import PdfThumbnail from "./PdfThumbnail.svelte";
  import FileIcon from "./FileIcon.svelte";

  export let src: string;
  export let name: string;

  export let width: number;
  export let height: number;

  export let align: Alignment = Alignment.Left;
  export let moreClasses = "";

  $: extension = name.split(".").pop()?.toLowerCase();
  $: isPdf = extension === "pdf";
</script>

<div
  class="bg-surface-800/10 flex items-start rounded-xl
    {align === Alignment.Left ? 'flex-row' : 'flex-row-reverse'}
    {moreClasses}"
>
  <div class="flex-shrink-0">
    {#if isPdf && src !== undefined}
      <PdfThumbnail url={src} {width} {height} />
    {:else}
      <!-- both width and height are set to 'height' value, to ensure that file icons have the same height as pdf thumbnails -->
      <FileIcon {extension} style="width: {height}px; height: {height}px;" />
    {/if}
  </div>

  <slot></slot>
</div>
