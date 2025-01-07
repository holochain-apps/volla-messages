<script lang="ts">
  import { getContext } from "svelte";
  import { goto } from "$app/navigation";
  import Button from "$lib/Button.svelte";
  import Header from "$lib/Header.svelte";
  import { t } from "$translations";
  import { MIN_TITLE_LENGTH } from "$config";
  import { Privacy } from "$lib/types";
  import toast from "svelte-french-toast";
  import InputImageAvatar from "$lib/InputImageAvatar.svelte";
  import type { ConversationStore } from "$store/ConversationStore";
  import { encodeHashToBase64 } from "@holochain/client";

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();

  let title = "";
  let imageUrl = "";
  let pendingCreate = false;

  async function createConversation(privacy: Privacy) {
    pendingCreate = true;
    try {
      const cellIdB64 = await conversationStore.create({
        config: {
          title,
          image: imageUrl,
        },
        privacy,
      });
      await goto(`/conversations/${cellIdB64}`);
    } catch (e) {
      toast.error(`${$t("common.create_conversation_error")}: ${e}`);
    }
    pendingCreate = false;
  }

  $: valid = title.trim().length >= MIN_TITLE_LENGTH;
</script>

<Header back title={$t("common.new_group")} />

<div class="my-10 flex flex-col items-center justify-center">
  <InputImageAvatar
    value={imageUrl}
    on:change={(event) => {
      try {
        imageUrl = event.detail;
      } catch (e) {
        toast.error(`${$t("common.upload_image_error")}: ${e}`);
      }
    }}
  />
</div>

<div class="flex min-w-[66%] grow flex-col justify-start">
  <h1 class="h1">{$t("conversations.group_name")}</h1>
  <input
    autofocus
    class="mt-2 w-full border-none pl-0.5 outline-none focus:outline-none focus:ring-0"
    type="text"
    placeholder={$t("conversations.enter_name_here")}
    name="title"
    bind:value={title}
    minlength={MIN_TITLE_LENGTH}
  />
</div>

<div class="my-8">
  <Button
    on:click={() => createConversation(Privacy.Public)}
    disabled={!valid || pendingCreate}
    loading={pendingCreate}
  >
    {$t("conversations.create_group")}
  </Button>
</div>
