import {
  derived,
  get as svelteStoreGet,
  writable,
  type Invalidator,
  type Subscriber,
  type Unsubscriber,
  type Updater,
} from "svelte/store";

export interface GenericKeyValueStoreData<T> {
  [key: string]: T;
}

export interface GenericKeyValueStore<T> {
  getKeyValue: (key: string) => T;
  setKeyValue: (key: string, val: T) => void;
  updateKeyValue: (key: string, val: T) => void;
  removeKeyValue: (key: string) => void;
  set: (this: void, value: GenericKeyValueStoreData<T>) => void;
  update: (this: void, updater: Updater<GenericKeyValueStoreData<T>>) => void;
  subscribe(
    this: void,
    run: Subscriber<GenericKeyValueStoreData<T>>,
    invalidate?: Invalidator<GenericKeyValueStoreData<T>> | undefined,
  ): Unsubscriber;
}

/**
 * Creates a store for managing data associated with a key
 *
 * @template T - The type of data stored in the keyed store.
 * @returns {GenericKeyValueStoreData<T>} An object with methods to manipulate and subscribe to the store.
 */
export function createGenericKeyValueStore<T>(): GenericKeyValueStore<T> {
  const data = writable<GenericKeyValueStoreData<T>>({});

  function getKeyValue(key: string): T {
    const val = svelteStoreGet(data)[key];
    if (val === undefined) throw new Error(`No element with key of ${key}`);
    return val;
  }

  function updateKeyValue(key: string, val: T): void {
    data.update((d) => ({
      ...d,
      [key]: {
        ...d[key],
        ...val,
      },
    }));
  }

  function setKeyValue(key: string, val: T): void {
    data.update((d) => ({
      ...d,
      [key]: val,
    }));
  }

  function removeKeyValue(key: string) {
    data.update((d) => {
      delete d[key];
      return d;
    });
  }

  return {
    getKeyValue,
    setKeyValue,
    updateKeyValue,
    removeKeyValue,
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
export function deriveGenericValueStore<T>(
  genericKeyStore: GenericKeyValueStore<T>,
  key: string,
): GenericAgentStore<T> {
  const data = derived(genericKeyStore, ($genericKeyStore) => $genericKeyStore[key]);
  const set = (val: T) => genericKeyStore.setKeyValue(key, val);
  const update = (val: T) => genericKeyStore.updateKeyValue(key, val);
  const remove = () => genericKeyStore.removeKeyValue(key);

  return {
    set,
    update,
    remove,
    subscribe: data.subscribe,
  };
}
