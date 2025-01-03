<script lang="ts">
  import { getContext } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import { RelayStore } from "$store/RelayStore";
  import { Privacy } from "$lib/types";
  import toast from "svelte-french-toast";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import InputSearch from "$lib/InputSearch.svelte";
  import InputContactsSelect from "$lib/InputContactsSelect.svelte";

  const tAny = t as any;
  const relayStore = getContext<{ getStore: () => RelayStore }>("relayStore").getStore();
  let conversationStore = relayStore.getConversation($page.params.id);

  let searchQuery = "";
  let saving = false;

  async function addContactsToConversation(selectedContacts: AgentPubKeyB64[]) {
    if (selectedContacts.length === 0) return;

    saving = true;
    try {
      if (conversationStore) {
        conversationStore.addContacts(selectedContacts);
        await goto(`/conversations/${$conversationStore?.conversation.dnaHashB64}/details`);
      }
    } catch (e) {
      toast.error(`${$t("common.add_contact_to_conversation_error")}: ${e.message}`);
    }
    saving = false;
  }
</script>

<Header
  back
  title={$tAny("conversations.add_people", {
    public: $conversationStore?.conversation.privacy === Privacy.Public,
  })}
/>

<div class="relative mx-auto flex w-full flex-1 flex-col items-center p-5">
  <InputSearch bind:value={searchQuery} />

  <InputContactsSelect
    {searchQuery}
    loading={saving}
    disabled={saving}
    buttonLabel={$t("conversations.add_contact_to_conversation")}
    on:change={(e) => addContactsToConversation(e.detail.selectedAgentPubKeyB64s)}
  />
</div>
