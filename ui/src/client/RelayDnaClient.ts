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
} from "@holochain/client";
import { decode } from "@msgpack/msgpack";
import { EntryRecord } from "@holochain-open-dev/utils";
import type { Profile, ProfilesStore } from "@holochain-open-dev/profiles";
import { get } from "svelte/store";
import type {
  Config,
  Contact,
  ConversationCellAndConfig,
  ImageStruct,
  Invitation,
  MembraneProofData,
  Message,
  MessageRecord,
  Privacy,
} from "../types";

export class RelayDnaClient {
  // conversations is a map of string to ClonedCell
  conversations: { [key: string]: ConversationCellAndConfig } = {};
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
          const configRecord = await this.getConfig(cell.cell_id);

          const config = configRecord ? configRecord.entry : { title: cell.name, image: "" };

          const convoCellAndConfig: ConversationCellAndConfig = { cell, config };

          this.conversations[cell.dna_modifiers.network_seed] = convoCellAndConfig;
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
  ): Promise<ConversationCellAndConfig> {
    return this.cloneConversation(
      new Date().getTime(),
      title,
      image,
      privacy,
      this.client.myPubKey,
    );
  }

  async joinConversation(invitation: Invitation): Promise<ConversationCellAndConfig> {
    // we don't have the image at join time, it get's loaded later
    return this.cloneConversation(
      invitation.created,
      invitation.title,
      "",
      invitation.privacy,
      invitation.progenitor,
      invitation.proof,
      invitation.networkSeed,
    );
  }

  private async cloneConversation(
    created: number,
    title: string,
    image: string,
    privacy: Privacy,
    progenitor: AgentPubKey,
    membrane_proof?: MembraneProof,
    networkSeed?: string,
  ): Promise<ConversationCellAndConfig> {
    const conversationId = networkSeed || uuidv4();

    const cell = await this.client.createCloneCell({
      role_name: this.roleName,
      name: title,
      membrane_proof,
      modifiers: {
        network_seed: conversationId,
        properties: {
          created,
          privacy,
          progenitor: encodeHashToBase64(progenitor),
        },
      },
    });

    if (!networkSeed) {
      await this.setConfig({ title, image }, cell.cell_id);
    }

    await this.setMyProfileForConversation(cell.cell_id);
    const convoCellAndConfig: ConversationCellAndConfig = { cell, config: { title, image } };
    this.conversations[conversationId] = convoCellAndConfig;

    return convoCellAndConfig;
  }

  async getMessageHashes(
    conversationId: string,
    bucket: number,
    count: number,
  ): Promise<Array<ActionHash>> {
    return this.client.callZome({
      cell_id: this.conversations[conversationId].cell.cell_id,
      zome_name: this.zomeName,
      fn_name: "get_message_hashes",
      payload: { bucket, count },
    });
  }

  async getMessageEntries(
    conversationId: string,
    hashes: Array<ActionHash>,
  ): Promise<Array<MessageRecord>> {
    return this.client.callZome({
      cell_id: this.conversations[conversationId].cell.cell_id,
      zome_name: this.zomeName,
      fn_name: "get_message_entries",
      payload: hashes,
    });
  }

  async getAllAgents(conversationId: string): Promise<{ [key: AgentPubKeyB64]: Profile }> {
    const cellId = this.conversations[conversationId].cell.cell_id;

    const agentsResponse = await this.client.callZome({
      cell_id: cellId,
      zome_name: "profiles",
      fn_name: "get_agents_with_profile",
      payload: null,
    });

    return await agentsResponse.reduce(
      async (resultsPromise: { [key: AgentPubKeyB64]: Profile }, a: any) => {
        const agentRecord = await this.client.callZome({
          cell_id: cellId,
          zome_name: "profiles",
          fn_name: "get_agent_profile",
          payload: a,
        });
        const results = await resultsPromise;

        if (!!agentRecord?.entry?.Present?.entry) {
          results[encodeHashToBase64(a)] = decode(agentRecord.entry.Present.entry) as Profile;
        }

        return results;
      },
      Promise.resolve<{ [key: AgentPubKeyB64]: Profile }>({}),
    );
  }

  async setConfig(config: Config, cellId: CellId): Promise<null> {
    return this.client.callZome({
      cell_id: cellId,
      zome_name: this.zomeName,
      fn_name: "set_config",
      payload: config,
    });
  }

  async getConfig(id: CellId | string): Promise<EntryRecord<Config> | undefined> {
    const cellId = typeof id === "string" ? this.conversations[id].cell.cell_id : id;

    const config = await this.client.callZome({
      cell_id: cellId,
      zome_name: this.zomeName,
      fn_name: "get_config",
      payload: null,
    });
    return config ? new EntryRecord(config) : undefined;
  }

  async sendMessage(
    conversationId: string,
    content: string,
    bucket: number,
    images: ImageStruct[],
    agents: AgentPubKey[],
  ): Promise<EntryRecord<Message>> {
    const message = await this.client.callZome({
      cell_id: this.conversations[conversationId].cell.cell_id,
      zome_name: this.zomeName,
      fn_name: "create_message",
      payload: {
        message: { content, bucket, images },
        agents,
      },
    });
    return new EntryRecord(message);
  }

  private async setMyProfileForConversation(cellId: CellId): Promise<null> {
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

  async generateMembraneProofForAgent(
    conversationId: string,
    forAgent: AgentPubKey,
    role: number = 0,
  ): Promise<MembraneProof | undefined> {
    const conversation = this.conversations[conversationId];

    const membraneProof = await this.client.callZome({
      cell_id: conversation.cell.cell_id,
      zome_name: "profiles",
      fn_name: "generate_membrane_proof",
      payload: {
        conversation_id: conversation.cell.dna_modifiers.network_seed,
        for_agent: forAgent,
        as_role: role,
      } as MembraneProofData,
    });

    return membraneProof;
  }

  /********* Contacts **********/

  async getAllContacts() {
    return this.client.callZome({
      role_name: this.roleName,
      zome_name: this.zomeName,
      fn_name: "get_all_contact_entries",
      payload: null,
    });
  }

  async createContact(contact: Contact) {
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

  async updateContact(contact: Contact) {
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
