<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { CellIdB64, MessageExtended } from "$lib/types";
  import AgentNickname from "$lib/AgentNickname.svelte";
  import DOMPurify from "dompurify";
  import MessageFilePreview from "./MessageFilePreview.svelte";
  import { encodeHashToBase64 } from "@holochain/client";
  import { Alignment } from "$lib/types";

  export let replyToMessage: MessageExtended;
  export let cellIdB64: CellIdB64;
  export let maxLength = 100;

  const dispatch = createEventDispatcher<{ click: void }>();

  $: truncatedContent =
    replyToMessage.message.content.length > maxLength
      ? replyToMessage.message.content.slice(0, maxLength) + "..."
      : replyToMessage.message.content;

  $: hasFiles = replyToMessage.message.images.length > 0;
</script>

<button
  class="bg-secondary-200 dark:bg-secondary-700 border-primary-500 hover:bg-secondary-300 dark:hover:bg-secondary-600 mb-2 w-full cursor-pointer rounded-md border-l-4 px-3 py-2 text-left transition-colors"
  on:click={() => dispatch("click")}
>
  <div
    class="text-primary-600 dark:text-primary-400 mb-1 flex items-center gap-1 text-xs font-semibold"
  >
    <span>Reply to:</span>
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
    <div class="text-secondary-600 dark:text-secondary-400 line-clamp-2 text-sm">
      {@html DOMPurify.sanitize(truncatedContent)}
    </div>
  {/if}
</button>
