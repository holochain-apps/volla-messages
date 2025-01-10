<script lang="ts">
  import type { AgentPubKeyB64 } from "@holochain/client";
  import type { CellIdB64 } from "./types";
  import { type ConversationStore, deriveCellConversationStore } from "$store/ConversationStore";
  import { t } from "$translations";
  import { getContext } from "svelte";
  import ButtonsCopyShare from "./ButtonsCopyShare.svelte";
  import SvgIcon from "./SvgIcon.svelte";
  import {
    type ConversationTitleStore,
    deriveCellConversationTitleStore,
  } from "$store/ConversationTitleStore";
  import {
    type MergedProfileContactInviteStore,
    deriveCellMergedProfileContactInviteStore,
  } from "$store/MergedProfileContactInviteStore";
  import type { CellProfileStore } from "$store/ProfileStore";

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();
  const conversationTitleStore = getContext<{ getStore: () => ConversationTitleStore }>(
    "conversationTitleStore",
  ).getStore();
  const mergedProfileContactInviteStore = getContext<{
    getStore: () => MergedProfileContactInviteStore;
  }>("mergedProfileContactInviteStore").getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();
  const provisionedRelayCellProfileStore = getContext<{
    getProvisionedRelayCellProfileStore: () => CellProfileStore;
  }>("profileStore").getProvisionedRelayCellProfileStore();

  export let cellIdB64: CellIdB64;
  export let agentPubKeyB64: AgentPubKeyB64;

  let conversation = deriveCellConversationStore(conversationStore, cellIdB64);
  let conversationTitle = deriveCellConversationTitleStore(conversationTitleStore, cellIdB64);
  let mergedProfileContact = deriveCellMergedProfileContactInviteStore(
    mergedProfileContactInviteStore,
    cellIdB64,
    myPubKeyB64,
  );
  $: myProfile = $provisionedRelayCellProfileStore.data[myPubKeyB64];

  $: invitationTitle =
    $mergedProfileContact.count <= 2
      ? myProfile.profile.nickname
      : `${myProfile.profile.nickname} + ${$mergedProfileContact.count - 1}`;
</script>

{#await conversation.makePrivateInviteCode(agentPubKeyB64, invitationTitle) then text}
  <div
    class="bg-tertiary-500 dark:bg-secondary-500 mx-8 mb-3 flex flex-col items-center rounded-xl p-4"
  >
    <SvgIcon icon="handshake" moreClasses="w-[36px] h-[36px]" />
    <h1 class="text-secondary-500 dark:text-tertiary-100 mt-2 text-xl font-bold">
      {$t("common.pending_connection_header")}
    </h1>
    <p class="text-secondary-400 dark:text-tertiary-700 mb-6 mt-4 text-center text-sm">
      {$t("common.pending_connection_description", {
        name: $conversationTitle,
      })}
    </p>

    <div class="flex justify-center">
      <ButtonsCopyShare
        moreClasses="bg-tertiary-600 dark:bg-secondary-700"
        {text}
        copyLabel={$t("common.copy_invite_code")}
        shareLabel={$t("common.share_invite_code")}
      />
    </div>
  </div>
{/await}
