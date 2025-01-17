<script lang="ts">
  import { slide } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { pan, type PanCustomEvent } from "svelte-gestures";
  import SvgIcon from "../../lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { encodeCellIdToBase64, isMobile } from "$lib/utils";
  import { deriveCellConversationStore, type ConversationStore } from "$store/ConversationStore";
  import { Privacy, type CellIdB64 } from "$lib/types";
  import { goto } from "$app/navigation";
  import { getContext } from "svelte";
  import { type ProfileStore } from "$store/ProfileStore";
  import MessagePreview from "./MessagePreview.svelte";
  import UnreadIndicator from "./UnreadIndicator.svelte";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import PrivateConversationImageThumbnail from "./[id]/PrivateConversationImageThumbnail.svelte";
  import {
    type ConversationTitleStore,
    deriveCellConversationTitleStore,
  } from "$store/ConversationTitleStore";
  import { deriveCellInviteStore, type InviteStore } from "$store/InviteStore";
  import { deriveCellMergedProfileContactInviteStore } from "$store/MergedProfileContactInviteStore";
  import {
    type ConversationLatestMessageStore,
    deriveCellConversationLatestMessageStore,
  } from "$store/ConversationLatestMessageStore";

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();
  const conversationLatestMessageStore = getContext<{
    getStore: () => ConversationLatestMessageStore;
  }>("conversationLatestMessageStore").getStore();
  const conversationTitleStore = getContext<{ getStore: () => ConversationTitleStore }>(
    "conversationTitleStore",
  ).getStore();
  const mergedProfileContactInviteStore = getContext<{ getStore: () => ProfileStore }>(
    "mergedProfileContactInviteStore",
  ).getStore();
  const inviteStore = getContext<{ getStore: () => InviteStore }>("inviteStore").getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  export let cellIdB64: CellIdB64;

  let conversation = deriveCellConversationStore(conversationStore, cellIdB64);
  let mergedProfileContact = deriveCellMergedProfileContactInviteStore(
    mergedProfileContactInviteStore,
    cellIdB64,
    myPubKeyB64,
  );
  let conversationTitle = deriveCellConversationTitleStore(conversationTitleStore, cellIdB64);
  let conversationLatestMessage = deriveCellConversationLatestMessageStore(
    conversationLatestMessageStore,
    cellIdB64,
  );
  let invite = deriveCellInviteStore(inviteStore, cellIdB64);

  let isHovering = false;
  let menuOpen = 0;
  let isVisible = true;

  let x = 0;
  let dragThreshold = 10;
  let startX = 0;
  let isDragging = false;
  let snapDistance = 60; // Distance to snap to
  let snapThreshold = 40; // Threshold to determine if it should snap
  let animationDuration = 300; // Duration of the bounce animation in ms
  let actionDistance = 300; // Once you get here do the action

  function handlePanStart(event: PanCustomEvent) {
    startX = event.detail.x;
    isDragging = false;
  }

  function handlePan(event: PanCustomEvent) {
    const currentX = startX - event.detail.x;
    if (currentX > dragThreshold) {
      isDragging = true;

      // Apply a resistance effect as the user drags further
      let resistance = 0.8;
      let resistedX = snapDistance + (currentX - snapDistance) * resistance;

      x = resistedX;

      // Check if we've reached the actionDistance
      if (resistedX >= actionDistance) {
        x = actionDistance;
      }
    }
  }

  function handlePanEnd(event: PanCustomEvent) {
    let finalX = startX - event.detail.x;
    let targetX: number;

    if (finalX >= actionDistance) {
      targetX = actionDistance;
    } else if (finalX > snapThreshold) {
      targetX = snapDistance;
    } else {
      targetX = 0;
    }

    // Animate to the target position
    let start = x;
    let startTime = performance.now();

    function animate(currentTime: number) {
      let elapsed = currentTime - startTime;
      if (elapsed < animationDuration) {
        let progress = elapsed / animationDuration;
        // Use easeOutElastic for bouncy effect
        progress =
          1 - Math.pow(2, -10 * progress) * Math.cos(((progress * 10 - 0.75) * Math.PI) / 3);
        x = start + (targetX - start) * progress;
        requestAnimationFrame(animate);
      } else {
        x = targetX;
      }
    }

    requestAnimationFrame(animate);

    setTimeout(() => {
      isDragging = false;
      if (finalX >= actionDistance) {
        startArchive();
      }
    }, animationDuration);
  }

  function handleClick(e: MouseEvent) {
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
    } else if ($conversation.cellInfo.enabled) {
      goto(`/conversations/${encodeCellIdToBase64($conversation.cellInfo.cell_id)}`);
    }
  }

  function handleHover() {
    isHovering = true;
  }

  function handleLeave() {
    isHovering = false;
  }

  function toggleMenu(e: MouseEvent) {
    menuOpen = menuOpen === 0 ? (e.currentTarget as HTMLElement).getBoundingClientRect().y : 0;
  }

  function startArchive() {
    isVisible = false;
    menuOpen = 0;
  }

  async function archiveConversation() {
    if ($conversation.cellInfo.enabled) {
      conversation.disable();
    } else {
      conversation.enable();
    }

    x = 0;
  }
