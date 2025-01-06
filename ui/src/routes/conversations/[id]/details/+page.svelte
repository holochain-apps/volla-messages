<script lang="ts">
  import { getContext } from "svelte";
  import { encodeHashToBase64, type AgentPubKeyB64 } from "@holochain/client";
  import { page } from "$app/stores";
  import Avatar from "$lib/Avatar.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { Privacy } from "$lib/types";
  import { goto } from "$app/navigation";
  import ButtonsCopyShareInline from "$lib/ButtonsCopyShareInline.svelte";
  import TitleInput from "./TitleInput.svelte";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";
  import InputImageAvatar from "$lib/InputImageAvatar.svelte";
  import { deriveCellConversationStore, type ConversationStore } from "$store/ConversationStore";
  import {
    deriveCellMergedProfileContactListStore,
    deriveCellMergedProfileContactStore,
    type MergedProfileContactStore,
  } from "$store/MergedProfileContactStore";
  import MemberListItem from "./MemberListItem.svelte";
  import PrivateConversationImage from "../PrivateConversationImage.svelte";

  // Silly hack to get around issues with typescript in sveltekit-i18n
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
  let mergedProfileContact = deriveCellMergedProfileContactStore(
    mergedProfileContactStore,
    $page.params.id,
  );
  let mergedProfileContactList = deriveCellMergedProfileContactListStore(
    mergedProfileContactStore,
    $page.params.id,
    myPubKeyB64,
  );

  // used for editing Group conversation details
  let image = $conversation.conversation.config?.image || "";
  let title = $conversation.conversation.title || "";
  let editingTitle = false;

  $: iAmProgenitor = myPubKeyB64 === $conversation.conversation.dnaProperties.progenitor;
  $: invitedUnjoinedAgentPubKeyB64s = $conversation.conversation.invited.filter(
    (a) => !(a in $mergedProfileContact),
  );

  const saveTitle = async (newTitle: string) => {
    conversation.updateConfig({ title: newTitle.trim(), image });
    title = newTitle.trim();
    editingTitle = false;
  };

  const saveImage = async (newImage: string) => {
    conversation.updateConfig({
      title: $conversation.conversation.config?.title || "",
      image: newImage,
    });
    image = newImage;
  };
</script>

<Header backUrl={`/conversations/${$page.params.id}`}>
  <h1 slot="center" class="overflow-hidden text-ellipsis whitespace-nowrap text-center">
    {$conversation.conversation.title}
  </h1>

  <div slot="right">
    {#if $conversation.conversation.dnaProperties.privacy === Privacy.Private && iAmProgenitor}
      <ButtonIconBare
        moreClasses="h-[24px] w-[24px]"
        icon="addPerson"
        on:click={() => goto(`/conversations/${$page.params.id}/invite`)}
      />
    {/if}
  </div>
</Header>

<div class="relative mx-auto flex w-full flex-1 flex-col items-center overflow-hidden pt-6">
  {#if $conversation.conversation.dnaProperties.privacy === Privacy.Private}
    <PrivateConversationImage cellIdB64={$page.params.id} />
  {:else}
    <InputImageAvatar value={image} on:change={(e) => saveImage(e.detail)} />
  {/if}

  <div class="flex items-center justify-center space-x-2">
    {#if editingTitle}
      <TitleInput
        initialValue={title}
        on:save={(e) => saveTitle(e.detail)}
        on:cancel={() => (editingTitle = false)}
      />
    {:else}
      <h1 class="break-all text-3xl">
        {title}
      </h1>

      {#if $conversation.conversation.dnaProperties.privacy === Privacy.Public}
        <ButtonIconBare
          on:click={() => (editingTitle = true)}
          icon="write"
          moreClasses="text-gray-500"
        />
      {/if}
    {/if}
  </div>

  <p class="text-sm">
    {$tAny("conversations.created", { date: $conversation.conversation.dnaProperties.created })}
  </p>
  <p class="text-sm">
    {$tAny("conversations.num_members", { count: $mergedProfileContactList.length })}
  </p>

  <div class="mx-auto flex w-full flex-col overflow-y-auto px-4">
    <ul class="mt-10 flex-1">
      {#if $conversation.conversation.dnaProperties.privacy === Privacy.Public && $conversation.conversation.publicInviteCode !== undefined}
        <li class="variant-filled-primary mb-2 flex flex-row items-center rounded-full p-2 text-xl">
          <span
            class="bg-tertiary-500 inline-block flex h-10 w-10 items-center justify-center rounded-full"
          >
            <SvgIcon icon="addPerson" moreClasses="text-primary-600" />
          </span>
          <span class="ml-4 flex-1 text-sm font-bold">{$t("conversations.add_members")}</span>

          <ButtonsCopyShareInline
            text={$conversation.conversation.publicInviteCode}
            copyLabel={$t("conversations.copy_invite")}
            shareLabel={$t("conversations.share_invite_code")}
          />
        </li>
      {:else}
        {#if invitedUnjoinedAgentPubKeyB64s.length > 0}
          <h3 class="text-md text-secondary-300 mb-2 font-light">
            {$t("conversations.unconfirmed_invitations")}
          </h3>

          {#each invitedUnjoinedAgentPubKeyB64s as agentPubKeyB64 (agentPubKeyB64)}
            <MemberListItem cellIdB64={$page.params.id} {agentPubKeyB64}>
              {#await conversation.makePrivateInviteCode(agentPubKeyB64) then res}
                <ButtonsCopyShareInline
                  text={res}
                  copyLabel={$t("conversations.copy_invite")}
                  shareLabel={$t("conversations.share_invite_code")}
                />
              {/await}
            </MemberListItem>
          {/each}
        {/if}

        <h3 class="text-md text-secondary-300 mb-2 mt-4 font-light">
          {$t("conversations.members")}
        </h3>
      {/if}

      {#each $mergedProfileContactList as [publicKeyB64] (publicKeyB64)}
        <MemberListItem cellIdB64={$page.params.id} agentPubKeyB64={publicKeyB64} />
      {/each}
    </ul>
  </div>
</div>
