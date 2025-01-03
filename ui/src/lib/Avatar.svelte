<script lang="ts">
  import { decodeHashFromBase64, type AgentPubKeyB64, type CellId } from "@holochain/client";
  import { getContext } from "svelte";
  import "@holochain-open-dev/elements/dist/elements/holo-identicon.js";
  import type { ProfileStore } from "$store/ProfileStore";
  import { encodeCellIdToBase64 } from "$store/GenericCellIdAgentStore";

  const profileStore = getContext<{ getStore: () => ProfileStore }>("profileStore").getStore();
  const provisionedRelayCellId = getContext<{ getCellId: () => CellId }>(
    "provisionedRelayCellId",
  ).getCellId();

  export let cellId: CellId = provisionedRelayCellId;
  export let agentPubKeyB64: AgentPubKeyB64;

  export let size: number = 32;
  export let namePosition = "row";
  export let moreClasses = "";

  $: profileExtended = $profileStore[encodeCellIdToBase64(cellId)][agentPubKeyB64];
</script>

<div class="avatar-{namePosition} {moreClasses}" title={profileExtended.profile.nickname}>
  {#if profileExtended.profile.fields.avatar}
    <div
      class="flex h-[150px] w-[150px] items-center justify-center overflow-hidden rounded-full"
      style="width: {size}px; height: {size}px"
    >
      <img
        src={profileExtended.profile.fields.avatar}
        alt="avatar"
        width={size}
        height={size}
        class="h-full w-full object-cover"
      />
    </div>
  {:else}
    <holo-identicon
      hash={decodeHashFromBase64(agentPubKeyB64)}
      {size}
      style={`width: ${size}px; height: ${size}px`}
      disableTooltip={true}
      disableCopy={true}
    ></holo-identicon>
  {/if}
</div>
