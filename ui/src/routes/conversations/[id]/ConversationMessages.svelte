<script lang="ts">
  import { isMobile, isSameDay, isWithinFiveMinutes } from "$lib/utils";
  import type { ActionHashB64 } from "@holochain/client";
  import type { MessageExtended, CellIdB64 } from "$lib/types";
  import BaseMessage from "./Message.svelte";
  import { createEventDispatcher, onMount } from "svelte";
  import ConversationHeader from "./ConversationHeader.svelte";

  const dispatch = createEventDispatcher<{ scrollAtTop: null; scrollAtBottom: null }>();

  export let messages: [ActionHashB64, MessageExtended][];
  export let cellIdB64: CellIdB64;
  export let loadingTop = false;

  let selected: ActionHashB64 | undefined;
  let containerEl: HTMLDivElement;

  // --- REFACTORED LOGIC ---
  // Create a chronological version of the messages array to simplify all logic.
  // This array is sorted from OLDEST to NEWEST.
  $: chronologicalMessages = messages.slice().reverse();

  // Virtual list configuration
  const ITEM_HEIGHT_ESTIMATE = 40;
  const BUFFER_SIZE = 5; // Slightly larger buffer for smoother scrolling
  const SCROLL_THRESHOLD_PERCENTAGE = 0.4; // 40% of viewport height - much larger threshold to prevent header flashing
  const VIRTUALIZATION_THRESHOLD = 50; // Only virtualize if we have more than this many messages

  // Dynamic scroll threshold based on container height
  $: scrollThreshold = Math.max(250, Math.min(800, containerHeight * SCROLL_THRESHOLD_PERCENTAGE));

  // Virtual list state
  let containerHeight = 0;
  let scrollTop = 0;
  let startIndex = 0;
  let endIndex = 0;
  let visibleMessages: [ActionHashB64, MessageExtended][] = [];
  let topSpacerHeight = 0;
  let bottomSpacerHeight = 0;

  // Scroll position tracking
  let isAtBottom = true;
  let wasAtBottom = true; // Used to detect if user was at bottom *before* new messages arrived
  let previousScrollHeight = 0;
  let shouldMaintainScrollPosition = false;
  let initialScrollCompleted = false; // Track if initial scroll has been done
  let isInitializing = true; // Track if component is still initializing

  // Determine if we should use virtualization
  $: shouldVirtualize = chronologicalMessages.length > VIRTUALIZATION_THRESHOLD;

  // Set visible messages based on virtualization mode
  $: {
    if (!shouldVirtualize) {
      // When not virtualizing, show all messages immediately
      visibleMessages = chronologicalMessages;
      topSpacerHeight = 0;
      bottomSpacerHeight = 0;
      startIndex = 0;
      endIndex = chronologicalMessages.length - 1;
    }
  }

  // Recalculate the visible range when scroll or container size changes (only for virtualization)
  $: {
    if (containerEl && shouldVirtualize && containerHeight > 0) {
      calculateVisibleRange(containerHeight, scrollTop, chronologicalMessages.length);
    }
  }

  // The core function to calculate which messages to show.
  // Now works with the chronologically sorted array, making logic much simpler.
  function calculateVisibleRange(height: number, scroll: number, totalCount: number) {
    if (totalCount === 0 || height === 0) {
      visibleMessages = [];
      topSpacerHeight = 0;
      bottomSpacerHeight = 0;
      return;
    }

    // Calculate visible range based on scroll position
    const visibleStart = Math.floor(scroll / ITEM_HEIGHT_ESTIMATE);
    const visibleEnd = Math.ceil((scroll + height) / ITEM_HEIGHT_ESTIMATE);

    // Add buffer to reduce re-renders during scroll
    startIndex = Math.max(0, visibleStart - BUFFER_SIZE);
    endIndex = Math.min(totalCount - 1, visibleEnd + BUFFER_SIZE);

    // Get the visible subset from the chronological array
    visibleMessages = chronologicalMessages.slice(startIndex, endIndex + 1);

    // Spacer heights are now simple and intuitive
    topSpacerHeight = startIndex * ITEM_HEIGHT_ESTIMATE;
    bottomSpacerHeight = Math.max(0, (totalCount - 1 - endIndex) * ITEM_HEIGHT_ESTIMATE);
  }

  // Detect scroll position to dispatch events (e.g., for loading more messages)
  function checkScrollPosition(scroll: number, height: number) {
    if (!containerEl || !height) return;

    const scrollHeight = containerEl.scrollHeight;

    // Detect if we are near the top (for loading older messages)
    if (scroll <= scrollThreshold && !loadingTop) {
      dispatch("scrollAtTop");
    }

    // Detect if we are at the bottom
    wasAtBottom = isAtBottom;
    isAtBottom = scroll + height >= scrollHeight - scrollThreshold;

    if (isAtBottom) {
      dispatch("scrollAtBottom");
    }
  }

  // This function is crucial for preventing the view from jumping when older messages are loaded.
  function handleScrollPositionMaintenance() {
    // 1. Before loading starts, save the current scroll height.
    if (loadingTop && containerEl) {
      previousScrollHeight = containerEl.scrollHeight;
      shouldMaintainScrollPosition = true;
    }

    // 2. After loading is finished, calculate the height of the new content and adjust scroll position.
    if (shouldMaintainScrollPosition && containerEl && !loadingTop) {
      const currentScrollHeight = containerEl.scrollHeight;
      const heightDifference = currentScrollHeight - previousScrollHeight;

      if (heightDifference > 0) {
        // We added content at the top, so we move the scrollbar down by the same amount.
        containerEl.scrollTop = scrollTop + heightDifference;
      }
      shouldMaintainScrollPosition = false;
    }
  }

  // Watch for `loadingTop` changes to trigger scroll maintenance
  $: loadingTop, handleScrollPositionMaintenance();

  // Scroll to bottom on initial mount
  onMount(() => {
    // Set initial scroll completion flag immediately to prevent interference
    initialScrollCompleted = false;

    if (chronologicalMessages.length > 0) {
      // Use a longer delay to ensure everything is fully rendered
      setTimeout(() => {
        if (containerEl) {
          scrollToBottom();
          initialScrollCompleted = true;
          isInitializing = false;
        }
      }, 100);
    } else {
      initialScrollCompleted = true;
      isInitializing = false;
    }
  });

  // --- User Interaction & Helpers ---

  function scrollToBottom() {
    if (containerEl) {
      containerEl.scrollTop = containerEl.scrollHeight;
    }
  }

  function handleClick(e: MouseEvent, actionHashB64: ActionHashB64) {
    e.stopPropagation();
    selected = selected === actionHashB64 ? undefined : isMobile() ? undefined : actionHashB64;
  }

  function handleClickOutside() {
    selected = undefined;
  }

  function handlePress(actionHashB64: ActionHashB64) {
    if (isMobile()) {
      selected = actionHashB64;
    }
  }

  // Optimized scroll handler using requestAnimationFrame
  let scrollUpdateScheduled = false;
  function handleScroll() {
    if (scrollUpdateScheduled || !containerEl) return;

    scrollUpdateScheduled = true;
    requestAnimationFrame(() => {
      if (containerEl) {
        scrollTop = containerEl.scrollTop;
        checkScrollPosition(scrollTop, containerHeight);
      }
      scrollUpdateScheduled = false;
    });
  }

  // Auto-scroll to bottom when new messages arrive, but only if the user was already at the bottom.
  let lastMessageLength = 0;
  $: {
    if (
      chronologicalMessages.length > lastMessageLength &&
      wasAtBottom &&
      containerEl &&
      initialScrollCompleted &&
      !isInitializing
    ) {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
    lastMessageLength = chronologicalMessages.length;
  }
</script>

<div
  class="flex h-full w-full transform-gpu touch-pan-y flex-col overflow-y-auto overflow-x-hidden will-change-scroll"
  bind:this={containerEl}
  bind:clientHeight={containerHeight}
  on:scroll={handleScroll}
  style="opacity: {isInitializing ? 0 : 1}; transition: opacity 0.1s ease-in-out;"
>
  <!-- Top spacer for virtual scrolling (only when virtualizing) -->
  {#if shouldVirtualize}
    <div style="height: {topSpacerHeight}px; flex-shrink: 0;"></div>
  {/if}

  <!-- Rendered messages -->
  {#each visibleMessages as [actionHashB64, messageExtended], i (actionHashB64)}
    {@const currentIndex = shouldVirtualize ? startIndex + i : i}
    {@const prevMessageExtended =
      currentIndex > 0 ? chronologicalMessages[currentIndex - 1][1] : undefined}

    <div class="flex flex-shrink-0 flex-col">
      <!-- Show conversation header at the very beginning of the chat -->
      {#if currentIndex === 0}
        <div class="flex h-4 items-center justify-center"></div>
        <ConversationHeader {cellIdB64} />
        <div class="flex h-4 items-center justify-center"></div>
      {/if}

      <!-- Show day separator if the day is different from the previous message -->
      {#if prevMessageExtended === undefined || !isSameDay(new Date(messageExtended.timestamp / 1000), new Date(prevMessageExtended.timestamp / 1000))}
        <div class="text-secondary-400 dark:text-secondary-300 my-4 px-4 text-center text-xs">
          {new Date(messageExtended.timestamp / 1000).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </div>
      {/if}

      <!-- Message content -->
      <div class="mt-3 px-4">
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

      <!-- Show padding at the very end of the chat -->
      {#if currentIndex === chronologicalMessages.length - 1}
        <div class="flex h-4 items-center justify-center"></div>
      {/if}
    </div>
  {/each}

  <!-- Bottom spacer for virtual scrolling (only when virtualizing) -->
  {#if shouldVirtualize}
    <div style="height: {bottomSpacerHeight}px; flex-shrink: 0;"></div>
  {/if}
</div>