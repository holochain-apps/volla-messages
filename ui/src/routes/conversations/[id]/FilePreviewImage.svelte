<script lang="ts">
  import LightboxImage from "./LightboxImage.svelte";

  export let src: string;
  export let alt: string;
  export let showLightbox: boolean = false;
</script>

{#if showLightbox}
  <LightboxImage btnClass="inline w-full transition-all duration-200" {src} {alt} />
{:else}
  <img {src} {alt} class="h-full w-full rounded-lg object-cover" />
{/if}
