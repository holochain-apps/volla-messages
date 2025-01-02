import type { AgentPubKeyB64 } from "@holochain/client";
import {
  derived,
  get as svelteStoreGet,
  writable,
  type Invalidator,
  type Subscriber,
  type Unsubscriber,
  type Updater,
} from "svelte/store";

export interface GenericAgentKeyedStoreData<T> {
  [agentPubKeyB64: AgentPubKeyB64]: T;
}

export interface GenericAgentKeyedStore<T> {
  getOne: (agentPubKeyB64: AgentPubKeyB64) => T;
  setOne: (agentPubKeyB64: AgentPubKeyB64, val: T) => void;
  updateOne: (agentPubKeyB64: AgentPubKeyB64, val: T) => void;
  removeOne: (agentPubKeyB64: AgentPubKeyB64) => void;
  set: (this: void, value: GenericAgentKeyedStoreData<T>) => void;
  update: (this: void, updater: Updater<GenericAgentKeyedStoreData<T>>) => void;
  subscribe(
    this: void,
    run: Subscriber<GenericAgentKeyedStoreData<T>>,
    invalidate?: Invalidator<GenericAgentKeyedStoreData<T>> | undefined,
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
export function createGenericAgentKeyedStore<T>(): GenericAgentKeyedStore<T> {
  const data = writable<GenericAgentKeyedStoreData<T>>({});

  function getOne(agentPubKeyB64: AgentPubKeyB64): T {
    const val = svelteStoreGet(data)[agentPubKeyB64];
    if (val === undefined) throw new Error(`No element with key of ${agentPubKeyB64}`);
    return val;
  }

  function updateOne(agentPubKeyB64: AgentPubKeyB64, val: T): void {
    data.update((d) => ({
      ...d,
      [agentPubKeyB64]: {
        ...d[agentPubKeyB64],
        ...val,
      },
    }));
  }

  function setOne(agentPubKeyB64: AgentPubKeyB64, val: T): void {
    data.update((d) => ({
      ...d,
      [agentPubKeyB64]: val,
    }));
  }

  function removeOne(agentPubKeyB64: AgentPubKeyB64) {
    data.update((d) => {
      delete d[agentPubKeyB64];
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

export interface GenericAgentStore<T> {
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
export function deriveGenericAgentStore<T>(
  genericAgentStore: GenericAgentKeyedStore<T>,
  agentPubKeyB64: AgentPubKeyB64,
): GenericAgentStore<T> {
  const data = derived(
    genericAgentStore,
    ($genericAgentStore) => $genericAgentStore[agentPubKeyB64],
  );
  const set = (val: T) => genericAgentStore.setOne(agentPubKeyB64, val);
  const update = (val: T) => genericAgentStore.updateOne(agentPubKeyB64, val);
  const remove = () => genericAgentStore.removeOne(agentPubKeyB64);

  return {
    set,
    update,
    remove,
    subscribe: data.subscribe,
  };
}
