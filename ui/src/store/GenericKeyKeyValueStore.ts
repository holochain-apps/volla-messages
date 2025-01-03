import {
  derived,
  get as svelteStoreGet,
  writable,
  type Invalidator,
  type Subscriber,
  type Unsubscriber,
  type Updater,
} from "svelte/store";
import type { GenericKeyValueStoreData, GenericKeyValueStore } from "./GenericKeyValueStore";

export interface GenericKeyKeyValueStoreData<T> {
  [key: string]: GenericKeyValueStoreData<T>;
}

export interface GenericKeyKeyValueStore<T> {
  getKeyValue: (key1: string) => GenericKeyValueStoreData<T>;
  setKeyValue: (key1: string, val: GenericKeyValueStoreData<T>) => void;
  updateKeyValue: (key1: string, val: T) => void;
  removeKeyValue: (key1: string) => void;
  getKeyKeyValue: (key1: string, key2: string) => T;
  setKeyKeyValue: (key1: string, key2: string, val: T) => void;
  updateKeyKeyValue: (key1: string, key2: string, val: T) => void;
  removeKeyKeyValue: (key1: string, key2: string) => void;
  set: (this: void, value: GenericKeyKeyValueStoreData<T>) => void;
  update: (this: void, updater: Updater<GenericKeyKeyValueStoreData<T>>) => void;
  subscribe(
    this: void,
    run: Subscriber<GenericKeyKeyValueStoreData<T>>,
    invalidate?: Invalidator<GenericKeyKeyValueStoreData<T>> | undefined,
  ): Unsubscriber;
}

/**
 * Creates a store for managing data associated with agent public keys.
 *
 * This function returns an object implementing the `GenericAgentKeyedStore` interface,
 * providing methods to get, set, update, and remove data entries keyed by `string`.
 * It also includes methods to update the entire store, set the store's value, and subscribe
 * to changes in the store.
 *
 * @template T - The type of data stored in the keyed store.
 * @returns {GenericAgentKeyedStore<T>} An object with methods to manipulate and subscribe to the store.
 */
export function createGenericKeyKeyValueStore<T>(): GenericKeyKeyValueStore<T> {
  const data = writable<GenericKeyKeyValueStoreData<T>>({});

  function getKeyValue(key1: string): GenericKeyValueStoreData<T> {
    const key1Val = svelteStoreGet(data)[key1];
    if (key1Val === undefined) throw new Error(`No cell value with key of ${key1}`);

    return key1Val;
  }

  function updateKeyValue(key1: string, val: T): void {
    data.update((d) => ({
      ...d,
      [key1]: {
        ...d[key1],
        val,
      },
    }));
  }

  function setKeyValue(key1: string, val: GenericKeyValueStoreData<T>): void {
    data.update((d) => ({
      ...d,
      [key1]: val,
    }));
  }

  function removeKeyValue(key1: string) {
    data.update((d) => {
      delete d[key1];
      return d;
    });
  }

  function getKeyKeyValue(key1: string, key2: string): T {
    const key1Val = svelteStoreGet(data)[key1];
    if (key1Val === undefined) throw new Error(`No cell value with key of ${key1}`);

    const key2Val = key1Val[key2];
    if (key2Val === undefined) throw new Error(`No agebt value with key of ${key2}`);

    return key2Val;
  }

  function updateKeyKeyValue(key1: string, key2: string, val: T): void {
    data.update((d) => ({
      ...d,
      [key1]: {
        ...d[key1],
        [key2]: {
          ...d[key1][key2],
          ...val,
        },
      },
    }));
  }

  function setKeyKeyValue(key1: string, key2: string, val: T): void {
    data.update((d) => ({
      ...d,
      [key1]: {
        ...d[key1],
        [key2]: val,
      },
    }));
  }

  function removeKeyKeyValue(key1: string, key2: string) {
    data.update((d) => {
      delete d[key1][key2];
      return d;
    });
  }

  return {
    getKeyValue,
    updateKeyValue,
    setKeyValue,
    removeKeyValue,
    getKeyKeyValue,
    updateKeyKeyValue,
    setKeyKeyValue,
    removeKeyKeyValue,
    update: data.update,
    set: data.set,
    subscribe: data.subscribe,
  };
}

/**
 * Creates a derived store for a specific agent from a generic agent keyed store
 *
 * @param genericAgentStore - The source store containing data for multiple agents
 * @param key2 - The public key of the agent to derive the store for
 * @returns A store interface with set/update/remove/subscribe methods for the specific agent
 */
export function deriveGenericKeyValueStore<T>(
  genericKeyKeyValueStore: GenericKeyKeyValueStore<T>,
  key1: string,
): GenericKeyValueStoreData<T> {
  const data = derived(
    genericKeyKeyValueStore,
    ($genericKeyKeyValueStore) => $genericKeyKeyValueStore[key1],
  );
  const setKeyValue = (key2: string, val: T) =>
    genericKeyKeyValueStore.setKeyKeyValue(key1, key2, val);
  const updateKeyValue = (key2: string, val: T) =>
    genericKeyKeyValueStore.updateKeyKeyValue(key1, key2, val);
  const removeKeyValue = (key2: string) => genericKeyKeyValueStore.removeKeyKeyValue(key1, key2);

  const set = (val: GenericKeyValueStoreData<T>) => genericKeyKeyValueStore.setKeyValue(key1, val);
  const update = (val: T) => genericKeyKeyValueStore.updateKeyValue(key1, val);
  const remove = () => genericKeyKeyValueStore.removeKeyValue(key1);

  return {
    setKeyValue,
    updateKeyValue,
    removeKeyValue,
    set,
    update,
    remove,
    subscribe: data.subscribe,
  };
}

export interface GenericValueStore<T> {
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
 * @param key2 - The public key of the agent to derive the store for
 * @returns A store interface with set/update/remove/subscribe methods for the specific agent
 */
export function deriveGenericValueStore<T>(
  genericKeyKeyValueStore: GenericKeyKeyValueStore<T>,
  key1: string,
  key2: string,
): GenericValueStore<T> {
  const data = derived(
    genericKeyKeyValueStore,
    ($genericKeyKeyValueStore) => $genericKeyKeyValueStore[key1][key2],
  );
  const set = (val: T) => genericKeyKeyValueStore.setKeyKeyValue(key1, key2, val);
  const update = (val: T) => genericKeyKeyValueStore.updateKeyKeyValue(key1, key2, val);
  const remove = () => genericKeyKeyValueStore.removeKeyKeyValue(key1, key2);

  return {
    set,
    update,
    remove,
    subscribe: data.subscribe,
  };
}
