<script lang="ts">
  import { isMobile } from "$lib/utils";
  import type { ActionHashB64 } from "@holochain/client";
  import type { Message } from "../../../types";
  import BaseMessage from "./Message.svelte";
  import type { Image } from "../../../types";

  export let messages: Message[];
  export let formatFileName: (file: Image, maxLength?: number) => string;
  export let formatFileIcon: (file: Image) => string;

  let selected: ActionHashB64 | undefined;

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
    {#each messages as message (message.hash)}
      <BaseMessage
        {message}
        isSelected={selected === message.hash}
        on:press={() => handlePress(message.hash)}
        on:click={(e) => handleClick(e, message.hash)}
        on:clickoutside={handleClickOutside}
        {formatFileName}
        {formatFileIcon}
      />
    {/each}
  </ul>
</div>
