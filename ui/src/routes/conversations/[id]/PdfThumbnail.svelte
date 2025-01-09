<script lang="ts">
  import { onMount } from "svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import * as pdfjs from "pdfjs-dist";

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  export let url: string;
  export let width: number;
  export let height: number;

  let renderedDataUrl: string | undefined = undefined;

  onMount(async () => {
    try {
      const pdf = await pdfjs.getDocument(url).promise;
      const page = await pdf.getPage(1);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Could not get 2D rendering context");
      }
      const viewport = page.getViewport({ scale: 1 });
      canvas.height = height;
      canvas.width = width;
      const renderContext = {
        canvasContext: context,
        viewport: page.getViewport({
          scale: Math.min(width / viewport.width, height / viewport.height),
        }),
      };
      await page.render(renderContext).promise;
      renderedDataUrl = canvas.toDataURL();
    } catch (error) {
      console.error("Error generating PDF thumbnail:", error);
    }
  });
</script>

{#if renderedDataUrl !== undefined}
  <img
    src={renderedDataUrl}
    alt="PDF Thumbnail"
    class="rounded object-cover"
    style="width: {width}px; height: {height}px;"
  />
{:else}
  <SvgIcon icon="pdf" style="width: {height}px; height: {height}px;" />
{/if}
