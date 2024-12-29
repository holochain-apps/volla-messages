import { v4 as uuidv4 } from "uuid";
import {
  CellType,
  decodeHashFromBase64,
  encodeHashToBase64,
  type AgentPubKey,
  type AppClient,
  type CellId,
  type CellInfo,
  type MembraneProof,
  type AgentPubKeyB64,
  type ActionHash,
  type DnaHashB64,
  type Record,
} from "@holochain/client";
import { EntryRecord } from "@holochain-open-dev/utils";
import type { Profile, ProfilesStore } from "@holochain-open-dev/profiles";
import { get } from "svelte/store";
import type {
  Config,
  Contact,
  ContactRecord,
  ConversationCellAndConfig,
  ImageStruct,
  Invitation,
  MembraneProofData,
  Message,
  MessageRecord,
  Privacy,
} from "$lib/types";
import { makeFullName } from "$lib/utils";

export class RelayClient {
  // conversations is a map of string to ClonedCell
  conversations: { [dnaHashB64: DnaHashB64]: ConversationCellAndConfig } = {};
  myPubKeyB64: AgentPubKeyB64;

  constructor(
    public client: AppClient,
    public profilesStore: ProfilesStore,
    public roleName: string,
    public zomeName: string,
  ) {
    this.myPubKeyB64 = encodeHashToBase64(this.client.myPubKey);
  }

  get myPubKey(): AgentPubKey {
    return this.client.myPubKey;
  }

  async createProfile(firstName: string, lastName: string, avatar: string): Promise<Record> {
    return this.client.callZome({
      role_name: this.roleName,
      zome_name: "profiles",
      fn_name: "create_profile",
      payload: {
        nickname: makeFullName(firstName, lastName),
        fields: { avatar, firstName, lastName },
      },
    });
  }

  async updateProfile(firstName: string, lastName: string, avatar: string): Promise<Record> {
    const record = await this.client.callZome({
      role_name: this.roleName,
      zome_name: "profiles",
      fn_name: "update_profile",
      payload: {
        nickname: makeFullName(firstName, lastName),
        fields: { avatar, firstName, lastName },
      },
    });

    // Update profile in every conversation I am a part of
    Object.values(this.conversations).forEach(async (conversation) => {
      await this.client.callZome({
        cell_id: conversation.cell.cell_id,
        zome_name: "profiles",
        fn_name: "update_profile",
        payload: {
          nickname: makeFullName(firstName, lastName),
          fields: { avatar, firstName, lastName },
        },
      });
    });

    return record;
  }

  /********* Conversations **********/
  async initConversations() {
    const appInfo = await this.client.appInfo();

    if (appInfo) {
      const cells: CellInfo[] = appInfo.cell_info[this.roleName].filter(
        (c) => CellType.Cloned in c,
      );

      for (const c of cells) {
        // @ts-ignore
        const cell = c[CellType.Cloned];

        try {
          const maybeConfig = await this.getConfig(cell.cell_id);
          const config = maybeConfig ? maybeConfig : { title: cell.name, image: "" };
          this.conversations[encodeHashToBase64(cell.cell_id[0])] = { cell, config };
        } catch (e) {
          console.error("Unable to get config for cell:", cell, e);
        }
      }
    }
  }

  async createConversation(
    title: string,
    image: string,
    privacy: Privacy,
  ): Promise<ConversationCellAndConfig | null> {
    return this._cloneConversation(
      new Date().getTime(),
      title,
      image,
      privacy,
      this.client.myPubKey,
    );
  }

  async joinConversation(invitation: Invitation): Promise<ConversationCellAndConfig | null> {
    // we don't have the image at join time, it get's loaded later
    return this._cloneConversation(
      invitation.created,
      invitation.title,
      "",
      invitation.privacy,
      invitation.progenitor,
      invitation.proof,
      invitation.networkSeed,
    );
  }

  async _cloneConversation(
    created: number,
    title: string,
    image: string,
    privacy: Privacy,
    progenitor: AgentPubKey,
    membrane_proof?: MembraneProof,
    networkSeed?: string,
  ): Promise<ConversationCellAndConfig | null> {
    const newNetworkSeed = networkSeed || uuidv4();

    try {
      const cell = await this.client.createCloneCell({
        role_name: this.roleName,
        name: title,
        membrane_proof,
        modifiers: {
          network_seed: newNetworkSeed,
          properties: {
            created,
            privacy,
            progenitor: encodeHashToBase64(progenitor),
          },
        },
      });
      const config: Config = { title, image };

      if (!networkSeed) {
        await this.setConfig(config, cell.cell_id);
      }

      await this._setMyProfileForConversation(cell.cell_id);
      const convoCellAndConfig: ConversationCellAndConfig = { cell, config };
      this.conversations[encodeHashToBase64(cell.cell_id[0])] = convoCellAndConfig;
      return convoCellAndConfig;
    } catch (e) {
      console.error("Error creating conversation", e);
      return null;
    }
  }

