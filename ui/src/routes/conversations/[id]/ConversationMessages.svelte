<script lang="ts">
  import { isMobile, isSameDay, isWithinFiveMinutes } from "$lib/utils";
  import type { ActionHashB64, AgentPubKeyB64 } from "@holochain/client";
  import type { MessageExtended, CellIdB64, SizeInfo } from "$lib/types";
  import BaseMessage from "./Message.svelte";
  import { createVirtualizer } from "@tanstack/svelte-virtual";
  import { onMount, afterUpdate, onDestroy } from "svelte";

  export let messages: [ActionHashB64, MessageExtended][];
  export let cellIdB64: CellIdB64;

  let selected: ActionHashB64 | undefined;
  let virtualListEl: HTMLDivElement;
  let resizeObserver: ResizeObserver;
  let scrollTimeout: NodeJS.Timeout;
  let autoScroll = true;

  const SCROLL_BOTTOM_THRESHOLD = 100;

  /**
   * Map to cache measured element heights for virtual scrolling
   * @param Key Index of message in messages array
   * @param Value Size information including height and measurement status
   */
  const sizeMap = new Map<number, SizeInfo>();

  /**
   * Virtualizer instance for efficient rendering of large lists
   * Handles calculations for visible items and scroll positioning
   */
  $: virtualizer = createVirtualizer({
    count: messages.length,
    getScrollElement: () => virtualListEl,

    /**
     * Estimates item height for initial layout calculations
     * @param index Index of item in messages array
     * @returns Estimated height in pixels including optional date header
     */
    estimateSize: (index) => {
      const cached = sizeMap.get(index);
      if (cached) return cached.height;

      const message = messages[index][1];
      const prevMessage = index > 0 ? messages[index - 1][1] : undefined;
      const showDate =
        !prevMessage ||
        !isSameDay(new Date(message.timestamp / 1000), new Date(prevMessage.timestamp / 1000));

      // Base message height 100px + date header height
      return (showDate ? 40 : 0) + 100;
    },
    overscan: 10,

    /**
     * Measures actual element height and updates size cache
     * @param element The rendered DOM element
     * @returns Measured height of the element in pixels
     */
    measureElement: (element: HTMLElement) => {
      const index = Number(element.dataset.index);
      if (isNaN(index)) return 0;

      const height = element.offsetHeight;
      sizeMap.set(index, { height, measured: true });
      return height;
    },
  });

  function handleItemMount(element: HTMLElement) {
    resizeObserver.observe(element);
  }

  function handleScroll() {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const { scrollTop, scrollHeight, clientHeight } = virtualListEl;
      autoScroll = scrollHeight - scrollTop <= clientHeight + SCROLL_BOTTOM_THRESHOLD;
    }, 50);
  }

  afterUpdate(() => {
    if (autoScroll) {
      virtualListEl.scrollTop = virtualListEl.scrollHeight;
    }
  });

  onMount(() => {
    resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const index = Number(entry.target.getAttribute("data-index"));
        if (!isNaN(index)) {
          sizeMap.set(index, { height: entry.contentRect.height, measured: true });
          $virtualizer.measure();
        }
      });
    });

    return () => resizeObserver.disconnect();
  });

  // Scrolls to the bottom of the message list
  // Aligns to end of list with smooth animation
  export function scrollToBottom() {
    if (messages.length === 0) return;
    $virtualizer.scrollToIndex(messages.length - 1, { align: "end", behavior: "auto" });
  }

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
</script>

<div class="flex w-full flex-1 flex-col-reverse p-4">
  <div class="scroll-container" bind:this={virtualListEl} on:scroll={handleScroll}>
    <div style="position: relative; height: {$virtualizer.getTotalSize()}px; width: 100%;">
      {#each $virtualizer.getVirtualItems() as virtualItem (messages[virtualItem.index][0])}
        {@const [actionHashB64, messageExtended] = messages[virtualItem.index]}
        {@const prevMessage =
          virtualItem.index > 0 ? messages[virtualItem.index - 1][1] : undefined}
        {@const showDate =
          !prevMessage ||
          !isSameDay(
            new Date(messageExtended.timestamp / 1000),
            new Date(prevMessage?.timestamp / 1000),
          )}

        <div
          data-index={virtualItem.index}
          use:handleItemMount
          style="position: absolute; top: 0; left: 0; width: 100%; transform: translateY({virtualItem.start}px);"
        >
          {#if showDate}
            <li class="my-4">
              <div class="text-secondary-400 dark:text-secondary-300 text-center text-xs">
                {new Date(messageExtended.timestamp / 1000).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </div>
            </li>
          {/if}

          <BaseMessage
            {cellIdB64}
            message={messageExtended}
            isSelected={selected === actionHashB64}
            showAuthor={prevMessage === undefined ||
              messageExtended.authorAgentPubKeyB64 !== prevMessage.authorAgentPubKeyB64 ||
              !isWithinFiveMinutes(
                new Date(messageExtended.timestamp / 1000),
                new Date(prevMessage.timestamp / 1000),
              )}
            on:press={() => handlePress(actionHashB64)}
            on:click={(e) => handleClick(e, actionHashB64)}
            on:clickoutside={handleClickOutside}
          />
        </div>
      {/each}
    </div>
  </div>
</div>
