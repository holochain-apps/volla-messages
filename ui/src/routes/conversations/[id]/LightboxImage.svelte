<script lang="ts">
  import BiggerPicture from "bigger-picture";
  import "bigger-picture/css";

  export let btnClass = "";
  export let src = "";
  export let alt = "";

  let biggerPicture = BiggerPicture({
    target: document.body,
  });

  function show(e: PointerEvent | MouseEvent) {
    const targetImg = e.target as HTMLImageElement;
    biggerPicture.open({
      items: [
        {
          // Because we don't know the original image dimensions,
          // we scale by 10x and let bigger-picture handle constraining within window
          width: targetImg.width * 10,
          height: targetImg.height * 10,
          img: src,
        },
      ],
    });
  }
</script>

<button on:click={(e) => show(e)} class="{btnClass}}">
  <img {src} {alt} class="object-cover" />
</button>

<style>
  :global(.bp-zoomed.bp-small .bp-controls) {
    opacity: 1 !important;
  }

  :global(.bp-close) {
    z-index: 50;
  }
</style>
