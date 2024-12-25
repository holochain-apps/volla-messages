<script lang="ts">
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher<{ change: string }>();

  export let accept: string;
  export let id: string;

  // Crop avatar image and return a base64 bytes string of its content
  function convertImageToDataUrl(
    img: HTMLImageElement,
    maxWidth: number = 300,
    maxHeight: number = 300
  ): string {
    let width = img.width;
    let height = img.height;

    // Resize image
    if (width > height) {
      if (width > maxWidth) {
        height = height * (maxWidth / width);
        width = maxWidth;
      }
    } else {
      if (height > maxHeight) {
        width = width * (maxHeight / height);
        height = maxHeight;
      }
    }

    // Construct canvas containing image
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.drawImage(img, 0, 0, width, height);

    // Convert canvas data to data url
    return canvas.toDataURL();
  }

  function handleFileChange(
    event: Event,
    callback: (imageData: string) => void
  ) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e: ProgressEvent<FileReader>): void => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const imageData = convertImageToDataUrl(img);
          callback(imageData);
        };
        img.src = e.target?.result as string;
      };

      reader.onerror = (e): void => {
        console.error("Error reading file:", e);
        reader.abort();
      };

      reader.readAsDataURL(file);
    }
  }
</script>

<input
  type="file"
  {accept}
  {id}
  class="hidden"
  on:change={(event) =>
    handleFileChange(event, (imageData) => {
      dispatch("change", imageData);
    })}
/>
