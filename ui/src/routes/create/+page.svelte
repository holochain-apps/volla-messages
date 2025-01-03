<script lang="ts">
  import { getContext } from "svelte";
  import { get } from "svelte/store";
  import { goto } from "$app/navigation";
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import { RelayStore } from "$store/RelayStore";
  import { Privacy } from "$lib/types";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import toast from "svelte-french-toast";
  import ButtonSquare from "$lib/ButtonSquare.svelte";
  import InputSearch from "$lib/InputSearch.svelte";
  import InputContactsSelect from "$lib/InputContactsSelect.svelte";

  const tAny = t as any;

  const relayStore = getContext<{ getStore: () => RelayStore }>("relayStore").getStore();

  let searchQuery = "";
  let creating = false;
  let existingConversationStore = false;

  async function createConversation(
    selectedAgentPubKeyB64s: AgentPubKeyB64[],
    selectedContactNames: string,
  ) {
    if (selectedAgentPubKeyB64s.length === 0) return;

    // TODO if conversation already exists, navigate to it
    creating = true;
    try {
      const conversationStore = await relayStore.createConversation(
        selectedContactNames,
        "",
        Privacy.Private,
        selectedAgentPubKeyB64s,
      );
      await goto(`/conversations/${get(conversationStore).conversation.dnaHashB64}/details`);
    } catch (e) {
      toast.error(`${$t("common.create_conversation_error")}: ${e.message}`);
    }
    creating = false;
  }
</script>

<Header backUrl="/welcome" title={$t("create.page_title")} />

<div class="flex w-full flex-col items-center p-5">
  <InputSearch bind:value={searchQuery} />

  <div class="mb-5 flex w-full justify-between gap-4">
    <ButtonSquare
      on:click={() => goto("/conversations/join")}
      icon="ticket"
      label={$t("common.use_invite_code")}
    />

    <ButtonSquare
      on:click={() => goto("/contacts/new")}
      icon="newPerson"
      label={$t("common.new_contact")}
    />

    <ButtonSquare
      on:click={() => goto("/conversations/new")}
      icon="people"
      label={$t("common.new_group")}
    />
  </div>

  <InputContactsSelect
    {searchQuery}
    loading={creating}
    disabled={creating}
    buttonLabel={$tAny("create.open_conversation", {
      existingConversation: !!existingConversationStore,
    })}
    on:change={(e) =>
      createConversation(e.detail.selectedAgentPubKeyB64s, e.detail.selectedContactNames)}
  />
</div>
