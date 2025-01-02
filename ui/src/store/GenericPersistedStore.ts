import { writable } from "svelte/store";
import { get as svelteGet } from "svelte/store";
import { stringify, parse } from "devalue";

export function persisted<T>(key: string, defaultValue: T) {
  const savedValue = localStorage.getItem(key);
  const data = writable<T>(savedValue ? _decode(savedValue) : defaultValue);
  set(svelteGet(data));

  function set(val: T): void {
    localStorage.setItem(key, _encode(val));
    data.set(val);
  }

  function update(updater: (val: T) => T): void {
    const newVal = updater(svelteGet(data));
    set(newVal);
  }

  function _encode(val: T): string {
    return stringify(val);
  }

  function _decode(val: string): T {
    return parse(val) as T;
  }

  return {
    set,
    update,
    subscribe: data.subscribe,
  };
}
