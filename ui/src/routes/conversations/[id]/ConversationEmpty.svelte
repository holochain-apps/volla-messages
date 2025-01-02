<script lang="ts">
  import { t } from "$translations";
  import { Privacy } from "$lib/types";
  import type { ConversationStore } from "$store/ConversationStore";
  import ButtonsCopyShare from "$lib/ButtonsCopyShare.svelte";
  import NoticePendingConnection from "$lib/NoticePendingConnection.svelte";

  // Silly hack to get around issues with typescript in sveltekit-i18n
  const tAny = t as any;

  export let conversationStore: ConversationStore;
</script>

<div class="flex h-full w-full flex-col items-center justify-center">
  <div
    class="bg-clearSkiesGray dark:bg-clearSkiesWhite mb-4 mt-4 h-32 w-32 bg-contain bg-center bg-no-repeat"
  ></div>
  {#if $conversationStore.conversation.privacy === Privacy.Private && conversationStore.getAllMembers().length === 1}
    <NoticePendingConnection {conversationStore} />
  {:else if $conversationStore.conversation.privacy === Privacy.Public}
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
