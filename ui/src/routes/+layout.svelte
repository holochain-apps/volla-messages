<script lang="ts">
  import type { AgentPubKeyB64, AppClient, CellId } from "@holochain/client";
  import { AppWebsocket, CellType, encodeHashToBase64 } from "@holochain/client";
  import { onMount, setContext } from "svelte";
  import { t } from "$translations";
  import { createSignalHandler } from "$store/SignalHandler";
  import toast, { Toaster } from "svelte-french-toast";
  import { initLightDarkModeSwitcher } from "$lib/utils";
  import { RelayClient } from "$store/RelayClient";
  import AppLanding from "$lib/AppLanding.svelte";
  import { MIN_FIRST_NAME_LENGTH, ROLE_NAME, ZOME_NAME } from "$config";
  import Button from "$lib/Button.svelte";
  import ProfileSetupName from "./ProfileSetupName.svelte";
  import ProfileSetupAvatar from "./ProfileSetupAvatar.svelte";
  import { createContactStore, type ContactStore } from "$store/ContactStore";
  import {
    type CellProfileStore,
    type ProfileStore,
    createProfileStore,
    deriveCellProfileStore,
  } from "$store/ProfileStore";
  import { encodeCellIdToBase64 } from "$lib/utils";
  import {
    createMergedProfileContactInviteStore,
    type MergedProfileContactInviteStore,
  } from "$store/MergedProfileContactInviteStore";
  import { createConversationStore, type ConversationStore } from "$store/ConversationStore";
  import {
    createConversationTitleStore,
    type ConversationTitleStore,
  } from "$store/ConversationTitleStore";
  import type { CellIdB64, CreateProfileInputUI } from "$lib/types";
  import { createInviteStore, type InviteStore } from "$store/InviteStore";
  import "../app.postcss";
  import {
    type ConversationLatestMessageStore,
    createConversationLatestMessageStore,
  } from "$store/ConversationLatestMessageStore";
  import {
    type ConversationMessageStore,
    createConversationMessageStore,
  } from "$store/ConversationMessageStore";
  import {
    createMergedProfileContactInviteJoinedStore,
    createMergedProfileContactInviteUnjoinedStore,
    type MergedProfileContactInviteJoinedStore,
    type MergedProfileContactInviteUnjoinedStore,
  } from "$store/MergedProfileContactInviteJoinedStore";
  import { createFileStore, type FileStore } from "$store/FileStore";
  import {
    createSimplePeerConferenceStore,
    type SimplePeerConferenceStore,
  } from "$store/SimplePeerConferenceStore";
  import Dialog from "$lib/Dialog.svelte";
  // Use the refactored ConferenceView with extracted components
  import { ConferenceView, ResizablePip } from "$lib/conference";
  import { sendConferenceEndedLog } from "$lib/conferenceLogging";
  import { onDestroy } from "svelte";

  // Svelte action to set video srcObject
  function setVideoStream(videoElement: HTMLVideoElement, stream: MediaStream) {
    videoElement.srcObject = stream;
    return {
      update(newStream: MediaStream) {
        if (videoElement.srcObject !== newStream) {
          videoElement.srcObject = newStream;
        }
      },
    };
  }

  // Holochain client
  let client: AppClient;
  let provisionedRelayCellId: CellId;
  let provisionedRelayCellIdB64: CellIdB64;
  let myPubKeyB64: AgentPubKeyB64;

  // Frontend store singletons
  let profileStore: ProfileStore;
  let contactStore: ContactStore;
  let mergedProfileContactInviteStore: MergedProfileContactInviteStore;
  let conversationStore: ConversationStore;
  let fileStore: FileStore;
  let conversationTitleStore: ConversationTitleStore;
  let conversationMessageStore: ConversationMessageStore;
  let conversationLatestMessageStore: ConversationLatestMessageStore;
  let inviteStore: InviteStore;
  let provisionedRelayCellProfileStore: CellProfileStore;
  let mergedProfileContactInviteUnjoinedStore: MergedProfileContactInviteUnjoinedStore;
  let mergedProfileContactInviteJoinedStore: MergedProfileContactInviteJoinedStore;
  let conferenceStore: SimplePeerConferenceStore;

  // Is the holochain client connected?
  let isClientConnected = false;
  let isClientConnectionFailed = false;

  // Are the frontend stores initialized?
  let isStoresSetup = false;

  // Has the user clicked the "create account" button?
  let isUserCreatingProfile = false;

  // Profile create data
  let profileCreateInput: CreateProfileInputUI = {
    firstName: "",
    lastName: "",
    avatar: "",
  };

  $: myProfile =
    provisionedRelayCellProfileStore && $provisionedRelayCellProfileStore.data[myPubKeyB64]
      ? $provisionedRelayCellProfileStore.data[myPubKeyB64]
      : undefined;
  $: myProfileExists = myProfile !== undefined;

  $: activeConference =
    conferenceStore && $conferenceStore
      ? Object.entries($conferenceStore.data).find(
          ([_, conf]) =>
            conf &&
            !conf.ended &&
            !conf.isMinimized && // Exclude minimized conferences from full view
            conf.invitationStatus !== "left" &&
            conf.invitationStatus !== "rejected" &&
            // Include: initiator, accepted, or showPreJoinScreen is true (for PreJoinScreen overlay)
            (conf.isInitiator || conf.invitationStatus === "accepted" || conf.showPreJoinScreen),
        )?.[0]
      : null;

  // Find minimized conference (for PiP view)
  $: minimizedConference =
    conferenceStore && $conferenceStore
      ? Object.entries($conferenceStore.data).find(
          ([_, conf]) =>
            conf &&
            !conf.ended &&
            conf.isMinimized &&
            (conf.isInitiator || conf.invitationStatus === "accepted"),
        )?.[0]
      : null;

  // Track which conferences we've already logged to prevent duplicates
  // This is necessary because the ConferenceView component may unmount before its reactive
  // statement can fire (due to activeConference becoming null when ended: true)
  const loggedConferenceEnds = new Set<string>();

  // Watch for conferences that end and log them from the layout level
  // ONLY the initiator logs to prevent duplicate messages
  // This fixes the race condition where ConferenceView unmounts before it can call onConferenceEnded
  $: if (conferenceStore && $conferenceStore) {
    for (const [roomId, conf] of Object.entries($conferenceStore.data)) {
      if (conf && conf.ended && conf.isInitiator) {
\        handleConferenceEnded(roomId);
      }
    }
  }

  function handleCloseConference() {
    // Minimize the conference to PiP mode instead of closing
    if (activeConference) {
      console.log("[+layout] Minimizing conference:", activeConference);
      conferenceStore.setMinimized(activeConference, true);
    }
  }

  function handleMaximizeConference() {
    // Restore the conference from PiP to full view
    if (minimizedConference) {
      console.log("[+layout] Maximizing conference:", minimizedConference);
      conferenceStore.setMinimized(minimizedConference, false);
    }
  }

  async function handleConferenceEnded(roomId: string) {
    if (loggedConferenceEnds.has(roomId)) {
      console.log("[ConferenceLog] Already logged conference end for:", roomId);
      return;
    }
    loggedConferenceEnds.add(roomId);

    let conference;
    try {
      conference = conferenceStore.getConference(roomId);
    } catch (error) {
      console.warn("[ConferenceLog] Conference not found in store:", roomId);
      return;
    }

    if (
      !conference ||
      !conference.cellIdB64 ||
      !conference.startTime ||
      !conference.initiatorPubKeyB64
    ) {
      console.warn("[ConferenceLog] Cannot send ended log - missing metadata");
      return;
    }

    if (!conference.isInitiator) {
      console.log("[ConferenceLog] Skipping ended log - not the initiator");
      return;
    }

    const durationSeconds = Math.floor((Date.now() - conference.startTime) / 1000);
    const allParticipants = Array.from(conference.participants.keys());

    try {
      await sendConferenceEndedLog(
        conversationMessageStore,
        conference.cellIdB64,
        roomId,
        conference.initiatorPubKeyB64,
        allParticipants,
        durationSeconds,
      );
      console.log("[ConferenceLog] Successfully sent conference ended log");
    } catch (error) {
      console.error("[ConferenceLog] Failed to send conference ended log:", error);
    }
  }

  async function initHolochainClient() {
    try {
      console.log("__HC_LAUNCHER_ENV__ is", window.__HC_LAUNCHER_ENV__);

      // Connect to holochain
      client = await AppWebsocket.connect({ defaultTimeout: 30000 });

      // Call 'ping' with very long timeout
      // This should be the first zome call after the client connects,
      // as subsequent zome calls will be much faster and can use the default timeout.
      console.log("Awaiting relay cell launch");
      await client.callZome(
        {
          role_name: ROLE_NAME,
          zome_name: ZOME_NAME,
          fn_name: "ping",
          payload: null,
        },

        // 5m timeout
        5 * 60 * 1000,
      );
      const appInfo = await client.appInfo();
      if (appInfo === null) throw new Error("Failed to get appInfo");
      console.log("Relay cell ready. App Info is ", appInfo);

      // Get provisioned relay CellId
      const provisionedRelayCellInfo = appInfo.cell_info[ROLE_NAME].find(
        (c) => c.type === CellType.Provisioned,
      );
      if (provisionedRelayCellInfo === undefined)
        throw new Error("Failed to get CellInfo for cell 'relay'");
      provisionedRelayCellId = provisionedRelayCellInfo.value.cell_id;
      provisionedRelayCellIdB64 = encodeCellIdToBase64(provisionedRelayCellId);

      isClientConnected = true;
      console.log("Connected");
    } catch (e) {
      isClientConnectionFailed = true;
      console.error("Failed to init holochain", e);
      // toast.error(`${$t("common.holochain_connect_error")}: ${e}`);
      throw e;
    }
  }

  async function initStores() {
    try {
      // Setup stores
      const relayClient = new RelayClient(client, provisionedRelayCellId);
      myPubKeyB64 = encodeHashToBase64(client.myPubKey);
      contactStore = createContactStore(relayClient);
      profileStore = createProfileStore(relayClient);
      provisionedRelayCellProfileStore = deriveCellProfileStore(
        profileStore,
        provisionedRelayCellIdB64,
      );
      inviteStore = createInviteStore();
      mergedProfileContactInviteStore = createMergedProfileContactInviteStore(
        profileStore,
        contactStore,
        inviteStore,
      );
      conversationStore = createConversationStore(relayClient);
      fileStore = createFileStore(relayClient);
      conversationMessageStore = createConversationMessageStore(
        relayClient,
        conversationStore,
        mergedProfileContactInviteStore,
        fileStore,
      );
      conversationLatestMessageStore = createConversationLatestMessageStore(
        conversationStore,
        conversationMessageStore,
      );
      mergedProfileContactInviteUnjoinedStore = createMergedProfileContactInviteUnjoinedStore(
        profileStore,
        inviteStore,
        mergedProfileContactInviteStore,
      );
      mergedProfileContactInviteJoinedStore = createMergedProfileContactInviteJoinedStore(
        profileStore,
        inviteStore,
        mergedProfileContactInviteStore,
      );
      conversationTitleStore = createConversationTitleStore(
        conversationStore,
        mergedProfileContactInviteStore,
        myPubKeyB64,
      );
      conferenceStore = createSimplePeerConferenceStore(relayClient);

      // Initialize store data
      await contactStore.initialize();
      await profileStore.initialize();
      await conversationStore.initialize();
      await conversationMessageStore.initialize();

      isStoresSetup = true;

      createSignalHandler(
        relayClient,
        conversationStore,
        conversationMessageStore,
        conferenceStore,
      );
    } catch (e) {
      console.error("Failed to init stores", e);
      toast.error(`${$t("common.stores_setup_error")}: ${e}`);
    }
  }

  async function setupApp() {
    initLightDarkModeSwitcher();
    await initHolochainClient();
    await initStores();
  }

  onMount(setupApp);

  setContext("myPubKey", {
    getMyPubKey: () => client.myPubKey,
    getMyPubKeyB64: () => myPubKeyB64,
  });

  setContext("provisionedRelayCellId", {
    getCellId: () => provisionedRelayCellId,
    getCellIdB64: () => provisionedRelayCellIdB64,
  });

  setContext("profileStore", {
    getStore: () => profileStore,
    getProvisionedRelayCellProfileStore: () => provisionedRelayCellProfileStore,
  });

  setContext("contactStore", {
    getStore: () => contactStore,
  });

  setContext("mergedProfileContactInviteStore", {
    getStore: () => mergedProfileContactInviteStore,
  });

  setContext("mergedProfileContactInviteJoinedStore", {
    getStore: () => mergedProfileContactInviteJoinedStore,
  });

  setContext("mergedProfileContactInviteUnjoinedStore", {
    getStore: () => mergedProfileContactInviteUnjoinedStore,
  });

  setContext("conversationStore", {
    getStore: () => conversationStore,
  });

  setContext("fileStore", {
    getStore: () => fileStore,
  });

  setContext("conversationTitleStore", {
    getStore: () => conversationTitleStore,
  });

  setContext("conversationMessageStore", {
    getStore: () => conversationMessageStore,
  });

  setContext("conversationLatestMessageStore", {
    getStore: () => conversationLatestMessageStore,
  });

  setContext("inviteStore", {
    getStore: () => inviteStore,
  });

  setContext("conferenceStore", {
    getStore: () => conferenceStore,
  });
