<script lang="ts">
  import { isMobile, isSameDay, isWithinFiveMinutes } from "$lib/utils";
  import type { ActionHashB64 } from "@holochain/client";
  import type { MessageExtended, CellIdB64 } from "$lib/types";
  import BaseMessage from "./Message.svelte";
  import { createEventDispatcher, onMount } from "svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import ConversationHeader from "./ConversationHeader.svelte";

  const dispatch = createEventDispatcher<{
    loadMore: null;
  }>();

  export let messages: [ActionHashB64, MessageExtended][];
  export let cellIdB64: CellIdB64;

  let selected: ActionHashB64 | undefined;
  let scrollContainer: HTMLDivElement;

  // Client-side pagination state
  let displayedMessageCount = 20; // Start by showing 20 messages
  const messagesPerPage = 20; // Load 20 more messages each time
  let isLoadingMore = false; // Track loading state for more messages
  let scrollTimeout: NodeJS.Timeout; // Debounce scroll events
  let hasTriggeredLoad = false; // Prevent multiple triggers

  // Get the most recent messages to display (slice from the end)
  $: displayedMessages = messages.slice(-displayedMessageCount);

  // Check if there are more messages to load
  $: hasMoreMessages = messages.length > displayedMessageCount;

  // Handle scroll events - detect when user scrolls near the top
  function handleScroll() {
    if (!scrollContainer || isLoadingMore || !hasMoreMessages) return;

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;

      // Calculate distance from top
      const distanceFromTop = scrollTop;
      const threshold = 50; // pixels from top

      // Debug log
      console.log("Scroll event:", {
        scrollTop,
        scrollHeight,
        clientHeight,
        distanceFromTop,
        hasMoreMessages,
      });

      // Trigger loading when user scrolls close to the top AND we haven't just loaded
      if (distanceFromTop <= threshold && !hasTriggeredLoad) {
        console.log("Triggering load more messages");
        hasTriggeredLoad = true;
        loadMoreMessages();

        // Reset the trigger flag after a delay
        setTimeout(() => {
          hasTriggeredLoad = false;
        }, 1000);
      }
    }, 100); // Reduced debounce for better responsiveness
  }

  // Load more messages (increase displayed count)
  function loadMoreMessages() {
    if (isLoadingMore || !hasMoreMessages) return;

    isLoadingMore = true;
    const previousScrollHeight = scrollContainer.scrollHeight;

    // Increase the number of displayed messages
    displayedMessageCount = Math.min(displayedMessageCount + messagesPerPage, messages.length);

    // Maintain scroll position after loading more messages
    requestAnimationFrame(() => {
      if (scrollContainer) {
        const newScrollHeight = scrollContainer.scrollHeight;
        const heightDifference = newScrollHeight - previousScrollHeight;
        // Adjust scroll position to maintain visual position
        scrollContainer.scrollTop = heightDifference;
      }

      // Add a small delay before allowing more loads
      setTimeout(() => {
        isLoadingMore = false;
      }, 500); // Longer delay to prevent rapid loading
    });
  }

  // Reset pagination when messages change (new conversation or new messages)
  let previousMessagesLength = 0;
  $: {
    if (messages.length !== previousMessagesLength) {
      // If new messages were added (length increased), keep current pagination
      // If it's a different conversation (length is very different), reset pagination
      if (
        messages.length < previousMessagesLength ||
        Math.abs(messages.length - previousMessagesLength) > 5
      ) {
        displayedMessageCount = Math.min(20, messages.length);
      }
      previousMessagesLength = messages.length;
    }
  }

  // No scroll positioning needed - flexbox handles it naturally

  function handleClick(e: MouseEvent, actionHashB64: ActionHashB64) {
    // prevent clickoutside event from firing at the same time
    e.stopPropagation();

    if (selected === actionHashB64) {
      // If clicking a selected message, deselect it
      selected = undefined;
    } else if (selected !== undefined) {
      // If clicking an unselected message, and another message is currently selected, deselect it
      selected = undefined;
    } else if (!isMobile()) {
      // If clicking an unselected message **on desktop**, select it
      selected = actionHashB64;
    }
  }

  // If clicking outside a message, deselect it
  function handleClickOutside() {
    selected = undefined;
  }

  // If pressing a message **on mobile**, select it
  function handlePress(actionHashB64: ActionHashB64) {
    if (!isMobile()) return;

    selected = actionHashB64;
  }

  // Scroll to bottom only when component first loads
  function scrollToBottom() {
    if (scrollContainer) {
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });
    }
  }

  // Track if this is the first load
  let isFirstLoad = true;

  onMount(() => {
    // Only scroll to bottom when component first loads
    if (isFirstLoad) {
      scrollToBottom();
      isFirstLoad = false;
    }
  });

  // Watch for new messages from backend (not pagination) and scroll to bottom only if user is near bottom
  let previousTotalMessages = 0;
  $: {
    if (messages.length > previousTotalMessages && previousTotalMessages > 0) {
      // New messages from backend - check if user is near bottom
      if (scrollContainer) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

        // Only auto-scroll if user is near the bottom (within 100px)
        if (distanceFromBottom <= 100) {
          scrollToBottom();
        }
      }
    }
    previousTotalMessages = messages.length;
  }
