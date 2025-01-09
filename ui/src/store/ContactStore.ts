import {
  encodeHashToBase64,
  type ActionHash,
  type AgentPubKeyB64,
  type CellId,
  type Record,
} from "@holochain/client";
import { get, type Invalidator, type Subscriber, type Unsubscriber, derived } from "svelte/store";
import { decodeCellIdFromBase64, makeFullName } from "$lib/utils";
import type { CellIdB64, Contact, ContactExtended, ProfileExtended } from "$lib/types";
import type { RelayClient } from "./RelayClient";
import { EntryRecord } from "@holochain-open-dev/utils";
import { persisted } from "./GenericPersistedStore";
import { createGenericKeyValueStore } from "./GenericKeyValueStore";
import { sortBy } from "lodash-es";

export interface ContactsExtendedObj {
  [agentPubKeyB64: AgentPubKeyB64]: ContactExtended;
}

export interface ContactStore {
  initialize: () => Promise<void>;
  create: (val: Contact, cellIdB64: CellIdB64) => Promise<void>;
  update: (val: Contact) => Promise<void>;
  delete: (agentPubKeyB64: AgentPubKeyB64) => Promise<void>;
  getHasAgentJoinedDht: (agentPubKeyB64: AgentPubKeyB64) => Promise<boolean>;
  getAsProfileExtended: (agentPubKeyB64: AgentPubKeyB64) => ProfileExtended;
  subscribe: (
    this: void,
    run: Subscriber<ContactsExtendedObj>,
    invalidate?: Invalidator<ContactsExtendedObj> | undefined,
  ) => Unsubscriber;
}

/**
 * Creates a store for managing contacts
 *
 * @param client
 * @returns
 */
