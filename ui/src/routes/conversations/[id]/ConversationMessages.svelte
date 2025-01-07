<script lang="ts">
  import { isMobile, isSameDay } from "$lib/utils";
  import type { ActionHashB64 } from "@holochain/client";
  import type { MessageExtended, CellIdB64 } from "$lib/types";
  import BaseMessage from "./Message.svelte";
  import { getContext } from "svelte";
  import {
    deriveCellMergedProfileContactStore,
    type MergedProfileContactStore,
  } from "$store/MergedProfileContactStore";

  const mergedProfileContactStore = getContext<{ getStore: () => MergedProfileContactStore }>(
    "mergedProfileContactStore",
  ).getStore();

  export let messages: [ActionHashB64, MessageExtended][];
  export let cellIdB64: CellIdB64;

  let mergedProfileContact = deriveCellMergedProfileContactStore(
    mergedProfileContactStore,
    cellIdB64,
  );

  let selected: ActionHashB64 | undefined;

  $: messagesByAgentsWithProfiles = messages.filter(
    ([, messageExtended]) =>
      $mergedProfileContact !== undefined &&
      $mergedProfileContact[messageExtended.authorAgentPubKeyB64] !== undefined,
  );

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
  <ul>
    {#each messagesByAgentsWithProfiles as [actionHashB64, messageExtended], i (actionHashB64)}
      {@const prevMessageExtended = i === 0 ? undefined : messages[i - 1][1]}

      <BaseMessage
        {cellIdB64}
        message={messageExtended}
        isSelected={selected === actionHashB64}
        showAuthor={prevMessageExtended === undefined ||
          messageExtended.authorAgentPubKeyB64 !== prevMessageExtended.authorAgentPubKeyB64 ||
          messageExtended.timestamp - prevMessageExtended.timestamp < 1000 * 60 * 5}
        showDate={prevMessageExtended === undefined ||
          !isSameDay(
            new Date(messageExtended.timestamp / 1000),
            new Date(prevMessageExtended.timestamp / 1000),
          )}
        on:press={() => handlePress(actionHashB64)}
        on:click={(e) => handleClick(e, actionHashB64)}
        on:clickoutside={handleClickOutside}
      />
    {/each}
  </ul>
</div>
