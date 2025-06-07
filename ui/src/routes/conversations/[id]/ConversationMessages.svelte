<script lang="ts">
  import { isMobile, isSameDay, isWithinFiveMinutes } from "$lib/utils";
  import type { ActionHashB64 } from "@holochain/client";
  import type { MessageExtended, CellIdB64 } from "$lib/types";
  import BaseMessage from "./Message.svelte";
  import { createVirtualizer } from "@tanstack/svelte-virtual";
  import { createEventDispatcher } from "svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import ConversationHeader from "./ConversationHeader.svelte";
  import { v4 as uuidv4 } from "uuid";

  const dispatch = createEventDispatcher<{ scrollAtTop: null; scrollAtBottom: null }>();

  // Note we must have at least 1 message when rendering this component, 
  // or the virtual list instance will fail to render any additional messages -->
  export let messages: [ActionHashB64, MessageExtended][];
  export let cellIdB64: CellIdB64;
  export let loadingTop = false;

  let selected: ActionHashB64 | undefined;
  let virtualListEl: HTMLDivElement;
  let virtualItemEls: HTMLDivElement[] = [];

  // Virtual list to ensure reliable rendering of a large number of DOM elements
  $: virtualizer = createVirtualizer({
    count: 0,
    getScrollElement: () => virtualListEl,
    estimateSize: () => 45,
    overscan: 10,
  });

  // Workaround to ensure that the virtualizer is not re-instantiated every time the messages count changes
  // (and thus the scrollbar position is reset to the top)
  $: count = messages.length;
  $: {
    $virtualizer.setOptions({
      count,
    });
  }

  // Dynamic sizing of virtual list elements
  $: virtualListItems = $virtualizer.getVirtualItems();
  $: {
    if (virtualItemEls.length > 0) {
      virtualItemEls.forEach((el) => $virtualizer.measureElement(el));
    }
  }

  // Dispatch events when scrollbar at top or bottom
  $: scrollOffset = $virtualizer.scrollOffset;
  $: {
    if (scrollOffset !== null && scrollOffset === 0) {
      dispatch("scrollAtTop");
    } else if (
      scrollOffset !== null &&
      virtualListEl !== undefined &&
      scrollOffset === virtualListEl.scrollHeight - virtualListEl.offsetHeight
    ) {
      dispatch("scrollAtBottom");
    }
  }

  // Auto scroll to bottom of list when new messages are added
  let messagesCount: number | undefined;
  let prevMessagesCount: number | undefined;
  $: {
    if (messagesCount === undefined || messagesCount !== count) {
      prevMessagesCount = messagesCount;
      messagesCount = count;
    }
  }
  $: {
    if (messagesCount !== undefined && prevMessagesCount === undefined) {
        // Initial load: scroll to bottom.
      // Using a minimal delay to allow virtualizer and DOM to settle.
      // The original 200ms was primarily for Android keyboard on new message, not initial view.
      scrollToBottom(isMobile() ? 50 : 20); 
    } else if (
      messagesCount !== undefined &&
      prevMessagesCount !== undefined &&
      messagesCount > prevMessagesCount
    ) {
       // New messages added.
      // The original delay for Android keyboard opening might be relevant here
      // if text input is focused and a new message arrives.
      scrollToBottom(isMobile() ? 200 : 50);
    }
  }

  // Scrolls to the bottom of the message list
  function scrollToBottom(delay = 10) {
    if (count === 0) return;

    setTimeout(() => {
      const targetIndex = count - 1;
      if (targetIndex < 0) return; // Guard against empty list after initial check
      
      // behavior: 'auto' for an instant jump to the bottom
      $virtualizer.scrollToIndex(targetIndex, { align: 'end', behavior: 'auto' });
    }, delay);
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

<div class="flex w-full flex-1 overflow-y-auto" style="contain: strict;" bind:this={virtualListEl}>
  <div class="relative h-full w-full">
    <div
      class="absolute left-0 top-0 h-full w-full"
      style="transform: translateY({virtualListItems[0] ? virtualListItems[0].start : 0}px);"
    >
      {#each virtualListItems as row (messages[row.index] !== undefined ? messages[row.index][0] : uuidv4())}
        <!-- This if statement is a hacky workaround to ensure that deleted messages do not break rendering,
          as they are not removed from the virtualListItems reactively -->
        {#if row.index < messages.length}
          {@const [actionHashB64, messageExtended] = messages[row.index]}
          {@const prevMessageExtended = row.index > 0 ? messages[row.index - 1][1] : undefined}

          <div bind:this={virtualItemEls[row.index]} data-index={row.index}>
            <div class="flex flex-col">
              <!-- 
              First element includes conversation header.
              
              This ensures the conversation header is *within* the virtualized list,
              without breaking scrollToBottom. 
            -->
              {#if row.index === 0}
                <ConversationHeader {cellIdB64} />
                <div class="flex h-4 items-center justify-center">
                  {#if loadingTop}
                    <SvgIcon icon="spinner" moreClasses="!h-4" />
                  {/if}
                </div>
              {/if}

              <!-- 
              Show day if the message is authored on a different day then the previous message
            -->
              {#if prevMessageExtended === undefined || !isSameDay(new Date(messageExtended.timestamp / 1000), new Date(prevMessageExtended.timestamp / 1000))}
                <div
                  class="text-secondary-400 dark:text-secondary-300 my-4 px-4 text-center text-xs"
                >
                  {new Date(messageExtended.timestamp / 1000).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              {/if}

              <div class="mt-3 px-4">
                <BaseMessage
                  {cellIdB64}
                  message={messageExtended}
                  isSelected={selected === actionHashB64}
                  showAuthor={prevMessageExtended === undefined ||
                    messageExtended.authorAgentPubKeyB64 !==
                      prevMessageExtended.authorAgentPubKeyB64 ||
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
              <!-- 
                Last element includes additional row of padding
                
                This is a hacky workaround to ensure that the list
                scrolls to the bottom when a new message is added.
              -->
              {#if row.index === messages.length - 1}
                <div class="flex h-4 items-center justify-center"></div>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </div>
</div>