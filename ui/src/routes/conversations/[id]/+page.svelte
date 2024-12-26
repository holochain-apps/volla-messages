<script lang="ts">
  import { debounce } from "lodash-es";
  import { encodeHashToBase64 } from "@holochain/client";
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext, onDestroy, onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { RelayStore } from "$store/RelayStore";
  import { Privacy, type Image } from "../../../types";
  import ConversationMessageInput from "./ConversationMessageInput.svelte";
  import ConversationEmpty from "./ConversationEmpty.svelte";
  import ConversationMembers from "./ConversationMembers.svelte";
  import ConversationMessages from "./ConversationMessages.svelte";

  // Silly hack to get around issues with typescript in sveltekit-i18n
  const tAny = t as any;

  const relayStoreContext: { getStore: () => RelayStore } = getContext("relayStore");
  let relayStore = relayStoreContext.getStore();
  let myPubKeyB64 = relayStore.client.myPubKeyB64;

  let conversationStore = relayStore.getConversation($page.params.id);

  let configTimeout: NodeJS.Timeout;
  let agentTimeout: NodeJS.Timeout;
  let messageTimeout: NodeJS.Timeout;

  let conversationMessageInputRef: HTMLInputElement;
  let conversationContainer: HTMLElement;
  let scrollAtBottom = true;
  let scrollAtTop = false;

  const SCROLL_BOTTOM_THRESHOLD = 100; // How close to the bottom must the user be to consider it "at the bottom"
  const SCROLL_TOP_THRESHOLD = 300; // How close to the top must the user be to consider it "at the top"

  $: agentProfiles = $conversationStore ? $conversationStore.conversation.agentProfiles : {};
  $: numMembers = Object.keys(agentProfiles).length;

  const checkForAgents = async () => {
    if (!conversationStore) return;

    const a = await conversationStore.fetchAgents();
    if (Object.values(a).length < 2) {
      agentTimeout = setTimeout(() => {
        checkForAgents();
      }, 2000);
    }
  };

  const checkForConfig = async () => {
    if (!conversationStore) return;

    const c = await conversationStore.fetchConfig();
    if (!c?.title) {
      configTimeout = setTimeout(() => {
        checkForConfig();
      }, 2000);
    }
  };

  const checkForMessages = async () => {
    if (!conversationStore || !$conversationStore) return;

    const [_, h] = await conversationStore.loadMessageSetFromCurrentBucket();
    // If this we aren't getting anything back and there are no messages loaded at all
    // then keep trying as this is probably a no network, or a just joined situation
    if (h.length == 0 && Object.keys($conversationStore?.conversation.messages).length == 0) {
      messageTimeout = setTimeout(() => {
        checkForMessages();
      }, 2000);
    }
  };

  const checkForData = () => {
    checkForAgents();
    checkForConfig();
    checkForMessages();
  };

  function handleResize() {
    if (scrollAtBottom) {
      scrollToBottom();
    }
  }
  const debouncedHandleResize = debounce(handleResize, 100);

  onMount(() => {
    if (!conversationStore) {
      goto("/conversations");
    } else {
      checkForData();
      conversationContainer.addEventListener("scroll", handleScroll);
      window.addEventListener("resize", debouncedHandleResize);
      conversationMessageInputRef.focus();
      conversationStore.setUnread(false);
    }
  });

  // Cleanup
  onDestroy(() => {
    clearTimeout(agentTimeout);
    clearTimeout(configTimeout);
    clearTimeout(messageTimeout);
    conversationContainer && conversationContainer.removeEventListener("scroll", handleScroll);
    window.removeEventListener("resize", debouncedHandleResize);
  });

  // Reactive update to scroll to the bottom every time the messages update,
  // but only if the user is near the bottom already
  $: if ($conversationStore && $conversationStore.processedMessages.length > 0) {
    if (scrollAtBottom) {
      setTimeout(scrollToBottom, 100);
    }
  }

  const handleScroll = debounce(() => {
    const atTop = conversationContainer.scrollTop < SCROLL_TOP_THRESHOLD;
    if (!scrollAtTop && atTop && conversationStore) {
      conversationStore.loadMessagesSet();
    }
    scrollAtTop = atTop;
    scrollAtBottom =
      conversationContainer.scrollHeight - conversationContainer.scrollTop <=
      conversationContainer.clientHeight + SCROLL_BOTTOM_THRESHOLD;
  }, 100);

  function scrollToBottom() {
    if (conversationContainer) {
      conversationContainer.scrollTop = conversationContainer.scrollHeight;
      scrollAtBottom = true;
    }
  }

  async function sendMessage(text: string, images: Image[]) {
    if (conversationStore && (text.trim() || images.length > 0)) {
      conversationStore.sendMessage(myPubKeyB64, text, images);
      setTimeout(scrollToBottom, 100);
      conversationMessageInputRef.focus();
    }
  }
