<script lang="ts">
  import { getContext } from "svelte";
  import { type AgentPubKeyB64 } from "@holochain/client";
  import { page } from "$app/stores";
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
    deriveCellMergedProfileContactInviteStore,
    type MergedProfileContactInviteStore,
  } from "$store/MergedProfileContactInviteStore";
  import MemberListItem from "./MemberListItem.svelte";
  import PrivateConversationImage from "../PrivateConversationImage.svelte";
  import { type CellProfileStore } from "$store/ProfileStore";
  import {
    type ConversationTitleStore,
    deriveCellConversationTitleStore,
  } from "$store/ConversationTitleStore";
  import {
    deriveCellMergedProfileContactInviteJoinedStore,
    deriveCellMergedProfileContactInviteUnjoinedStore,
    type MergedProfileContactInviteJoinedStore,
    type MergedProfileContactInviteUnjoinedStore,
  } from "$store/MergedProfileContactInviteJoinedStore";

  const conversationStore = getContext<{ getStore: () => ConversationStore }>(
    "conversationStore",
  ).getStore();
  const mergedProfileContactInviteStore = getContext<{
    getStore: () => MergedProfileContactInviteStore;
  }>("mergedProfileContactInviteStore").getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();
  const provisionedRelayCellProfileStore = getContext<{
    getProvisionedRelayCellProfileStore: () => CellProfileStore;
  }>("profileStore").getProvisionedRelayCellProfileStore();
  const conversationTitleStore = getContext<{
    getStore: () => ConversationTitleStore;
  }>("conversationTitleStore").getStore();
  const mergedProfileContactInviteJoinedStore = getContext<{
    getStore: () => MergedProfileContactInviteJoinedStore;
  }>("mergedProfileContactInviteJoinedStore").getStore();
  const mergedProfileContactInviteUnjoinedStore = getContext<{
    getStore: () => MergedProfileContactInviteUnjoinedStore;
  }>("mergedProfileContactInviteUnjoinedStore").getStore();

  let conversation = deriveCellConversationStore(conversationStore, $page.params.id);
  let conversationTitle = deriveCellConversationTitleStore(conversationTitleStore, $page.params.id);
  let mergedProfileContact = deriveCellMergedProfileContactInviteStore(
    mergedProfileContactInviteStore,
    $page.params.id,
    myPubKeyB64,
  );
  let joined = deriveCellMergedProfileContactInviteJoinedStore(
    mergedProfileContactInviteJoinedStore,
    $page.params.id,
  );
  let unjoined = deriveCellMergedProfileContactInviteUnjoinedStore(
    mergedProfileContactInviteUnjoinedStore,
    $page.params.id,
  );

  $: myProfile = $provisionedRelayCellProfileStore.data[myPubKeyB64];
  $: invitationTitle =
    $joined.count <= 2
      ? `${myProfile.profile.nickname}`
      : `${myProfile.profile.nickname} + ${$mergedProfileContact.count - 1}`;

  // used for editing Group conversation details
  let image = $conversation.config?.image || "";
  let title = $conversationTitle || "";
  let editingTitle = false;

  $: iAmProgenitor = myPubKeyB64 === $conversation.dnaProperties.progenitor;

  const saveTitle = async (newTitle: string) => {
    conversation.updateConfig({ title: newTitle.trim(), image });
    title = newTitle.trim();
    editingTitle = false;
  };

  const saveImage = async (newImage: string) => {
    conversation.updateConfig({
      title: $conversationTitle || "",
      image: newImage,
    });
    image = newImage;
  };
</script>

<Header backUrl={`/conversations/${$page.params.id}`}>
  <h1 slot="center" class="overflow-hidden text-ellipsis whitespace-nowrap p-4 text-center">
    {$conversationTitle}
  </h1>

  <div slot="right">
    {#if $conversation.dnaProperties.privacy === Privacy.Private && iAmProgenitor}
      <ButtonIconBare
        moreClasses="h-[24px] w-[24px]"
        moreClassesButton="p-4"
        icon="addPerson"
        on:click={() => goto(`/conversations/${$page.params.id}/invite`)}
      />
    {/if}
  </div>
</Header>

<div class="relative mx-auto flex w-full flex-1 flex-col items-center overflow-hidden pt-6">
  {#if $conversation.dnaProperties.privacy === Privacy.Private}
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

      <!-- Don't let the user edit the title unless we actually have the conversation Config (with a prior user-created title) -->
      {#if $conversation.dnaProperties.privacy === Privacy.Public && $conversation.config !== undefined}
        <ButtonIconBare
          on:click={() => (editingTitle = true)}
          icon="write"
          moreClasses="text-gray-500"
        />
      {/if}
    {/if}
  </div>

  <p class="text-sm">
    {$t("common.created", { date: $conversation.dnaProperties.created })}
  </p>
  <p class="text-sm">
    {$t("common.num_members", { count: $joined.count })}
  </p>

  <div class="mx-auto flex w-full flex-col overflow-y-auto px-4">
    <ul class="mt-10 flex-1">
      {#if $conversation.dnaProperties.privacy === Privacy.Public && $conversation.publicInviteCode !== undefined}
        <li class="variant-filled-primary mb-2 flex flex-row items-center rounded-full p-2 text-xl">
          <span
            class="bg-tertiary-500 inline-block flex h-10 w-10 items-center justify-center rounded-full"
          >
            <SvgIcon icon="addPerson" moreClasses="text-primary-600" />
          </span>
          <span class="ml-4 flex-1 text-sm font-bold">{$t("common.add_members")}</span>

          <ButtonsCopyShareInline
            text={$conversation.publicInviteCode}
            copyLabel={$t("common.copy_invite")}
            shareLabel={$t("common.share_invite_code")}
          />
        </li>
      {:else}
        {#if $unjoined.count > 0}
          <h3 class="text-md text-secondary-300 mb-2 font-light">
            {$t("common.unconfirmed_invitations")}
          </h3>

          {#each $unjoined.list as [agentPubKeyB64] (agentPubKeyB64)}
            <MemberListItem cellIdB64={$page.params.id} {agentPubKeyB64}>
              {#await conversation.makePrivateInviteCode(agentPubKeyB64, invitationTitle) then res}
                <ButtonsCopyShareInline
                  text={res}
                  copyLabel={$t("common.copy_invite")}
                  shareLabel={$t("common.share_invite_code")}
                />
              {/await}
            </MemberListItem>
          {/each}
        {/if}

        <h3 class="text-md text-secondary-300 mb-2 mt-4 font-light">
          {$t("common.members")}
        </h3>
      {/if}

      {#each $joined.list as [publicKeyB64] (publicKeyB64)}
        <MemberListItem cellIdB64={$page.params.id} agentPubKeyB64={publicKeyB64} />
      {/each}
    </ul>
  </div>
</div>
