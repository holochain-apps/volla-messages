<script lang="ts">
  import { decode } from "@msgpack/msgpack";
  import { Base64 } from "js-base64";
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import { getContext } from "svelte";
  import { goto } from "$app/navigation";
  import Button from "$lib/Button.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { RelayClient } from "$store/RelayClient";
  import { RelayStore } from "$store/RelayStore";
  import type { Invitation } from "../../../types";

  const relayClientContext: { getClient: () => RelayClient } =
    getContext("relayClient");
  let relayClient = relayClientContext.getClient();

  const relayStoreContext: { getStore: () => RelayStore } =
    getContext("relayStore");
  let relayStore = relayStoreContext.getStore();

  let inviteCode = "";
  let joining = false;
  let error = false;

  async function joinConversation() {
    joining = true;
    try {
      const msgpack = Base64.toUint8Array(inviteCode);
      const invitation: Invitation = decode(msgpack) as Invitation;
      const conversation = await relayStore.joinConversation(invitation);
      if (conversation) {
        goto(`/conversations/${conversation.data.id}`);
        joining = false;
      } else {
        console.error(
          "Error joining conversation, couldn't create the conversation"
        );
        error = true;
        joining = false;
      }
    } catch (e) {
      error = true;
      joining = false;
      console.error("Error joining conversation", e);
    }
  }
</script>

<Header back title={$t("conversations.join_conversation")} />

<form on:submit|preventDefault={() => joinConversation()} class="contents">
  <div
    class="container mx-auto flex grow flex-col items-start justify-center px-10"
  >
    <h1 class="h1">{$t("conversations.enter_invite_code")}</h1>
    <input
      class="bg-surface-900 mt-2 w-full overflow-hidden text-ellipsis border-none pl-0.5 outline-none focus:outline-none focus:ring-0"
      type="text"
      placeholder="e.g. hLBjb252ZXJzYXRpb25OYW1lq0..."
      name="inviteCode"
      bind:value={inviteCode}
    />
    {#if error}
      <p class="text-error-500 mt-2 text-sm">
        {$t("conversations.error_joining")}
      </p>
    {/if}
  </div>

  <footer>
    <Button
      disabled={!inviteCode || joining}
      moreClasses="variant-filled-tertiary"
    >
      {#if joining}<SvgIcon icon="spinner" size="20" />{:else}<SvgIcon
          icon="newConversation"
          size="20"
        />{/if}
      <strong class="ml-2">{$t("conversations.join_conversation")}</strong>
    </Button>
  </footer>
</form>
