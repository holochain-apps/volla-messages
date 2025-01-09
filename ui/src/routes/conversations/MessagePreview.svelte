<script lang="ts">
  import type { CellIdB64, MessageExtended } from "$lib/types";
  import { deriveCellMergedProfileContactInviteStore } from "$store/MergedProfileContactInviteStore";
  import type { ProfileStore } from "$store/ProfileStore";
  import { t } from "$translations";
  import DOMPurify from "dompurify";
  import { getContext } from "svelte";

  const profileStore = getContext<{ getStore: () => ProfileStore }>("profileStore").getStore();

  export let messageExtended: MessageExtended;
  export let cellIdB64: CellIdB64;

  let profile = deriveCellMergedProfileContactInviteStore(profileStore, cellIdB64);
</script>

<div class="flex items-center justify-start space-x-1">
  {#if $profile[messageExtended.authorAgentPubKeyB64] !== undefined}
    <div>{$profile[messageExtended.authorAgentPubKeyB64].profile.nickname}:</div>
  {/if}

  <div>{@html DOMPurify.sanitize(messageExtended.message.content)}</div>

  {#if messageExtended.message.images.length > 0}
    <div class="text-secondary-400 italic">
      ({$t("common.images", {
        count: messageExtended.message.images.length,
      })})
    </div>
  {/if}
</div>
