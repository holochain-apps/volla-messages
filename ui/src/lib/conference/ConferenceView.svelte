<script lang="ts">
  import { onMount, onDestroy, getContext } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { t } from "$translations/index";
  import toast from "svelte-french-toast";
  import type { SimplePeerConferenceStore } from "$store/SimplePeerConferenceStore";
  import type { AgentPubKeyB64 } from "@holochain/client";
  import { type CellIdB64, ConferenceRole } from "$lib/types";
  import Dialog from "$lib/Dialog.svelte";
  import DialogConfirm from "$lib/DialogConfirm.svelte";
  import Button from "$lib/Button.svelte";
  import SvgIcon from "$lib/SvgIcon.svelte";
  import Avatar from "$lib/Avatar.svelte";
  import {
    deriveCellMergedProfileContactInviteStore,
    type MergedProfileContactInviteStore,
  } from "$store/MergedProfileContactInviteStore";

  import {
    ParticipantTile,
    ParticipantTileSkeleton,
    ConferenceHeader,
    ConferenceFooter,
    PreJoinScreen,
    ResizablePip,
  } from "./index";
  import { createActiveSpeakerStore, type SpeakerInfo } from "./activeSpeakerDetection";
  import type { ParticipantData } from "./types";

  export let roomId: string;
  export let onClose: () => void;
  export let onConferenceEnded: ((roomId: string) => void) | undefined = undefined;
  export let showPreJoin: boolean = false; // Enable pre-join screen

  const conferenceStoreBase = getContext<{ getStore: () => SimplePeerConferenceStore }>(
    "conferenceStore",
  ).getStore();
  const myPubKeyB64 = getContext<{ getMyPubKeyB64: () => AgentPubKeyB64 }>(
    "myPubKey",
  ).getMyPubKeyB64();
  const mergedProfileContactInviteStore = getContext<{
    getStore: () => MergedProfileContactInviteStore;
  }>("mergedProfileContactInviteStore").getStore();
  const provisionedRelayCellIdB64 = getContext<{ getCellIdB64: () => CellIdB64 }>(
    "provisionedRelayCellId",
  ).getCellIdB64();

  const conferenceStore = conferenceStoreBase.deriveConferenceStore(roomId);

  let conferenceEndedLogged = false;

  const MAX_PARTICIPANTS = 6;
  let isGridView = false;
  let callDurationSeconds = 0;
  let callStartTime: number | null = null;
  let durationInterval: ReturnType<typeof setInterval> | null = null;
  $: videoEnabled = $conferenceStore?.videoEnabled ?? true;
  $: audioEnabled = $conferenceStore?.audioEnabled ?? true;
  let showPreJoinScreen = showPreJoin;
  let pipExpanded = false; // When true, local video is main and remote is PiP

  // Active speaker detection
  const activeSpeakerStore = createActiveSpeakerStore({
    speakingThreshold: 0.1,
    switchCooldown: 500,
  });

  let showEndCallDialog = false;
  let showErrorDialog = false;
  let showIncomingCallDialog = false;
  let showKickConfirmDialog = false;
  let showTransferHostDialog = false;
  let showPromoteDialog = false;

  let errorDialogMessage = "";
  let errorDialogTitle = "";
  let errorDialogActionLabel = "";
  let suppressErrorDialog = false;

  let activeParticipantMenu: AgentPubKeyB64 | null = null;
  let targetParticipantPubKey: AgentPubKeyB64 | null = null;
  let isPerformingAction = false;

  $: profiles = $conferenceStore?.cellIdB64
    ? deriveCellMergedProfileContactInviteStore(
        mergedProfileContactInviteStore,
        $conferenceStore.cellIdB64,
        myPubKeyB64,
      )
    : deriveCellMergedProfileContactInviteStore(
        mergedProfileContactInviteStore,
        provisionedRelayCellIdB64,
        myPubKeyB64,
      );

  $: isMuted = !audioEnabled;
  $: isVideoEnabled = videoEnabled;
  $: myRole = $conferenceStore?.myRole;
  $: canEndForAll = conferenceStoreBase.canEndConference(roomId);
  $: currentError = $conferenceStore?.error;

  $: allParticipants = buildParticipantList($conferenceStore, myPubKeyB64, myRole);
  $: remoteParticipants = allParticipants.filter((p) => !p.isLocal);

  $: activeSpeakerId = $activeSpeakerStore.activeSpeaker;
  $: activeParticipant = activeSpeakerId
    ? remoteParticipants.find((p) => p.pubKey === activeSpeakerId)
    : remoteParticipants.find((p) => p._stream && p._connected) || remoteParticipants[0];

  $: pipParticipants = buildPipParticipants(
    allParticipants,
    activeParticipant,
    myPubKeyB64,
    myRole,
  );

  // Show PreJoinScreen for:
  // 1. Non-initiators receiving an invitation
  // 2. Anyone rejoining after leaving (invitationStatus === "left")
  $: shouldShowPreJoinScreen =
    $conferenceStore &&
    $conferenceStore.showPreJoinScreen &&
    (!$conferenceStore.isInitiator || $conferenceStore.invitationStatus === "left");

  $: if (!suppressErrorDialog && currentError && currentError !== errorDialogMessage) {
    const isRejected = $conferenceStore?.invitationStatus === "rejected";
    errorDialogMessage = currentError;
    errorDialogTitle = isRejected
      ? $t("common.conference_callDeclined")
      : $t("common.conference_connectionError");
    errorDialogActionLabel = isRejected
      ? $t("common.conference_close")
      : $t("common.conference_closeConference");
    showErrorDialog = true;
  }

  $: if ($conferenceStore?.ended && !conferenceEndedLogged) {
    conferenceEndedLogged = true;
    if (onConferenceEnded && roomId) {
      onConferenceEnded(roomId);
    }
  }

  function buildParticipantList(
    store: typeof $conferenceStore,
    myPubKey: string,
    role: ConferenceRole | undefined,
  ): ParticipantData[] {
    if (!store?.participants) return [];

    const remote = [...store.participants.entries()].map(([pubKey, participant]) => ({
      pubKey,
      publicKey: pubKey,
      isLocal: false,
      hasJoined: participant.hasJoined,
      connectionStatus: participant.connectionStatus,
      videoEnabled: participant.videoEnabled,
      audioEnabled: participant.audioEnabled,
      connectionQuality: participant.connectionQuality,
      role: participant.role,
      _stream: getParticipantStream(participant),
      _connected: isParticipantConnected(participant),
    }));

    const local: ParticipantData = {
      pubKey: myPubKey,
      publicKey: myPubKey,
      isLocal: true,
      hasJoined: true,
      connectionStatus: "connected",
      videoEnabled,
      audioEnabled,
      connectionQuality: undefined,
      role,
      _stream: store?.localStream ?? null,
      _connected: true,
    };

    return [local, ...remote.filter((p) => p.pubKey !== myPubKey)];
  }

  function buildPipParticipants(
    all: ParticipantData[],
    active: ParticipantData | undefined,
    myPubKey: string,
    role: ConferenceRole | undefined,
  ): ParticipantData[] {
    const local: ParticipantData = {
      pubKey: myPubKey,
      publicKey: myPubKey,
      isLocal: true,
      hasJoined: true,
      connectionStatus: "connected",
      videoEnabled,
      audioEnabled,
      connectionQuality: undefined,
      role,
      _stream: $conferenceStore?.localStream ?? null,
      _connected: true,
    };

    if (active) {
      const others = all.filter((p) => !p.isLocal && p.pubKey !== active.pubKey);
      return [local, ...others];
    }
    return [local, ...all.filter((p) => !p.isLocal)];
  }

  function getParticipantStream(participant: any): MediaStream | null {
    return participant.stream ?? null;
  }

  function isParticipantConnected(participant: any): boolean {
    return participant.peer?.connected === true || !!participant.stream;
  }

  function getParticipantName(agentPubKeyB64: string): string {
    const profile = $profiles?.data[agentPubKeyB64];
    if (profile?.profile?.fields) {
      const firstName = profile.profile.fields.firstName || "";
      const lastName = profile.profile.fields.lastName || "";
      return `${firstName} ${lastName}`.trim() || "Unknown";
    }
    return "Unknown";
  }

  function canKickParticipant(targetPubKeyB64: AgentPubKeyB64): boolean {
    return conferenceStoreBase.canKick(roomId, targetPubKeyB64);
  }

  function handleScreenInteraction() {}

  function toggleMute() {
    if ($conferenceStore?.localStream) {
      const audioTracks = $conferenceStore.localStream.getAudioTracks();
      const nextState = !audioEnabled;
      audioTracks.forEach((track: MediaStreamTrack) => {
        track.enabled = nextState;
      });
      conferenceStoreBase.setMediaEnabled(roomId, videoEnabled, nextState);
      conferenceStoreBase.sendMediaStateToAll(roomId, videoEnabled, nextState);
    }
  }

  function toggleVideo() {
    if ($conferenceStore?.localStream) {
      const videoTracks = $conferenceStore.localStream.getVideoTracks();
      const nextState = !videoEnabled;
      videoTracks.forEach((track: MediaStreamTrack) => {
        track.enabled = nextState;
      });
      conferenceStoreBase.setMediaEnabled(roomId, nextState, audioEnabled);
      conferenceStoreBase.sendMediaStateToAll(roomId, nextState, audioEnabled);
    }
  }

  async function endCall() {
    if (roomId && canEndForAll) {
      showEndCallDialog = true;
    } else {
      if (roomId) {
        await conferenceStoreBase.leaveConference(roomId);
        conferenceStoreBase.cleanupWebRTC(roomId);
      }
    }
  }

  async function confirmEndForAll() {
    showEndCallDialog = false;
    if (roomId) {
      conferenceStoreBase.cleanupWebRTC(roomId);

      await conferenceStoreBase.endConferenceForAll(roomId);
      conferenceEndedLogged = true;
      if (onConferenceEnded) {
        try {
          await onConferenceEnded(roomId);
        } catch (error) {
          console.warn("[ConferenceView] Failed to send conference ended log:", error);
        }
      }
    }
  }

  async function confirmJustLeave() {
    showEndCallDialog = false;
    if (roomId) {
      await conferenceStoreBase.leaveConference(roomId);
      conferenceStoreBase.cleanupWebRTC(roomId);
    }
  }

  async function handleRejectCall() {
    await conferenceStoreBase.rejectConferenceInvitation(roomId);
    // Don't call onClose() - state change (invitationStatus: "rejected") closes view automatically
  }

  async function handleErrorClose() {
    suppressErrorDialog = true;
    showErrorDialog = false;
    if (roomId) {
      conferenceStoreBase.cleanupWebRTC(roomId);
      await conferenceStoreBase.leaveConference(roomId);
    }
  }

  function handlePreJoinComplete(
    event: CustomEvent<{ videoEnabled: boolean; audioEnabled: boolean }>,
  ) {
    conferenceStoreBase.setMediaEnabled(
      roomId,
      event.detail.videoEnabled,
      event.detail.audioEnabled,
    );
    conferenceStoreBase.setShowPreJoinScreen(roomId, false);
    conferenceStoreBase.acceptConferenceInvitation(roomId);
  }

  function handlePreJoinCancel() {
    conferenceStoreBase.setShowPreJoinScreen(roomId, false);
  }

  function handleToggleMenu(event: CustomEvent<{ pubKey: string }>) {
    activeParticipantMenu =
      activeParticipantMenu === event.detail.pubKey ? null : event.detail.pubKey;
  }

  function handlePromote(event: CustomEvent<{ pubKey: string }>) {
    targetParticipantPubKey = event.detail.pubKey;
    showPromoteDialog = true;
    activeParticipantMenu = null;
  }

  function handleTransferHost(event: CustomEvent<{ pubKey: string }>) {
    targetParticipantPubKey = event.detail.pubKey;
    showTransferHostDialog = true;
    activeParticipantMenu = null;
  }

  function handleKick(event: CustomEvent<{ pubKey: string }>) {
    targetParticipantPubKey = event.detail.pubKey;
    showKickConfirmDialog = true;
    activeParticipantMenu = null;
  }

  async function confirmKick() {
    if (!targetParticipantPubKey) return;
    isPerformingAction = true;
    try {
      await conferenceStoreBase.kickParticipant(roomId, targetParticipantPubKey);
      toast.success($t("common.conference_participantKicked"));
    } catch (error) {
      toast.error($t("common.conference_kickFailed"));
    } finally {
      isPerformingAction = false;
      showKickConfirmDialog = false;
      targetParticipantPubKey = null;
    }
  }

  async function confirmTransferHost() {
    if (!targetParticipantPubKey) return;
    isPerformingAction = true;
    try {
      await conferenceStoreBase.transferHost(roomId, targetParticipantPubKey);
      toast.success($t("common.conference_hostTransferred"));
    } catch (error) {
      toast.error($t("common.conference_transferFailed"));
    } finally {
      isPerformingAction = false;
      showTransferHostDialog = false;
      targetParticipantPubKey = null;
    }
  }

  async function confirmPromote() {
    if (!targetParticipantPubKey) return;
    isPerformingAction = true;
    try {
      await conferenceStoreBase.changeParticipantRole(
        roomId,
        targetParticipantPubKey,
        ConferenceRole.CoHost,
      );
      toast.success($t("common.conference_participantPromoted"));
    } catch (error) {
      toast.error($t("common.conference_promoteFailed"));
    } finally {
      isPerformingAction = false;
      showPromoteDialog = false;
      targetParticipantPubKey = null;
    }
  }

  function handleKeyboardShortcuts(event: KeyboardEvent) {
    if (event.code === "Escape") endCall();
    if (event.code === "KeyM" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      toggleMute();
    }
    if (event.code === "KeyV" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      toggleVideo();
    }
  }

  $: {
    remoteParticipants.forEach((p) => {
      if (p._stream && p._connected) {
        activeSpeakerStore.addParticipant(p.pubKey, p._stream);
      }
    });
  }

  onMount(() => {
    callStartTime = Date.now();
    durationInterval = setInterval(() => {
      if (callStartTime) {
        callDurationSeconds = Math.floor((Date.now() - callStartTime) / 1000);
      }
    }, 1000);

    if ($conferenceStore?.cellIdB64 && $conferenceStore.invitationStatus !== "pending") {
      conferenceStoreBase.fetchRoles(roomId).catch(console.error);
    }

    if ($conferenceStore?.localStream) {
      const storedVideoEnabled = $conferenceStore.videoEnabled ?? true;
      const storedAudioEnabled = $conferenceStore.audioEnabled ?? true;

      $conferenceStore.localStream.getVideoTracks().forEach((track: MediaStreamTrack) => {
        track.enabled = storedVideoEnabled;
      });
      $conferenceStore.localStream.getAudioTracks().forEach((track: MediaStreamTrack) => {
        track.enabled = storedAudioEnabled;
      });
    }
  });

  onDestroy(() => {
    if (durationInterval) clearInterval(durationInterval);
    activeSpeakerStore.destroy();
  });

  $: targetParticipantName = targetParticipantPubKey
    ? getParticipantName(targetParticipantPubKey)
    : "";
