<script lang="ts">
  import {
    encodeHashToBase64,
    type ActionHashB64,
    type AgentPubKeyB64,
  } from "@holochain/client";
  import { getContext, onMount } from "svelte";
  import { page } from "$app/stores";
  import Header from "$lib/Header.svelte";
  import type { LocalFile, MessageExtended } from "$lib/types";
  import ConversationMessageInput from "../../ConversationMessageInput.svelte";
  import Message from "../../Message.svelte";
  import {
    deriveCellConversationMessageStore,
    type ConversationMessageStore,
  } from "$store/ConversationMessageStore";
  import { toast } from "svelte-french-toast";
  import { isMobile, isSameDay, isWithinFiveMinutes } from "$lib/utils";

  const conversationMessageStore = getContext<{
    getStore: () => ConversationMessageStore;
  }>("conversationMessageStore").getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  let messages = deriveCellConversationMessageStore(conversationMessageStore, $page.params.id);

  let threadMessages: MessageExtended[] = [];
  let loading = true;
  let sending = false;
  let messageInputRef: HTMLElement;
  let selected: ActionHashB64 | undefined;

  $: threadRootHash = $page.params.threadRootHash as ActionHashB64;
  $: conversationId = $page.params.id;

  async function loadThread() {
    try {
      threadMessages = await messages.getThreadMessages(threadRootHash);
    } catch (e) {
      console.error("Failed to load thread:", e);
      toast.error("Failed to load thread");
    }
    loading = false;
  }

  async function handleSend(event: CustomEvent) {
    if (sending) return;

    const { text, files } = event.detail;
    sending = true;

    try {
      await messages.sendMessage(text, files as LocalFile[], threadRootHash, threadRootHash);
      await loadThread();
    } catch (e) {
      console.error("Failed to send thread reply:", e);
      toast.error("Failed to send reply");
    }

    sending = false;
  }

  function handlePress(actionHashB64: ActionHashB64) {
    if (isMobile()) {
      selected = actionHashB64;
    }
  }

  function handleClick(e: MouseEvent, actionHashB64: ActionHashB64) {
    e.stopPropagation();
    selected = selected === actionHashB64 ? undefined : isMobile() ? undefined : actionHashB64;
  }

  function handleClickOutside() {
    selected = undefined;
  }

  function shouldShowDaySeparator(currentIndex: number) {
    if (currentIndex === 0) return true;
    const currentMsg = threadMessages[currentIndex];
    const prevMsg = threadMessages[currentIndex - 1];
    if (!currentMsg || !prevMsg) return true;
    return !isSameDay(new Date(currentMsg.timestamp / 1000), new Date(prevMsg.timestamp / 1000));
  }

  function shouldShowAuthor(currentIndex: number) {
    if (currentIndex === 0) return true;
    const currentMsg = threadMessages[currentIndex];
    const prevMsg = threadMessages[currentIndex - 1];
    if (!currentMsg || !prevMsg) return true;
    return (
      currentMsg.authorAgentPubKeyB64 !== prevMsg.authorAgentPubKeyB64 ||
      !isWithinFiveMinutes(
        new Date(currentMsg.timestamp / 1000),
        new Date(prevMsg.timestamp / 1000),
      )
    );
  }

  onMount(() => {
    loadThread();
  });
</script>

<Header backUrl="/conversations/{conversationId}">
  <h1 slot="center" class="overflow-hidden text-ellipsis whitespace-nowrap p-4 text-center">
    Thread
  </h1>
</Header>

<div class="mx-auto flex w-full flex-1 flex-col items-center justify-center overflow-hidden">
  <div class="relative flex w-full grow flex-col items-center overflow-hidden">
    {#if loading}
      <div class="flex flex-1 items-center justify-center">
        <span class="text-secondary-400 text-sm">Loading...</span>
      </div>
    {:else if threadMessages.length === 0}
      <div class="flex flex-1 items-center justify-center">
        <span class="text-secondary-400 text-sm">No messages in this thread</span>
      </div>
    {:else}
      <div class="flex w-full flex-1 flex-col overflow-y-auto">
        <div class="flex h-4 items-center justify-center"></div>

        {#each threadMessages as messageExtended, idx}
          {@const actionHashB64 = messageExtended.message.reply_to
            ? encodeHashToBase64(messageExtended.message.reply_to)
            : threadRootHash}

          {#if shouldShowDaySeparator(idx)}
            <div class="text-secondary-400 dark:text-secondary-300 my-4 px-4 text-center text-xs">
              {new Date(messageExtended.timestamp / 1000).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </div>
          {/if}

          <div class="mt-3 px-4">
            <Message
              cellIdB64={conversationId}
              message={messageExtended}
              isSelected={selected === actionHashB64}
              showAuthor={shouldShowAuthor(idx)}
              {actionHashB64}
              participantCount={0}
              on:press={() => handlePress(actionHashB64)}
              on:click={(e) => handleClick(e, actionHashB64)}
              on:clickoutside={handleClickOutside}
            />
          </div>

          {#if idx === 0 && threadMessages.length > 1}
            <div class="border-secondary-300 dark:border-secondary-600 mx-4 my-2 border-t"></div>
          {/if}
        {/each}

        <div class="flex h-4 items-center justify-center"></div>
      </div>
    {/if}
  </div>
</div>

<ConversationMessageInput
  bind:ref={messageInputRef}
  cellIdB64={conversationId}
  disabled={sending}
  loading={sending}
  on:send={handleSend}
/>
