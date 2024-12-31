<script lang="ts">
  import { FileStatus, type Image } from "$lib/types";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { t } from "$translations";
  import { createEventDispatcher } from "svelte";
  import toast from "svelte-french-toast";
  import { MAX_FILE_SIZE } from "$config";
  import FilePreview from "$lib/FilePreview.svelte";

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
                status: FileStatus.Preview,
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
              status: FileStatus.Error,
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
          <FilePreview
            {file}
            size="sm"
            showCancel
            maxFilenameLength={10}
            className="mr-2"
            on:cancel={(e) => cancelUpload(e.detail)}
          />
        {/each}
      </div>
    </div>
    <button disabled={text.trim() === "" && images.length === 0} class="pr-2 disabled:opacity-50">
      <SvgIcon icon="caretRight" color={$modeCurrent ? "#2e2e2e" : "white"} size={10} />
    </button>
  </form>
</div>
