<script lang="ts">
  import type { RelayStore } from "$store/RelayStore";
  import { getContext } from "svelte";
  import { type Message as MessageType, type Image } from "../../../types";
  import Time from "svelte-time";
  import LightboxImage from "$lib/LightboxImage.svelte";
  import MessageActions from "./MessageActions.svelte";
  import Avatar from "$lib/Avatar.svelte";
  import { press } from "svelte-gestures";
  import SvgIcon from "../../../lib/SvgIcon.svelte";
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import DOMPurify from "dompurify";
  import linkifyStr from "linkify-string";
  import { clickoutside } from "@svelte-put/clickoutside";
  import PdfThumbnail from "$lib/PdfThumbnail.svelte";
  import { isMobile } from "$lib/utils";
  import prettyBytes from "pretty-bytes";
  import FileIcon from "$lib/FileIcon.svelte";

  const relayStoreContext: { getStore: () => RelayStore } = getContext("relayStore");
  let relayStore = relayStoreContext.getStore();
  let myPubKeyB64 = relayStore.client.myPubKeyB64;

  export let message: MessageType;
  export let isSelected: boolean = false;
  export let formatFileName: (file: Image, maxLength?: number) => string;

  $: fromMe = message.authorKey === myPubKeyB64;
</script>

{#if message.header}
  <li class="mb-2 mt-auto">
    <div class="text-secondary-400 dark:text-secondary-300 text-center text-xs">
      {message.header}
    </div>
  </li>
{/if}
<button
  class="message-content mt-3 block w-full border-0 text-left
    {isSelected
    ? 'bg-tertiary-500 dark:bg-secondary-500 rounded-xl px-2.5 py-1.5'
    : 'bg-transparent'}"
  on:click
  use:press={{ timeframe: 300, triggerBeforeFinished: true }}
  on:press
  use:clickoutside
  on:clickoutside
  aria-pressed={isSelected}
  aria-label={`Message from ${fromMe ? "you" : message.author}`}
>
  <div class="flex {fromMe ? 'justify-end' : 'justify-start'}">
    {#if !fromMe}
      {#if !message.hideDetails}
        <Avatar
          image={message.avatar}
          agentPubKey={message.authorKey}
          size={24}
          moreClasses="items-start mt-1"
        />
      {:else}
        <span class="inline-block min-w-6"></span>
      {/if}
    {/if}

    <div class="max-w-3/4 ml-3 w-auto {fromMe && 'items-end text-end'}">
      {#if !message.hideDetails}
        <span class="flex items-baseline {fromMe && 'flex-row-reverse opacity-80'}">
          <span class="font-bold">{fromMe ? "You" : message.author}</span>
          <span class="text-xxs mx-2"><Time timestamp={message.timestamp} format="h:mma" /></span>
        </span>
      {/if}

      <!-- if message contains files -->
      {#if message.images && message.images.length > 0}
        {#each message.images as file}
          <div class="flex {fromMe ? 'justify-end' : 'justify-start'} w-full p-2">
            <!-- if file is loaded -->
            {#if file.status === "loaded"}
              <div class="mb-2 flex w-auto max-w-full items-start justify-between">
                <!-- Display image thumbnail -->
                {#if file.fileType.startsWith("image/")}
                  <div class="w-full">
                    <LightboxImage
                      btnClass="inline w-full sm:max-w-md lg:max-w-lg transition-all duration-200"
                      src={file.dataURL}
                      alt={file.name}
                    />
                  </div>
                  <!-- Display pdf thumbnail -->
                {:else if file.fileType === "application/pdf"}
                  <div
                    class="bg-surface-800/10 flex w-auto flex-row items-start gap-3 rounded-xl p-3"
                  >
                    {#if !fromMe}
                      <div class="flex flex-shrink-0 items-center justify-center">
                        <PdfThumbnail
                          pdfDataUrl={file.dataURL ?? ""}
                          width={70}
                          height={90}
                          fallbackIcon="pdf"
                        />
                      </div>
                    {/if}
                    <div class="min-w-0 flex-grow">
                      <div class="break-all text-sm sm:text-base">
                        {isMobile() ? formatFileName(file, 20) : formatFileName(file, 50)}
                      </div>
                      <div class="mt-1 text-xs font-bold text-yellow-400 sm:text-sm">
                        {prettyBytes(file.size)}
                      </div>
                    </div>
                    {#if fromMe}
                      <div class="flex flex-shrink-0 items-center justify-center">
                        <PdfThumbnail
                          pdfDataUrl={file.dataURL ?? ""}
                          width={70}
                          height={90}
                          fallbackIcon="pdf"
                        />
                      </div>
                    {/if}
                  </div>
                  <!-- Display icons for other file types -->
                {:else}
                  <div
                    class="bg-surface-800/10 flex w-auto flex-row items-start gap-3 rounded-xl p-3"
                  >
                    {#if !fromMe}
                      <div class="flex flex-shrink-0 items-center justify-center">
                        <FileIcon {file} size={50} />
                      </div>
                    {/if}
                    <div class="min-w-0 flex-grow">
                      <div class="break-all text-sm sm:text-base">
                        {isMobile() ? formatFileName(file, 20) : formatFileName(file, 50)}
                      </div>
                      <div class="mt-1 text-xs font-bold text-yellow-400 sm:text-sm">
                        {prettyBytes(file.size)}
                      </div>
                    </div>
                    {#if fromMe}
                      <div class="flex flex-shrink-0 items-center justify-center">
                        <FileIcon {file} size={50} />
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
              <!-- if file is loading -->
            {:else if file.status === "loading" || file.status === "pending"}
              <div
                class="bg-surface-800/60 mb-2 flex h-20 w-20 items-center justify-center rounded-lg"
              >
                <SvgIcon icon="spinner" color={$modeCurrent ? "%232e2e2e" : "white"} size={30} />
              </div>
            {:else}
              <div
                class="bg-surface-800/60 mb-2 flex h-20 w-20 items-center justify-center rounded-lg"
              >
                <SvgIcon icon="x" color={$modeCurrent ? "%232e2e2e" : "white"} size={30} />
              </div>
            {/if}
          </div>
        {/each}
      {/if}

      <div class="message w-full break-words font-light {fromMe && 'text-end'}">
        {@html DOMPurify.sanitize(
          linkifyStr(message.content, {
            defaultProtocol: "https",
            rel: {
              url: "noopener noreferrer",
            },
            target: "_blank",
          }),
        )}
      </div>
    </div>
  </div>

  {#if isSelected}
    <MessageActions {message} on:unselect />
  {/if}
</button>

<style>
  :global(.message a) {
    color: rgba(var(--color-primary-500));
  }
</style>
