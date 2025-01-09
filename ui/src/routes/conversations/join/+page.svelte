<script lang="ts">
  import { decode } from "@msgpack/msgpack";
  import { Base64 } from "js-base64";
  import { getContext } from "svelte";
  import { goto } from "$app/navigation";
  import Button from "$lib/Button.svelte";
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import type { Invitation } from "$lib/types";
  import type { ConversationStore } from "$store/ConversationStore";
  import { encodeHashToBase64 } from "@holochain/client";

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();

  let inviteCode = "";
  let joining = false;
  let error = false;

  async function joinConversation() {
    joining = true;
    try {
      const msgpack = Base64.toUint8Array(inviteCode);
      const invitation: Invitation = decode(msgpack) as Invitation;
      const cellIdB64 = await conversationStore.join(invitation);

      goto(`/conversations/${cellIdB64}`);
    } catch (e) {
      error = true;
      console.error("Error joining conversation", e);
    }

    joining = false;
  }
</script>

<Header back title={$t("common.join_conversation")} />

<form on:submit|preventDefault={() => joinConversation()} class="contents">
  <div class="mx-auto flex w-full grow flex-col items-start justify-center px-10">
    <h1 class="h1">{$t("common.enter_invite_code")}</h1>
    <input
      class="bg-surface-900 mt-2 w-full overflow-hidden text-ellipsis border-none pl-0.5 outline-none focus:outline-none focus:ring-0"
      type="text"
      placeholder="e.g. hLBjb252ZXJzYXRpb25OYW1lq0..."
      name="inviteCode"
      bind:value={inviteCode}
    />
    {#if error}
      <p class="text-error-500 mt-2 text-sm">
        {$t("common.error_joining")}
      </p>
    {/if}
  </div>

  <div class="my-8">
    <Button disabled={!inviteCode || joining} loading={joining} icon="newConversation">
      {$t("common.join_conversation")}
    </Button>
  </div>
</form>
