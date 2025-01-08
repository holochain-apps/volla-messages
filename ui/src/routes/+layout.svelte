<script lang="ts">
  import type { AppClient, CellId } from "@holochain/client";
  import { AppWebsocket, CellType, encodeHashToBase64 } from "@holochain/client";
  import { onMount, setContext } from "svelte";
  import { t } from "$translations";
  import { createSignalHandler } from "$store/SignalHandler";
  import toast, { Toaster } from "svelte-french-toast";
  import { handleLinkClick, initLightDarkModeSwitcher } from "$lib/utils";
  import { RelayClient } from "$store/RelayClient";
  import AppLanding from "$lib/AppLanding.svelte";
  import { MIN_FIRST_NAME_LENGTH, ROLE_NAME, ZOME_NAME } from "$config";
  import { goto } from "$app/navigation";
  import Button from "$lib/Button.svelte";
  import ProfileSetupName from "./ProfileSetupName.svelte";
  import ProfileSetupAvatar from "./ProfileSetupAvatar.svelte";
  import { ProfileCreateStore } from "$store/ProfileCreateStore";
  import { createContactStore, type ContactStore } from "$store/ContactStore";
  import { type ProfileStore, createProfileStore } from "$store/ProfileStore";
  import { encodeCellIdToBase64 } from "$lib/utils";
  import {
    createMergedProfileContactStore,
    type MergedProfileContactStore,
  } from "$store/MergedProfileContactStore";
  import { createConversationStore, type ConversationStore } from "$store/ConversationStore";
  import {
    createConversationTitleStore,
    type ConversationTitleStore,
  } from "$store/ConversationTitleStore";
  import "../app.postcss";

  let client: AppClient;
  let profileStore: ProfileStore;
  let contactStore: ContactStore;
  let mergedProfileContactStore: MergedProfileContactStore;
  let conversationStore: ConversationStore;
  let conversationTitleStore: ConversationTitleStore;
  let provisionedRelayCellId: CellId;

  // Is the holochain client connected?
  let isClientConnected = false;

  // Are the frontend stores initialized?
  let isStoresSetup = false;

  // Has the user clicked the "create account" button?
  let isUserCreatingProfile = false;

  $: myProfile =
    profileStore &&
    provisionedRelayCellId &&
    $profileStore[encodeCellIdToBase64(provisionedRelayCellId)]
      ? $profileStore[encodeCellIdToBase64(provisionedRelayCellId)][
          encodeHashToBase64(client.myPubKey)
        ]
      : undefined;
  $: myProfileExists = myProfile !== undefined;

  $: if (myProfileExists && conversationStore) {
    gotoAppPage();
  }

  async function gotoAppPage() {
    if (Object.keys($conversationStore).length > 0) {
      await goto("/conversations");
    }
    await goto("/welcome");
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
        (c) => CellType.Provisioned in c,
      );
      if (provisionedRelayCellInfo === undefined)
        throw new Error("Failed to get CellInfo for cell 'relay'");
      provisionedRelayCellId = provisionedRelayCellInfo[CellType.Provisioned].cell_id;

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
      contactStore = createContactStore(relayClient);
      profileStore = createProfileStore(relayClient);
      mergedProfileContactStore = createMergedProfileContactStore(profileStore, contactStore);
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
    await initHolochainClient();
    await initStores();

    connected = true;
  }

  onMount(() => {
    setupApp();

    initLightDarkModeSwitcher();
    document.addEventListener("click", handleLinkClick);
    return () => {
      document.removeEventListener("click", handleLinkClick);
    };
  });

  setContext("myPubKey", {
    getMyPubKey: () => client.myPubKey,
    getMyPubKeyB64: () => encodeHashToBase64(client.myPubKey),
  });

  setContext("profileStore", {
    getStore: () => profileStore,
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

  setContext("provisionedRelayCellId", {
    getCellId: () => provisionedRelayCellId,
    getCellIdB64: () => encodeCellIdToBase64(provisionedRelayCellId),
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
  {:else if isClientConnected && isStoresSetup && !myProfileExists && isUserCreatingProfile && $ProfileCreateStore.firstName === ""}
    <ProfileSetupName />
  {:else if isClientConnected && isStoresSetup && !myProfileExists && isUserCreatingProfile && $ProfileCreateStore.firstName.length >= MIN_FIRST_NAME_LENGTH}
    <ProfileSetupAvatar />
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
