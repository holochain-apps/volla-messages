<script lang="ts">
  import { getContext } from "svelte";
  import { Alignment, type CellIdB64, type MessageExtended } from "$lib/types";
  import Time from "svelte-time";
  import MessageActions from "./MessageActions.svelte";
  import Avatar from "$lib/Avatar.svelte";
  import { press } from "svelte-gestures";
  import DOMPurify from "dompurify";
  import linkifyStr from "linkify-string";
  import { clickoutside } from "@svelte-put/clickoutside";
  import MessageFilePreview from "./MessageFilePreview.svelte";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import {
    deriveCellMergedProfileContactInviteStore,
    type MergedProfileContactInviteStore,
  } from "$store/MergedProfileContactInviteStore";

  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();
  const mergedProfileContactInviteStore = getContext<{
    getStore: () => MergedProfileContactInviteStore;
  }>("mergedProfileContactInviteStore").getStore();

  export let message: MessageExtended;
  export let cellIdB64: CellIdB64;
  export let isSelected: boolean = false;
  export let showAuthor: boolean = false;
  export let showDate: boolean = false;

  let mergedProfileContact = deriveCellMergedProfileContactInviteStore(
    mergedProfileContactInviteStore,
    cellIdB64,
    myPubKeyB64,
  );

  $: fromMe = message.authorAgentPubKeyB64 === myPubKeyB64;
  $: authorNickname = $mergedProfileContact.data[message.authorAgentPubKeyB64].profile.nickname;
</script>

{#if showDate}
  <li class="mb-2 mt-auto">
    <div class="text-secondary-400 dark:text-secondary-300 text-center text-xs">
      {new Date(message.timestamp / 1000).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}
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
  aria-label={`Message from ${fromMe ? "you" : authorNickname}`}
>
  <div class="flex {fromMe ? 'justify-end' : 'justify-start'}">
    {#if !fromMe && showAuthor}
      <Avatar
        {cellIdB64}
        agentPubKeyB64={message.authorAgentPubKeyB64}
        size={24}
        moreClasses="items-start mt-1"
      />
    {:else if !fromMe}
      <span class="inline-block min-w-6"></span>
    {/if}

    <div class="max-w-3/4 ml-3 w-auto {fromMe && 'items-end text-end'}">
      {#if showAuthor}
        <span class="flex items-baseline {fromMe && 'flex-row-reverse opacity-80'}">
          <span class="font-bold">{fromMe ? "You" : authorNickname}</span>
          <span class="text-xxs mx-2">
            <Time timestamp={message.timestamp / 1000} format="h:mma" />
          </span>
        </span>
      {/if}

      {#each message.messageFileExtendeds as file}
        <div class="flex {fromMe ? 'justify-end' : 'justify-start'} w-full p-2">
          <MessageFilePreview {file} align={fromMe ? Alignment.Right : Alignment.Left} />
        </div>
      {/each}

      <div class="message w-full break-words font-light {fromMe && 'text-end'}">
        {@html DOMPurify.sanitize(
          linkifyStr(message.message.content, {
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
