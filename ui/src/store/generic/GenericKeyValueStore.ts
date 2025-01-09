import { sortBy } from "lodash-es";
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

export interface GenericKeyValueStoreDataExtended<T> {
  data: GenericKeyValueStoreData<T>;
  list: [string, T][];
  count: number;
}

export interface GenericKeyValueStoreReadable<T> {
  subscribe: (
    this: void,
    run: Subscriber<GenericKeyValueStoreDataExtended<T>>,
    invalidate?: Invalidator<GenericKeyValueStoreDataExtended<T>> | undefined,
  ) => Unsubscriber;
}

export interface GenericKeyValueStore<T> extends GenericKeyValueStoreReadable<T> {
  getKeyValue: (key: string) => T;
  setKeyValue: (key: string, val: T) => void;
  updateKeyValue: (key: string, updater: Updater<T>) => void;
  removeKeyValue: (key: string) => void;
  set: (this: void, value: GenericKeyValueStoreData<T>) => void;
  update: (this: void, updater: Updater<GenericKeyValueStoreData<T>>) => void;
}

/**
 * Creates a store for managing data associated with a key
 *
 * @template T - The type of data stored in the keyed store.
 * @returns {GenericKeyValueStore<T>} An object with methods to manipulate and subscribe to the store.
 */
export function createGenericKeyValueStore<T>(
  listSortBy: Array<(val: any) => any> = [],
): GenericKeyValueStore<T> {
  const data = writable<GenericKeyValueStoreData<T>>({});

  const { subscribe } = derived(data, ($data) => ({
    data: $data,
    list: sortBy(Object.entries($data), listSortBy),
    count: Object.keys($data).length,
  }));

  function getKeyValue(key: string): T {
    const val = svelteStoreGet(data)[key];
    if (val === undefined) throw new Error(`No element with key of ${key}`);
    return val;
  }

  function setKeyValue(key: string, val: T): void {
    data.update((d) => ({
      ...d,
      [key]: val,
    }));
  }

  function updateKeyValue(key: string, updater: Updater<T>): void {
    data.update((d) => ({
      ...d,
      [key]: updater(d[key]),
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
    subscribe,
  };
}

export interface GenericValueStore<T> {
  set: (val: T) => void;
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
  genericKeyValueStore: GenericKeyValueStore<T>,
  key: string,
): GenericValueStore<T> {
  const data = derived(
    genericKeyValueStore,
    ($genericKeyValueStore) => $genericKeyValueStore.data[key],
  );

  return {
    set: (val: T) => genericKeyValueStore.setKeyValue(key, val),
    remove: () => genericKeyValueStore.removeKeyValue(key),
    subscribe: data.subscribe,
  };
}
