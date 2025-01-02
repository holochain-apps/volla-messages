<script lang="ts">
  import type { AppClient } from "@holochain/client";
  import { AppWebsocket, encodeHashToBase64 } from "@holochain/client";
  import { ProfilesClient, ProfilesStore } from "@holochain-open-dev/profiles";
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

  let client: AppClient;
  let relayStore: RelayStore;
  let profilesStore: ProfilesStore | undefined = undefined;
  let contactStore: ContactStore;
  let connected = false;
  let readyToCreateProfile = false;

  $: myProfile = profilesStore ? profilesStore.myProfile : undefined;
  $: myProfileExists =
    $myProfile && $myProfile.status == "complete" && $myProfile.value !== undefined;

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
      console.log("Relay cell ready. App Info is ", appInfo);

      // Setup stores
      profilesStore = new ProfilesStore(new ProfilesClient(client, ROLE_NAME));
      const relayClient = new RelayClient(client, profilesStore, ROLE_NAME, ZOME_NAME);
      contactStore = createContactStore(relayClient);
      relayStore = new RelayStore(relayClient);
      await relayStore.initialize();

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

  setContext("profiles", {
    getStore: () => profilesStore,
  });

  setContext("relayStore", {
    getStore: () => relayStore,
  });

  setContext("contactStore", {
    getStgore: () => contactStore,
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
