<script lang="ts">
  import Header from "$lib/Header.svelte";
  import { type ConversationStore } from "$store/ConversationStore";
  import { t } from "$translations";
  import { getContext } from "svelte";
  import ConversationList from "../ConversationList.svelte";
  import { goto } from "$app/navigation";

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();

  $: hasArchivedConversations =
    $conversationStore.list.filter((c) => !c[1].cellInfo.enabled).length > 0;

  $: {
    if (!hasArchivedConversations) {
      goto("/conversations");
    }
  }
</script>

<Header backUrl="/conversations" title={$t("common.archive")}></Header>

<ConversationList enabled={false} />
