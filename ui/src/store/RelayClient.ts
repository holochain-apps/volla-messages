import { v4 as uuidv4 } from "uuid";
import {
  CellType,
  encodeHashToBase64,
  decodeHashFromBase64,
  type AgentPubKey,
  type AppClient,
  type CellId,
  type MembraneProof,
  type AgentPubKeyB64,
  type ActionHash,
  type Record,
  type ClonedCell,
  type ProvisionedCell,
  type SignedActionHashed,
} from "@holochain/client";
import { EntryRecord } from "@holochain-open-dev/utils";
import type {
  Config,
  Contact,
  ContactRecord,
  Invitation,
  MembraneProofData,
  MessageRecord,
  UpdateContactInput,
  Profile,
  ProfileExtended,
  BucketInput,
  CreateConversationInput,
  SendMessageInput,
  DeleteMessageInput,
  SimplePeerSignalType,
  CreateConferenceInput,
  JoinConferenceInput,
  SignalInput,
  CellIdB64,
  ConferenceRole,
  ConferenceParticipantRecord,
  TransferHostInput,
  KickParticipantInput,
  RoleChangeInput,
} from "$lib/types";
import { ZOME_NAME, ROLE_NAME } from "$config";
import { encodeCellIdToBase64, decodeCellIdFromBase64 } from "$lib/utils";

export class RelayClient {
  constructor(
    public client: AppClient,
    public provisionedRelayCellId: CellId,
  ) {}

  decodeCellId(cellIdB64: CellIdB64): CellId {
    return decodeCellIdFromBase64(cellIdB64);
  }

  async createProfile(cellId: CellId, payload: Profile): Promise<Record> {
    return this.client.callZome({
      cell_id: cellId,
      zome_name: "profiles",
      fn_name: "create_profile",
      payload,
    });
  }

  async updateProfile(cellId: CellId, payload: Profile): Promise<Record> {
    return this.client.callZome({
      cell_id: cellId,
      zome_name: "profiles",
      fn_name: "update_profile",
      payload,
    });
  }

  async getAgentProfile(
    cellId: CellId,
    agentPubKey: AgentPubKey,
    local?: boolean,
  ): Promise<Record | undefined> {
    return this.client.callZome({
      cell_id: cellId,
      zome_name: "profiles",
      fn_name: "get_agent_profile",
      payload: { input: agentPubKey, local },
    });
  }

  async getAgentsWithProfile(cellId: CellId, local?: boolean): Promise<AgentPubKey[]> {
    return this.client.callZome({
      cell_id: cellId,
      zome_name: "profiles",
      fn_name: "get_agents_with_profile",
      payload: { input: null, local },
    });
  }

  async getAllProfiles(cellId: CellId, local: boolean): Promise<ProfileExtended[]> {
    const agentPubKeys = await this.getAgentsWithProfile(cellId, local);
    const profileExtendeds = (
      await Promise.allSettled(
        agentPubKeys.map(async (a) => {
          const record = await this.getAgentProfile(cellId, a, local);
          if (record === undefined)
            throw new Error(
              `Failed to get agent profile for cellId [${encodeCellIdToBase64(cellId)} and agent ${encodeHashToBase64(a)}`,
            );

          const profile = new EntryRecord<Profile>(record).entry;
          if (profile === undefined)
            throw new Error(
              `Failed to decode agent profile entry for cellId [${encodeCellIdToBase64(cellId)} and agent ${encodeHashToBase64(a)}`,
            );

          return {
            profile,
            publicKeyB64: encodeHashToBase64(a),
          } as ProfileExtended;
        }),
      )
    )
      .filter((p) => p.status === "fulfilled")
      .map((p) => p.value);

    return profileExtendeds;
  }

  /********* Conversations **********/
  async getRelayClonedCellInfos(): Promise<ClonedCell[]> {
    const appInfo = await this.client.appInfo();
    if (!appInfo) throw new Error("Failed to get appInfo");

    return appInfo.cell_info[ROLE_NAME].filter((c) => c.type === CellType.Cloned).map(
      (c) => c.value,
    );
  }

  async getRelayProvisionedCellInfo(): Promise<ProvisionedCell> {
    const appInfo = await this.client.appInfo();
    if (!appInfo) throw new Error("Failed to get appInfo");

    const cellInfo = appInfo.cell_info[ROLE_NAME].find((c) => c.type === CellType.Provisioned);
    if (!cellInfo) throw new Error("Provisioned relay cell not found in appInfo");

    return cellInfo.value;
  }

  async createConversation(input: CreateConversationInput): Promise<ClonedCell> {
    const modifiers = {
      network_seed: uuidv4(),
      properties: {
        created: new Date().getTime(),
        privacy: input.privacy,
        progenitor: encodeHashToBase64(this.client.myPubKey),
      },
    };
    const cellInfo = await this.client.createCloneCell({
      role_name: ROLE_NAME,
      name: input.config.title,
      modifiers,
    });

    return cellInfo;
  }

