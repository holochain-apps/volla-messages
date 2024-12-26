<script lang="ts">
  import { debounce } from "lodash-es";
  import { type AgentPubKeyB64, encodeHashToBase64 } from "@holochain/client";
  import { type Profile } from "@holochain-open-dev/profiles";
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext, onDestroy, onMount } from "svelte";
  import { type Unsubscriber, derived, writable, type Writable } from "svelte/store";
  import Time from "svelte-time";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import Avatar from "$lib/Avatar.svelte";
  import Button from "$lib/Button.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$lib/translations";
  import { copyToClipboard, isMobile, linkify, sanitizeHTML, shareText } from "$lib/utils";
  import { RelayStore } from "$store/RelayStore";
  import { Privacy, type Conversation, type Message, type FileMetadata } from "../../../types";
  import LightboxImage from "$lib/LightboxImage.svelte";
  import MessageActions from "$lib/MessageActions.svelte";
  import { press } from "svelte-gestures";
  import toast from "svelte-french-toast";
  import PdfThumbnail from "$lib/PDFThumbnail.svelte";
  import prettyBytes from "pretty-bytes";

  // Silly hack to get around issues with typescript in sveltekit-i18n
  const tAny = t as any;
  const MAX_FILE_SIZE = 15 * 1024 * 1024; //15MB

  $: conversationId = $page.params.id;

  const relayStoreContext: { getStore: () => RelayStore } = getContext("relayStore");
  let relayStore = relayStoreContext.getStore();
  let myPubKeyB64 = relayStore.client.myPubKeyB64;

  $: conversation = relayStore.getConversation(conversationId);
  $: contacts = relayStore.contacts;

  let agentProfiles: { [key: AgentPubKeyB64]: Profile } = {};
  let numMembers = 0;
  let unsubscribe: Unsubscriber;

  let configTimeout: NodeJS.Timeout;
  let agentTimeout: NodeJS.Timeout;
  let messageTimeout: NodeJS.Timeout;

  let newMessageInput: HTMLInputElement;
  let newMessageText = "";
  const newMessageFiles: Writable<FileMetadata[]> = writable([]);
  let conversationContainer: HTMLElement;
  let scrollAtBottom = true;
  let scrollAtTop = false;

  const SCROLL_BOTTOM_THRESHOLD = 100; // How close to the bottom must the user be to consider it "at the bottom"
  const SCROLL_TOP_THRESHOLD = 300; // How close to the top must the user be to consider it "at the top"

  const checkForAgents = () => {
    conversation &&
      conversation.fetchAgents().then((agentProfiles) => {
        if (Object.values(agentProfiles).length < 2) {
          agentTimeout = setTimeout(() => {
            checkForAgents();
          }, 2000);
        }
      });
  };

  const checkForConfig = () => {
    conversation &&
      conversation.getConfig().then((config) => {
        if (!config?.title) {
          configTimeout = setTimeout(() => {
            checkForConfig();
          }, 2000);
        }
      });
  };

  const checkForMessages = () => {
    conversation &&
      conversation.loadMessageSetFrom(conversation.currentBucket()).then(([_, hashes]) => {
        // If this we aren't getting anything back and there are no messages loaded at all
        // then keep trying as this is probably a no network, or a just joined situation
        if (hashes.length == 0 && Object.keys(conversation.data.messages).length == 0) {
          messageTimeout = setTimeout(() => {
            checkForMessages();
          }, 2000);
        }
      });
  };

  const checkForData = () => {
    checkForAgents();
    checkForConfig();
    checkForMessages();
  };

  function handleResize() {
    if (scrollAtBottom) {
      scrollToBottom();
    }
  }
  const debouncedHandleResize = debounce(handleResize, 100);

  onMount(() => {
    if (!conversation) {
      goto("/conversations");
    } else {
      unsubscribe = conversation.subscribe((c: Conversation) => {
        agentProfiles = c.agentProfiles;
        // messages = c.messages;
        numMembers = Object.values(agentProfiles).length;
      });
      checkForData();
      conversationContainer.addEventListener("scroll", handleScroll);
      window.addEventListener("resize", debouncedHandleResize);
      newMessageInput.focus();
      conversation.setOpen(true);
      conversation.setUnread(false);
    }
  });

  // Cleanup
  onDestroy(() => {
    if (conversation) {
      conversation.setOpen(false);
    }
    unsubscribe && unsubscribe();
    clearTimeout(agentTimeout);
    clearTimeout(configTimeout);
    clearTimeout(messageTimeout);
    conversationContainer && conversationContainer.removeEventListener("scroll", handleScroll);
    window.removeEventListener("resize", debouncedHandleResize);
  });

  // Derived store to process messages and add headers
  $: processedMessages =
    conversation &&
    derived(conversation, ($value) => {
      const messages = Object.values(($value as Conversation).messages).sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      );
      const result: Message[] = [];

      let lastMessage: Message | null = null;

      messages.forEach((message) => {
        // Don't display message if we don't have a profile from the author yet.
        if (!agentProfiles[message.authorKey]) {
          return;
        }

        const contact = $contacts.find((c) => c.publicKeyB64 === message.authorKey);

        const displayMessage = {
          ...message,
          author:
            contact?.firstName ||
            ($value as Conversation).agentProfiles[message.authorKey].fields.firstName,
          avatar:
            contact?.avatar ||
            ($value as Conversation).agentProfiles[message.authorKey].fields.avatar,
        };

        if (
          !lastMessage ||
          message.timestamp.toDateString() !== lastMessage.timestamp.toDateString()
        ) {
          displayMessage.header = message.timestamp.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          });
        }

        // If same person is posting a bunch of messages in a row, hide their name and avatar
        if (
          lastMessage?.authorKey === message.authorKey &&
          message.timestamp.getTime() - lastMessage.timestamp.getTime() < 1000 * 60 * 5
        ) {
          displayMessage.hideDetails = true;
        }

        result.push(displayMessage);
        lastMessage = message;
      });

      return result;
    });

  // Reactive update to scroll to the bottom every time the messages update,
  // but only if the user is near the bottom already
  $: if ($processedMessages && $processedMessages.length > 0) {
    if (scrollAtBottom) {
      setTimeout(scrollToBottom, 100);
    }
  }

  const handleScroll = debounce(() => {
    const atTop = conversationContainer.scrollTop < SCROLL_TOP_THRESHOLD;
    if (!scrollAtTop && atTop && conversation) {
      conversation.loadMessagesSet();
    }
    scrollAtTop = atTop;
    scrollAtBottom =
      conversationContainer.scrollHeight - conversationContainer.scrollTop <=
      conversationContainer.clientHeight + SCROLL_BOTTOM_THRESHOLD;
  }, 100);

  function scrollToBottom() {
    if (conversationContainer) {
      conversationContainer.scrollTop = conversationContainer.scrollHeight;
      scrollAtBottom = true;
    }
  }

  async function sendMessage(e: SubmitEvent) {
    if (conversation && (newMessageText.trim() || $newMessageFiles.length > 0)) {
      conversation.sendMessage(myPubKeyB64, newMessageText, $newMessageFiles);
      newMessageText = ""; // Clear input after sending
      newMessageFiles.set([]);
      setTimeout(scrollToBottom, 100);
      newMessageInput.focus();
    }
    e.preventDefault();
  }

  async function handleFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const files = Array.from(input.files);
      const validFiles = files.filter((file) => {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${$t("common.large_file_error", { maxSize: "15MB" } as any)}`);
          return false;
        }
        return true;
      });

      const readers: Promise<FileMetadata>[] = validFiles.map((file) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        return new Promise<FileMetadata>((resolve) => {
          reader.onload = async () => {
            if (typeof reader.result === "string") {
              resolve({
                id: crypto.randomUUID(),
                dataURL: reader.result,
                lastModified: file.lastModified,
                fileType: file.type,
                fileObject: file,
                name: file.name,
                size: file.size,
                status: "pending",
              });
            }
          };
          reader.onerror = () => {
            console.error("Error reading file");
            resolve({
              id: crypto.randomUUID(),
              dataURL: "",
              lastModified: file.lastModified,
              fileType: file.type,
              fileObject: file,
              name: file.name,
              size: file.size,
              status: "error",
            });
          };
        });
      });

      // When all files are read, update the file store
      Promise.all(readers).then((newFiles: FileMetadata[]) => {
        newMessageFiles.update((currentFile) => [...currentFile, ...newFiles]);
      });

      // Resetting the file input, so user can upload the same file again
      input.value = "";
    }
  }

  function cancelUpload(id: string) {
    newMessageFiles.update((files) => files.filter((file) => file.id !== id));
  }

  let selectedMessageHash: string | null = null;

  function unselectMessage() {
    selectedMessageHash = null;
  }

  function clickOutside(node: HTMLElement, callback: () => void) {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        node &&
        !node.contains(target) &&
        !target.closest("[data-message-actions]") &&
        !target.closest("[data-message-selection]")
      ) {
        callback();
      }
    };

    document.addEventListener("click", handleClick, true);

    return {
      destroy() {
        document.removeEventListener("click", handleClick, true);
      },
    };
  }

  function handleMessageClick(messageHash: string) {
    if (!isMobile()) {
      if (selectedMessageHash === messageHash) {
        selectedMessageHash = null;
      } else if (selectedMessageHash !== null) {
        selectedMessageHash = null;
      } else {
        selectedMessageHash = messageHash;
      }
    }
  }

  function handleMessagePress(messageHash: string) {
    if (isMobile()) {
      if (selectedMessageHash === messageHash) {
        selectedMessageHash = null;
      } else if (selectedMessageHash !== null) {
        selectedMessageHash = null;
      } else {
        selectedMessageHash = messageHash;
      }
    }
  }

  function formatFileName(file: FileMetadata, maxLength: number = 10): string {
    const fileName = file.name.trim();
    if (fileName.length <= maxLength) {
      return fileName;
    }
    return fileName.slice(0, maxLength) + "...";
  }

  // To get the icon name based on the file type
  function formatFileIcon(file: FileMetadata): string {
    const commonFileTypes: { [key: string]: string[] } = {
      document: ["doc", "docx", "rtf", "txt", "odt"],
      spreadsheet: ["xls", "xlsx", "csv", "ods"],
      presentation: ["ppt", "pptx", "odp"],
      audio: ["mp3", "wav", "ogg", "flac"],
      video: ["mp4", "avi", "mkv", "mov"],
      archivefile: ["zip", "rar", "7z", "tar", "gz"],
    };
    if (file.name) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension) {
        for (const [type, extensions] of Object.entries(commonFileTypes)) {
          if (extensions.includes(extension)) {
            return type;
          }
        }
      }
    }
    // Final fallback
    return "file";
  }
</script>

<Header>
  <button
    class="flex-none pr-5"
    on:click={() => goto(`/conversations${conversation?.archived ? "/archive" : ""}`)}
  >
    <SvgIcon icon="caretLeft" color={$modeCurrent ? "%232e2e2e" : "white"} size="10" />
  </button>
  {#if conversation}
    <h1 class="block grow self-center overflow-hidden text-ellipsis whitespace-nowrap text-center">
      <button on:click={() => goto(`/conversations/${conversationId}/details`)} class="w-full">
        {conversation.title}
      </button>
    </h1>
    <button
      class="self-center pl-2"
      on:click={() => goto(`/conversations/${conversationId}/details`)}
    >
      <SvgIcon icon="gear" size="18" color={$modeCurrent ? "%232e2e2e" : "white"} />
    </button>
    {#if conversation.data.privacy === Privacy.Public || encodeHashToBase64(conversation.data.progenitor) === myPubKeyB64}
      <button
        class="flex-none pl-5"
        on:click={() =>
          goto(
            `/conversations/${conversation.data.id}/${conversation.data.privacy === Privacy.Public ? "details" : "invite"}`,
          )}
      >
        <SvgIcon icon="addPerson" size="24" color={$modeCurrent ? "%232e2e2e" : "white"} />
      </button>
    {:else}
      <span class="flex-none pl-8">&nbsp;</span>
    {/if}
  {/if}
</Header>

{#if conversation && typeof $processedMessages !== "undefined"}
  <div
    class="container mx-auto flex w-full flex-1 flex-col items-center justify-center overflow-hidden"
  >
    <div
      class="relative flex w-full grow flex-col items-center overflow-y-auto overflow-x-hidden pt-10"
      bind:this={conversationContainer}
      id="message-container"
    >
      {#if conversation.privacy === Privacy.Private}
        <div class="flex items-center justify-center gap-4">
          {#if encodeHashToBase64(conversation.data.progenitor) !== myPubKeyB64 && numMembers === 1}
            <!-- When you join a private conversation and it has not synced yet -->
            <SvgIcon
              icon="spinner"
              size="44"
              color={$modeCurrent ? "%232e2e2e" : "white"}
              moreClasses="mb-5"
            />
          {/if}
          {#each conversation.allMembers.slice(0, 2) as contact, i}
            {#if contact}
              <Avatar
                image={contact.avatar}
                agentPubKey={contact.publicKeyB64}
                size={120}
                moreClasses="mb-5"
              />
            {/if}
          {/each}
          {#if conversation.allMembers.length > 2}
            <div
              class="variant-filled-tertiary mb-5 flex h-10 min-h-10 w-10 items-center justify-center rounded-full"
            >
              <span class="text-xl">+{conversation.allMembers.length - 2}</span>
            </div>
          {/if}
        </div>
      {:else if conversation.data?.config.image}
        <img
          src={conversation.data?.config.image}
          alt="Conversation"
          class="mb-5 h-32 min-h-32 w-32 rounded-full object-cover"
        />
      {/if}
      <h1 class="b-1 break-all text-3xl">{conversation.title}</h1>
      <!-- if joining a conversation created by someone else, say still syncing here until there are at least 2 members -->
      <button
        on:click={() => goto(`/conversations/${conversationId}/details`)}
        class="text-left text-sm"
      >
        {$tAny("conversations.num_members", { count: numMembers })}
      </button>
      {#if $processedMessages.length === 0 && encodeHashToBase64(conversation.data.progenitor) === myPubKeyB64 && numMembers === 1}
        <!-- No messages yet, no one has joined, and this is a conversation I created. Display a helpful message to invite others -->
        <div class="flex h-full w-full flex-col items-center justify-center">
          <img
            src={$modeCurrent ? "/clear-skies-gray.png" : "/clear-skies-white.png"}
            alt="No contacts"
            class="mb-4 mt-4 h-32 w-32"
          />
          {#if conversation.data.privacy === Privacy.Private}
            {#if conversation.allMembers.length === 1}
              <!-- A 1:1 conversation, so this is a pending connection -->
              <div
                class="bg-tertiary-500 dark:bg-secondary-500 mx-8 mb-3 flex flex-col items-center rounded-xl p-4"
              >
                <SvgIcon icon="handshake" size="36" color={$modeCurrent ? "%23232323" : "white"} />
                <h1 class="text-secondary-500 dark:text-tertiary-100 mt-2 text-xl font-bold">
                  {$t("contacts.pending_connection_header")}
                </h1>
                <p class="text-secondary-400 dark:text-tertiary-700 mb-6 mt-4 text-center text-sm">
                  {$tAny("contacts.pending_connection_description", { name: conversation.title })}
                </p>
                <div class="flex justify-center">
                  <Button
                    moreClasses="bg-surface-100 text-sm text-secondary-500 dark:text-tertiary-100 font-bold dark:bg-secondary-900"
                    onClick={async () => {
                      try {
                        const inviteCode = conversation.inviteCodeForAgent(
                          conversation.allMembers[0]?.publicKeyB64,
                        );
                        await copyToClipboard(inviteCode);
                        toast.success(`${$t("common.copy_success")}`);
                      } catch (e) {
                        toast.error(`${$t("common.copy_error")}: ${e.message}`);
                      }
                    }}
                  >
                    <SvgIcon icon="copy" size="20" color="%23FD3524" moreClasses="mr-2" />
                    {$t("contacts.copy_invite_code")}
                  </Button>
                  {#if isMobile()}
                    <Button
                      moreClasses="bg-surface-100 text-sm text-secondary-500 dark:text-tertiary-100 font-bold dark:bg-secondary-900"
                      onClick={() => {
                        shareText(
                          conversation.inviteCodeForAgent(conversation.allMembers[0]?.publicKeyB64),
                        );
                      }}
                    >
                      <SvgIcon icon="share" size="20" color="%23FD3524" moreClasses="mr-2" />
                      {$t("contacts.share_invite_code")}
                    </Button>
                  {/if}
                </div>
              </div>
            {:else}
              <p class="text-secondary-500 dark:text-tertiary-500 mx-10 mb-8 text-center text-xs">
                {$t("conversations.share_personal_invitations")}
              </p>
              <Button
                onClick={() => goto(`/conversations/${conversation.data.id}/details`)}
                moreClasses="w-72 justify-center"
              >
                <SvgIcon icon="ticket" size="24" color={$modeCurrent ? "white" : "%23FD3524"} />
                <strong class="ml-2">{$t("conversations.send_invitations")}</strong>
              </Button>
            {/if}
          {:else}
            <!-- Public conversation, make it easy to copy invite code-->
            <p class="text-secondary-500 dark:text-tertiary-700 mx-10 mb-8 text-center text-xs">
              {$t("conversations.share_invitation_code_msg")}
            </p>
            <Button
              moreClasses="w-64 justify-center variant-filled-tertiary"
              onClick={async () => {
                try {
                  await copyToClipboard(conversation.publicInviteCode);
                  toast.success(`${$t("common.copy_success")}`);
                } catch (e) {
                  toast.error(`${$t("common.copy_error")}: ${e.message}`);
                }
              }}
            >
              <SvgIcon icon="copy" size="18" color="%23FD3524" />
              <strong class="ml-2 text-sm">{$t("conversations.copy_invite_code")}</strong>
            </Button>
            {#if isMobile()}
              <Button
                onClick={() => shareText(conversation.publicInviteCode)}
                moreClasses="w-64 justify-center variant-filled-tertiary"
              >
                <SvgIcon icon="share" size="18" color="%23FD3524" />
                <strong class="ml-2 text-sm">{$t("conversations.share_invite_code")}</strong>
              </Button>
            {/if}
          {/if}
        </div>
      {:else}
        <div
          id="message-box"
          class="flex w-full flex-1 flex-col-reverse p-4"
          use:clickOutside={() => (selectedMessageHash = null)}
        >
          <ul>
            {#each $processedMessages as message (message.hash)}
              {@const fromMe = message.authorKey === myPubKeyB64}
              {@const isSelected = selectedMessageHash === message.hash}
              {#if message.header}
                <li class="mb-2 mt-auto">
                  <div class="text-secondary-400 dark:text-secondary-300 text-center text-xs">
                    {message.header}
                  </div>
                </li>
              {/if}
              <li
                class="mt-auto {!message.hideDetails && 'mt-3'} relative {isSelected
                  ? 'bg-tertiary-500 dark:bg-secondary-500 mb-20 mt-2 rounded-t-xl'
                  : ''}"
                data-message-selection={isSelected ? "true" : undefined}
              >
                <button
                  class="flex w-full {fromMe ? 'justify-end' : 'justify-start'} {isSelected
                    ? 'bg-tertiary-500 dark:bg-secondary-500 rounded-b-none rounded-t-xl px-2.5 py-1.5'
                    : 'bg-transparent'} border-0 bg-transparent text-left"
                  use:press={{ timeframe: 300, triggerBeforeFinished: false }}
                  on:press={(e) => handleMessagePress(message.hash)}
                  on:click|preventDefault={() => handleMessageClick(message.hash)}
                  aria-pressed={isSelected}
                  aria-label={`Message from ${fromMe ? "you" : message.author}`}
                >
                  {#if !fromMe}
                    {#if !message.hideDetails}
                      <Avatar
                        image={message.avatar}
                        agentPubKey={message.authorKey}
                        size="24"
                        moreClasses="items-start mt-1"
                      />
                    {:else}
                      <span class="inline-block min-w-6"></span>
                    {/if}
                  {/if}

                  <div class="max-w-3/4 ml-3 w-auto {fromMe && 'items-end text-end'}">
                    {#if !message.hideDetails}
                      <span class="flex items-baseline {fromMe && 'flex-row-reverse opacity-80'}">
                        <span class="font-bold">{fromMe ? "You" : message.author}</span>
                        <span class="text-xxs mx-2"
                          ><Time timestamp={message.timestamp} format="h:mma" /></span
                        >
                      </span>
                    {/if}
                    <!-- if message contains files -->
                    {#if message.images && message.images.length > 0}
                      {#each message.images as file}
                        <div class="flex {fromMe ? 'justify-end' : 'justify-start'} w-full p-2">
                          <!-- if file is loaded -->
                          {#if file.status === "loaded"}
                            <div class="mb-2 flex w-auto max-w-full items-start justify-between">
                              <!-- Display image thumbnail -->
                              {#if file.fileType.startsWith("image/")}
                                <div class="w-full">
                                  <LightboxImage
                                    btnClass="inline w-full sm:max-w-md lg:max-w-lg transition-all duration-200"
                                    src={file.dataURL}
                                    alt={file.name}
                                  />
                                </div>
                                <!-- Display pdf thumbnail -->
                              {:else if file.fileType === "application/pdf"}
                                <div
                                  class="bg-surface-800/10 flex w-auto flex-row items-start gap-3 rounded-xl p-3"
                                >
                                  {#if !fromMe}
                                    <div class="flex flex-shrink-0 items-center justify-center">
                                      <PdfThumbnail
                                        pdfDataUrl={file.dataURL ?? ""}
                                        width={70}
                                        height={90}
                                        fallbackIcon="pdf"
                                      />
                                    </div>
                                  {/if}
                                  <div class="min-w-0 flex-grow">
                                    <div class="break-all text-sm sm:text-base">
                                      {isMobile()
                                        ? formatFileName(file, 20)
                                        : formatFileName(file, 50)}
                                    </div>
                                    <div class="mt-1 text-xs font-bold text-yellow-400 sm:text-sm">
                                      {prettyBytes(file.size)}
                                    </div>
                                  </div>
                                  {#if fromMe}
                                    <div class="flex flex-shrink-0 items-center justify-center">
                                      <PdfThumbnail
                                        pdfDataUrl={file.dataURL ?? ""}
                                        width={70}
                                        height={90}
                                        fallbackIcon="pdf"
                                      />
                                    </div>
                                  {/if}
                                </div>
                                <!-- Display icons for other file types -->
                              {:else}
                                <div
                                  class="bg-surface-800/10 flex w-auto flex-row items-start gap-3 rounded-xl p-3"
                                >
                                  {#if !fromMe}
                                    <div class="flex flex-shrink-0 items-center justify-center">
                                      <SvgIcon
                                        icon={formatFileIcon(file)}
                                        color={$modeCurrent ? "black" : "white"}
                                        size="50"
                                      />
                                    </div>
                                  {/if}
                                  <div class="min-w-0 flex-grow">
                                    <div class="break-all text-sm sm:text-base">{file.name}</div>
                                    <div class="mt-1 text-xs font-bold text-yellow-400 sm:text-sm">
                                      {prettyBytes(file.size)}
                                    </div>
                                  </div>
                                  {#if fromMe}
                                    <div class="flex flex-shrink-0 items-center justify-center">
                                      <SvgIcon
                                        icon={formatFileIcon(file)}
                                        color={$modeCurrent ? "black" : "white"}
                                        size="50"
                                      />
                                    </div>
                                  {/if}
                                </div>
                              {/if}
                            </div>
                            <!-- if file is loading -->
                          {:else if file.status === "loading" || file.status === "pending"}
                            <div
                              class="bg-surface-800/60 mb-2 flex h-20 w-20 items-center justify-center rounded-lg"
                            >
                              <SvgIcon
                                icon="spinner"
                                color={$modeCurrent ? "%232e2e2e" : "white"}
                                size="30"
                              />
                            </div>
                          {:else}
                            <div
                              class="bg-surface-800/60 mb-2 flex h-20 w-20 items-center justify-center rounded-lg"
                            >
                              <SvgIcon
                                icon="x"
                                color={$modeCurrent ? "%232e2e2e" : "white"}
                                size="30"
                              />
                            </div>
                          {/if}
                        </div>
                      {/each}
                    {/if}

                    <div class="message w-full break-words font-light {fromMe && 'text-end'}">
                      {@html sanitizeHTML(linkify(message.content))}
                    </div>
                  </div>
                </button>

                {#if isSelected}
                  <div data-message-actions>
                    <MessageActions {message} {unselectMessage} />
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  </div>
  <div class="bg-tertiary-500 dark:bg-secondary-500 w-full flex-shrink-0 p-2">
    <form class="flex" method="POST" on:submit={sendMessage}>
      <input type="file" multiple id="files" class="hidden" on:change={handleFileSelected} />
      <label for="files" class="flex cursor-pointer">
        <SvgIcon
          icon="fileClip"
          color={$modeCurrent ? "%232e2e2e" : "white"}
          size="26"
          moreClasses="ml-3"
        />
      </label>
      <div class="flex w-full flex-col">
        <!-- svelte-ignore a11y-autofocus -->
        <input
          autofocus
          type="text"
          bind:this={newMessageInput}
          bind:value={newMessageText}
          class="bg-tertiary-500 w-full border-0 placeholder:text-sm placeholder:text-gray-400 focus:border-gray-500 focus:ring-0"
          placeholder={$t("conversations.message_placeholder")}
          on:keydown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (newMessageText.trim() || $newMessageFiles.length > 0) {
                const submitEvent = new SubmitEvent("submit");
                e.currentTarget.form?.dispatchEvent(submitEvent);
              }
            }
          }}
        />
        <div class="flex flex-row flex-wrap px-4">
          {#each $newMessageFiles as file (file.id)}
            {#if file.status === "loading"}
              <div
                class="bg-primary-500 relative mr-3 flex items-start justify-between rounded-xl p-2"
              >
                <button
                  class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white p-1 text-white"
                  on:click={() => cancelUpload(file.id)}
                  aria-label="Cancel Upload"
                >
                  <SvgIcon icon="x" size="8" />
                </button>
                <div class="flex flex-col">
                  {formatFileName(file)}
                  <div class="file-size text-sm font-bold text-yellow-400">
                    {prettyBytes(file.size)}
                  </div>
                </div>
                <div class="justify-cente relative ml-4 flex items-center">
                  <SvgIcon icon="spinner" color={$modeCurrent ? "%232e2e2e" : "white"} size="20" />
                </div>
              </div>
            {:else if file.dataURL && file.fileType.startsWith("image/")}
              <!-- Display image thumbnail -->
              <div class="relative mr-3 h-16 w-16">
                <img src={file.dataURL} class="h-16 w-16 rounded-lg object-cover" alt="thumbnail" />
                <button
                  class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white p-1 text-white"
                  on:click={() => cancelUpload(file.id)}
                  aria-label="Cancel Upload"
                >
                  <SvgIcon icon="x" size="8" />
                </button>
              </div>
            {:else if file.dataURL && file.fileType.startsWith("application/pdf")}
              <!-- Display pdf thumbnail -->
              <div
                class="bg-surface-800/10 relative mb-2 mr-2 flex flex-row items-start justify-between gap-1.5 rounded-xl p-2"
              >
                <button
                  class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white p-1 text-white"
                  on:click={() => cancelUpload(file.id)}
                  aria-label="Cancel Upload"
                >
                  <SvgIcon icon="x" size="8" />
                </button>
                <div class="flex flex-col break-all text-sm sm:text-base">
                  <div>
                    {formatFileName(file, 10)}
                  </div>
                  <div class="mt-1 text-xs font-bold text-yellow-400 sm:text-sm">
                    {prettyBytes(file.size)}
                  </div>
                </div>
                <div class="flex items-center justify-center">
                  <PdfThumbnail
                    pdfDataUrl={file.dataURL ?? ""}
                    width={30}
                    height={43}
                    fallbackIcon="pdf"
                  />
                </div>
              </div>
            {:else}
              <!-- Display pdf thumbnail -->
              <div
                class="bg-surface-800/10 relative mb-2 mr-2 flex flex-row items-start justify-between gap-1.5 rounded-xl p-2"
              >
                <button
                  class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white p-1 text-white"
                  on:click={() => cancelUpload(file.id)}
                  aria-label="Cancel Upload"
                >
                  <SvgIcon icon="x" size="8" />
                </button>
                <div class="flex flex-col break-all text-sm sm:text-base">
                  <div>
                    {formatFileName(file, 10)}
                  </div>
                  <div class="mt-1 text-xs font-bold text-yellow-400 sm:text-sm">
                    {prettyBytes(file.size)}
                  </div>
                </div>
                <div class="flex items-center justify-center">
                  <SvgIcon
                    icon={formatFileIcon(file)}
                    color={$modeCurrent ? "black" : "white"}
                    size="50"
                  />
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>
      <button
        disabled={newMessageText.trim() === "" && $newMessageFiles.length === 0}
        class="pr-2 disabled:opacity-50"
      >
        <SvgIcon icon="caretRight" color={$modeCurrent ? "#2e2e2e" : "white"} size="10" />
      </button>
    </form>
  </div>
{/if}

<style type="text/css">
  .message :global(a) {
    color: rgba(var(--color-primary-500));
  }
</style>