export function createContactStore(client: RelayClient): ContactStore {
  const contacts = createGenericKeyValueStore<ContactExtended>();
  const cellIds = persisted<{ [agentPubKeyB64: AgentPubKeyB64]: CellId }>(
    `CONTACTS.PRIVATE_CONVERSATION`,
    {},
  );

  /**
   * Create a contact
   *
   * Note the private conversation Cell with this contact must be created
   * BEFORE calling this function.
   *
   * @param val
   * @param cellId: The CellId of the private conversation with this contact
   */
  async function create(val: Contact, cellIdB64: CellIdB64) {
    const record = await client.createContact(val);
    const agentPubKeyB64 = encodeHashToBase64(val.public_key);
    const cellId = decodeCellIdFromBase64(cellIdB64);
    cellIds.update((d) => ({
      ...d,
      [agentPubKeyB64]: cellId,
    }));
    contacts.updateKeyValue(agentPubKeyB64, _makeContactExtendedFromRecord(record, cellId));
  }

  /**
   * Update a contact
   */
  async function update(val: Contact) {
    const prevContact = contacts.getKeyValue(encodeHashToBase64(val.public_key));
    const record = await client.updateContact({
      original_contact_hash: prevContact.originalActionHash,
      previous_contact_hash: prevContact.previousActionHash,
      updated_contact: val,
    });
    contacts.updateKeyValue(
      encodeHashToBase64(val.public_key),
      _makeContactExtendedFromRecord(record, prevContact.cellId, prevContact.originalActionHash),
    );
  }

  /**
   * Delete a contact
   */
  async function deleteContact(agentPubKeyB64: AgentPubKeyB64) {
    const contact = contacts.getKeyValue(agentPubKeyB64);
    await client.deleteContact(contact.originalActionHash);
    // Updates the local stores
    contacts.removeKeyValue(agentPubKeyB64);
    cellIds.update((d) => {
      const updated = { ...d };
      delete updated[agentPubKeyB64];
      return updated;
    });
  }

  /**
   * Fetch contacts data and load into writable
   */
  async function initialize() {
    const contactRecords = await client.getAllContacts();
    const $cellIds = get(cellIds);

    // Set contacts writables
    contacts.set(
      // Convert list to obj
      Object.fromEntries(
        // Construct list of [agentPubKeyB64, ContactExtended]
        contactRecords
          .filter((c) => c.contact !== undefined)
          .map((c) => [
            encodeHashToBase64(c.contact!.public_key),
            _makeContactExtended(
              c.contact!,
              c.original_action,
              c.signed_action.hashed.hash,
              $cellIds[encodeHashToBase64(c.contact!.public_key)],
            ),
          ]),
      ),
    );
  }

  /**
   * Check if there are 2+ profiles in private conversation cell.
   *
   * @returns
   */
  async function getHasAgentJoinedDht(agentPubKeyB64: AgentPubKeyB64): Promise<boolean> {
    const c = contacts.getKeyValue(agentPubKeyB64);
    const agents = await client.getAgentsWithProfile(c.cellId);
    return agents.length >= 2;
  }

  /**
   * Get a contact, transform into a ProfileExtended
   *
   * @param agentPubKeyB64
   * @returns
   */
  function getAsProfileExtended(agentPubKeyB64: AgentPubKeyB64): ProfileExtended {
    const c = contacts.getKeyValue(agentPubKeyB64);

    return {
      publicKeyB64: c.publicKeyB64,
      profile: {
        nickname: c.fullName,
        fields: {
          firstName: c.contact.first_name,
          lastName: c.contact.last_name,
          avatar: c.contact.avatar,
        },
      },
    };
  }

  /**
   * Construct a ContactExtended
   *
   * @param record
   * @param cellId
   * @param originalActionHash
   * @returns
   */
  function _makeContactExtendedFromRecord(
    record: Record,
    cellId: CellId,
    originalActionHash?: ActionHash,
  ): ContactExtended {
    const contact = new EntryRecord<Contact>(record).entry;
    if (!contact) throw new Error("Failed to make ContactExtended. No entry in record.");

    originalActionHash = originalActionHash ? originalActionHash : record.signed_action.hashed.hash;
    return _makeContactExtended(
      contact,
      originalActionHash,
      record.signed_action.hashed.hash,
      cellId,
    );
  }

  /**
   * Construct a ContactExtended
   *
   * @param contact
   * @param originalActionHash
   * @param previousActionHash
   * @param cellId
   * @returns
   */
  function _makeContactExtended(
    contact: Contact,
    originalActionHash: ActionHash,
    previousActionHash: ActionHash,
    cellId: CellId,
  ): ContactExtended {
    return {
      contact,
      originalActionHash,
      previousActionHash,
      fullName: makeFullName(contact.first_name, contact.last_name),
      publicKeyB64: encodeHashToBase64(contact.public_key),
      cellId,
    };
  }

  return {
    initialize,

    create,
    update,
    delete: deleteContact,

    getHasAgentJoinedDht,
    getAsProfileExtended,

    subscribe: contacts.subscribe,
  };
}

/**
 * Creates a derived store for a single contact from the main contact store
 *
 * @param contactStore - The main contact store instance
 * @param agentPubKeyB64 - The base64 encoded public key of the agent
 * @returns An object with methods to update, check DHT status, get profile data and subscribe to contact changes
 */
export function deriveOneContactStore(contactStore: ContactStore, agentPubKeyB64: AgentPubKeyB64) {
  const { subscribe } = derived(contactStore, ($contactStore) => $contactStore[agentPubKeyB64]);

  const getHasAgentJoinedDht = () => contactStore.getHasAgentJoinedDht(agentPubKeyB64);
  const getAsProfileExtended = () => contactStore.getAsProfileExtended(agentPubKeyB64);

  return {
    update: contactStore.update,
    delete: () => contactStore.delete(agentPubKeyB64),
    getHasAgentJoinedDht,
    getAsProfileExtended,
    subscribe,
  };
}

/**
 * Creates a derived store for a single contact from the main contact store
 *
 * @param contactStore - The main contact store instance
 * @param agentPubKeyB64 - The base64 encoded public key of the agent
 * @returns An object with methods to update, check DHT status, get profile data and subscribe to contact changes
 */
export const deriveContactListStore = (contactStore: ContactStore) =>
  derived(contactStore, ($contactStore) => {
    if ($contactStore === undefined) return [];

    return sortBy(Object.entries($contactStore), [(c) => c[1].fullName]);
  });
