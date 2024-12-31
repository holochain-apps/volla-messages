<script lang="ts">
  import type { RelayStore } from "$store/RelayStore";
  import { getContext } from "svelte";
  import { type Message as MessageType, type Image, Alignment } from "$lib/types";
  import Time from "svelte-time";
  import MessageActions from "./MessageActions.svelte";
  import Avatar from "$lib/Avatar.svelte";
  import { press } from "svelte-gestures";
  import DOMPurify from "dompurify";
  import linkifyStr from "linkify-string";
  import { clickoutside } from "@svelte-put/clickoutside";
  import { isMobile } from "$lib/utils";
  import FilePreview from "$lib/FilePreview.svelte";

  const relayStoreContext: { getStore: () => RelayStore } = getContext("relayStore");
  let relayStore = relayStoreContext.getStore();
  let myPubKeyB64 = relayStore.client.myPubKeyB64;

  export let message: MessageType;
  export let isSelected: boolean = false;

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
            <FilePreview {file} size="lg" align={fromMe ? "right" : "left"} className="mb-2" />
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
