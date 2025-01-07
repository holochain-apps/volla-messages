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
} from "@holochain/client";
import { EntryRecord } from "@holochain-open-dev/utils";
import type { ProfilesStore } from "@holochain-open-dev/profiles";
import { get } from "svelte/store";
import type {
  Config,
  Contact,
  ContactRecord,
  ImageStruct,
  Invitation,
  MembraneProofData,
  Message,
  MessageRecord,
  Privacy,
  UpdateContactInput,
  Profile,
  CreateConferenceInput,
  JoinConferenceInput,
  SignalInput,
  CallSignalType,
  ConferenceRoom,
} from "$lib/types";
import { makeFullName } from "$lib/utils";

export class RelayClient {
  constructor(
    public client: AppClient,
    public profilesStore: ProfilesStore,
    public roleName: string,
    public zomeName: string,
  ) {}

  async createProfile(firstName: string, lastName: string, avatar: string): Promise<void> {
    await this.client.callZome({
      role_name: this.roleName,
      zome_name: "profiles",
      fn_name: "create_profile",
      payload: {
        nickname: makeFullName(firstName, lastName),
        fields: { avatar, firstName, lastName },
      },
    });
  }

  async updateProfile(firstName: string, lastName: string, avatar: string): Promise<void> {
    const payload = {
      nickname: makeFullName(firstName, lastName),
      fields: { avatar, firstName, lastName },
    };

    await this.client.callZome({
      role_name: this.roleName,
      zome_name: "profiles",
      fn_name: "update_profile",
      payload,
    });

    // Update profile in every conversation I am a part of
    const clonedCellInfos = await this.getRelayClonedCellInfos();
    clonedCellInfos
      .map((c) => c.cell_id)
      .forEach(async (cell_id) => {
        await this.client.callZome({
          cell_id,
          zome_name: "profiles",
          fn_name: "update_profile",
          payload,
        });
      });
  }

  /********* Conversations **********/
  async getRelayClonedCellInfos(): Promise<ClonedCell[]> {
    const appInfo = await this.client.appInfo();
    if (!appInfo) throw new Error("Failed to get appInfo");

    return appInfo.cell_info[this.roleName]
      .filter((c) => CellType.Cloned in c)
      .map((c) => c[CellType.Cloned]);
  }

  async createConversation(title: string, image: string, privacy: Privacy): Promise<ClonedCell> {
    const modifiers = {
      network_seed: uuidv4(),
      properties: {
        created: new Date().getTime(),
        privacy,
        progenitor: encodeHashToBase64(this.client.myPubKey),
      },
    };
    const cellInfo = await this.client.createCloneCell({
      role_name: this.roleName,
      name: title,
      modifiers,
    });
    await this.setConfig(cellInfo.cell_id, { title, image });
    await this._setMyProfileForConversation(cellInfo.cell_id);

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
      role_name: this.roleName,
      name: invitation.title,
      membrane_proof: invitation.proof,
      modifiers,
    });
    await this._setMyProfileForConversation(cellInfo.cell_id);

    return cellInfo;
  }

  public async getMessageHashes(
    cell_id: CellId,
    bucket: number,
    count: number,
  ): Promise<Array<ActionHash>> {
    return this.client.callZome({
      cell_id,
      zome_name: this.zomeName,
      fn_name: "get_message_hashes",
      payload: { bucket, count },
    });
  }

  public async getMessageEntries(
    cell_id: CellId,
    hashes: Array<ActionHash>,
  ): Promise<Array<MessageRecord>> {
    return this.client.callZome({
      cell_id,
      zome_name: this.zomeName,
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
      zome_name: this.zomeName,
      fn_name: "set_config",
      payload: config,
    });
  }

  async getConfig(cell_id: CellId): Promise<Config | undefined> {
    const config = await this.client.callZome({
      cell_id,
      zome_name: this.zomeName,
      fn_name: "get_config",
      payload: null,
    });
    return config ? new EntryRecord<Config>(config).entry : undefined;
  }

  public async sendMessage(
    cell_id: CellId,
    content: string,
    bucket: number,
    images: ImageStruct[],
    agents: AgentPubKey[],
  ): Promise<EntryRecord<Message>> {
    const record = await this.client.callZome({
      cell_id,
      zome_name: this.zomeName,
      fn_name: "create_message",
      payload: {
        message: { content, bucket, images },
        agents,
      },
    });
    return new EntryRecord(record);
  }

  async _setMyProfileForConversation(cell_id: CellId): Promise<null> {
    const myProfile = get(this.profilesStore.myProfile);
    const myProfileValue =
      myProfile && myProfile.status === "complete" && (myProfile.value as EntryRecord<Profile>);
    const profile = myProfileValue ? myProfileValue.entry : undefined;

    return this.client.callZome({
      cell_id,
      zome_name: "profiles",
      fn_name: "create_profile",
      payload: profile,
    });
  }

  public async inviteAgentToConversation(
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
      zome_name: this.zomeName,
      fn_name: "generate_membrane_proof",
      payload: data,
    });

    return r;
  }

  /********* Contacts **********/

  public async getAllContacts(): Promise<ContactRecord[]> {
    return this.client.callZome({
      role_name: this.roleName,
      zome_name: this.zomeName,
      fn_name: "get_all_contact_entries",
      payload: null,
    });
  }

  public async createContact(payload: Contact): Promise<Record> {
    return this.client.callZome({
      role_name: this.roleName,
      zome_name: this.zomeName,
      fn_name: "create_contact",
      payload,
    });
  }

  public async updateContact(payload: UpdateContactInput): Promise<Record> {
    return this.client.callZome({
      role_name: this.roleName,
      zome_name: this.zomeName,
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
      role_name: this.roleName,
      zome_name: this.zomeName,
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
      role_name: this.roleName,
      zome_name: this.zomeName,
      fn_name: "join_conference",
      payload
    });
  }

  public async leaveConference(roomId: ActionHash): Promise<void> {
    await this.client.callZome({
      role_name: this.roleName,
      zome_name: this.zomeName,
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
      role_name: this.roleName,
      zome_name: this.zomeName,
      fn_name: "send_signal",
      payload
    });
  }

}
