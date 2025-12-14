<script lang="ts">
  import Avatar from "$lib/Avatar.svelte";
  import type { CellIdB64, MessageExtended } from "$lib/types";
  import { t } from "$translations";
  import DOMPurify from "dompurify";
  import AgentNickname from "$lib/AgentNickname.svelte";

  export let messageExtended: MessageExtended;
  export let cellIdB64: CellIdB64;

  // Separate images from other files based on MIME type
  $: imageFiles = messageExtended.message.images.filter((file) =>
    file.file_type.startsWith("image/"),
  );
  $: otherFiles = messageExtended.message.images.filter(
    (file) => !file.file_type.startsWith("image/"),
  );
  $: hasImages = imageFiles.length > 0;
  $: hasFiles = otherFiles.length > 0;
</script>

<div class="mt-1 flex items-start justify-start space-x-2">
  <div class=" flex items-start justify-start space-x-1">
    <Avatar agentPubKeyB64={messageExtended.authorAgentPubKeyB64} {cellIdB64} size={14} />
    <AgentNickname {cellIdB64} agentPubKeyB64={messageExtended.authorAgentPubKeyB64} />
  </div>

  <div>{@html DOMPurify.sanitize(messageExtended.message.content)}</div>

  {#if hasImages || hasFiles}
    <div class="text-secondary-400 italic">
      ({#if hasImages}
        {$t("common.images", {
          count: imageFiles.length,
        })}
      {/if}
      {#if hasImages && hasFiles},
      {/if}
      {#if hasFiles}
        {$t("common.files", {
          count: otherFiles.length,
        })}
      {/if})
    </div>
  {/if}
</div>
