<script lang="ts">
  import { debounce } from "lodash-es";
  import { type AgentPubKeyB64, encodeHashToBase64 } from "@holochain/client";
  import { type Profile } from "@holochain-open-dev/profiles";
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext, onDestroy, onMount } from "svelte";
  import { type Unsubscriber, derived } from "svelte/store";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { RelayStore } from "$store/RelayStore";
  import {
    Privacy,
    type Conversation,
    type Image,
    type Message,
  } from "../../../types";
  import ConversationMessageInput from "./ConversationMessageInput.svelte";
  import ConversationEmpty from "./ConversationEmpty.svelte";
  import ConversationMembers from "./ConversationMembers.svelte";
  import ConversationMessages from "./ConversationMessages.svelte";

  // Silly hack to get around issues with typescript in sveltekit-i18n
  const tAny = t as any;

  const relayStoreContext: { getStore: () => RelayStore } =
    getContext("relayStore");
  let relayStore = relayStoreContext.getStore();
  let myPubKeyB64 = relayStore.client.myPubKeyB64;

  $: conversation = relayStore.getConversation($page.params.id);
  $: contacts = relayStore.contacts;

  let agentProfiles: { [key: AgentPubKeyB64]: Profile } = {};
  let numMembers = 0;

  let unsubscribe: Unsubscriber;

  let configTimeout: NodeJS.Timeout;
  let agentTimeout: NodeJS.Timeout;
  let messageTimeout: NodeJS.Timeout;

  let conversationMessageInputRef: HTMLInputElement;
  let conversationContainer: HTMLElement;
  let scrollAtBottom = true;
  let scrollAtTop = false;

  const SCROLL_BOTTOM_THRESHOLD = 100; // How close to the bottom must the user be to consider it "at the bottom"
  const SCROLL_TOP_THRESHOLD = 300; // How close to the top must the user be to consider it "at the top"

  const checkForAgents = async () => {
    if (!conversation) return;

    const agentProfiles = await conversation.fetchAgents();
    if (Object.values(agentProfiles).length < 2) {
      agentTimeout = setTimeout(() => {
        checkForAgents();
      }, 2000);
    }
  };

  const checkForConfig = async () => {
    if (!conversation) return;

    const config = await conversation.getConfig();
    if (!config?.title) {
      configTimeout = setTimeout(() => {
        checkForConfig();
      }, 2000);
    }
  };

  const checkForMessages = async () => {
    if (!conversation) return;

    const [_, hashes] = await conversation.loadMessageSetFrom(
      conversation.currentBucket()
    );
    // If this we aren't getting anything back and there are no messages loaded at all
    // then keep trying as this is probably a no network, or a just joined situation
    if (
      hashes.length == 0 &&
      Object.keys(conversation.data.messages).length == 0
    ) {
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
    if (!conversation) {
      goto("/conversations");
    } else {
      unsubscribe = conversation.subscribe((c: Conversation) => {
        agentProfiles = c.agentProfiles;
        // messages = c.messages;
        numMembers = Object.values(agentProfiles).length;
      });
      checkForData();
      conversationContainer.addEventListener("scroll", handleScroll);
      window.addEventListener("resize", debouncedHandleResize);
      conversationMessageInputRef.focus();
      conversation.setUnread(false);
    }
  });

  // Cleanup
  onDestroy(() => {
    unsubscribe && unsubscribe();
    clearTimeout(agentTimeout);
    clearTimeout(configTimeout);
    clearTimeout(messageTimeout);
    conversationContainer &&
      conversationContainer.removeEventListener("scroll", handleScroll);
    window.removeEventListener("resize", debouncedHandleResize);
  });

  // Derived store to process messages and add headers
  $: processedMessages =
    conversation &&
    derived(conversation, ($value) => {
      const messages = Object.values(($value as Conversation).messages).sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );
      const result: Message[] = [];

      let lastMessage: Message | null = null;

      messages.forEach((message) => {
        // Don't display message if we don't have a profile from the author yet.
        if (!agentProfiles[message.authorKey]) {
          return;
        }

        const contact = $contacts.find(
          (c) => c.publicKeyB64 === message.authorKey
        );

        const displayMessage = {
          ...message,
          author:
            contact?.firstName ||
            ($value as Conversation).agentProfiles[message.authorKey].fields
              .firstName,
          avatar:
            contact?.avatar ||
            ($value as Conversation).agentProfiles[message.authorKey].fields
              .avatar,
        };

        if (
          !lastMessage ||
          message.timestamp.toDateString() !==
            lastMessage.timestamp.toDateString()
        ) {
          displayMessage.header = message.timestamp.toLocaleDateString(
            "en-US",
            {
              weekday: "long",
              month: "long",
              day: "numeric",
            }
          );
        }

        // If same person is posting a bunch of messages in a row, hide their name and avatar
        if (
          lastMessage?.authorKey === message.authorKey &&
          message.timestamp.getTime() - lastMessage.timestamp.getTime() <
            1000 * 60 * 5
        ) {
          displayMessage.hideDetails = true;
        }

        result.push(displayMessage);
        lastMessage = message;
      });

      return result;
    });

  // Reactive update to scroll to the bottom every time the messages update,
  // but only if the user is near the bottom already
  $: if ($processedMessages && $processedMessages.length > 0) {
    if (scrollAtBottom) {
      setTimeout(scrollToBottom, 100);
    }
  }

  const handleScroll = debounce(() => {
    const atTop = conversationContainer.scrollTop < SCROLL_TOP_THRESHOLD;
    if (!scrollAtTop && atTop && conversation) {
      conversation.loadMessagesSet();
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
    if (conversation && (text.trim() || images.length > 0)) {
      conversation.sendMessage(myPubKeyB64, text, images);
      setTimeout(scrollToBottom, 100);
      conversationMessageInputRef.focus();
    }
  }
</script>

<Header backUrl={`/conversations${conversation?.archived ? "/archive" : ""}`}>
  {#if conversation}
    <h1
      class="block grow self-center overflow-hidden text-ellipsis whitespace-nowrap text-center"
    >
      <button
        on:click={() => goto(`/conversations/${$page.params.id}/details`)}
        class="w-full"
      >
        {conversation.title}
      </button>
    </h1>
    <button
      class="self-center pl-2"
      on:click={() => goto(`/conversations/${$page.params.id}/details`)}
    >
      <SvgIcon
        icon="gear"
        size="18"
        color={$modeCurrent ? "%232e2e2e" : "white"}
      />
    </button>
    {#if conversation.data.privacy === Privacy.Public || encodeHashToBase64(conversation.data.progenitor) === myPubKeyB64}
      <button
        class="flex-none pl-5"
        on:click={() =>
          goto(
            `/conversations/${conversation.data.id}/${conversation.data.privacy === Privacy.Public ? "details" : "invite"}`
          )}
      >
        <SvgIcon
          icon="addPerson"
          size="24"
          color={$modeCurrent ? "%232e2e2e" : "white"}
        />
      </button>
    {:else}
      <span class="flex-none pl-8">&nbsp;</span>
    {/if}
  {/if}
</Header>

{#if conversation && typeof $processedMessages !== "undefined"}
  <div
    class="container mx-auto flex w-full flex-1 flex-col items-center justify-center overflow-hidden"
  >
    <div
      class="relative flex w-full grow flex-col items-center overflow-y-auto overflow-x-hidden pt-10"
      bind:this={conversationContainer}
      id="message-container"
    >
      {#if conversation.privacy === Privacy.Private}
        <div class="flex items-center justify-center gap-4">
          {#if encodeHashToBase64(conversation.data.progenitor) !== myPubKeyB64 && numMembers === 1}
            <!-- When you join a private conversation and it has not synced yet -->
            <SvgIcon
              icon="spinner"
              size="44"
              color={$modeCurrent ? "%232e2e2e" : "white"}
              moreClasses="mb-5"
            />
          {/if}

          <ConversationMembers {conversation} />
        </div>
      {:else if conversation.data?.config.image}
        <img
          src={conversation.data?.config.image}
          alt="Conversation"
          class="mb-5 h-32 min-h-32 w-32 rounded-full object-cover"
        />
      {/if}
      <h1 class="b-1 break-all text-3xl">{conversation.title}</h1>

      <!-- if joining a conversation created by someone else, say still syncing here until there are at least 2 members -->
      <button
        on:click={() => goto(`/conversations/${$page.params.id}/details`)}
        class="text-left text-sm"
      >
        {$tAny("conversations.num_members", { count: numMembers })}
      </button>

      {#if $processedMessages.length === 0 && encodeHashToBase64(conversation.data.progenitor) === myPubKeyB64 && numMembers === 1}
        <!-- No messages yet, no one has joined, and this is a conversation I created. Display a helpful message to invite others -->
        <ConversationEmpty {conversation} />
      {:else}
        <!-- Display conversation messages -->
        <ConversationMessages messages={$processedMessages} />
      {/if}
    </div>
  </div>

  <ConversationMessageInput
    bind:ref={conversationMessageInputRef}
    on:send={(e) => sendMessage(e.detail.text, e.detail.images)}
  />
{/if}
