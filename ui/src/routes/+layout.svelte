<script lang="ts">
  import type { AppClient, CellId } from "@holochain/client";
  import { AppWebsocket, CellType, encodeHashToBase64 } from "@holochain/client";
  import { onMount, setContext } from "svelte";
  import { t } from "$translations";
  import { RelayStore } from "$store/RelayStore";
  import toast, { Toaster } from "svelte-french-toast";
  import { handleLinkClick, initLightDarkModeSwitcher } from "$lib/utils";
  import { RelayClient } from "$store/RelayClient";
  import AppLanding from "$lib/AppLanding.svelte";
  import { MIN_FIRST_NAME_LENGTH, ROLE_NAME, ZOME_NAME } from "$config";
  import "../app.postcss";
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

  let client: AppClient;
  let relayStore: RelayStore;
  let profileStore: ProfileStore;
  let contactStore: ContactStore;
  let mergedProfileContactStore: MergedProfileContactStore;
  let provisionedRelayCellId: CellId;
  let connected = false;
  let readyToCreateProfile = false;

  $: myProfile =
    profileStore &&
    provisionedRelayCellId &&
    $profileStore[encodeCellIdToBase64(provisionedRelayCellId)]
      ? $profileStore[encodeCellIdToBase64(provisionedRelayCellId)][
          encodeHashToBase64(client.myPubKey)
        ]
      : undefined;
  $: myProfileExists = myProfile !== undefined;

  $: if (myProfileExists && relayStore) {
    gotoAppPage();
  }

  async function gotoAppPage() {
    if (relayStore.conversations.length > 0) {
      await goto("/conversations");
    }
    await goto("/welcome");
  }

  async function initHolochain() {
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

      // Setup stores
      const relayClient = new RelayClient(client, provisionedRelayCellId);
      contactStore = createContactStore(relayClient);
      profileStore = createProfileStore(relayClient);
      mergedProfileContactStore = createMergedProfileContactStore(profileStore, contactStore);

      relayStore = new RelayStore(relayClient);

      // Initialize store data
      await contactStore.initialize();
      await profileStore.initialize();
      await relayStore.initialize();

      // Setup complete
      connected = true;
      console.log("Connected");
    } catch (e) {
      console.error("Failed to init holochain", e);
      toast.error(`${$t("common.holochain_connect_error")}: ${e.message}`);
    }
  }

  onMount(() => {
    initLightDarkModeSwitcher();
    initHolochain();

    document.addEventListener("click", handleLinkClick);
    return () => {
      document.removeEventListener("click", handleLinkClick);
    };
  });

  setContext("myPubKey", {
    getMyPubKey: () => client.myPubKey,
    getMyPubKeyB64: () => encodeHashToBase64(client.myPubKey),
  });

  setContext("relayStore", {
    getStore: () => relayStore,
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

  setContext("provisionedRelayCellId", {
    getCellId: () => provisionedRelayCellId,
  });
</script>

<div class="mx-auto flex h-screen w-full max-w-screen-lg flex-col items-center">
  {#if connected && myProfileExists}
    <slot />
  {:else if connected && !myProfileExists && !readyToCreateProfile}
    <AppLanding>
      <Button icon="lock" on:click={() => (readyToCreateProfile = true)} moreClasses="!font-normal">
        {$t("common.create_an_account")}
      </Button>
    </AppLanding>
  {:else if connected && !myProfileExists && readyToCreateProfile && $ProfileCreateStore.firstName === ""}
    <ProfileSetupName />
  {:else if connected && !myProfileExists && readyToCreateProfile && $ProfileCreateStore.firstName.length >= MIN_FIRST_NAME_LENGTH}
    <ProfileSetupAvatar />
  {:else}
    <AppLanding>
      {$t("common.connecting_to_holochain")}
    </AppLanding>
  {/if}
</div>

<Toaster position="bottom-end" />
