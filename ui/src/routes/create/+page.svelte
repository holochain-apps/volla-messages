<script lang="ts">
  import { getContext } from "svelte";
  import { goto } from "$app/navigation";
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import { Privacy } from "$lib/types";
  import { type AgentPubKeyB64 } from "@holochain/client";
  import toast from "svelte-french-toast";
  import ButtonSquare from "$lib/ButtonSquare.svelte";
  import InputSearch from "$lib/InputSearch.svelte";
  import InputContactsSelect from "$lib/InputContactsSelect.svelte";
  import type { ConversationStore } from "$store/ConversationStore";
  import type { ProfileStore } from "$store/ProfileStore";
  import { every } from "lodash-es";

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();
  const profileStore = getContext<{ getStore: () => ProfileStore }>("profileStore").getStore();

  let searchQuery = "";
  let creating = false;
  let selectedAgentPubKeyB64s: AgentPubKeyB64[] = [];

  // Find conversation that contains *all* the selected agents, and no other agents
  $: conversationWithAllSelectedAgents = Object.entries($profileStore).find(
    ([, cellProfiles]) =>
      every(selectedAgentPubKeyB64s.map((agentPubKeyB64) => agentPubKeyB64 in cellProfiles)) &&
      selectedAgentPubKeyB64s.length === Object.keys(cellProfiles).length - 1,
  );

  async function createConversation(
    selectedAgentPubKeyB64s: AgentPubKeyB64[],
    selectedContactNames: string,
  ) {
    if (selectedAgentPubKeyB64s.length === 0) return;

    // TODO if conversation already exists, navigate to it
    creating = true;
    try {
      const cellIdB64 = await conversationStore.create({
        config: {
          title: selectedContactNames,
          image: "",
        },
        privacy: Privacy.Private,
      });
      await conversationStore.invite(cellIdB64, selectedAgentPubKeyB64s);
      await goto(`/conversations/${cellIdB64}/details`);
    } catch (e) {
      toast.error(`${$t("common.create_conversation_error")}: ${e}`);
    }
    creating = false;
  }
</script>

<Header backUrl="/welcome" title={$t("common.page_title")} />

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
    bind:value={selectedAgentPubKeyB64s}
    {searchQuery}
    loading={creating}
    disabled={creating}
    buttonLabel={$t("common.open_conversation", {
      existingConversation: !!conversationWithAllSelectedAgents,
    })}
    on:clickAction={(e) => {
      if (conversationWithAllSelectedAgents === undefined) {
        createConversation(e.detail.selectedAgentPubKeyB64s, e.detail.selectedContactNames);
      } else {
        goto(`/conversations/${conversationWithAllSelectedAgents[0]}`);
      }
    }}
  />
</div>
