<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { CellIdB64, MessageExtended } from "$lib/types";
  import AgentNickname from "$lib/AgentNickname.svelte";
  import DOMPurify from "dompurify";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import MessageFilePreview from "./MessageFilePreview.svelte";
  import { encodeHashToBase64 } from "@holochain/client";
  import { Alignment } from "$lib/types";

  export let replyToMessage: MessageExtended;
  export let cellIdB64: CellIdB64;

  const dispatch = createEventDispatcher<{ cancel: void }>();

  $: truncatedContent =
    replyToMessage.message.content.length > 80
      ? replyToMessage.message.content.slice(0, 80) + "..."
      : replyToMessage.message.content;

  $: hasFiles = replyToMessage.message.images.length > 0;
</script>

<div
  class="border-primary-500 bg-tertiary-400 dark:bg-secondary-600 mb-2 flex items-start justify-between gap-2 border-l-4 p-3"
>
  <div class="min-w-0 flex-1">
    <div class="mb-1 flex items-center gap-1 text-xs font-semibold">
      <span>Replying to:</span>
      <AgentNickname {cellIdB64} agentPubKeyB64={replyToMessage.authorAgentPubKeyB64} />
    </div>

    {#if hasFiles}
      <div class="mb-2">
        {#each replyToMessage.message.images as file}
          <MessageFilePreview
            entryHashB64={encodeHashToBase64(file.storage_entry_hash)}
            align={Alignment.Left}
          />
        {/each}
      </div>
    {/if}

    {#if truncatedContent}
      <div class="text-secondary-600 dark:text-secondary-400 text-sm">
        {@html DOMPurify.sanitize(truncatedContent)}
      </div>
    {/if}
  </div>
  <button
    on:click={() => dispatch("cancel")}
    class="hover:bg-secondary-300 dark:hover:bg-secondary-700 flex shrink-0 items-center justify-center self-start rounded p-1.5 transition-colors"
    aria-label="Cancel reply"
  >
    <SvgIcon icon="x" moreClasses="!w-4 !h-4" />
  </button>
</div>
