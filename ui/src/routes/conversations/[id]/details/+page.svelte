<script lang="ts">
  import { getContext } from "svelte";
  import { encodeHashToBase64, type AgentPubKeyB64 } from "@holochain/client";
  import { page } from "$app/stores";
  import Avatar from "$lib/Avatar.svelte";
  import Header from "$lib/Header.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import { t } from "$translations";
  import type { RelayStore } from "$store/RelayStore";
  import { Privacy } from "$lib/types";
  import { goto } from "$app/navigation";
  import ButtonsCopyShareInline from "$lib/ButtonsCopyShareInline.svelte";
  import TitleInput from "./TitleInput.svelte";
  import ButtonIconBare from "$lib/ButtonIconBare.svelte";
  import InputImageAvatar from "$lib/InputImageAvatar.svelte";

  // Silly hack to get around issues with typescript in sveltekit-i18n
  const tAny = t as any;

  const relayStore = getContext<{ getStore: () => RelayStore }>("relayStore").getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();

  let conversationStore = relayStore.getConversation($page.params.id);

  // used for editing Group conversation details
  let image = $conversationStore?.conversation.config?.image || "";
  let title = conversationStore?.getTitle() || "";
  let editingTitle = false;

  const saveTitle = async (newTitle: string) => {
    if (!conversationStore) return;

    conversationStore.setConfig({ title: newTitle.trim(), image });
    title = newTitle.trim();
    editingTitle = false;
  };

  const saveImage = async (newImage: string) => {
    if (!conversationStore) return;

    conversationStore.setConfig({
      title: $conversationStore?.conversation.config?.title || "",
      image: newImage,
    });
    image = newImage;
  };
</script>

<Header backUrl={`/conversations/${$page.params.id}`}>
  {#if conversationStore}
    <h1 class="block grow self-center overflow-hidden text-ellipsis whitespace-nowrap text-center">
      {conversationStore.getTitle()}
    </h1>

    {#if $conversationStore && $conversationStore.conversation.privacy === Privacy.Private && encodeHashToBase64($conversationStore.conversation.progenitor) === myPubKeyB64}
      <ButtonIconBare
        moreClasses="ml-5 h-[24px] w-[24px]"
        icon="addPerson"
        on:click={() =>
          goto(`/conversations/${$conversationStore?.conversation.dnaHashB64}/invite`)}
      />
    {/if}
  {/if}
</Header>

{#if conversationStore && $conversationStore}
  {@const numMembers = Object.values($conversationStore.conversation.agentProfiles).length}

  <div class="relative mx-auto flex w-full flex-1 flex-col items-center overflow-hidden pt-10">
    {#if $conversationStore.conversation.privacy === Privacy.Private}
      <div class="flex items-center justify-center gap-4">
        {#each conversationStore.getAllMembers().slice(0, 2) as profile}
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
      </div>
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
        {#if $conversationStore.conversation.privacy !== Privacy.Private}
          <ButtonIconBare
            on:click={() => (editingTitle = true)}
            icon="write"
            moreClasses="text-gray-500"
          />
        {/if}
      {/if}
    </div>

    <p class="text-sm">
      {$tAny("conversations.created", { date: $conversationStore.created })}
    </p>
    <p class="text-sm">
      {$tAny("conversations.num_members", { count: numMembers })}
    </p>

    <div class="mx-auto flex w-full flex-col overflow-y-auto px-4">
      <ul class="mt-10 flex-1">
        {#if $conversationStore.conversation.privacy === Privacy.Public}
          <li
            class="variant-filled-primary mb-2 flex flex-row items-center rounded-full p-2 text-xl"
          >
            <span
              class="bg-tertiary-500 inline-block flex h-10 w-10 items-center justify-center rounded-full"
            >
              <SvgIcon icon="addPerson" moreClasses="text-primary-600" />
            </span>
            <span class="ml-4 flex-1 text-sm font-bold">{$t("conversations.add_members")}</span>

            <ButtonsCopyShareInline
              text={$conversationStore.publicInviteCode}
              copyLabel={$t("conversations.copy_invite")}
              shareLabel={$t("conversations.share_invite_code")}
            />
          </li>
        {:else}
          {#if conversationStore.getInvitedUnjoinedContacts().length > 0}
            <h3 class="text-md text-secondary-300 mb-2 font-light">
              {$t("conversations.unconfirmed_invitations")}
            </h3>

            {#each conversationStore.getInvitedUnjoinedContacts() as contact}
              <li class="mb-4 flex flex-row items-center px-2 text-xl">
                <Avatar
                  image={contact.contact.avatar}
                  agentPubKey={contact.publicKeyB64}
                  size={38}
                  moreClasses="-ml-30"
                />
                <span class="ml-4 flex-1 text-sm">{contact.fullName}</span>
                {#await conversationStore.makeInviteCodeForAgent(contact.publicKeyB64) then res}
                  <ButtonsCopyShareInline
                    text={res}
                    copyLabel={$t("conversations.copy_invite")}
                    shareLabel={$t("conversations.share_invite_code")}
                  />
                {/await}
              </li>
            {/each}
          {/if}

          <h3 class="text-md text-secondary-300 mb-2 mt-4 font-light">
            {$t("conversations.members")}
          </h3>
        {/if}
        <li class="mb-4 flex flex-row items-center px-2 text-xl">
          <Avatar agentPubKey={myPubKeyB64} size={38} moreClasses="-ml-30" />
          <span class="ml-4 flex-1 text-sm font-bold">{$t("conversations.you")}</span>
          {#if myPubKeyB64 === encodeHashToBase64($conversationStore.conversation.progenitor)}
            <span class="text-secondary-300 ml-2 text-xs">{$t("conversations.admin")}</span>
          {/if}
        </li>
        {#each conversationStore.getJoinedMembers() as profile}
          <li class="mb-4 flex flex-row items-center px-2 text-xl">
            <Avatar
              image={profile.profile.fields.avatar}
              agentPubKey={profile.publicKeyB64}
              size={38}
              moreClasses="-ml-30"
            />
            <span class="ml-4 flex-1 text-sm font-bold">{profile.profile.nickname}</span>
            {#if profile.publicKeyB64 === encodeHashToBase64($conversationStore.conversation.progenitor)}
              <span class="text-secondary-300 ml-2 text-xs">{$t("conversations.admin")}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  </div>
{/if}
