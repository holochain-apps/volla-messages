<script lang="ts">
  import { isMobile, isSameDay, isWithinFiveMinutes } from "$lib/utils";
  import type { ActionHashB64, AgentPubKeyB64 } from "@holochain/client";
  import type { MessageExtended, CellIdB64 } from "$lib/types";
  import BaseMessage from "./Message.svelte";
  import VirtualScroll from "svelte-virtual-scroll-list";
  import { createEventDispatcher } from "svelte";

  const dispatch = createEventDispatcher();

  export let messages: [ActionHashB64, MessageExtended][];
  export let cellIdB64: CellIdB64;
  export let virtualList: VirtualScroll;

  let selected: ActionHashB64 | undefined;

  /**
   * Calculates the size of each item.
   * Adds an extra 40 pixels if a date header is to be rendered.
   */
  function getSize(index: number) {
    const [, message] = messages[index];
    // Base size is larger if the message contains images.
    let baseSize = message.message.images.length > 0 ? 300 : 100;

    // Date header should be displayed if message is the first in the list
    // or if its date differs from the previous message's date.
    let showHeader = false;
    if (index === 0) {
      showHeader = true;
    } else {
      const [, prevMessage] = messages[index - 1];
      const currentDate = new Date(message.timestamp / 1000);
      const prevDate = new Date(prevMessage.timestamp / 1000);
      if (!isSameDay(currentDate, prevDate)) {
        showHeader = true;
      }
    }

    if (showHeader) {
      baseSize += 40;
    }
    return baseSize;
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
  <VirtualScroll
    bind:this={virtualList}
    data={messages}
    key="0"
    {getSize}
    keeps={30}
    topThreshold={300}
    bottomThreshold={100}
    on:top={() => dispatch("top")}
    on:bottom={() => dispatch("bottom")}
    let:data
    let:index
  >
    {#if (() => {
      let showHeader = false;
      const [, message] = data;
      const currentDate = new Date(message.timestamp / 1000);
      if (index === 0) {
        showHeader = true;
      } else {
        const [, prevMessage] = messages[index - 1];
        const prevDate = new Date(prevMessage.timestamp / 1000);
        if (!isSameDay(currentDate, prevDate)) {
          showHeader = true;
        }
      }
      return showHeader;
    })()}
      <li class="my-4">
        <div class="text-secondary-400 dark:text-secondary-300 text-center text-xs">
          {new Date(data[1].timestamp / 1000).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </div>
      </li>
    {/if}
    <BaseMessage
      {cellIdB64}
      message={data[1]}
      isSelected={selected === data[0]}
      showAuthor={index === 0
        ? true
        : (() => {
            const [, prevMessage] = messages[index - 1];
            const currentDate = new Date(data[1].timestamp / 1000);
            const prevDate = new Date(prevMessage.timestamp / 1000);
            return (
              data[1].authorAgentPubKeyB64 !== prevMessage.authorAgentPubKeyB64 ||
              !isWithinFiveMinutes(currentDate, prevDate)
            );
          })()}
      on:press={() => handlePress(data[0])}
      on:click={(e) => handleClick(e, data[0])}
      on:clickoutside={handleClickOutside}
    />
  </VirtualScroll>
</div>