</script>

<!-- Scrollable container with normal flex flow -->
<div
  class="flex w-full flex-1 flex-col overflow-y-auto"
  bind:this={scrollContainer}
  on:scroll={handleScroll}
>
  <!-- Top loading indicator when actively loading -->
  {#if isLoadingMore}
    <div class="animate-in fade-in flex items-center justify-center py-6 duration-300">
      <div
        class="flex items-center space-x-3 rounded-full border border-gray-200/50 bg-white/90 px-6 py-3 shadow-lg backdrop-blur-sm dark:border-gray-700/50 dark:bg-gray-800/90"
      >
        <div class="relative">
          <div
            class="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500 dark:border-gray-600 dark:border-t-blue-400"
          ></div>
          <div
            class="absolute inset-0 h-5 w-5 animate-pulse rounded-full border-2 border-blue-200/50 dark:border-blue-300/30"
          ></div>
        </div>
        <span class="text-sm font-medium text-gray-700 dark:text-gray-200"
          >Loading older messages...</span
        >
      </div>
    </div>
  {:else if hasMoreMessages}
    <!-- Indicator when more messages are available to load -->
    <div class="animate-in fade-in flex items-center justify-center py-4 duration-500">
      <div
        class="group flex cursor-pointer items-center space-x-2 rounded-full border border-blue-200/60 bg-blue-50/80 px-4 py-2 shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-blue-300/80 hover:bg-blue-100/90 hover:shadow-md dark:border-blue-800/60 dark:bg-blue-900/30 dark:hover:border-blue-700/80 dark:hover:bg-blue-800/40"
        on:click={loadMoreMessages}
        role="button"
        tabindex="0"
        on:keydown={(e) => e.key === "Enter" && loadMoreMessages()}
      >
        <div class="relative">
          <div
            class="h-4 w-4 animate-pulse rounded-full border-2 border-blue-400/60 group-hover:border-blue-500 dark:border-blue-400/80 dark:group-hover:border-blue-300"
          ></div>
          <div
            class="absolute inset-1 h-2 w-2 animate-ping rounded-full bg-blue-400/40 group-hover:bg-blue-500/60 dark:bg-blue-400/60"
          ></div>
        </div>
        <span
          class="text-sm font-medium text-blue-700 group-hover:text-blue-800 dark:text-blue-300 dark:group-hover:text-blue-200"
          >{messages.length - displayedMessageCount} more messages</span
        >
        <svg
          class="h-3 w-3 text-blue-600 transition-transform duration-300 group-hover:-translate-y-0.5 dark:text-blue-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"
          ></path>
        </svg>
      </div>
    </div>
  {/if}

  <!-- Messages content -->
  <div class="flex flex-col">
    <!-- Conversation header at top of messages -->
    <div class="animate-in fade-in slide-in-from-top-4 flex-shrink-0 duration-500">
      <ConversationHeader {cellIdB64} />
    </div>

    {#each displayedMessages as [actionHashB64, messageExtended], index}
      {@const prevMessageExtended = index > 0 ? displayedMessages[index - 1][1] : undefined}

      <div
        class="animate-in fade-in slide-in-from-top-2 flex flex-col duration-300"
        style="animation-delay: {index * 20}ms;"
      >
        <!-- Show day if the message is authored on a different day than the previous message -->
        {#if prevMessageExtended === undefined || !isSameDay(new Date(messageExtended.timestamp / 1000), new Date(prevMessageExtended.timestamp / 1000))}
          <div
            class="animate-in fade-in my-4 px-4 text-center text-xs text-secondary-400 duration-500 dark:text-secondary-300"
          >
            {new Date(messageExtended.timestamp / 1000).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </div>
        {/if}

        <div
          class="animate-in fade-in slide-in-from-bottom-1 duration-400 mt-3 px-4"
          style="animation-delay: {index * 30 + 100}ms;"
        >
          <BaseMessage
            {cellIdB64}
            message={messageExtended}
            isSelected={selected === actionHashB64}
            showAuthor={prevMessageExtended === undefined ||
              messageExtended.authorAgentPubKeyB64 !== prevMessageExtended.authorAgentPubKeyB64 ||
              !isWithinFiveMinutes(
                new Date(messageExtended.timestamp / 1000),
                new Date(prevMessageExtended.timestamp / 1000),
              )}
            {actionHashB64}
            on:press={() => handlePress(actionHashB64)}
            on:click={(e) => handleClick(e, actionHashB64)}
            on:clickoutside={handleClickOutside}
            on:delete
          />
        </div>
      </div>
    {/each}

    <!-- Bottom padding -->
    <div class="h-4 flex-shrink-0"></div>
  </div>
</div>