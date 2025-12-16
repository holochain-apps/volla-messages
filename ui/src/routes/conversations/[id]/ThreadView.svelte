<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { CellIdB64, MessageExtended, ThreadInfo } from "$lib/types";
  import type { ActionHashB64 } from "@holochain/client";
  import Message from "./Message.svelte";
  import ConversationMessageInput from "./ConversationMessageInput.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { encodeHashToBase64 } from "@holochain/client";

  export let thread: ThreadInfo;
  export let cellIdB64: CellIdB64;
  export let open = false;

  const dispatch = createEventDispatcher<{
    close: void;
    sendReply: { text: string; files: File[]; replyTo: ActionHashB64 };
  }>();

  let messageInputRef: HTMLElement;

  function handleSend(event: CustomEvent) {
    dispatch("sendReply", {
      ...event.detail,
      replyTo: thread.rootMessageHash,
    });
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
    on:click={() => dispatch("close")}
  >
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="dark:bg-secondary-800 flex h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-2xl"
      on:click|stopPropagation
    >
      <div
        class="border-secondary-300 dark:border-secondary-700 flex items-center justify-between border-b p-4"
      >
        <h2 class="text-lg font-semibold">Thread</h2>
        <button
          on:click={() => dispatch("close")}
          class="hover:bg-secondary-200 dark:hover:bg-secondary-700 flex items-center justify-center rounded p-1.5 transition-colors"
          aria-label="Close thread"
        >
          <SvgIcon icon="x" moreClasses="!w-5 !h-5" />
        </button>
      </div>

      <div class="flex-1 space-y-4 overflow-y-auto p-4">
        {#each thread.messages as messageExtended, idx (idx)}
          <Message
            {cellIdB64}
            message={messageExtended}
            actionHashB64={encodeHashToBase64(messageExtended.message.reply_to || new Uint8Array())}
            showAuthor={true}
            isSelected={false}
            participantCount={0}
          />
        {/each}
      </div>

      <div class="border-secondary-300 dark:border-secondary-700 border-t">
        <ConversationMessageInput bind:ref={messageInputRef} {cellIdB64} on:send={handleSend} />
      </div>
    </div>
  </div>
{/if}