</script>

<div class="mx-auto flex h-screen w-full max-w-screen-lg flex-col items-center">
  {#if isClientConnected && isStoresSetup && myProfileExists}
    <slot />
  {:else if isClientConnected && isStoresSetup && !myProfileExists && !isUserCreatingProfile}
    <AppLanding>
      <Button
        icon="lock"
        on:click={() => (isUserCreatingProfile = true)}
        moreClasses="!font-normal"
      >
        {$t("common.create_an_account")}
      </Button>
    </AppLanding>
  {:else if isClientConnected && isStoresSetup && !myProfileExists && isUserCreatingProfile && profileCreateInput.firstName === ""}
    <ProfileSetupName bind:value={profileCreateInput} />
  {:else if isClientConnected && isStoresSetup && !myProfileExists && isUserCreatingProfile && profileCreateInput.firstName.length >= MIN_FIRST_NAME_LENGTH}
    <ProfileSetupAvatar bind:value={profileCreateInput} />
  {:else if isClientConnected && !isStoresSetup}
    <AppLanding>
      {$t("common.stores_setup")}
    </AppLanding>
  {:else}
    <AppLanding>
      {$t("common.connecting_to_holochain")}
    </AppLanding>
  {/if}
</div>

{#if activeConference}
  <ConferenceView
    roomId={activeConference}
    onClose={handleCloseConference}
    onConferenceEnded={handleConferenceEnded}
    showPreJoin={true}
  />
{/if}

{#if minimizedConference}
  {@const conf = $conferenceStore.data[minimizedConference]}
  <div class="pointer-events-none fixed inset-0" style="z-index: 50;">
    <ResizablePip
      initialWidth={180}
      initialHeight={135}
      minWidth={120}
      minHeight={90}
      maxWidth={320}
      maxHeight={240}
      persistKey="conference-pip-position"
      on:click={handleMaximizeConference}
    >
      <div class="relative flex h-full w-full items-center justify-center bg-zinc-900">
        {#if conf?.localStream}
          <!-- svelte-ignore a11y-media-has-caption -->
          <video
            autoplay
            playsinline
            muted
            class="h-full w-full object-cover"
            use:setVideoStream={conf.localStream}
          />
        {:else}
          <div class="text-xs text-white/60">In Call</div>
        {/if}

        <div
          class="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/30"
        >
          <div class="opacity-0 transition-opacity hover:opacity-100">
            <svg class="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
          </div>
        </div>

        {#if conf?.participants}
          {@const participantCount = Array.from(conf.participants.values()).filter(
            (p) => p.hasJoined,
          ).length}
          {#if participantCount > 0}
            <div
              class="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white"
            >
              {participantCount} in call
            </div>
          {/if}
        {/if}
      </div>
    </ResizablePip>
  </div>
{/if}

<Toaster position="bottom-end" />

<Dialog title="Failed to Connect" open={isClientConnectionFailed}>
  <p>Failed to connect to Holochain.</p>

  <div class="mt-8 flex items-center justify-center">
    <Button on:click={() => window.location.reload()}>Relaunch App</Button>
  </div>
</Dialog>
