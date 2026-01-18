<script lang="ts">
  import { getContext } from "svelte";
  import { encodeHashToBase64, type AgentPubKeyB64 } from "@holochain/client";
  import type { SimplePeerConferenceStore } from "$store/SimplePeerConferenceStore";
  import type { ProfileStore } from "$store/ProfileStore";
  import type { CellIdB64 } from "$lib/types";
  import Avatar from "$lib/Avatar.svelte";
  import ButtonInline from "$lib/ButtonInline.svelte";
  import DialogConfirm from "$lib/DialogConfirm.svelte";

  const conferenceStore = getContext<{ getStore: () => SimplePeerConferenceStore }>(
    "conferenceStore",
  ).getStore();
  const profileStore = getContext<{ getStore: () => ProfileStore }>("profileStore").getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();
  const provisionedRelayCellIdB64 = getContext<{ getCellIdB64: () => CellIdB64 }>(
    "provisionedRelayCellId",
  ).getCellIdB64();

  export let onAccept: (roomId: string) => void;
  export let onReject: (roomId: string) => void;

  let showDismissConfirm = false;
  let dismissingRoomId: string | null = null;

  $: pendingInvitations = Object.entries($conferenceStore?.data || {})
    .filter(
      ([_, conf]) =>
        conf &&
        (conf.invitationStatus === "pending" || conf.invitationStatus === "left") &&
        !conf.ended,
    )
    .map(([roomId, conf]) => {
      // Count participants who have joined
      let participantCount = 0;
      const joinedParticipants: AgentPubKeyB64[] = [];

      for (const [pubKey, participant] of conf.participants || new Map()) {
        if (participant.hasJoined) {
          participantCount++;
          if (pubKey !== myPubKeyB64 && joinedParticipants.length < 3) {
            joinedParticipants.push(pubKey);
          }
        }
      }

      return {
        roomId,
        ...conf,
        participantCount,
        joinedParticipants,
      };
    });

  // Get caller name from profile
  function getCallerName(agentPubKeyB64: string | undefined): string {
    if (!agentPubKeyB64) return "Unknown";

    const allProfiles = $profileStore.data;
    for (const cellProfiles of Object.values(allProfiles)) {
      const profileExtended = cellProfiles[agentPubKeyB64];
      if (profileExtended?.profile?.fields) {
        const firstName = profileExtended.profile.fields.firstName || "";
        const lastName = profileExtended.profile.fields.lastName || "";
        return `${firstName} ${lastName}`.trim() || "Unknown";
      }
    }
    return "Unknown";
  }

  function handleJoin(roomId: string) {
    onAccept(roomId);
  }

  function handleDismissClick(roomId: string) {
    dismissingRoomId = roomId;
    showDismissConfirm = true;
  }

  function confirmDismiss() {
    if (dismissingRoomId) {
      onReject(dismissingRoomId);
      showDismissConfirm = false;
      dismissingRoomId = null;
    }
  }

  function cancelDismiss() {
    showDismissConfirm = false;
    dismissingRoomId = null;
  }
</script>

{#each pendingInvitations as invitation (invitation.roomId)}
  <div class="bg-surface-100 dark:bg-surface-900 w-full px-4 py-2">
    <div
      class="mx-auto flex max-w-2xl items-center justify-between rounded-full bg-zinc-800 px-4 py-3 shadow-lg"
    >
      <div class="flex items-center gap-3">
        <div class="rounded-full bg-zinc-700 p-2.5">
          <svg class="h-5 w-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
            />
          </svg>
        </div>

        <div class="flex flex-col">
          <span class="text-sm font-medium text-white">
            {#if invitation.isInitiator}
              You started a call
            {:else}
              {getCallerName(invitation.invitedBy)} started a call
            {/if}
          </span>
          <span class="text-xs text-zinc-400">{invitation.participantCount} in call</span>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Participant avatars -->
        {#if invitation.joinedParticipants.length > 0}
          <div class="flex -space-x-2">
            {#each invitation.joinedParticipants as participantPubKey}
              <div
                class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-zinc-800"
              >
                <Avatar
                  agentPubKeyB64={participantPubKey}
                  size={32}
                  cellIdB64={provisionedRelayCellIdB64}
                />
              </div>
            {/each}
          </div>
        {/if}

        <ButtonInline
          moreClassesButton="!bg-white hover:!bg-zinc-100 !text-black !h-9 !px-4 !py-1.5 !min-w-0"
          on:click={() => handleJoin(invitation.roomId)}
        >
          {invitation.invitationStatus === "left" ? "Rejoin" : "Join Call"}
        </ButtonInline>

        <button
          on:click={() => handleDismissClick(invitation.roomId)}
          class="p-1 text-zinc-400 transition-colors hover:text-white"
          aria-label="Dismiss"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  </div>
{/each}

<DialogConfirm
  bind:open={showDismissConfirm}
  title="Dismiss Call Invite?"
  actionButtonLabel="Yes, Dismiss"
  actionButtonIcon="delete"
  on:confirm={confirmDismiss}
  on:cancel={cancelDismiss}
>
  <div class="flex flex-col items-center gap-4 text-center">
    <div class="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10">
      <svg class="h-6 w-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    </div>
    <p class="text-secondary-500 dark:text-tertiary-500 text-sm">
      Are you sure you want to dismiss this call? The call initiator will be notified.
    </p>
  </div>
</DialogConfirm>
