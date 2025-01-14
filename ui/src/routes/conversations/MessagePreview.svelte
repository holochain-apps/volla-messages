<script lang="ts">
  import Avatar from "$lib/Avatar.svelte";
  import type { CellIdB64, MessageExtended } from "$lib/types";
  import { t } from "$translations";
  import DOMPurify from "dompurify";
  import AgentNickname from "$lib/AgentNickname.svelte";

  export let messageExtended: MessageExtended;
  export let cellIdB64: CellIdB64;
</script>

<div class="flex items-start justify-start space-x-2 mt-1">
  <div class=" flex items-start justify-start space-x-1">
    <Avatar agentPubKeyB64={messageExtended.authorAgentPubKeyB64} {cellIdB64} size={14} />
    <AgentNickname cellIdB64={cellIdB64} agentPubKeyB64={messageExtended.authorAgentPubKeyB64} />
  </div>

  <div>{@html DOMPurify.sanitize(messageExtended.message.content)}</div>

  {#if messageExtended.message.images.length > 0}
    <div class="text-secondary-400 italic">
      ({$t("common.images", {
        count: messageExtended.message.images.length,
      })})
    </div>
  {/if}
</div>
