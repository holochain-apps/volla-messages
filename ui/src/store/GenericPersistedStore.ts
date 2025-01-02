import { writable } from "svelte/store";
import { get as svelteGet } from "svelte/store";
import { encode, decode } from "@msgpack/msgpack";
import { Base64 } from "js-base64";

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
    return Base64.fromUint8Array(encode(val), true);
  }

  function _decode(val: string): T {
    return decode(Base64.toUint8Array(val)) as T;
  }

  return {
    set,
    update,
    subscribe: data.subscribe,
  };
}