</script>

<Header backUrl={`/conversations${$conversationStore?.archived ? "/archive" : ""}`}>
  {#if conversationStore}
    <h1 class="block grow self-center overflow-hidden text-ellipsis whitespace-nowrap text-center">
      <button on:click={() => goto(`/conversations/${$page.params.id}/details`)} class="w-full">
        {conversationStore.getTitle()}
      </button>
    </h1>
    <button
      class="self-center pl-2"
      on:click={() => goto(`/conversations/${$page.params.id}/details`)}
    >
      <SvgIcon icon="gear" size="18" color={$modeCurrent ? "%232e2e2e" : "white"} />
    </button>
    {#if $conversationStore && ($conversationStore.conversation.privacy === Privacy.Public || encodeHashToBase64($conversationStore.conversation.progenitor) === myPubKeyB64)}
      <button
        class="flex-none pl-5"
        on:click={() =>
          goto(
            `/conversations/${$conversationStore?.conversation.dnaHashB64}/${$conversationStore.conversation.privacy === Privacy.Public ? "details" : "invite"}`,
          )}
      >
        <SvgIcon icon="addPerson" size="24" color={$modeCurrent ? "%232e2e2e" : "white"} />
      </button>
    {:else}
      <span class="flex-none pl-8">&nbsp;</span>
    {/if}
  {/if}
</Header>

{#if conversationStore && $conversationStore && typeof $conversationStore.processedMessages !== undefined}
  <div
    class="container mx-auto flex w-full flex-1 flex-col items-center justify-center overflow-hidden"
  >
    <div
      class="relative flex w-full grow flex-col items-center overflow-y-auto overflow-x-hidden pt-10"
      bind:this={conversationContainer}
      id="message-container"
    >
      {#if $conversationStore.conversation.privacy === Privacy.Private}
        <div class="flex items-center justify-center gap-4">
          {#if encodeHashToBase64($conversationStore.conversation.progenitor) !== myPubKeyB64 && numMembers === 1}
            <!-- When you join a private conversation and it has not synced yet -->
            <SvgIcon
              icon="spinner"
              size="44"
              color={$modeCurrent ? "%232e2e2e" : "white"}
              moreClasses="mb-5"
            />
          {/if}

          <ConversationMembers {conversationStore} />
        </div>
      {:else if $conversationStore.conversation.config.image}
        <img
          src={$conversationStore.conversation.config.image}
          alt="Conversation"
          class="mb-5 h-32 min-h-32 w-32 rounded-full object-cover"
        />
      {/if}
      <h1 class="b-1 break-all text-3xl">{conversationStore.getTitle()}</h1>

      <!-- if joining a conversation created by someone else, say still syncing here until there are at least 2 members -->
      <button
        on:click={() => goto(`/conversations/${$page.params.id}/details`)}
        class="text-left text-sm"
      >
        {$tAny("conversations.num_members", { count: numMembers })}
      </button>

      {#if $conversationStore.processedMessages.length === 0 && encodeHashToBase64($conversationStore.conversation.progenitor) === myPubKeyB64 && numMembers === 1}
        <!-- No messages yet, no one has joined, and this is a conversation I created. Display a helpful message to invite others -->
        <ConversationEmpty {conversationStore} />
      {:else}
        <!-- Display conversation messages -->
        <ConversationMessages messages={$conversationStore.processedMessages} />
      {/if}
    </div>
  </div>

  <ConversationMessageInput
    bind:ref={conversationMessageInputRef}
    on:send={(e) => sendMessage(e.detail.text, e.detail.images)}
  />
{/if}
