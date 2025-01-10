import { v4 as uuidv4 } from "uuid";
import {
  CellType,
  encodeHashToBase64,
  type AgentPubKey,
  type AppClient,
  type CellId,
  type MembraneProof,
  type AgentPubKeyB64,
  type ActionHash,
  type Record,
  type ClonedCell,
  type ProvisionedCell,
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
  CreateConferenceInput,
  JoinConferenceInput,
  SignalInput,
  CallSignalType,
  ConferenceRoom,
  ProfileExtended,
  BucketInput,
  CreateConversationInput,
  SendMessageInput,
} from "$lib/types";
import { ZOME_NAME, ROLE_NAME } from "$config";
import { encodeCellIdToBase64 } from "$lib/utils";

export class RelayClient {
  constructor(
    public client: AppClient,
    public provisionedRelayCellId: CellId,
  ) {}

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

  async getAgentProfile(cellId: CellId, agentPubKey: AgentPubKey): Promise<Record | undefined> {
    return this.client.callZome({
      cell_id: cellId,
      zome_name: "profiles",
      fn_name: "get_agent_profile",
      payload: agentPubKey,
    });
  }

  async getAgentsWithProfile(cellId: CellId): Promise<AgentPubKey[]> {
    return this.client.callZome({
      cell_id: cellId,
      zome_name: "profiles",
      fn_name: "get_agents_with_profile",
      payload: null,
    });
  }

  async getAllProfiles(cellId: CellId): Promise<ProfileExtended[]> {
    const agentPubKeys = await this.getAgentsWithProfile(cellId);
    const profileExtendeds = (
      await Promise.allSettled(
        agentPubKeys.map(async (a) => {
          const record = await this.getAgentProfile(cellId, a);
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

    return appInfo.cell_info[ROLE_NAME].filter((c) => CellType.Cloned in c).map(
      (c) => c[CellType.Cloned],
    );
  }

  async getRelayProvisionedCellInfo(): Promise<ProvisionedCell> {
    const appInfo = await this.client.appInfo();
    if (!appInfo) throw new Error("Failed to get appInfo");

    const cellInfo = appInfo.cell_info[ROLE_NAME].find((c) => CellType.Provisioned in c);
    if (!cellInfo) throw new Error("Provisioned relay cell not found in appInfo");

    return cellInfo[CellType.Provisioned];
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

  public async getMessageHashes(cell_id: CellId, payload: BucketInput): Promise<Array<ActionHash>> {
    return this.client.callZome({
      cell_id,
      zome_name: ZOME_NAME,
      fn_name: "get_message_hashes",
      payload,
    });
  }

  public async getMessageEntries(
    cell_id: CellId,
    hashes: Array<ActionHash>,
  ): Promise<Array<MessageRecord>> {
    return this.client.callZome({
      cell_id,
      zome_name: ZOME_NAME,
      fn_name: "get_message_entries",
      payload: hashes,
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

  async getConfig(cell_id: CellId): Promise<Config | undefined> {
    const config = await this.client.callZome({
      cell_id,
      zome_name: ZOME_NAME,
      fn_name: "get_config",
      payload: null,
    });
    return config ? new EntryRecord<Config>(config).entry : undefined;
  }

  public async createMessage(cell_id: CellId, payload: SendMessageInput): Promise<Record> {
    return this.client.callZome({
      cell_id,
      zome_name: ZOME_NAME,
      fn_name: "create_message",
      payload,
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
    return this.client.disableCloneCell({ clone_cell_id: cell_id[0] });
  }

  public async enableConversationCell(cell_id: CellId) {
    return this.client.enableCloneCell({ clone_cell_id: cell_id[0] });
  }

  /**
   * Contacts
   *
   * Contacts are all stored in the original provisioned relay Cell.
   * So these functions do NOT take a CellId.
   *
   */

  public async getAllContacts(): Promise<ContactRecord[]> {
    return this.client.callZome({
      cell_id: this.provisionedRelayCellId,
      zome_name: ZOME_NAME,
      fn_name: "get_all_contact_entries",
      payload: null,
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

  /********** Conference **********/

  public async createConference(title: string, participants: AgentPubKey[]): Promise<EntryRecord<ConferenceRoom>> {
    const payload: CreateConferenceInput = {
      participants,
      title
    };

    const record = await this.client.callZome({
      role_name: ROLE_NAME,
      zome_name: ZOME_NAME,
      fn_name: "create_conference",
      payload
    });

    return new EntryRecord(record);
  }

  public async joinConference(roomId: ActionHash): Promise<void> {
    const payload: JoinConferenceInput = {
      room_id: roomId
    };

    await this.client.callZome({
      role_name: ROLE_NAME,
      zome_name: ZOME_NAME,
      fn_name: "join_conference",
      payload
    });
  }

  public async leaveConference(roomId: ActionHash): Promise<void> {
    await this.client.callZome({
      role_name: ROLE_NAME,
      zome_name: ZOME_NAME,
      fn_name: "leave_conference",
      payload: roomId
    });
  }

  public async sendSignal(
    roomId: string,
    target: AgentPubKey,
    payloadType: CallSignalType,
    data: string
  ): Promise<void> {
    const payload: SignalInput = {
      room_id: roomId,
      target,
      payload_type: payloadType,
      data
    };

    await this.client.callZome({
      role_name: ROLE_NAME,
      zome_name: ZOME_NAME,
      fn_name: "send_signal",
      payload
    });
  }

}
