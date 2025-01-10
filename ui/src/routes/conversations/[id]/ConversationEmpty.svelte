<script lang="ts">
  import { t } from "$translations";
  import { Privacy, type CellIdB64 } from "$lib/types";
  import { deriveCellConversationStore, type ConversationStore } from "$store/ConversationStore";
  import ButtonsCopyShare from "$lib/ButtonsCopyShare.svelte";
  import { getContext } from "svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { type CellProfileStore } from "$store/ProfileStore";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import {
    deriveCellMergedProfileContactInviteStore,
    type MergedProfileContactInviteStore,
  } from "$store/MergedProfileContactInviteStore";
  import { page } from "$app/stores";
  import {
    deriveCellConversationTitleStore,
    type ConversationTitleStore,
  } from "$store/ConversationTitleStore";
  import { deriveCellInviteStore, type InviteStore } from "$store/InviteStore";
  import NoticeContactNotJoined from "$lib/NoticeContactNotJoined.svelte";

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();
  const provisionedRelayCellProfileStore = getContext<{
    getProvisionedRelayCellProfileStore: () => CellProfileStore;
  }>("profileStore").getProvisionedRelayCellProfileStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  const inviteStore = getContext<{ getStore: () => InviteStore }>("inviteStore").getStore();

  export let cellIdB64: CellIdB64;

  let conversation = deriveCellConversationStore(conversationStore, cellIdB64);
  let invite = deriveCellInviteStore(inviteStore, cellIdB64);

  $: myProfile = $provisionedRelayCellProfileStore.data[myPubKeyB64];
</script>

<div class="flex h-full w-full flex-col items-center justify-center">
  <div
    class="bg-clearSkiesGray dark:bg-clearSkiesWhite mb-4 mt-4 h-32 w-32 bg-contain bg-center bg-no-repeat"
  ></div>

  {#if $conversation.dnaProperties.privacy === Privacy.Private}
    {#if $invite.length > 0}
      <NoticeContactNotJoined {cellIdB64} agentPubKeyB64={$invite[0]} />
    {/if}
  {:else if $conversation.dnaProperties.privacy === Privacy.Public && $conversation.publicInviteCode}
    <p class="text-secondary-500 dark:text-tertiary-700 mx-10 mb-8 text-center text-xs">
      {$t("common.share_invitation_code_msg")}
    </p>

    <div class="mb-8">
      <ButtonsCopyShare
        text={$conversation.publicInviteCode}
        copyLabel={$t("common.copy_invite_code")}
        shareLabel={$t("common.share_invite_code")}
      />
    </div>
  {/if}
</div>
