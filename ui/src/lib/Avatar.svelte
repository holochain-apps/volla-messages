<script lang="ts">
  import { decodeHashFromBase64, encodeHashToBase64, type AgentPubKey } from "@holochain/client";
  import { ProfilesStore } from "@holochain-open-dev/profiles";
  import { getContext } from "svelte";
  import "@holochain-open-dev/elements/dist/elements/holo-identicon.js";

  const profilesContext: { getStore: () => ProfilesStore } = getContext("profiles");
  const store = profilesContext.getStore();

  export let agentPubKey: AgentPubKey | string | null = null;
  export let image: string | undefined = undefined; // If image is passed in this will ignore the agentPubKey
  export let size: number = 32;
  export let namePosition = "row";
  export let showAvatar = true;
  export let showNickname = false;
  export let moreClasses = "";

  $: agentPubKey;
  $: agentPubKeyB64 = agentPubKey
    ? typeof agentPubKey === "string"
      ? agentPubKey
      : encodeHashToBase64(agentPubKey)
    : null;
  $: agentPubKeyHash =
    agentPubKey instanceof Uint8Array
      ? agentPubKey
      : agentPubKeyB64
        ? decodeHashFromBase64(agentPubKeyB64)
        : null;
  $: profile = agentPubKeyHash && store.profiles.get(agentPubKeyHash); // TODO: how to look in a specific cell
  $: nickname =
    $profile && agentPubKeyB64
      ? $profile.status == "complete" && $profile.value
        ? $profile.value.entry.fields.firstName + " " + $profile.value.entry.fields.lastName
        : agentPubKeyB64.slice(5, 9) + "..."
      : "";
</script>

<div class="avatar-{namePosition} {moreClasses}" title={showNickname ? "" : nickname}>
  {#if image}
    <div class="avatar-container" style="width: {size}px; height: {size}px">
      <img src={image} alt="avatar" width={size} height={size} />
    </div>
  {:else if $profile && $profile.status == "pending"}
    ...
  {:else if $profile && $profile.status == "complete" && $profile.value}
    {#if showAvatar}
      <div class="avatar-container" style="width: {size}px; height: {size}px">
        {#if $profile.value.entry.fields.avatar}
          <img src={$profile.value.entry.fields.avatar} alt="avatar" width={size} height={size} />
        {:else}
          <holo-identicon
            hash={agentPubKeyHash}
            {size}
            style={`width: ${size}px; height: ${size}px`}
            disableTooltip={true}
            disableCopy={true}
          ></holo-identicon>
        {/if}
      </div>
    {/if}
    {#if showNickname}
      <div class="nickname">{nickname}</div>
    {/if}
  {:else}
    <div class="avatar-container" style="width: {size}px; height: {size}px">
      <holo-identicon
        hash={agentPubKeyHash}
        {size}
        style={`width: ${size}px; height: ${size}px`}
        disableTooltip={true}
        disableCopy={true}
      ></holo-identicon>
    </div>
  {/if}
</div>

<style lang="scss">
  .avatar-column {
    align-items: center;
    display: flex;
    flex-direction: column;
  }
  .avatar-row {
    display: inline-flex;
    flex-direction: row;
    justify-content: center;
    position: relative;
    // height: 100%;
    align-items: start;
  }
  .avatar-row .nickname {
    margin-left: 0.5em;
  }
  .disable-ptr-events {
    pointer-events: none;
  }

  .avatar-container {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 150px; /* Set the desired width */
    height: 150px; /* Set the desired height */
    overflow: hidden;
    border-radius: 50%; /* Make the container circular */

    img {
      width: 100%;
      height: 100%;
      object-fit: cover; /* Ensure the image covers the container */
    }
  }
</style>
