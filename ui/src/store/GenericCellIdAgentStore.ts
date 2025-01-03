import { type AgentPubKeyB64, type CellId } from "@holochain/client";
import { Base64 } from "js-base64";
import {
  derived,
  get as svelteStoreGet,
  writable,
  type Invalidator,
  type Subscriber,
  type Unsubscriber,
  type Updater,
} from "svelte/store";
import type { GenericAgentKeyedStoreData, GenericAgentStore } from "./GenericAgentStore";

export type CellIdB64 = string;

const URL_SAFE_DELIMETER = "+";

export function encodeCellIdToBase64(cellId: CellId): CellIdB64 {
  return `${Base64.fromUint8Array(cellId[0], true)}${URL_SAFE_DELIMETER}${Base64.fromUint8Array(cellId[1])}`;
}

export function decodeCellIdFromBase64(base64: CellIdB64): CellId {
  const val = base64.split(URL_SAFE_DELIMETER);
  return [Base64.toUint8Array(val[0]), Base64.toUint8Array(val[1])] as CellId;
}

export interface GenericCellIdAgentKeyedStoreData<T> {
  [cellIdB64: CellIdB64]: GenericAgentKeyedStoreData<T>;
}

export interface GenericCellIdAgentKeyedStore<T> {
  getOne: (cellIdB64: CellIdB64, agentPubKeyB64: AgentPubKeyB64) => T;
  setOne: (cellIdB64: CellIdB64, agentPubKeyB64: AgentPubKeyB64, val: T) => void;
  updateOne: (cellIdB64: CellIdB64, agentPubKeyB64: AgentPubKeyB64, val: T) => void;
  removeOne: (cellIdB64: CellIdB64, agentPubKeyB64: AgentPubKeyB64) => void;
  set: (this: void, value: GenericCellIdAgentKeyedStoreData<T>) => void;
  update: (this: void, updater: Updater<GenericCellIdAgentKeyedStoreData<T>>) => void;
  subscribe(
    this: void,
    run: Subscriber<GenericCellIdAgentKeyedStoreData<T>>,
    invalidate?: Invalidator<GenericCellIdAgentKeyedStoreData<T>> | undefined,
  ): Unsubscriber;
}

/**
 * Creates a store for managing data associated with agent public keys.
 *
 * This function returns an object implementing the `GenericAgentKeyedStore` interface,
 * providing methods to get, set, update, and remove data entries keyed by `AgentPubKeyB64`.
 * It also includes methods to update the entire store, set the store's value, and subscribe
 * to changes in the store.
 *
 * @template T - The type of data stored in the keyed store.
 * @returns {GenericAgentKeyedStore<T>} An object with methods to manipulate and subscribe to the store.
 */
export function createGenericCellIdAgentKeyedStore<T>(): GenericCellIdAgentKeyedStore<T> {
  const data = writable<GenericCellIdAgentKeyedStoreData<T>>({});

  function getOne(cellIdB64: CellIdB64, agentPubKeyB64: AgentPubKeyB64): T {
    const cellVal = svelteStoreGet(data)[cellIdB64];
    if (cellVal === undefined) throw new Error(`No cell value with key of ${cellIdB64}`);

    const agentVal = cellVal[agentPubKeyB64];
    if (agentVal === undefined) throw new Error(`No agebt value with key of ${cellIdB64}`);

    return agentVal;
  }

  function updateOne(cellIdB64: CellIdB64, agentPubKeyB64: AgentPubKeyB64, val: T): void {
    data.update((d) => ({
      ...d,
      [cellIdB64]: {
        ...d[cellIdB64],
        [agentPubKeyB64]: {
          ...d[cellIdB64][agentPubKeyB64],
          ...val,
        },
      },
    }));
  }

  function setOne(cellIdB64: CellIdB64, agentPubKeyB64: AgentPubKeyB64, val: T): void {
    data.update((d) => ({
      ...d,
      [cellIdB64]: {
        ...d[cellIdB64],
        [agentPubKeyB64]: val,
      },
    }));
  }

  function removeOne(cellIdB64: CellIdB64, agentPubKeyB64: AgentPubKeyB64) {
    data.update((d) => {
      delete d[cellIdB64][agentPubKeyB64];
      return d;
    });
  }

  return {
    getOne,
    setOne,
    updateOne,
    removeOne,
    update: data.update,
    set: data.set,
    subscribe: data.subscribe,
  };
}

export interface GenericCellIdStore<T> {
  set: (agentPubKeyB64: AgentPubKeyB64, val: T) => void;
  update: (agentPubKeyB64: AgentPubKeyB64, val: T) => void;
  remove: (agentPubKeyB64: AgentPubKeyB64, val: T) => void;
  subscribe: (
    this: void,
    run: Subscriber<GenericAgentKeyedStoreData<T>>,
    invalidate?: Invalidator<GenericAgentKeyedStoreData<T>> | undefined,
  ) => Unsubscriber;
}

/**
 * Creates a derived store for a specific agent from a generic agent keyed store
 *
 * @param genericAgentStore - The source store containing data for multiple agents
 * @param agentPubKeyB64 - The public key of the agent to derive the store for
 * @returns A store interface with set/update/remove/subscribe methods for the specific agent
 */
export function deriveGenericCellIdStore<T>(
  genericAgentStore: GenericCellIdAgentKeyedStore<T>,
  cellIdB64: CellIdB64,
): GenericCellIdStore<T> {
  const data = derived(genericAgentStore, ($genericAgentStore) => $genericAgentStore[cellIdB64]);
  const set = (agentPubKeyB64: AgentPubKeyB64, val: T) =>
    genericAgentStore.setOne(cellIdB64, agentPubKeyB64, val);
  const update = (agentPubKeyB64: AgentPubKeyB64, val: T) =>
    genericAgentStore.updateOne(cellIdB64, agentPubKeyB64, val);
  const remove = (agentPubKeyB64: AgentPubKeyB64) =>
    genericAgentStore.removeOne(cellIdB64, agentPubKeyB64);

  return {
    set,
    update,
    remove,
    subscribe: data.subscribe,
  };
}

export interface GenericCellIdAgentStore<T> {
  set: (val: T) => void;
  update: (val: T) => void;
  remove: (val: T) => void;
  subscribe: (
    this: void,
    run: Subscriber<T>,
    invalidate?: Invalidator<T> | undefined,
  ) => Unsubscriber;
}

/**
 * Creates a derived store for a specific agent from a generic agent keyed store
 *
 * @param genericAgentStore - The source store containing data for multiple agents
 * @param agentPubKeyB64 - The public key of the agent to derive the store for
 * @returns A store interface with set/update/remove/subscribe methods for the specific agent
 */
export function deriveGenericCellIdAgentStore<T>(
  genericAgentStore: GenericCellIdAgentKeyedStore<T>,
  cellIdB64: CellIdB64,
  agentPubKeyB64: AgentPubKeyB64,
): GenericAgentStore<T> {
  const data = derived(
    genericAgentStore,
    ($genericAgentStore) => $genericAgentStore[cellIdB64][agentPubKeyB64],
  );
  const set = (val: T) => genericAgentStore.setOne(cellIdB64, agentPubKeyB64, val);
  const update = (val: T) => genericAgentStore.updateOne(cellIdB64, agentPubKeyB64, val);
  const remove = () => genericAgentStore.removeOne(cellIdB64, agentPubKeyB64);

  return {
    set,
    update,
    remove,
    subscribe: data.subscribe,
  };
}
