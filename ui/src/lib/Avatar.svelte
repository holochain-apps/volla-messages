<script lang="ts">
  import { decodeHashFromBase64, type AgentPubKeyB64, type CellId } from "@holochain/client";
  import { getContext } from "svelte";
  import "@holochain-open-dev/elements/dist/elements/holo-identicon.js";
  import {
    deriveCellMergedProfileContactInviteStore,
    type MergedProfileContactInviteStore,
  } from "$store/MergedProfileContactInviteStore";
  import { type CellIdB64 } from "./types";

  const mergedProfileContactInviteStore = getContext<{
    getStore: () => MergedProfileContactInviteStore;
  }>("mergedProfileContactInviteStore").getStore();
  const provisionedRelayCellIdB64 = getContext<{ getCellIdB64: () => CellIdB64 }>(
    "provisionedRelayCellId",
  ).getCellIdB64();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  export let cellIdB64: CellIdB64 = provisionedRelayCellIdB64;
  export let agentPubKeyB64: AgentPubKeyB64;

  export let size: number = 32;
  export let namePosition = "row";
  export let moreClasses = "";

  let profiles = deriveCellMergedProfileContactInviteStore(
    mergedProfileContactInviteStore,
    cellIdB64,
    myPubKeyB64,
  );

  $: profile = $profiles.data[agentPubKeyB64];
  $: title = profile ? profile.profile.nickname : "";
</script>

<div class="avatar-{namePosition} {moreClasses}" {title}>
  {#if profile && profile.profile.fields.avatar}
    <div
      class="flex h-[150px] w-[150px] items-center justify-center overflow-hidden rounded-full"
      style="width: {size}px; height: {size}px"
    >
      <img
        src={profile.profile.fields.avatar}
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