  public async getAllMessages(
    dnaHashB64: DnaHashB64,
    buckets: Array<number>,
  ): Promise<Array<MessageRecord>> {
    return this.client.callZome({
      cell_id: this.conversations[dnaHashB64].cell.cell_id,
      zome_name: this.zomeName,
      fn_name: "get_messages_for_buckets",
      payload: buckets,
    });
  }

  public async getMessageHashes(
    dnaHashB64: DnaHashB64,
    bucket: number,
    count: number,
  ): Promise<Array<ActionHash>> {
    return this.client.callZome({
      cell_id: this.conversations[dnaHashB64].cell.cell_id,
      zome_name: this.zomeName,
      fn_name: "get_message_hashes",
      payload: { bucket, count },
    });
  }

  public async getMessageEntries(
    dnaHashB64: DnaHashB64,
    hashes: Array<ActionHash>,
  ): Promise<Array<MessageRecord>> {
    return this.client.callZome({
      cell_id: this.conversations[dnaHashB64].cell.cell_id,
      zome_name: this.zomeName,
      fn_name: "get_message_entries",
      payload: hashes,
    });
  }

  public async getAllAgents(dnaHashB64: DnaHashB64): Promise<{ [key: AgentPubKeyB64]: Profile }> {
    const cellId = this.conversations[dnaHashB64].cell.cell_id;

    // Fetcha all AgentPubKeys of agents with profiles
    const agentsResponse: AgentPubKey[] = await this.client.callZome({
      cell_id: cellId,
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
            cell_id: cellId,
            zome_name: "profiles",
            fn_name: "get_agent_profile",
            payload: agentPubKey,
          });
          return [encodeHashToBase64(agentPubKey), new EntryRecord<Profile>(record).entry];
        }),
      )
    )
      .filter((p) => p.status === "fulfilled")
      .map((p) => p.value);

    return Object.fromEntries(profileEntries);
  }

  async setConfig(config: Config, cellId: CellId): Promise<null> {
    return this.client.callZome({
      cell_id: cellId,
      zome_name: this.zomeName,
      fn_name: "set_config",
      payload: config,
    });
  }

  async getConfig(cellId: CellId): Promise<Config | undefined> {
    console.log("cell id is", cellId);

    const config = await this.client.callZome({
      cell_id: cellId,
      zome_name: this.zomeName,
      fn_name: "get_config",
      payload: null,
    });
    return config ? new EntryRecord<Config>(config).entry : undefined;
  }

  public async sendMessage(
    dnaHashB64: DnaHashB64,
    content: string,
    bucket: number,
    images: ImageStruct[],
    agents: AgentPubKey[],
  ): Promise<EntryRecord<Message>> {
    const record = await this.client.callZome({
      cell_id: this.conversations[dnaHashB64].cell.cell_id,
      zome_name: this.zomeName,
      fn_name: "create_message",
      payload: {
        message: { content, bucket, images },
        agents,
      },
    });
    return new EntryRecord(record);
  }

  async _setMyProfileForConversation(cellId: CellId): Promise<null> {
    const myProfile = get(this.profilesStore.myProfile);
    const myProfileValue =
      myProfile && myProfile.status === "complete" && (myProfile.value as EntryRecord<Profile>);
    const profile = myProfileValue ? myProfileValue.entry : undefined;

    return this.client.callZome({
      cell_id: cellId,
      zome_name: "profiles",
      fn_name: "create_profile",
      payload: profile,
    });
  }

  public async inviteAgentToConversation(
    dnaHashB64: DnaHashB64,
    forAgent: AgentPubKey,
    role: number = 0,
  ): Promise<MembraneProof> {
    const conversation = this.conversations[dnaHashB64];
    const data: MembraneProofData = {
      conversation_id: conversation.cell.dna_modifiers.network_seed,
      for_agent: forAgent,
      as_role: role,
    };
    const r = await this.client.callZome({
      cell_id: conversation.cell.cell_id,
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

  public async createContact(contact: Contact): Promise<Record> {
    return this.client.callZome({
      role_name: this.roleName,
      zome_name: this.zomeName,
      fn_name: "create_contact",
      payload: {
        avatar: contact.avatar,
        first_name: contact.firstName,
        last_name: contact.lastName,
        public_key: decodeHashFromBase64(contact.publicKeyB64),
      },
    });
  }

  public async updateContact(contact: Contact): Promise<Record> {
    return this.client.callZome({
      role_name: this.roleName,
      zome_name: this.zomeName,
      fn_name: "update_contact",
      payload: {
        original_contact_hash: contact.originalActionHash,
        previous_contact_hash: contact.currentActionHash,
        updated_contact: {
          avatar: contact.avatar,
          first_name: contact.firstName,
          last_name: contact.lastName,
          public_key: decodeHashFromBase64(contact.publicKeyB64),
        },
      },
    });
  }
}
