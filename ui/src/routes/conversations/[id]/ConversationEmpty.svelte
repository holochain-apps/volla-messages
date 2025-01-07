<script lang="ts">
  import { t } from "$translations";
  import { Privacy, type CellIdB64 } from "$lib/types";
  import { deriveCellConversationStore, type ConversationStore } from "$store/ConversationStore";
  import ButtonsCopyShare from "$lib/ButtonsCopyShare.svelte";
  import { getContext } from "svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { type ProfileStore, deriveCellProfileStore } from "$store/ProfileStore";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import {
    deriveCellMergedProfileContactListStore,
    type MergedProfileContactStore,
  } from "$store/MergedProfileContactStore";
  import { page } from "$app/stores";

  // Silly hack to get around issues with typescript in sveltekit-i18n
  const tAny = t as any;

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();
  const mergedProfileContactStore = getContext<{ getStore: () => MergedProfileContactStore }>(
    "mergedProfileContactStore",
  ).getStore();
  const profileStore = getContext<{ getStore: () => ProfileStore }>("profileStore").getStore();
  const provisionedRelayCellIdB64 = getContext<{ getCellIdB64: () => CellIdB64 }>(
    "provisionedRelayCellId",
  ).getCellIdB64();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();
  let mergedProfileContactList = deriveCellMergedProfileContactListStore(
    mergedProfileContactStore,
    $page.params.id,
    myPubKeyB64,
  );

  export let cellIdB64: CellIdB64;

  let conversation = deriveCellConversationStore(conversationStore, cellIdB64);
  let profiles = deriveCellProfileStore(profileStore, provisionedRelayCellIdB64);
  $: invitationTitle =
    $mergedProfileContactList.length === 1
      ? `${$profiles[myPubKeyB64].profile.nickname}`
      : `${$profiles[myPubKeyB64].profile.nickname} + ${$mergedProfileContactList.length - 1}`;
</script>

<div class="flex h-full w-full flex-col items-center justify-center">
  <div
    class="bg-clearSkiesGray dark:bg-clearSkiesWhite mb-4 mt-4 h-32 w-32 bg-contain bg-center bg-no-repeat"
  ></div>

  {#if $conversation.conversation.dnaProperties.privacy === Privacy.Private}
    <div
      class="bg-tertiary-500 dark:bg-secondary-500 mx-8 mb-3 flex flex-col items-center rounded-xl p-4"
    >
      <SvgIcon icon="handshake" moreClasses="w-[36px] h-[36px]" />
      <h1 class="text-secondary-500 dark:text-tertiary-100 mt-2 text-xl font-bold">
        {$t("contacts.pending_connection_header")}
      </h1>
      <p class="text-secondary-400 dark:text-tertiary-700 mb-6 mt-4 text-center text-sm">
        {$tAny("contacts.pending_connection_description", {
          name: $conversation.conversation.title,
        })}
      </p>

      {#await conversation.makePrivateInviteCode($conversation.conversation.invited[0], invitationTitle) then text}
        <div class="flex justify-center">
          <ButtonsCopyShare
            moreClasses="bg-tertiary-600 dark:bg-secondary-700"
            {text}
            copyLabel={$t("contacts.copy_invite_code")}
            shareLabel={$t("contacts.share_invite_code")}
          />
        </div>
      {/await}
    </div>
  {:else if $conversation.conversation.dnaProperties.privacy === Privacy.Public && $conversation.conversation.publicInviteCode}
    <p class="text-secondary-500 dark:text-tertiary-700 mx-10 mb-8 text-center text-xs">
      {$t("conversations.share_invitation_code_msg")}
    </p>

    <div class="mb-8">
      <ButtonsCopyShare
        text={$conversation.conversation.publicInviteCode}
        copyLabel={$t("conversations.copy_invite_code")}
        shareLabel={$t("conversations.share_invite_code")}
      />
    </div>
  {/if}
</div>
