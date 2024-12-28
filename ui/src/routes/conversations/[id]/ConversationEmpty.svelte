<script lang="ts">
  import Button from "$lib/Button.svelte";
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import SvgIcon from "../../../lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { Privacy } from "../../../types";
  import { goto } from "$app/navigation";
  import type { ConversationStore } from "$store/ConversationStore";
  import ButtonsCopyShare from "$lib/ButtonsCopyShare.svelte";

  // Silly hack to get around issues with typescript in sveltekit-i18n
  const tAny = t as any;

  export let conversationStore: ConversationStore;
</script>

<div class="flex h-full w-full flex-col items-center justify-center">
  <img
    src={$modeCurrent ? "/clear-skies-gray.png" : "/clear-skies-white.png"}
    alt="No contacts"
    class="mb-4 mt-4 h-32 w-32"
  />
  {#if $conversationStore.conversation.privacy === Privacy.Private}
    {#if conversationStore.getAllMembers().length === 1}
      <!-- A 1:1 conversation, so this is a pending connection -->
      <div
        class="bg-tertiary-500 dark:bg-secondary-500 mx-8 mb-3 flex flex-col items-center rounded-xl p-4"
      >
        <SvgIcon icon="handshake" size={36} color={$modeCurrent ? "%23232323" : "white"} />
        <h1 class="text-secondary-500 dark:text-tertiary-100 mt-2 text-xl font-bold">
          {$t("contacts.pending_connection_header")}
        </h1>
        <p class="text-secondary-400 dark:text-tertiary-700 mb-6 mt-4 text-center text-sm">
          {$tAny("contacts.pending_connection_description", {
            name: conversationStore.getTitle(),
          })}
        </p>
        {#await conversationStore.makeInviteCodeForAgent(conversationStore.getAllMembers()[0].publicKeyB64) then res}
          <div class="flex justify-center">
            <ButtonsCopyShare
              text={res}
              copyLabel={$t("contacts.copy_invite_code")}
              shareLabel={$t("contacts.share_invite_code")}
            />
          </div>
        {/await}
      </div>
    {:else}
      <p class="text-secondary-500 dark:text-tertiary-500 mx-10 mb-8 text-center text-xs">
        {$t("conversations.share_personal_invitations")}
      </p>
      <Button
        on:click={() =>
          goto(`/conversations/${$conversationStore.conversation.dnaHashB64}/details`)}
        moreClasses="w-72 justify-center"
      >
        <SvgIcon icon="ticket" size={24} color={$modeCurrent ? "white" : "%23FD3524"} />
        <strong class="ml-2">{$t("conversations.send_invitations")}</strong>
      </Button>
    {/if}
  {:else}
    <!-- Public conversation, make it easy to copy invite code-->
    <p class="text-secondary-500 dark:text-tertiary-700 mx-10 mb-8 text-center text-xs">
      {$t("conversations.share_invitation_code_msg")}
    </p>

    <div class="mb-8">
      <ButtonsCopyShare
        text={$conversationStore.publicInviteCode}
        copyLabel={$t("conversations.copy_invite_code")}
        shareLabel={$t("conversations.share_invite_code")}
      />
    </div>
  {/if}
</div>