</script>

{#if isVisible}
  <li
    class="relative flex flex-row items-start overflow-hidden text-xl transition-opacity duration-300 ease-in-out"
    transition:slide={{ axis: "x", duration: 300, easing: quintOut }}
    on:outroend={archiveConversation}
  >
    <button
      class={`bg-surface-100 hover:bg-tertiary-400 dark:bg-surface-900 dark:hover:bg-secondary-500 z-10 flex w-full min-w-0 flex-row items-center rounded-lg px-2 py-3 text-left transition-transform duration-300 ease-in-out ${isHovering && "bg-tertiary-400 dark:!bg-secondary-500"}`}
      style="transform: translateX({-x}px)"
      use:pan={{ delay: 10 }}
      on:pan={handlePan}
      on:pandown={handlePanStart}
      on:panup={handlePanEnd}
      on:dragstart|preventDefault
      on:click={handleClick}
      on:mouseover={handleHover}
      on:focus={handleHover}
      on:mouseleave={handleLeave}
      on:blur={handleLeave}
    >
      {#if $conversation.dnaProperties.privacy === Privacy.Private}
        <PrivateConversationImageThumbnail {cellIdB64} />
      {:else if $conversation.config?.image}
        <img
          src={$conversation.config.image}
          alt="Conversation"
          class="h-10 w-10 rounded-full object-cover"
        />
      {:else}
        <span
          class="bg-secondary-300 dark:bg-secondary-400 flex h-10 w-10 items-center justify-center rounded-full"
        >
          <SvgIcon icon="group" />
        </span>
      {/if}
      <div class="ml-4 flex min-w-0 flex-1 flex-col overflow-hidden">
        <span class="text-base">{$conversationTitle}</span>
        <span class="flex min-w-0 items-center overflow-hidden text-ellipsis text-nowrap text-xs">
          {#if $conversation.unread}
            <UnreadIndicator />
          {/if}

          {#if $conversation.dnaProperties.privacy === Privacy.Private && $mergedProfileContact.count === 1 && $invite.length > 0}
            <span class="text-secondary-400">{$t("common.unconfirmed")}</span>
          {:else if $conversationLatestMessage}
            <MessagePreview {cellIdB64} messageExtended={$conversationLatestMessage} />
          {/if}
        </span>
      </div>
      <div class="text-secondary-300 relative flex flex-row items-center text-xs">
        <SvgIcon icon="person" moreClasses="h-[8px] w-[8px]" />
        <div class="ml-1">{$mergedProfileContact.count}</div>
      </div>
      {#if !isMobile() && isHovering && x === 0}
        <button
          class="z-10 flex items-center justify-center"
          on:click|preventDefault|stopPropagation={toggleMenu}
        >
          <SvgIcon icon="caretDown" moreClasses="border-2 rounded-md ml-2 shadow-md" />
        </button>
      {/if}
    </button>

    <div class="absolute left-0 top-0 flex h-full w-full flex-row rounded-lg px-[1px] py-[1px]">
      <!-- <div class="flex flex-1 items-center justify-start ml-1  rounded-lg bg-secondary-500">Mark as Unread</div> -->
      <div
        class="mr-1 flex flex-1 items-center justify-end rounded-lg
        {$conversation.cellInfo.enabled ? 'bg-primary-500' : 'bg-secondary-900'}"
      >
        <button
          class="text-surface-100 dark:text-tertiary-100 mr-2 flex flex-col items-center justify-center font-bold"
          on:click={startArchive}
        >
          <SvgIcon icon="archive" />
          <span class="text-xs">
            {$conversation.cellInfo.enabled ? $t("common.archive") : $t("common.restore")}
          </span>
        </button>
      </div>
    </div>
  </li>
{/if}

{#if menuOpen > 0}
  <ul
    class="bg-surface-100 dark:bg-surface-900 absolute right-0 top-0 z-30 rounded-md border-2 p-2 shadow-md"
    style="top: {menuOpen + 22}px;"
    on:mouseover={handleHover}
    on:focus={handleHover}
  >
    <li>
      <button class="flex flex-row items-center justify-start" on:click={startArchive}>
        <SvgIcon icon="archive" moreClasses="mr-2" />
        <span class="text-xs"
          >{$conversation.cellInfo.enabled ? $t("common.archive") : $t("common.restore")}</span
        >
      </button>
    </li>
  </ul>
{/if}
