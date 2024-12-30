<script lang="ts">
  import Avatar from "$lib/Avatar.svelte";
  import { type ConversationStore } from "$store/ConversationStore";

  export let conversationStore: ConversationStore;
</script>

{#each conversationStore.getAllMembers().slice(0, 2) as profile, i}
  {#if profile}
    <Avatar
      image={profile.profile.fields.avatar}
      agentPubKey={profile.publicKeyB64}
      size={120}
      moreClasses="mb-5"
    />
  {/if}
{/each}

{#if conversationStore.getAllMembers().length > 2}
  <div
    class="variant-filled-tertiary mb-5 flex h-10 min-h-10 w-10 items-center justify-center rounded-full"
  >
    <span class="text-xl">+{conversationStore.getAllMembers().length - 2}</span>
  </div>
{/if}
