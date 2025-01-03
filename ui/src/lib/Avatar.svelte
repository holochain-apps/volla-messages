<script lang="ts">
  import { decodeHashFromBase64, type AgentPubKeyB64, type CellId } from "@holochain/client";
  import { getContext } from "svelte";
  import "@holochain-open-dev/elements/dist/elements/holo-identicon.js";
  import { encodeCellIdToBase64 } from "$lib/utils";
  import {
    deriveCellMergedProfileContactStore,
    type MergedProfileContactStore,
  } from "$store/MergedProfileContactStore";

  const mergedProfileContactStore = getContext<{ getStore: () => MergedProfileContactStore }>(
    "mergedProfileContactStore",
  ).getStore();
  const provisionedRelayCellId = getContext<{ getCellId: () => CellId }>(
    "provisionedRelayCellId",
  ).getCellId();

  export let cellId: CellId = provisionedRelayCellId;
  export let agentPubKeyB64: AgentPubKeyB64;

  export let size: number = 32;
  export let namePosition = "row";
  export let moreClasses = "";

  $: profiles = deriveCellMergedProfileContactStore(
    mergedProfileContactStore,
    encodeCellIdToBase64(cellId),
  );
  $: profileExtended = $profiles ? $profiles[agentPubKeyB64] : undefined;
  $: title = profileExtended ? profileExtended.profile.nickname : "";
</script>

<div class="avatar-{namePosition} {moreClasses}" {title}>
  {#if profileExtended && profileExtended.profile.fields.avatar}
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
