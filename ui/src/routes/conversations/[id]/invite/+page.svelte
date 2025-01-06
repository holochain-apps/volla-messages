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
    deriveCellMergedProfileContactListStore,
    type MergedProfileContactStore,
  } from "$store/MergedProfileContactStore";
  import { uniq } from "lodash-es";

  const tAny = t as any;
  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();
  const mergedProfileContactStore = getContext<{ getStore: () => MergedProfileContactStore }>(
    "mergedProfileContactStore",
  ).getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  let conversation = deriveCellConversationStore(conversationStore, $page.params.id);
  let profiles = deriveCellMergedProfileContactListStore(
    mergedProfileContactStore,
    $page.params.id,
    myPubKeyB64,
  );

  let searchQuery = "";
  let saving = false;

  $: conversationMemberAgentPubKeyB64s = uniq([
    ...$conversation.conversation.invited,
    ...$profiles.map(([a]) => a),
  ]);

  async function invite(selectedContacts: AgentPubKeyB64[]) {
    if (selectedContacts.length === 0) return;

    saving = true;
    try {
      await conversation.invite(selectedContacts);
      await goto(`/conversations/${$page.params.id}/details`);
    } catch (e) {
      toast.error(`${$t("common.add_contact_to_conversation_error")}: ${e}`);
    }
    saving = false;
  }
</script>

<Header
  back
  title={$tAny("conversations.add_people", {
    public: $conversation.conversation.dnaProperties.privacy === Privacy.Public,
  })}
/>
<div class="relative mx-auto flex w-full flex-1 flex-col items-center p-5">
  <InputSearch bind:value={searchQuery} />

  <InputContactsSelect
    {searchQuery}
    excludedAgentPubKeyB64s={conversationMemberAgentPubKeyB64s}
    loading={saving}
    disabled={saving}
    buttonLabel={$t("conversations.add_contact_to_conversation")}
    on:clickAction={(e) => invite(e.detail.selectedAgentPubKeyB64s)}
  />
</div>
