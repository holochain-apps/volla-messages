<script lang="ts">
  import type { AgentPubKeyB64, AppClient, CellId } from "@holochain/client";
  import { AppWebsocket, CellType, encodeHashToBase64 } from "@holochain/client";
  import { onDestroy, onMount, setContext } from "svelte";
  import { t } from "$translations";
  import { createSignalHandler } from "$store/SignalHandler";
  import toast, { Toaster } from "svelte-french-toast";
  import { handleLinkClick, initLightDarkModeSwitcher } from "$lib/utils";
  import { RelayClient } from "$store/RelayClient";
  import AppLanding from "$lib/AppLanding.svelte";
  import { MIN_FIRST_NAME_LENGTH, ROLE_NAME, ZOME_NAME } from "$config";
  import Button from "$lib/Button.svelte";
  import ProfileSetupName from "./ProfileSetupName.svelte";
  import ProfileSetupAvatar from "./ProfileSetupAvatar.svelte";
  import { createContactStore, type ContactStore } from "$store/ContactStore";
  import {
    CellProfileStore,
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

  // Holochain client
  let client: AppClient;
  let provisionedRelayCellId: CellId;
  let provisionedRelayCellIdB64: CellIdB64;
  let myPubKeyB64: AgentPubKeyB64;

  // Frontend store singletons
  let profileStore: ProfileStore;
  let contactStore: ContactStore;
  let mergedProfileContactStore: MergedProfileContactInviteStore;
  let conversationStore: ConversationStore;
  let conversationTitleStore: ConversationTitleStore;
  let inviteStore: InviteStore;
  let provisionedRelayCellProfileStore: CellProfileStore;

  // Is the holochain client connected?
  let isClientConnected = false;

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
        (c) => CellType.Provisioned in c,
      );
      if (provisionedRelayCellInfo === undefined)
        throw new Error("Failed to get CellInfo for cell 'relay'");
      provisionedRelayCellId = provisionedRelayCellInfo[CellType.Provisioned].cell_id;
      provisionedRelayCellIdB64 = encodeCellIdToBase64(provisionedRelayCellId);

      isClientConnected = true;
      console.log("Connected");
    } catch (e) {
      console.error("Failed to init holochain", e);
      toast.error(`${$t("common.holochain_connect_error")}: ${e}`);
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
      mergedProfileContactStore = createMergedProfileContactInviteStore(
        profileStore,
        contactStore,
        inviteStore,
      );
      conversationStore = createConversationStore(relayClient, mergedProfileContactStore);
      conversationTitleStore = createConversationTitleStore(
        conversationStore,
        mergedProfileContactStore,
        encodeHashToBase64(client.myPubKey),
      );

      // Initialize store data
      await contactStore.initialize();
      await profileStore.initialize();
      await conversationStore.initialize();

      // Initialize signal handler
      createSignalHandler(relayClient, conversationStore);

      isStoresSetup = true;
    } catch (e) {
      console.error("Failed to init stores", e);
      toast.error(`${$t("common.stores_setup_error")}: ${e}`);
    }
  }

  async function setupApp() {
    initLightDarkModeSwitcher();
    document.addEventListener("click", handleLinkClick);

    await initHolochainClient();
    await initStores();
  }

  onMount(setupApp);

  onDestroy(() => {
    document.removeEventListener("click", handleLinkClick);
  });

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

  setContext("mergedProfileContactStore", {
    getStore: () => mergedProfileContactStore,
  });

  setContext("conversationStore", {
    getStore: () => conversationStore,
  });

  setContext("conversationTitleStore", {
    getStore: () => conversationTitleStore,
  });

  setContext("inviteStore", {
    getStore: () => inviteStore,
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

<Toaster position="bottom-end" />
