<script lang="ts">
  import { type LocalFile, type MessageExtended, type CellIdB64 } from "$lib/types";
  import { decodeHashFromBase64, type ActionHash, type ActionHashB64 } from "@holochain/client";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { createEventDispatcher } from "svelte";
  import toast from "svelte-french-toast";
  import { MAX_FILE_SIZE } from "$config";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";
  import { v4 as uuidv4 } from "uuid";
  import LocalFilePreview from "./LocalFilePreview.svelte";
  import ReplyContext from "./ReplyContext.svelte";

  const dispatch = createEventDispatcher<{
    send: {
      text: string;
      files: LocalFile[];
      replyTo?: ActionHash;
      threadRoot?: ActionHash;
    };
    cancelReply: void;
  }>();

  export let text = "";
  export let files: LocalFile[] = [];
  export let ref: HTMLElement;
  export let disabled: boolean = false;
  export let loading: boolean = false;
  export let replyToMessage: MessageExtended | undefined = undefined;
  export let replyToActionHash: ActionHashB64 | undefined = undefined;
  export let cellIdB64: CellIdB64;

  // Generate unique ID for file input to
  // avoid conflicts when multiple instances
  // exist e.g., main view + thread view
  const fileInputId = `files-${uuidv4()}`;

  $: isValid = text.trim().length > 0 || files.length > 0;

  async function handleImagesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files === null || input.files.length === 0) return;

    const validFiles = Array.from(input.files).filter((file) => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${$t("common.large_file_error", { maxSize: "15MB" } as any)}`);
        return false;
      }
      return true;
    });

    const readers: Promise<LocalFile>[] = validFiles.map((file) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);

      return new Promise<LocalFile>((resolve, reject) => {
        reader.onload = async () => {
          if (typeof reader.result !== "string") reject();

          resolve({
            file,
            dataURL: reader.result as string,
            key: uuidv4(),
          });
        };

        reader.onerror = reject;
      });
    });

    try {
      // When all files are read, update the images store
      const newFiles = await Promise.all(readers);
      files = [...files, ...newFiles];
    } catch (e) {
      console.error(e);
      toast.error(`{$t("common.error_loading_file")}: ${e}`);
    }
    // Resetting the file input, so user can upload the same file again
    input.value = "";
  }

  function send() {
    if (!isValid) return;

    const sendPayload = {
      text,
      files,
      replyTo: replyToActionHash ? decodeHashFromBase64(replyToActionHash) : undefined,
      threadRoot: replyToMessage?.message.thread_root,
    };

    dispatch("send", sendPayload);

    text = "";
    files = [];
    replyToMessage = undefined;
    replyToActionHash = undefined;
  }

  function cancelReply() {
    replyToMessage = undefined;
    replyToActionHash = undefined;
    dispatch("cancelReply");
  }
</script>

<div class="bg-tertiary-500 dark:bg-secondary-500 w-full flex-shrink-0 p-2">
  {#if replyToMessage}
    <ReplyContext {replyToMessage} {cellIdB64} on:cancel={cancelReply} />
  {/if}

  <form class="flex" method="POST" on:submit|preventDefault={send}>
    <input type="file" multiple id={fileInputId} class="hidden" on:change={handleImagesSelected} />
    <label for={fileInputId} class="flex cursor-pointer">
      <div class="flex h-full w-full items-center justify-center">
        <SvgIcon icon="fileClip" moreClasses="ml-2" />
      </div>
    </label>

    <div class="flex w-full flex-col">
      <!-- svelte-ignore a11y-autofocus -->
      <input
        autofocus
        type="text"
        bind:this={ref}
        bind:value={text}
        class="bg-tertiary-500 w-full border-0 placeholder:text-sm placeholder:text-gray-400 focus:border-gray-500 focus:ring-0"
        placeholder={$t("common.message_placeholder")}
        on:keydown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            const submitEvent = new SubmitEvent("submit");
            e.currentTarget.form?.dispatchEvent(submitEvent);
          }
        }}
      />
      <div class="mx-4 flex flex-row flex-wrap">
        {#each files as file, i (file.key)}
          <LocalFilePreview
            {file}
            moreClasses="mr-2 mt-2"
            on:cancel={() => {
              files = [...files.slice(0, i), ...files.slice(i + 1)];
            }}
          />
        {/each}
      </div>
    </div>
    {#if loading}
      <div class="flex items-center justify-center">
        <SvgIcon icon="spinner" moreClasses="pr-2 disabled:opacity-50 w-8 h-8" />
      </div>
    {:else}
      <ButtonIconBare
        disabled={!isValid || disabled}
        moreClassesButton="pr-2 disabled:opacity-50"
        icon="caretRight"
      />
    {/if}
  </form>
</div>
