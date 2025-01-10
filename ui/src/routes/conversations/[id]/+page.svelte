<script lang="ts">
  import { debounce } from "lodash-es";
  import { type AgentPubKeyB64 } from "@holochain/client";
  import { getContext, onDestroy, onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import { Privacy, type LocalFile } from "$lib/types";
  import ConversationMessageInput from "./ConversationMessageInput.svelte";
  import ConversationEmpty from "./ConversationEmpty.svelte";
  import PrivateConversationImage from "./PrivateConversationImage.svelte";
  import ConversationMessages from "./ConversationMessages.svelte";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";
  import { deriveCellConversationStore, type ConversationStore } from "$store/ConversationStore";
  import { deriveCellProfileStore, type ProfileStore } from "$store/ProfileStore";
  import { toast } from "svelte-french-toast";
  import {
    type ConversationTitleStore,
    deriveCellConversationTitleStore,
  } from "$store/ConversationTitleStore";
  import {
    deriveCellConversationMessageStore,
    type ConversationMessageStore,
  } from "$store/ConversationMessageStore";
  import {
    deriveCellMergedProfileContactInviteJoinedStore,
    type MergedProfileContactInviteJoinedStore,
  } from "$store/MergedProfileContactInviteJoinedStore";

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();
  const profileStore = getContext<{ getStore: () => ProfileStore }>("profileStore").getStore();
  const mergedProfileContactInviteJoinedStore = getContext<{
    getStore: () => MergedProfileContactInviteJoinedStore;
  }>("mergedProfileContactInviteJoinedStore").getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();
  const conversationTitleStore = getContext<{ getStore: () => ConversationTitleStore }>(
    "conversationTitleStore",
  ).getStore();
  const conversationMessageStore = getContext<{ getStore: () => ConversationMessageStore }>(
    "conversationMessageStore",
  ).getStore();

  let conversation = deriveCellConversationStore(conversationStore, $page.params.id);
  let messages = deriveCellConversationMessageStore(conversationMessageStore, $page.params.id);
  let profiles = deriveCellProfileStore(profileStore, $page.params.id);
  let conversationTitle = deriveCellConversationTitleStore(conversationTitleStore, $page.params.id);
  let joined = deriveCellMergedProfileContactInviteJoinedStore(
    mergedProfileContactInviteJoinedStore,
    $page.params.id,
  );

  let configTimeout: NodeJS.Timeout;
  let agentTimeout: NodeJS.Timeout;
  let messageTimeout: NodeJS.Timeout;

  let conversationMessageInputRef: HTMLInputElement;
  let conversationContainerRef: HTMLElement;
  let scrollAtBottom = true;
  let scrollAtTop = false;
  let sending = false;

  const SCROLL_BOTTOM_THRESHOLD = 100; // How close to the bottom must the user be to consider it "at the bottom"
  const SCROLL_TOP_THRESHOLD = 300; // How close to the top must the user be to consider it "at the top"

  $: iAmProgenitor = $conversation.dnaProperties.progenitor === myPubKeyB64;

  // Reactive update to scroll to the bottom every time the messages update,
  // but only if the user is near the bottom already
  $: if ($messages.count > 0) {
    if (scrollAtBottom) {
      scrollToBottom(100);
    }
  }

  /**
   * Fetch agent profiles every 2s, until at least 2 profiles are received.
   */
  async function loadProfiles() {
    await profiles.load();

    if ($joined.count < 2) {
      agentTimeout = setTimeout(() => {
        loadProfiles();
      }, 2000);
    } else {
      agentTimeout = setTimeout(() => {
        loadProfiles();
      }, 15000);
    }
  }

  /**
   * Fetch config every 2s, until it is received.
   *
   * Note that if the config is updated, the latest version will not appear until
   * navigating away from and back to this page.
   */
  async function loadConfig() {
    await conversation.loadConfig();

    if ($conversation.config === undefined) {
      configTimeout = setTimeout(() => {
        loadConfig();
      }, 2000);
    }
  }

  /**
   * Fetch messages from current bucket every 2s, until any messages are received.
   */
  async function loadMessages() {
    await messages.loadMessagesInCurrentBucket();

    if ($messages.count === 0) {
      messageTimeout = setTimeout(() => {
        loadMessages();
      }, 2000);
    }
  }

  const loadData = () => {
    loadProfiles();
    loadConfig();
    loadMessages();
  };

  function _handleResize() {
    if (!scrollAtBottom) return;

    scrollToBottom();
  }
  const debouncedHandleResize = debounce(_handleResize, 100);

  const handleScroll = debounce(() => {
    if (conversationContainerRef === undefined) return;

    const atTop = conversationContainerRef.scrollTop < SCROLL_TOP_THRESHOLD;
    if (!scrollAtTop && atTop) {
      messages.loadMessagesInPreviousBucket();
    }
    scrollAtTop = atTop;
    scrollAtBottom =
      conversationContainerRef.scrollHeight - conversationContainerRef.scrollTop <=
      conversationContainerRef.clientHeight + SCROLL_BOTTOM_THRESHOLD;
  }, 100);

  function scrollToBottom(delay: number = 0) {
    setTimeout(() => {
      if (!conversationContainerRef) return;
      conversationContainerRef.scrollTop = conversationContainerRef.scrollHeight;
      scrollAtBottom = true;
    }, delay);
  }

  async function sendMessage(text: string, files: LocalFile[]) {
    if (sending) return;

    // Focus on input field to ensure the keyboard remains open after sending message on android
    conversationMessageInputRef.focus();

    sending = true;
    try {
      await messages.sendMessage(text, files);
    } catch (e) {
      console.error(e);
      toast.error(`${$t("common.error_sending_message")}: ${e.message}`);
    }
    sending = false;
  }

  onMount(() => {
    conversationMessageInputRef.focus();

    loadData();

    conversationContainerRef.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", debouncedHandleResize);

    conversation.updateUnread(false);

    scrollToBottom();
  });

  // Cleanup
  onDestroy(() => {
    clearTimeout(agentTimeout);
    clearTimeout(configTimeout);
    clearTimeout(messageTimeout);

    conversationContainerRef.removeEventListener("scroll", handleScroll);

    window.removeEventListener("resize", debouncedHandleResize);
  });
</script>

<Header backUrl="/conversations">
  <h1 slot="center" class="overflow-hidden text-ellipsis whitespace-nowrap p-4 text-center">
    {$conversationTitle}
  </h1>

  <div class="flex items-center justify-center" slot="right">
    <ButtonIconBare
      moreClasses="!w-[18px] !h-auto"
      moreClassesButton="p-4"
      icon="gear"
      on:click={() => goto(`/conversations/${$page.params.id}/details`)}
    />

    {#if $conversation.dnaProperties.privacy === Privacy.Private && iAmProgenitor}
      <ButtonIconBare
        moreClasses="h-[24px] w-[24px]"
        moreClassesButton="p-4"
        icon="addPerson"
        on:click={() => goto(`/conversations/${$page.params.id}/invite`)}
      />
    {/if}
  </div>
</Header>

<div class="mx-auto flex w-full flex-1 flex-col items-center justify-center overflow-hidden">
  <div
    class="relative flex w-full grow flex-col items-center overflow-y-auto overflow-x-hidden pt-6"
    bind:this={conversationContainerRef}
  >
    {#if $conversation.dnaProperties.privacy === Privacy.Private}
      <PrivateConversationImage cellIdB64={$page.params.id} />
    {:else if $conversation.config?.image}
      <img
        src={$conversation.config.image}
        alt="Conversation"
        class="mb-5 h-32 min-h-32 w-32 rounded-full object-cover"
      />
    {/if}

    <h1 class="b-1 break-all text-3xl">{$conversationTitle}</h1>

    <!-- if joining a conversation created by someone else, say still syncing here until there are at least 2 members -->
    <div class="text-left text-sm">
      {$t("common.num_members", { count: $joined.count })}
    </div>

    {#if $messages.count === 0 && iAmProgenitor && $joined.count === 1}
      <!-- No messages yet, no one has joined, and this is a conversation I created. Display a helpful message to invite others -->
      <ConversationEmpty cellIdB64={$page.params.id} />
    {:else}
      <!-- Display conversation messages -->
      <ConversationMessages cellIdB64={$page.params.id} messages={$messages.list} />
    {/if}
  </div>
</div>

<ConversationMessageInput
  bind:ref={conversationMessageInputRef}
  disabled={sending}
  loading={sending}
  on:send={(e) => sendMessage(e.detail.text, e.detail.files)}
/>
