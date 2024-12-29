<script lang="ts">
  import type { Image } from "$lib/types";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { t } from "$translations";
  import { createEventDispatcher } from "svelte";
  import toast from "svelte-french-toast";
  import prettyBytes from "pretty-bytes";
  import PdfThumbnail from "$lib/PdfThumbnail.svelte";
  import FileIcon from "$lib/FileIcon.svelte";
  import { MAX_FILE_SIZE } from "$config";

  const dispatch = createEventDispatcher<{
    send: {
      text: string;
      images: Image[];
    };
  }>();

  export let text = "";
  export let images: Image[] = [];
  export let ref: HTMLElement;
  export let formatFileName: (file: Image, maxLength?: number) => string;

  async function handleImagesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const files = Array.from(input.files);
      const validFiles = files.filter((file) => {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${$t("conversations.large_file_error", { maxSize: "15MB" } as any)}`);
          return false;
        }
        return true;
      });
      const readers: Promise<Image>[] = validFiles.map((file) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        return new Promise<Image>((resolve) => {
          reader.onload = async () => {
            if (typeof reader.result === "string") {
              resolve({
                id: crypto.randomUUID(),
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
              id: crypto.randomUUID(),
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
      // Resetting the file input, so user can upload the same file again
      input.value = "";
    }
  }

  function cancelUpload(id: string) {
    images = images.filter((img) => img.id !== id);
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
    <input type="file" multiple id="files" class="hidden" on:change={handleImagesSelected} />
    <label for="files" class="flex cursor-pointer">
      <SvgIcon
        icon="fileClip"
        color={$modeCurrent ? "%232e2e2e" : "white"}
        size={26}
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
        on:keydown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (text.trim() || images.length > 0) {
              const submitEvent = new SubmitEvent("submit");
              e.currentTarget.form?.dispatchEvent(submitEvent);
            }
          }
        }}
      />
      <div class="flex flex-row flex-wrap px-4">
        {#each images as file (file.id)}
          {#if file.status === "loading"}
            <div
              class="bg-primary-500 relative mr-3 flex items-start justify-between rounded-xl p-2"
            >
              <button
                class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white p-1 text-white"
                on:click={() => cancelUpload(file.id)}
                aria-label="Cancel Upload"
              >
                <SvgIcon icon="x" size={8} />
              </button>
              <div class="flex flex-col">
                {formatFileName(file)}
                <div class="file-size text-sm font-bold text-yellow-400">
                  {prettyBytes(file.size)}
                </div>
              </div>
              <div class="justify-cente relative ml-4 flex items-center">
                <SvgIcon icon="spinner" color={$modeCurrent ? "%232e2e2e" : "white"} size={20} />
              </div>
            </div>
          {:else if file.dataURL && file.fileType.startsWith("image/")}
            <!-- Display image thumbnail -->
            <div class="relative mr-3 h-16 w-16">
              <img src={file.dataURL} class="h-16 w-16 rounded-lg object-cover" alt="thumbnail" />
              <button
                class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white p-1 text-white"
                on:click={() => cancelUpload(file.id)}
                aria-label="Cancel Upload"
              >
                <SvgIcon icon="x" size={8} />
              </button>
            </div>
          {:else if file.dataURL && file.fileType.startsWith("application/pdf")}
            <!-- Display pdf thumbnail -->
            <div
              class="bg-surface-800/10 relative mb-2 mr-2 flex flex-row items-start justify-between gap-1.5 rounded-xl p-2"
            >
              <button
                class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white p-1 text-white"
                on:click={() => cancelUpload(file.id)}
                aria-label="Cancel Upload"
              >
                <SvgIcon icon="x" size={8} />
              </button>
              <div class="flex flex-col break-all text-sm sm:text-base">
                <div>
                  {formatFileName(file, 10)}
                </div>
                <div class="mt-1 text-xs font-bold text-yellow-400 sm:text-sm">
                  {prettyBytes(file.size)}
                </div>
              </div>
              <div class="flex items-center justify-center">
                <PdfThumbnail
                  pdfDataUrl={file.dataURL ?? ""}
                  width={30}
                  height={43}
                  fallbackIcon="pdf"
                />
              </div>
            </div>
          {:else}
            <!-- If not pdf or image -->
            <div
              class="bg-surface-800/10 relative mb-2 mr-2 flex flex-row items-start justify-between gap-1.5 rounded-xl p-2"
            >
              <button
                class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white p-1 text-white"
                on:click={() => cancelUpload(file.id)}
                aria-label="Cancel Upload"
              >
                <SvgIcon icon="x" size={8} />
              </button>
              <div class="flex flex-col break-all text-sm sm:text-base">
                <div>
                  {formatFileName(file, 10)}
                </div>
                <div class="mt-1 text-xs font-bold text-yellow-400 sm:text-sm">
                  {prettyBytes(file.size)}
                </div>
              </div>
              <div class="flex items-center justify-center">
                <FileIcon {file} size={50} />
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
    <button disabled={text.trim() === "" && images.length === 0} class="pr-2 disabled:opacity-50">
      <SvgIcon icon="caretRight" color={$modeCurrent ? "#2e2e2e" : "white"} size={10} />
    </button>
  </form>
</div>
