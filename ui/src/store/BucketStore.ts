import type { ActionHashB64 } from "@holochain/client";
import { get, writable, type Writable } from "svelte/store";

export class BucketStore {
  public hashes: Writable<Set<ActionHashB64>> = writable(new Set());

  constructor(hashes: Array<ActionHashB64>) {
    this.hashes.set(new Set(hashes));
  }

  get count(): number {
    return get(this.hashes).size;
  }

  toJSON(): string {
    return JSON.stringify(Array.from(get(this.hashes)!.keys()));
  }

  add(newHashes: Array<ActionHashB64>) {
    this.hashes.update((h) => new Set([...h, ...newHashes]));
  }

  missingHashes(hashes: Array<ActionHashB64>): Array<ActionHashB64> {
    const s: Set<ActionHashB64> = new Set(hashes);
    return Array.from(s.difference(get(this.hashes)));
  }
}
