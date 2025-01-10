<script lang="ts">
  import { getContext } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import { Privacy } from "$lib/types";
  import toast from "svelte-french-toast";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import InputSearch from "$lib/InputSearch.svelte";
  import InputContactsSelect from "$lib/InputContactsSelect.svelte";
  import { deriveCellConversationStore, type ConversationStore } from "$store/ConversationStore";
  import {
    deriveCellMergedProfileContactInviteStore,
    type MergedProfileContactInviteStore,
  } from "$store/MergedProfileContactInviteStore";
  import { uniq } from "lodash-es";
  import { deriveCellInviteStore, type InviteStore } from "$store/InviteStore";

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();
  const mergedProfileContactInviteStore = getContext<{
    getStore: () => MergedProfileContactInviteStore;
  }>("mergedProfileContactInviteStore").getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();
  const inviteStore = getContext<{ getStore: () => InviteStore }>("inviteStore").getStore();

  let conversation = deriveCellConversationStore(conversationStore, $page.params.id);
  let profiles = deriveCellMergedProfileContactInviteStore(
    mergedProfileContactInviteStore,
    $page.params.id,
    myPubKeyB64,
  );
  let invite = deriveCellInviteStore(inviteStore, $page.params.id);

  let searchQuery = "";
  let saving = false;

  $: conversationMemberAgentPubKeyB64s = uniq([...$invite, ...$profiles.list.map(([a]) => a)]);

  async function inviteContacts(selectedContacts: AgentPubKeyB64[]) {
    if (selectedContacts.length === 0) return;

    saving = true;
    try {
      await invite.invite(selectedContacts);
      await goto(`/conversations/${$page.params.id}/details`);
    } catch (e) {
      toast.error(`${$t("common.add_to_conversation_error")}: ${e}`);
    }
    saving = false;
  }
</script>

<Header
  back
  title={$t("common.add_people", {
    public: $conversation.dnaProperties.privacy === Privacy.Public,
  })}
/>
<div class="relative mx-auto flex w-full flex-1 flex-col items-center p-5">
  <InputSearch bind:value={searchQuery} />

  <InputContactsSelect
    {searchQuery}
    excludedAgentPubKeyB64s={conversationMemberAgentPubKeyB64s}
    loading={saving}
    disabled={saving}
    buttonLabel={$t("common.add_to_conversation")}
    on:clickAction={(e) => inviteContacts(e.detail.selectedAgentPubKeyB64s)}
  />
</div>
