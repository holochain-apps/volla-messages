<script lang="ts">
  import { decodeHashFromBase64, type ActionHashB64, type AgentPubKeyB64 } from "@holochain/client";
  import { getContext, onDestroy, onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import { Privacy, type LocalFile } from "$lib/types";
  import ConversationMessageInput from "./ConversationMessageInput.svelte";
  import ConversationEmpty from "./ConversationEmpty.svelte";
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
  import { POLLING_INTERVAL_FAST, POLLING_INTERVAL_SLOW } from "$config";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import DialogConfirm from "$lib/DialogConfirm.svelte";
  import ConversationHeader from "./ConversationHeader.svelte";

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
  const conversationTitleStore = getContext<{
    getStore: () => ConversationTitleStore;
  }>("conversationTitleStore").getStore();
  const conversationMessageStore = getContext<{
    getStore: () => ConversationMessageStore;
  }>("conversationMessageStore").getStore();

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
  let sending = false;
  let loadingMessagesNew = false;
  let loadingMessagesOld = false;

  let showDeleteDialog = false;
  let deleteMessageActionHashB64: undefined | ActionHashB64 = undefined;
  let isDeletingMessage = false;

  let isFirstConfigLoad = true;
  let isFirstProfilesLoad = true;
  let isFirstLoadMessages = true;

  $: iAmProgenitor = $conversation.dnaProperties.progenitor === myPubKeyB64;

  async function handleDeleteMessage() {
    if (deleteMessageActionHashB64 === undefined) return;

    isDeletingMessage = true;
    try {
      await messages.deleteMessage($page.params.id, deleteMessageActionHashB64);
      toast.success($t("common.delete_message_success"));
    } catch (err) {
      console.error(err);
      toast.error($t("common.delete_message_error"));
    }
    isDeletingMessage = false;
    showDeleteDialog = false;
    deleteMessageActionHashB64 = undefined;
  }

  /**
   * Fetch agent profiles every 2s, until at least 2 profiles are received.
   */
  async function loadProfiles() {
    await profiles.load(isFirstProfilesLoad);
    isFirstProfilesLoad = false;
    clearTimeout(agentTimeout);

    if ($joined.count < 2) {
      agentTimeout = setTimeout(() => {
        loadProfiles();
      }, POLLING_INTERVAL_FAST);
    } else {
      agentTimeout = setTimeout(() => {
        loadProfiles();
      }, POLLING_INTERVAL_SLOW);
    }
  }

  /**
   * Fetch config every 2s, until it is received.
   *
   * Note that if the config is updated, the latest version will not appear until
   * navigating away from and back to this page.
   */
  async function loadConfig() {
    await conversation.loadConfig(isFirstConfigLoad);
    isFirstConfigLoad = false;
    clearTimeout(configTimeout);

    if ($conversation.config === undefined) {
      configTimeout = setTimeout(() => {
        loadConfig();
      }, POLLING_INTERVAL_FAST);
    } else {
      configTimeout = setTimeout(() => {
        loadConfig();
      }, POLLING_INTERVAL_SLOW);
    }
  }

  /**
   * Fetch messages from current bucket every 2s, until any messages are received.
   */
  async function loadMessages() {
    clearTimeout(messageTimeout);
    await loadMessagesInCurrentBucket(isFirstLoadMessages);
    isFirstLoadMessages = false;

    if ($messages.count === 0) {
      messageTimeout = setTimeout(() => {
        loadMessages();
      }, POLLING_INTERVAL_FAST);
    } else {
      messageTimeout = setTimeout(() => {
        loadMessages();
      }, POLLING_INTERVAL_SLOW);
    }
  }

  const loadData = () => {
    loadProfiles();
    loadConfig();
    loadMessages();
  };

  async function loadMessagesInPreviousBucket() {
    if (loadingMessagesOld) return;

    loadingMessagesOld = true;
    try {
      await messages.loadMessagesInPreviousBucketTargetCount(false); //TODO: is this ok to always be from network?
    } catch (e) {
      console.error(e);
    }
    loadingMessagesOld = false;
  }

  async function loadMoreMessages() {
    if (loadingMessagesOld) return;

    loadingMessagesOld = true;
    try {
      const loadedCount = await messages.loadMoreMessages();
      console.log(`Loaded ${loadedCount} more messages for infinite scroll`);
    } catch (e) {
      console.error("Error loading more messages:", e);
    }
    loadingMessagesOld = false;
  }

  async function loadMessagesInCurrentBucket(local: boolean) {
    if (loadingMessagesNew) return;
    console.log("loadMessagesInCurrentBucket");
    loadingMessagesNew = true;
    try {
      await messages.loadMessagesInCurrentBucketTargetCount(local);
    } catch (e) {
      console.error(e);
    }
    loadingMessagesNew = false;
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
      toast.error(`${$t("common.error_sending_message")}: ${(e as Error).message || e}`);
    }
    sending = false;
  }

  onMount(() => {
    conversationMessageInputRef.focus();

    loadData();

    conversation.updateUnread(false);
  });

  // Cleanup
  onDestroy(() => {
    clearTimeout(agentTimeout);
    clearTimeout(configTimeout);
    clearTimeout(messageTimeout);
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
  <div class="relative flex w-full grow flex-col items-center overflow-hidden pt-6">
    {#if $messages.count === 0 && iAmProgenitor && $joined.count === 1}
      <!-- No messages yet, no one has joined, and this is a conversation I created. Display a helpful message to invite others -->
      <ConversationEmpty cellIdB64={$page.params.id} />
    {:else if $messages.count === 0}
      <!-- No messages yet, display conversation header -->
      <ConversationHeader cellIdB64={$page.params.id} />
    {:else}
      <!-- Display conversation messages with proper height container -->
      <div class="w-full flex-1 overflow-hidden">
        <ConversationMessages
          loadingTop={loadingMessagesOld}
          cellIdB64={$page.params.id}
          messages={$messages.list.reverse()}
          on:delete={(e) => {
            deleteMessageActionHashB64 = e.detail;
            showDeleteDialog = true;
          }}
          on:scrollAtTop={loadMoreMessages}
        />
      </div>
    {/if}
  </div>
</div>

<ConversationMessageInput
  bind:ref={conversationMessageInputRef}
  disabled={sending}
  loading={sending}
  on:send={(e) => sendMessage(e.detail.text, e.detail.files)}
/>

<DialogConfirm
  bind:open={showDeleteDialog}
  title={$t("common.delete_message")}
  actionButtonLabel={$t("common.delete")}
  actionButtonIcon="delete"
  loading={isDeletingMessage}
  on:confirm={handleDeleteMessage}
>
  <p>{$t("common.delete_message_dialog_message")}</p>
</DialogConfirm>
