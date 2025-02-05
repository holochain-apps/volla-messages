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

  function processMessages(messages: [ActionHashB64, MessageExtended][]) {
    let processed = [];
    let prevMessage: MessageExtended | undefined;

    for (const [actionHashB64, message] of messages) {
      const currentDate = new Date(message.timestamp / 1000);

      if (!prevMessage || !isSameDay(currentDate, new Date(prevMessage.timestamp / 1000))) {
        processed.push({
          type: "date",
          date: currentDate,
          key: `date-${currentDate.toISOString()}`,
        });
      }

      processed.push({
        type: "message",
        actionHashB64,
        message,
        showAuthor:
          !prevMessage ||
          message.authorAgentPubKeyB64 !== prevMessage.authorAgentPubKeyB64 ||
          !isWithinFiveMinutes(currentDate, new Date(prevMessage.timestamp / 1000)),
        key: actionHashB64,
      });

      prevMessage = message;
    }
    return processed;
  }

  $: processedData = processMessages(messages);

  function getSize(index: number) {
    const item = processedData[index];
    return item.type === "date"
      ? 40
      : item.message && item.message.message.images.length > 0
        ? 300
        : 100;
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
    data={processedData}
    key="key"
    {getSize}
    keeps={30}
    topThreshold={300}
    bottomThreshold={100}
    on:top={() => dispatch("top")}
    on:bottom={() => dispatch("bottom")}
    let:data
  >
    {#if data.type === "date"}
      <li class="my-4">
        <div class="text-secondary-400 dark:text-secondary-300 text-center text-xs">
          {new Date(data.date).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </div>
      </li>
    {:else}
      <BaseMessage
        {cellIdB64}
        message={data.message}
        isSelected={selected === data.actionHashB64}
        showAuthor={data.showAuthor}
        on:press={() => handlePress(data.actionHashB64)}
        on:click={(e) => handleClick(e, data.actionHashB64)}
        on:clickoutside={handleClickOutside}
      />
    {/if}
  </VirtualScroll>
</div>
