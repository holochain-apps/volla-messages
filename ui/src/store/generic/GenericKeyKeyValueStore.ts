import { derived, type Updater } from "svelte/store";
import {
  createGenericKeyValueStore,
  type GenericKeyValueStore,
  type GenericKeyValueStoreData,
  type GenericKeyValueStoreReadable,
} from "./GenericKeyValueStore";
import { sortBy } from "lodash-es";

export type GenericKeyKeyValueStoreReadable<T> = GenericKeyValueStoreReadable<
  GenericKeyValueStoreData<T>
>;

export interface GenericKeyKeyValueStore<T>
  extends GenericKeyValueStore<GenericKeyValueStoreData<T>> {
  getKeyKeyValue: (key1: string, key2: string) => T;
  setKeyKeyValue: (key1: string, key2: string, val: T) => void;
  updateKeyKeyValue(key1: string, key2: string, updater: Updater<T>): void;
  removeKeyKeyValue: (key1: string, key2: string) => void;
}

export function createGenericKeyKeyValueStore<T>(): GenericKeyKeyValueStore<T> {
  const store = createGenericKeyValueStore<GenericKeyValueStoreData<T>>();

  function getKeyKeyValue(key1: string, key2: string): T {
    const val = store.getKeyValue(key1)[key2];
    if (val === undefined) throw new Error(`No value with key1 ${key1}, key2 ${key2}`);
    return val;
  }

  function setKeyKeyValue(key1: string, key2: string, val: T): void {
    store.update((d) => ({
      ...d,
      [key1]: {
        ...(d[key1] || {}),
        [key2]: val,
      },
    }));
  }

  function updateKeyKeyValue(key1: string, key2: string, updater: Updater<T>): void {
    store.update((d) => ({
      ...d,
      [key1]: {
        ...(d[key1] || {}),
        [key2]: updater(d[key1][key2]),
      },
    }));
  }

  function removeKeyKeyValue(key1: string, key2: string) {
    store.update((d) => {
      delete d[key1][key2];
      return d;
    });
  }

  return {
    ...store,
    getKeyKeyValue,
    setKeyKeyValue,
    updateKeyKeyValue,
    removeKeyKeyValue,
  };
}

export function deriveGenericKeyValueStore<T>(
  genericKeyKeyValueStore: GenericKeyKeyValueStore<T>,
  key1: string,
  listSortBy: Array<(val: any) => any> = [],
): GenericKeyValueStore<T> {
  const store = derived(genericKeyKeyValueStore, ($genericKeyKeyValueStore) => ({
    data: $genericKeyKeyValueStore.data[key1] || {},
    list: sortBy(Object.entries($genericKeyKeyValueStore.data[key1] || {}), listSortBy),
    count: Object.keys($genericKeyKeyValueStore.data[key1] || {}).length,
  }));

  return {
    getKeyValue: (key2: string) => genericKeyKeyValueStore.getKeyKeyValue(key1, key2),
    setKeyValue: (key2: string, val: T) => genericKeyKeyValueStore.setKeyKeyValue(key1, key2, val),
    updateKeyValue: (key2: string, updater: Updater<T>) =>
      genericKeyKeyValueStore.updateKeyKeyValue(key1, key2, updater),
    removeKeyValue: (key2: string) => genericKeyKeyValueStore.removeKeyKeyValue(key1, key2),
    set: (val: GenericKeyValueStoreData<T>) => genericKeyKeyValueStore.setKeyValue(key1, val),
    update: (updater: Updater<GenericKeyValueStoreData<T>>) =>
      genericKeyKeyValueStore.updateKeyValue(key1, updater),
    subscribe: store.subscribe,
  };
}

export function deriveGenericKeyValueStoreReadable<T>(
  genericKeyKeyValueStore: GenericKeyKeyValueStoreReadable<T>,
  key1: string,
  listSortBy: Array<(val: any) => any> = [],
) {
  const store = derived(genericKeyKeyValueStore, ($genericKeyKeyValueStore) => ({
    data: $genericKeyKeyValueStore.data[key1] || {},
    list: sortBy(Object.entries($genericKeyKeyValueStore.data[key1] || {}), listSortBy),
    count: Object.keys($genericKeyKeyValueStore.data[key1] || {}).length,
  }));

  return {
    subscribe: store.subscribe,
  };
}