</script>

<svelte:window on:keydown={handleKeyboardShortcuts} />

{#if showPreJoinScreen && shouldShowPreJoinScreen}
  <PreJoinScreen
    callerName={$conferenceStore?.invitedBy ? getParticipantName($conferenceStore.invitedBy) : ""}
    participantCount={allParticipants.length}
    on:join={handlePreJoinComplete}
    on:cancel={handlePreJoinCancel}
  />
{:else}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="bg-secondary-500 fixed inset-0 z-50"
    transition:fade={{ duration: 200 }}
    on:click={handleScreenInteraction}
    on:touchstart={handleScreenInteraction}
  >
    {#if $conferenceStore && !$conferenceStore.localStream && $conferenceStore.invitationStatus === "accepted"}
      <div
        class="bg-secondary-500 absolute inset-0 z-50 flex flex-col items-center justify-center"
        transition:fade={{ duration: 200 }}
      >
        <div
          class="bg-secondary-400/50 flex flex-col items-center gap-6 rounded-3xl p-8 backdrop-blur-sm"
        >
          <div class="relative">
            <div class="bg-primary-500/20 h-20 w-20 animate-pulse rounded-full"></div>
            <div class="absolute inset-0 flex items-center justify-center">
              <SvgIcon icon="videocam" moreClasses="h-10 w-10 text-primary-500" />
            </div>
            <div
              class="bg-secondary-500 absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full"
            >
              <SvgIcon icon="spinner" moreClasses="h-5 w-5 animate-spin text-tertiary-400" />
            </div>
          </div>
          <div class="text-center">
            <p class="text-tertiary-300 text-lg font-semibold">
              {$t("common.conference_connecting")}
            </p>
            <p class="text-tertiary-500 mt-1 text-sm">{$t("common.conference_setupMessage")}</p>
          </div>
        </div>
      </div>
    {/if}

    <ConferenceHeader
      participantCount={allParticipants.length}
      maxParticipants={MAX_PARTICIPANTS}
      {isGridView}
      visible={true}
      on:toggleView={() => (isGridView = !isGridView)}
      on:minimize={onClose}
    />

    <div
      class="flex h-full w-full flex-col p-2 pb-24 pt-16 sm:p-3 sm:pb-28 sm:pt-20 md:p-4 md:pb-32 md:pt-24 lg:p-6 lg:pb-36 lg:pt-28"
    >
      {#if isGridView}
        <div
          class="mx-auto grid h-full w-full gap-2 sm:gap-3
            {allParticipants.length === 1
            ? 'max-w-2xl grid-cols-1'
            : allParticipants.length === 2
              ? 'max-w-4xl grid-cols-1 portrait:grid-cols-1 landscape:grid-cols-2'
              : 'max-w-7xl grid-cols-2'}
            {allParticipants.length <= 2 ? 'place-content-center' : ''}"
        >
          {#each allParticipants.slice(0, 4) as participant (participant.pubKey)}
            <div
              class="min-h-0 min-w-0 {allParticipants.length === 1
                ? 'max-h-[70dvh]'
                : allParticipants.length === 2
                  ? 'max-h-[45dvh] landscape:max-h-[70dvh]'
                  : ''}"
              animate:flip={{ duration: 250 }}
            >
              <ParticipantTile
                {participant}
                variant="grid"
                localStream={$conferenceStore?.localStream}
                isLocalVideoEnabled={isVideoEnabled}
                isLocalMuted={isMuted}
                {myRole}
                getName={getParticipantName}
                canKick={canKickParticipant}
                activeMenuPubKey={activeParticipantMenu}
                cellIdB64={$conferenceStore?.cellIdB64}
                on:toggleMenu={handleToggleMenu}
                on:promote={handlePromote}
                on:transferHost={handleTransferHost}
                on:kick={handleKick}
              />
            </div>
          {/each}
        </div>
      {:else}
        <div class="relative mx-auto h-full w-full max-w-7xl">
          {#if pipExpanded}
            <ParticipantTile
              participant={{
                pubKey: myPubKeyB64,
                publicKey: myPubKeyB64,
                isLocal: true,
                hasJoined: true,
                connectionStatus: "connected",
                _stream: $conferenceStore?.localStream ?? null,
                _connected: true,
                role: myRole,
                videoEnabled,
                audioEnabled,
              }}
              variant="main"
              localStream={$conferenceStore?.localStream}
              isLocalVideoEnabled={isVideoEnabled}
              isLocalMuted={isMuted}
              {myRole}
              getName={getParticipantName}
              canKick={canKickParticipant}
              cellIdB64={$conferenceStore?.cellIdB64}
            />
          {:else if activeParticipant}
            <ParticipantTile
              participant={activeParticipant}
              variant="main"
              localStream={$conferenceStore?.localStream}
              isLocalVideoEnabled={isVideoEnabled}
              isLocalMuted={isMuted}
              {myRole}
              getName={getParticipantName}
              canKick={canKickParticipant}
              activeMenuPubKey={activeParticipantMenu}
              cellIdB64={$conferenceStore?.cellIdB64}
              on:toggleMenu={handleToggleMenu}
              on:promote={handlePromote}
              on:transferHost={handleTransferHost}
              on:kick={handleKick}
            />
          {:else}
            <ParticipantTile
              participant={{
                pubKey: myPubKeyB64,
                publicKey: myPubKeyB64,
                isLocal: true,
                hasJoined: true,
                connectionStatus: "connected",
                _stream: $conferenceStore?.localStream ?? null,
                _connected: true,
                role: myRole,
              }}
              variant="main"
              localStream={$conferenceStore?.localStream}
              isLocalVideoEnabled={isVideoEnabled}
              isLocalMuted={isMuted}
              {myRole}
              getName={getParticipantName}
              canKick={canKickParticipant}
              cellIdB64={$conferenceStore?.cellIdB64}
            />
          {/if}

          {#if activeParticipant}
            <ResizablePip
              initialWidth={120}
              initialHeight={90}
              minWidth={100}
              minHeight={75}
              maxWidth={200}
              maxHeight={150}
              boundsPadding={16}
              keepAspectRatio={true}
              persistKey="conference-pip-v3"
              on:click={() => (pipExpanded = !pipExpanded)}
            >
              {#if pipExpanded}
                <ParticipantTile
                  participant={activeParticipant}
                  variant="pip"
                  localStream={$conferenceStore?.localStream}
                  isLocalVideoEnabled={isVideoEnabled}
                  isLocalMuted={isMuted}
                  {myRole}
                  getName={getParticipantName}
                  canKick={canKickParticipant}
                  cellIdB64={$conferenceStore?.cellIdB64}
                />
              {:else}
                <ParticipantTile
                  participant={{
                    pubKey: myPubKeyB64,
                    publicKey: myPubKeyB64,
                    isLocal: true,
                    hasJoined: true,
                    connectionStatus: "connected",
                    _stream: $conferenceStore?.localStream ?? null,
                    _connected: true,
                    role: myRole,
                    videoEnabled,
                    audioEnabled,
                  }}
                  variant="pip"
                  localStream={$conferenceStore?.localStream}
                  isLocalVideoEnabled={isVideoEnabled}
                  isLocalMuted={isMuted}
                  {myRole}
                  getName={getParticipantName}
                  canKick={canKickParticipant}
                  cellIdB64={$conferenceStore?.cellIdB64}
                />
              {/if}
            </ResizablePip>
          {/if}
        </div>
      {/if}
    </div>

    <ConferenceFooter
      {isMuted}
      {isVideoEnabled}
      {callDurationSeconds}
      visible={true}
      on:toggleMute={toggleMute}
      on:toggleVideo={toggleVideo}
      on:endCall={endCall}
    />
  </div>
{/if}

<Dialog bind:open={showEndCallDialog} title={$t("common.conference_endCallOptions")}>
  <div class="flex flex-col items-center gap-4 text-center">
    <div class="bg-error-500/10 flex h-12 w-12 items-center justify-center rounded-full">
      <SvgIcon icon="phone" moreClasses="h-6 w-6 rotate-[135deg] text-error-500" />
    </div>
    <p class="text-secondary-500 dark:text-tertiary-500 text-sm">
      {$t("common.conference_endCallMessage")}
    </p>
  </div>
  <div class="mt-6 flex flex-col gap-3">
    <Button
      moreClasses="w-full !bg-error-500 hover:!bg-error-600 !text-white"
      on:click={confirmEndForAll}
    >
      {$t("common.conference_endCallForAll")}
    </Button>
    <Button
      moreClasses="w-full !bg-primary-500 hover:!bg-primary-600 !text-white"
      on:click={confirmJustLeave}
    >
      {$t("common.conference_justLeave")}
    </Button>
    <Button
      moreClasses="w-full !bg-secondary-400 hover:!bg-secondary-300 !text-white"
      on:click={() => (showEndCallDialog = false)}
    >
      {$t("common.cancel")}
    </Button>
  </div>
</Dialog>

<Dialog bind:open={showErrorDialog} title={errorDialogTitle}>
  <div class="flex flex-col items-center gap-4 text-center">
    <div class="bg-error-500/10 flex h-12 w-12 items-center justify-center rounded-full">
      <SvgIcon icon="alertTriangle" moreClasses="h-6 w-6 text-error-500" />
    </div>
    <p class="text-secondary-500 dark:text-tertiary-500 text-sm">{errorDialogMessage}</p>
  </div>
  <div class="mt-6 flex justify-center">
    <Button
      moreClasses="w-full sm:w-auto !bg-error-500 hover:!bg-error-600 !text-white"
      on:click={handleErrorClose}
    >
      {errorDialogActionLabel}
    </Button>
  </div>
</Dialog>

<DialogConfirm
  bind:open={showKickConfirmDialog}
  title={$t("common.conference_kickTitle")}
  actionButtonLabel={$t("common.conference_kickConfirm")}
  loading={isPerformingAction}
  on:confirm={confirmKick}
  on:cancel={() => {
    showKickConfirmDialog = false;
    targetParticipantPubKey = null;
  }}
>
  <div class="flex flex-col items-center gap-4 text-center">
    <div class="bg-error-500/10 flex h-12 w-12 items-center justify-center rounded-full">
      <SvgIcon icon="alertCircle" moreClasses="h-6 w-6 text-error-500" />
    </div>
    {#if targetParticipantPubKey}
      <div class="flex flex-col items-center gap-2">
        <Avatar agentPubKeyB64={targetParticipantPubKey} size={48} />
        <p class="text-secondary-700 dark:text-tertiary-300 font-medium">{targetParticipantName}</p>
      </div>
    {/if}
    <p class="text-secondary-500 dark:text-tertiary-500 text-sm">
      {$t("common.conference_kickMessage")}
    </p>
  </div>
</DialogConfirm>

<DialogConfirm
  bind:open={showTransferHostDialog}
  title={$t("common.conference_transferHostTitle")}
  actionButtonLabel={$t("common.conference_transferHostConfirm")}
  loading={isPerformingAction}
  on:confirm={confirmTransferHost}
  on:cancel={() => {
    showTransferHostDialog = false;
    targetParticipantPubKey = null;
  }}
>
  <div class="flex flex-col items-center gap-4 text-center">
    <div class="bg-primary-500/10 flex h-12 w-12 items-center justify-center rounded-full">
      <SvgIcon icon="arrowUpCircle" moreClasses="h-6 w-6 text-primary-500" />
    </div>
    {#if targetParticipantPubKey}
      <div class="flex flex-col items-center gap-2">
        <Avatar agentPubKeyB64={targetParticipantPubKey} size={48} />
        <p class="text-secondary-700 dark:text-tertiary-300 font-medium">{targetParticipantName}</p>
      </div>
    {/if}
    <p class="text-secondary-500 dark:text-tertiary-500 text-sm">
      {$t("common.conference_transferHostMessage")}
    </p>
  </div>
</DialogConfirm>

<DialogConfirm
  bind:open={showPromoteDialog}
  title={$t("common.conference_promoteTitle")}
  actionButtonLabel={$t("common.conference_promoteConfirm")}
  loading={isPerformingAction}
  on:confirm={confirmPromote}
  on:cancel={() => {
    showPromoteDialog = false;
    targetParticipantPubKey = null;
  }}
>
  <div class="flex flex-col items-center gap-4 text-center">
    <div class="bg-warning-500/10 flex h-12 w-12 items-center justify-center rounded-full">
      <SvgIcon icon="star" moreClasses="h-6 w-6 text-warning-500" />
    </div>
    {#if targetParticipantPubKey}
      <div class="flex flex-col items-center gap-2">
        <Avatar agentPubKeyB64={targetParticipantPubKey} size={48} />
        <p class="text-secondary-700 dark:text-tertiary-300 font-medium">{targetParticipantName}</p>
      </div>
    {/if}
    <p class="text-secondary-500 dark:text-tertiary-500 text-sm">
      {$t("common.conference_promoteMessage")}
    </p>
  </div>
</DialogConfirm>

{#if activeParticipantMenu}
  <button
    class="fixed inset-0 z-40 cursor-default bg-black/10"
    on:click={() => (activeParticipantMenu = null)}
    aria-label="Close menu"
    tabindex="-1"
    transition:fade={{ duration: 150 }}
  ></button>
{/if}