  async joinConversation(invitation: Invitation): Promise<ClonedCell> {
    const modifiers = {
      network_seed: invitation.networkSeed,
      properties: {
        created: invitation.created,
        privacy: invitation.privacy,
        progenitor: encodeHashToBase64(invitation.progenitor),
      },
    };
    const cellInfo = await this.client.createCloneCell({
      role_name: ROLE_NAME,
      name: invitation.title,
      membrane_proof: invitation.proof,
      modifiers,
    });

    return cellInfo;
  }

  public async createMessage(cellId: CellId, payload: SendMessageInput): Promise<Record> {
    const result = await this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "create_message",
      payload,
    });

    return result;
  }

  public async getMessageHashes(
    cell_id: CellId,
    bucket: BucketInput,
    local?: boolean,
  ): Promise<Array<ActionHash>> {
    return this.client.callZome({
      cell_id,
      zome_name: ZOME_NAME,
      fn_name: "get_message_hashes",
      payload: { input: bucket, local },
    });
  }

  public async getMessageEntries(
    cell_id: CellId,
    hashes: Array<ActionHash>,
    local?: boolean,
  ): Promise<Array<MessageRecord>> {
    return this.client.callZome({
      cell_id,
      zome_name: ZOME_NAME,
      fn_name: "get_message_entries",
      payload: { input: hashes, local },
    });
  }

  /**
   * Fetch all AgentPubKeys of agents with profiles
   */
  public async getAllAgents(cell_id: CellId): Promise<{ [key: AgentPubKeyB64]: Profile }> {
    const agentsResponse: AgentPubKey[] = await this.client.callZome({
      cell_id,
      zome_name: "profiles",
      fn_name: "get_agents_with_profile",
      payload: null,
    });

    // Get profile for each AgentPubKey
    // If profile not found, exclude from results.
    const profileEntries = (
      await Promise.allSettled(
        agentsResponse.map(async (agentPubKey) => {
          const record = await this.client.callZome({
            cell_id,
            zome_name: "profiles",
            fn_name: "get_agent_profile",
            payload: agentPubKey,
          });
          const profile = new EntryRecord<Profile>(record).entry;
          if (!profile) throw new Error("Failed to get profile");

          return [encodeHashToBase64(agentPubKey), profile];
        }),
      )
    )
      .filter((p) => p.status === "fulfilled")
      .map((p) => p.value);

    return Object.fromEntries(profileEntries);
  }

  async setConfig(cell_id: CellId, config: Config): Promise<null> {
    return this.client.callZome({
      cell_id,
      zome_name: ZOME_NAME,
      fn_name: "set_config",
      payload: config,
    });
  }

  async getConfig(cell_id: CellId, local?: boolean): Promise<Config | undefined> {
    const config = await this.client.callZome({
      cell_id,
      zome_name: ZOME_NAME,
      fn_name: "get_config",
      payload: { input: null, local },
    });
    return config ? new EntryRecord<Config>(config).entry : undefined;
  }

  public async getRepliesForMessage(
    cell_id: CellId,
    message_hash: ActionHash,
    local?: boolean,
  ): Promise<Array<MessageRecord>> {
    return this.client.callZome({
      cell_id,
      zome_name: ZOME_NAME,
      fn_name: "get_replies_for_message",
      payload: { input: message_hash, local },
    });
  }

  public async getThreadMessages(
    cell_id: CellId,
    thread_root: ActionHash,
    local?: boolean,
  ): Promise<Array<MessageRecord>> {
    return this.client.callZome({
      cell_id,
      zome_name: ZOME_NAME,
      fn_name: "get_thread_messages",
      payload: { input: thread_root, local },
    });
  }

  public async getReplyCount(cell_id: CellId, message_hash: ActionHash): Promise<number> {
    return this.client.callZome({
      cell_id,
      zome_name: ZOME_NAME,
      fn_name: "get_reply_count",
      payload: message_hash,
    });
  }

  async setMyProfileForConversation(cell_id: CellId): Promise<Record> {
    const record = await this.getAgentProfile(this.provisionedRelayCellId, this.client.myPubKey);
    if (!record)
      throw new Error(
        `Failed to get profile record for agent ${encodeHashToBase64(this.client.myPubKey)}`,
      );

    const profile = new EntryRecord<Profile>(record).entry;
    if (!profile)
      throw new Error(
        `Failed to decode profile entry for agent ${encodeHashToBase64(this.client.myPubKey)}`,
      );

    return this.client.callZome({
      cell_id,
      zome_name: "profiles",
      fn_name: "create_profile",
      payload: profile,
    });
  }

  public async generateMembraneProof(
    cell_id: CellId,
    forAgent: AgentPubKey,
    role: number = 0,
  ): Promise<MembraneProof> {
    const relayClonedCellInfos = await this.getRelayClonedCellInfos();
    const conversation = relayClonedCellInfos.find(
      (c) => encodeHashToBase64(c.cell_id[0]) === encodeHashToBase64(cell_id[0]),
    );
    if (conversation === undefined) throw new Error("Conversation with cell_id not found");

    const data: MembraneProofData = {
      conversation_id: conversation.dna_modifiers.network_seed,
      for_agent: forAgent,
      as_role: role,
    };
    const r = await this.client.callZome({
      cell_id,
      zome_name: ZOME_NAME,
      fn_name: "generate_membrane_proof",
      payload: data,
    });

    return r;
  }

  public async disableConversationCell(cell_id: CellId) {
    return this.client.disableCloneCell({ clone_cell_id: { type: "dna_hash", value: cell_id[0] } });
  }

  public async enableConversationCell(cell_id: CellId) {
    return this.client.enableCloneCell({ clone_cell_id: { type: "dna_hash", value: cell_id[0] } });
  }

  /**
   * Contacts
   *
   * Contacts are all stored in the original provisioned relay Cell.
   * So these functions do NOT take a CellId.
   *
   */

  public async getAllContacts(local?: boolean): Promise<ContactRecord[]> {
    return this.client.callZome({
      cell_id: this.provisionedRelayCellId,
      zome_name: ZOME_NAME,
      fn_name: "get_all_contact_entries",
      payload: { input: null, local },
    });
  }

  public async createContact(payload: Contact): Promise<Record> {
    return this.client.callZome({
      cell_id: this.provisionedRelayCellId,
      zome_name: ZOME_NAME,
      fn_name: "create_contact",
      payload,
    });
  }

  public async updateContact(payload: UpdateContactInput): Promise<Record> {
    return this.client.callZome({
      cell_id: this.provisionedRelayCellId,
      zome_name: ZOME_NAME,
      fn_name: "update_contact",
      payload,
    });
  }

  public async deleteContact(originalContactHash: ActionHash): Promise<ActionHash> {
    return this.client.callZome({
      cell_id: this.provisionedRelayCellId,
      zome_name: ZOME_NAME,
      fn_name: "delete_contact",
      payload: originalContactHash,
    });
  }

  /**
   * Delete a message
   *
   * Delete a message by its ActionHash, and get the status of the deletion.
   * Message is not actually deleted, but a delete action is created.
   *
   */

  public async deleteMessage(cellId: CellId, payload: DeleteMessageInput): Promise<Record> {
    return this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "delete_message",
      payload,
    });
  }

  /**
   * Conference / AV Calling
   */

  public async createConference(participants: AgentPubKey[], cellId: CellId): Promise<string> {
    console.log("[RelayClient] createConference() - Calling Holochain zome");
    console.log("[RelayClient] Cell ID:", encodeCellIdToBase64(cellId));
    console.log("[RelayClient] Participants (Uint8Array):", participants);
    console.log("[RelayClient] Number of participants:", participants.length);

    const input: CreateConferenceInput = { participants };
    console.log("[RelayClient] Input payload:", input);

    const result = await this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "create_conference",
      payload: input,
    });

    console.log("[RelayClient] createConference() result from Holochain:", result);
    return result;
  }

  public async joinConference(
    room_id: string,
    participants: AgentPubKey[],
    cellId: CellId,
  ): Promise<void> {
    console.log("[RelayClient] joinConference() - Calling Holochain zome");
    console.log("[RelayClient] Cell ID:", encodeCellIdToBase64(cellId));
    console.log("[RelayClient] Room ID:", room_id);
    console.log("[RelayClient] Participants to send signals to:", participants);
    console.log("[RelayClient] Number of participants:", participants.length);

    const input: JoinConferenceInput = { room_id, participants };
    console.log("[RelayClient] Input payload:", input);

    const result = await this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "join_conference",
      payload: input,
    });

    console.log("[RelayClient] joinConference() complete - Holochain should have sent signals");
    return result;
  }

  public async leaveConference(room_id: string, cellId: CellId): Promise<void> {
    return this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "leave_conference",
      payload: room_id,
    });
  }

  public async endConferenceForAll(
    room_id: string,
    participants: AgentPubKey[],
    cellId: CellId,
  ): Promise<void> {
    return this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "end_conference_for_all",
      payload: { room_id, participants },
    });
  }

  public async rejectConference(
    room_id: string,
    participants: AgentPubKey[],
    cellId: CellId,
  ): Promise<void> {
    return this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "reject_conference",
      payload: { room_id, participants },
    });
  }

  public async sendSignal(
    room_id: string,
    target: AgentPubKey,
    payload_type: SimplePeerSignalType,
    data: string,
    cellId: CellId,
  ): Promise<void> {
    console.log("[RelayClient] sendSignal() - Sending WebRTC signal via Holochain");
    console.log("[RelayClient] Cell ID:", encodeCellIdToBase64(cellId));
    console.log("[RelayClient] Room ID:", room_id);
    console.log("[RelayClient] Target agent:", encodeHashToBase64(target));
    console.log("[RelayClient] Signal type:", payload_type);
    console.log("[RelayClient] Data length:", data.length);

    const input: SignalInput = { room_id, target, payload_type, data };

    await this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "send_signal",
      payload: input,
    });

    console.log("[RelayClient] sendSignal() complete");
  }

  public async sendInitRequest(
    room_id: string,
    target: AgentPubKey,
    connection_id: string,
    cellId: CellId,
  ): Promise<void> {
    console.log("[RelayClient] sendInitRequest() - Sending init request via Holochain");

    await this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "send_signal",
      payload: {
        room_id,
        target,
        payload_type: "InitRequest",
        data: JSON.stringify({ connection_id }),
      },
    });

    console.log("[RelayClient] sendInitRequest() complete");
  }

  public async sendInitAccept(
    room_id: string,
    target: AgentPubKey,
    connection_id: string,
    cellId: CellId,
  ): Promise<void> {
    console.log("[RelayClient] sendInitAccept() - Sending init accept via Holochain");

    await this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "send_signal",
      payload: {
        room_id,
        target,
        payload_type: "InitAccept",
        data: JSON.stringify({ connection_id }),
      },
    });

    console.log("[RelayClient] sendInitAccept() complete");
  }

  public async sendSdpData(
    room_id: string,
    target: AgentPubKey,
    connection_id: string,
    sdpData: object,
    cellId: CellId,
  ): Promise<void> {
    console.log("[RelayClient] sendSdpData() - Sending SDP data via Holochain");

    const wrappedData = JSON.stringify({ connection_id, sdp: sdpData });

    await this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "send_signal",
      payload: { room_id, target, payload_type: "SdpData", data: wrappedData },
    });

    console.log("[RelayClient] sendSdpData() complete");
  }

  public async sendMediaStateSignal(
    room_id: string,
    target: AgentPubKey,
    connection_id: string,
    videoEnabled: boolean,
    audioEnabled: boolean,
    cellId: CellId,
  ): Promise<void> {
    console.log("[RelayClient] sendMediaStateSignal() - Sending media state via Holochain");

    const wrappedData = JSON.stringify({ connection_id, videoEnabled, audioEnabled });

    await this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "send_signal",
      payload: { room_id, target, payload_type: "MediaState", data: wrappedData },
    });

    console.log("[RelayClient] sendMediaStateSignal() complete");
  }

  public async getMyConferenceRole(
    room_id: string,
    cellId: CellId,
  ): Promise<ConferenceRole | null> {
    console.log("[RelayClient] getMyConferenceRole() - Fetching role from DHT");
    const result = await this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "get_my_conference_role",
      payload: room_id,
    });
    console.log("[RelayClient] getMyConferenceRole() result:", result);
    return result;
  }

  public async getConferenceParticipants(
    room_id: string,
    cellId: CellId,
  ): Promise<ConferenceParticipantRecord[]> {
    console.log("[RelayClient] getConferenceParticipants() - Fetching participants from DHT");
    const result = await this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "get_conference_participants",
      payload: room_id,
    });
    console.log("[RelayClient] getConferenceParticipants() result:", result);
    return result;
  }

  public async transferHost(
    room_id: string,
    new_host: AgentPubKey,
    cellId: CellId,
  ): Promise<void> {
    console.log("[RelayClient] transferHost() - Transferring host role");
    const input: TransferHostInput = { room_id, new_host };
    await this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "transfer_host",
      payload: input,
    });
    console.log("[RelayClient] transferHost() complete");
  }

  public async kickParticipant(
    room_id: string,
    target: AgentPubKey,
    cellId: CellId,
  ): Promise<void> {
    console.log("[RelayClient] kickParticipant() - Kicking participant");
    const input: KickParticipantInput = { room_id, target };
    await this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "kick_participant",
      payload: input,
    });
    console.log("[RelayClient] kickParticipant() complete");
  }

  public async changeParticipantRole(
    room_id: string,
    target: AgentPubKey,
    new_role: ConferenceRole,
    cellId: CellId,
  ): Promise<void> {
    console.log("[RelayClient] changeParticipantRole() - Changing role");
    const input: RoleChangeInput = { room_id, target, new_role };
    await this.client.callZome({
      cell_id: cellId,
      zome_name: ZOME_NAME,
      fn_name: "change_participant_role",
      payload: input,
    });
    console.log("[RelayClient] changeParticipantRole() complete");
  }
}
