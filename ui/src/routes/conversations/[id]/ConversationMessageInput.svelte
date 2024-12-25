<script lang="ts">
  import type { Image } from "../../../types";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { t } from "$translations";
  import { createEventDispatcher } from "svelte";

  const dispatch = createEventDispatcher<{
    send: {
      text: string;
      images: Image[];
    };
  }>();

  export let text = "";
  export let images: Image[] = [];
  export let ref: HTMLElement;

  async function handleImagesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const files = Array.from(input.files);
      const readers: Promise<Image>[] = files.map((file) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        return new Promise<Image>((resolve) => {
          reader.onload = async () => {
            if (typeof reader.result === "string") {
              resolve({
                dataURL: reader.result,
                lastModified: file.lastModified,
                fileType: file.type,
                file,
                name: file.name,
                size: file.size,
                status: "pending",
              });
            }
          };
          reader.onerror = () => {
            console.error("Error reading file");
            resolve({
              dataURL: "",
              lastModified: file.lastModified,
              fileType: file.type,
              file,
              name: file.name,
              size: file.size,
              status: "error",
            });
          };
        });
      });

      // When all files are read, update the images store
      const newImages: Image[] = await Promise.all(readers);
      images = [...images, ...newImages];
    }
  }

  function send() {
    dispatch("send", {
      text,
      images,
    });

    text = "";
    images = [];
  }
</script>

<div class="bg-tertiary-500 dark:bg-secondary-500 w-full flex-shrink-0 p-2">
  <form class="flex" method="POST" on:submit|preventDefault={send}>
    <input
      type="file"
      accept="image/jpeg, image/png, image/gif"
      multiple
      id="images"
      class="hidden"
      on:change={handleImagesSelected}
    />
    <label for="images" class="flex cursor-pointer">
      <SvgIcon
        icon="image"
        color={$modeCurrent ? "%232e2e2e" : "white"}
        size="26"
        moreClasses="ml-3"
      />
    </label>
    <div class="flex w-full flex-col">
      <!-- svelte-ignore a11y-autofocus -->
      <input
        autofocus
        type="text"
        bind:this={ref}
        bind:value={text}
        class="bg-tertiary-500 w-full border-0 placeholder:text-sm placeholder:text-gray-400 focus:border-gray-500 focus:ring-0"
        placeholder={$t("conversations.message_placeholder")}
      />
      <div class="flex flex-row px-4">
        {#each images as image, i}
          {#if image.status === "loading"}
            <div
              class="bg-tertiary-500 mr-2 flex h-10 w-10 items-center justify-center"
            >
              <SvgIcon icon="spinner" color="white" size="10" />
            </div>
          {:else}
            <!-- svelte-ignore a11y-missing-attribute -->
            <img src={image.dataURL} class="mr-2 h-10 w-10 object-cover" />
          {/if}
        {/each}
      </div>
    </div>
    <button
      disabled={text.trim().length === 0 && images.length === 0}
      class="pr-2 disabled:opacity-50"
    >
      <SvgIcon
        icon="caretRight"
        color={$modeCurrent ? "#2e2e2e" : "white"}
        size="10"
      />
    </button>
  </form>
</div>
