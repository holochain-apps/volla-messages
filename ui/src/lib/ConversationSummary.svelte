<script lang="ts">
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { slide } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import {
    pan,
    type PanCustomEvent,
    type GestureCustomEvent,
  } from "svelte-gestures";
  import { writable } from "svelte/store";
  import Avatar from "./Avatar.svelte";
  import SvgIcon from "./SvgIcon.svelte";
  import { t } from "$translations";
  import { isMobile } from "$lib/utils";
  import type { ConversationStore } from "$store/ConversationStore";
  import { Privacy } from "../types";
  import { goto } from "$app/navigation";
  import DOMPurify from "dompurify";

  export let store: ConversationStore;
  $: conversation = store.conversation;
  $: unread = store.unread;
  $: lastMessage = store.lastMessage;
  $: lastMessageAuthor = $lastMessage
    ? $conversation.agentProfiles[$lastMessage.authorKey]?.fields.firstName
    : null;
  $: allMembers = store.allMembers;
  $: joinedMembers = store.memberList();

  const tAny = t as any;

  let isHovering = false;
  let menuOpen = 0;
  let isVisible = true;

  let x = writable(0);
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

      x.set(resistedX);

      // Check if we've reached the actionDistance
      if (resistedX >= actionDistance) {
        x.set(actionDistance);
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
    let start = $x;
    let startTime = performance.now();

    function animate(currentTime: number) {
      let elapsed = currentTime - startTime;
      if (elapsed < animationDuration) {
        let progress = elapsed / animationDuration;
        // Use easeOutElastic for bouncy effect
        progress =
          1 -
          Math.pow(2, -10 * progress) *
            Math.cos(((progress * 10 - 0.75) * Math.PI) / 3);
        x.set(start + (targetX - start) * progress);
        requestAnimationFrame(animate);
      } else {
        x.set(targetX);
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
    } else {
      goto(`/conversations/${$conversation.id}`);
    }
  }

  function handleHover() {
    isHovering = true;
  }

  function handleLeave() {
    isHovering = false;
  }

  function toggleMenu(e: MouseEvent) {
    menuOpen =
      menuOpen === 0
        ? (e.currentTarget as HTMLElement).getBoundingClientRect().y
        : 0;
  }

  function startArchive() {
    isVisible = false;
    menuOpen = 0;
  }

  function archiveConversation() {
    store.toggleArchived();
    isVisible = true;
    x.set(0);
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
      style="transform: translateX({-$x}px)"
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
      {#if $conversation.privacy === Privacy.Private}
        <div class="relative flex items-center justify-center">
          {#if allMembers.length == 0}
            <!-- When you join a private conversation and it has not synced yet -->
            <span
              class="bg-secondary-300 dark:bg-secondary-400 flex h-10 w-10 items-center justify-center rounded-full"
            >
              <SvgIcon icon="group" size="20" color="#ccc" />
            </span>
          {:else if allMembers.length == 1}
            <Avatar
              image={allMembers[0]?.avatar}
              agentPubKey={allMembers[0]?.publicKeyB64}
              size={40}
            />
          {:else if allMembers.length == 2}
            <Avatar
              image={allMembers[0]?.avatar}
              agentPubKey={allMembers[0]?.publicKeyB64}
              size={22}
              moreClasses=""
            />
            <Avatar
              image={allMembers[1]?.avatar}
              agentPubKey={allMembers[1]?.publicKeyB64}
              size={22}
              moreClasses="relative -ml-1"
            />
          {:else}
            <Avatar
              image={allMembers[0]?.avatar}
              agentPubKey={allMembers[0]?.publicKeyB64}
              size={22}
              moreClasses="relative -mb-2"
            />
            <Avatar
              image={allMembers[1]?.avatar}
              agentPubKey={allMembers[1]?.publicKeyB64}
              size={22}
              moreClasses="relative -ml-3 -mt-3"
            />
            <div
              class="variant-filled-tertiary relative -mb-3 -ml-2 flex h-4 w-4 items-center justify-center rounded-full p-2"
            >
              <span class="text-xxs">+{allMembers.length - 2}</span>
            </div>
          {/if}
        </div>
      {:else if $conversation.config.image}
        <img
          src={$conversation.config.image}
          alt="Conversation"
          class="h-10 w-10 rounded-full object-cover"
        />
      {:else}
        <span
          class="bg-secondary-300 dark:bg-secondary-400 flex h-10 w-10 items-center justify-center rounded-full"
        >
          <SvgIcon icon="group" size="20" color="#ccc" />
        </span>
      {/if}
      <div
        class="ml-4 flex min-w-0 flex-1 flex-col overflow-hidden"
        class:unread
      >
        <span class="text-base">{store.title}</span>
        <span
          class="flex min-w-0 items-center overflow-hidden text-ellipsis text-nowrap text-xs"
        >
          {#if unread}
            <span class="bg-primary-500 mr-2 inline-block h-2 w-2 rounded-full"
            ></span>
          {/if}
          {#if $conversation.privacy === Privacy.Private && joinedMembers.length === 0 && allMembers.length === 1}
            <span class="text-secondary-400"
              >{$t("conversations.unconfirmed")}</span
            >
          {:else if $lastMessage}
            {lastMessageAuthor || ""}:&nbsp;
            {@html DOMPurify.sanitize($lastMessage.content || "")}
            {#if $lastMessage.images.length > 0}
              &nbsp;<span class="text-secondary-400 italic"
                >({$tAny("conversations.images", {
                  count: $lastMessage.images.length,
                })})</span
              >
            {/if}
          {/if}
        </span>
      </div>
      <span
        class="text-secondary-300 relative flex flex-row items-center text-xs"
      >
        <SvgIcon
          icon="person"
          size="8"
          color={$modeCurrent ? "#aaa" : "#ccc"}
        />
        <span class="ml-1"
          >{Object.values($conversation.agentProfiles).length}</span
        >
      </span>
      {#if !isMobile() && isHovering && $x === 0}
        <button
          class="z-10"
          on:click|preventDefault|stopPropagation={toggleMenu}
        >
          <SvgIcon
            icon="caretDown"
            size="24"
            color={$modeCurrent ? "#aaa" : "#ccc"}
            moreClasses="border-2 rounded-md ml-2 shadow-md"
          />
        </button>
      {/if}
    </button>

    <div
      class="absolute left-0 top-0 flex h-full w-full flex-row rounded-lg px-[1px] py-[1px]"
    >
      <!-- <div class="flex flex-1 items-center justify-start ml-1  rounded-lg bg-secondary-500">Mark as Unread</div> -->
      <div
        class="mr-1 flex flex-1 items-center justify-end rounded-lg {store.archived
          ? 'bg-secondary-900'
          : 'bg-primary-500'}"
      >
        <button
          class="text-surface-100 dark:text-tertiary-100 mr-2 flex flex-col items-center justify-center font-bold"
          on:click={startArchive}
        >
          <SvgIcon icon="archive" size="20" color="white" moreClasses="" />
          <span class="text-xs"
            >{store.archived
              ? $t("conversations.restore")
              : $t("conversations.archive")}</span
          >
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
      <button
        class="flex flex-row items-center justify-start"
        on:click={startArchive}
      >
        <SvgIcon
          icon="archive"
          size="20"
          color={$modeCurrent ? "#aaa" : "#ccc"}
          moreClasses="mr-2"
        />
        <span class="text-xs"
          >{store.archived
            ? $t("conversations.restore")
            : $t("conversations.archive")}</span
        >
      </button>
    </li>
  </ul>
{/if}

<style>
  .unread {
    font-weight: 550;
  }
</style>
