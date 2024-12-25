<script lang="ts">
  import Button from "$lib/Button.svelte";
  import toast from "svelte-french-toast";
  import { copyToClipboard, isMobile, shareText } from "$lib/utils";
  import { modeCurrent } from "@skeletonlabs/skeleton";
  import SvgIcon from "../../../lib/SvgIcon.svelte";
  import { t } from "$translations";
  import { Privacy } from "../../../types";
  import { goto } from "$app/navigation";
  import type { ConversationStore } from "$store/ConversationStore";

  // Silly hack to get around issues with typescript in sveltekit-i18n
  const tAny = t as any;

  export let conversation: ConversationStore;
</script>

<div class="flex h-full w-full flex-col items-center justify-center">
  <img
    src={$modeCurrent ? "/clear-skies-gray.png" : "/clear-skies-white.png"}
    alt="No contacts"
    class="mb-4 mt-4 h-32 w-32"
  />
  {#if conversation.data.privacy === Privacy.Private}
    {#if conversation.allMembers.length === 1}
      <!-- A 1:1 conversation, so this is a pending connection -->
      <div
        class="bg-tertiary-500 dark:bg-secondary-500 mx-8 mb-3 flex flex-col items-center rounded-xl p-4"
      >
        <SvgIcon
          icon="handshake"
          size="36"
          color={$modeCurrent ? "%23232323" : "white"}
        />
        <h1
          class="text-secondary-500 dark:text-tertiary-100 mt-2 text-xl font-bold"
        >
          {$t("contacts.pending_connection_header")}
        </h1>
        <p
          class="text-secondary-400 dark:text-tertiary-700 mb-6 mt-4 text-center text-sm"
        >
          {$tAny("contacts.pending_connection_description", {
            name: conversation.title,
          })}
        </p>
        <div class="flex justify-center">
          <Button
            moreClasses="bg-surface-100 text-sm text-secondary-500 dark:text-tertiary-100 font-bold dark:bg-secondary-900"
            on:click={async () => {
              try {
                const inviteCode = await conversation.inviteCodeForAgent(
                  conversation.allMembers[0]?.publicKeyB64
                );
                if (!inviteCode)
                  throw new Error("Failed to generate invite code");
                await copyToClipboard(inviteCode);
                toast.success(`${$t("common.copy_success")}`);
              } catch (e) {
                toast.error(`${$t("common.copy_error")}: ${e.message}`);
              }
            }}
          >
            <SvgIcon
              icon="copy"
              size="20"
              color="%23FD3524"
              moreClasses="mr-2"
            />
            {$t("contacts.copy_invite_code")}
          </Button>
          {#if isMobile()}
            <Button
              moreClasses="bg-surface-100 text-sm text-secondary-500 dark:text-tertiary-100 font-bold dark:bg-secondary-900"
              on:click={async () => {
                try {
                  const inviteCode = await conversation.inviteCodeForAgent(
                    conversation.allMembers[0]?.publicKeyB64
                  );
                  if (!inviteCode)
                    throw new Error("Failed to generate invite code");
                  await shareText(inviteCode);
                } catch (e) {
                  toast.error(`${$t("common.share_code_error")}: ${e.message}`);
                }
              }}
            >
              <SvgIcon
                icon="share"
                size="20"
                color="%23FD3524"
                moreClasses="mr-2"
              />
              {$t("contacts.share_invite_code")}
            </Button>
          {/if}
        </div>
      </div>
    {:else}
      <p
        class="text-secondary-500 dark:text-tertiary-500 mx-10 mb-8 text-center text-xs"
      >
        {$t("conversations.share_personal_invitations")}
      </p>
      <Button
        on:click={() => goto(`/conversations/${conversation.data.id}/details`)}
        moreClasses="w-72 justify-center"
      >
        <SvgIcon
          icon="ticket"
          size="24"
          color={$modeCurrent ? "white" : "%23FD3524"}
        />
        <strong class="ml-2">{$t("conversations.send_invitations")}</strong>
      </Button>
    {/if}
  {:else}
    <!-- Public conversation, make it easy to copy invite code-->
    <p
      class="text-secondary-500 dark:text-tertiary-700 mx-10 mb-8 text-center text-xs"
    >
      {$t("conversations.share_invitation_code_msg")}
    </p>
    <Button
      moreClasses="w-64 justify-center variant-filled-tertiary"
      on:click={async () => {
        try {
          await copyToClipboard(conversation.publicInviteCode);
          toast.success(`${$t("common.copy_success")}`);
        } catch (e) {
          toast.error(`${$t("common.copy_error")}: ${e.message}`);
        }
      }}
    >
      <SvgIcon icon="copy" size="18" color="%23FD3524" />
      <strong class="ml-2 text-sm"
        >{$t("conversations.copy_invite_code")}</strong
      >
    </Button>
    {#if isMobile()}
      <Button
        on:click={async () => {
          try {
            await shareText(conversation.publicInviteCode);
          } catch (e) {
            toast.error(`${$t("common.share_code_error")}: ${e.message}`);
          }
        }}
        moreClasses="w-64 justify-center variant-filled-tertiary"
      >
        <SvgIcon icon="share" size="18" color="%23FD3524" />
        <strong class="ml-2 text-sm"
          >{$t("conversations.share_invite_code")}</strong
        >
      </Button>
    {/if}
  {/if}
</div>
