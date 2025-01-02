<script lang="ts">
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import type { ConversationStore } from "$store/ConversationStore";
  import ButtonsCopyShare from "$lib/ButtonsCopyShare.svelte";

  // Silly hack to get around issues with typescript in sveltekit-i18n
  const tAny = t as any;

  export let conversationStore: ConversationStore;
</script>

<div
  class="bg-tertiary-500 dark:bg-secondary-500 mx-8 mb-3 flex flex-col items-center rounded-xl p-4"
>
  <SvgIcon icon="handshake" moreClasses="w-[36px] h-[36px]" />
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
        moreClasses="bg-tertiary-600 dark:bg-secondary-700"
        text={res}
        copyLabel={$t("contacts.copy_invite_code")}
        shareLabel={$t("contacts.share_invite_code")}
      />
    </div>
  {/await}
</div>
