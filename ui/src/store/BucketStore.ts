import type { ActionHashB64, DnaHashB64 } from "@holochain/client";
import { persisted } from "svelte-persisted-store";
import { derived, get, type Invalidator, type Subscriber, type Unsubscriber } from "svelte/store";

export interface BucketStore {
  add: (hashes: ActionHashB64[]) => void;
  missingHashes: (allHashes: ActionHashB64[]) => ActionHashB64[];
  subscribe: (
    this: void,
    run: Subscriber<{
      hashes: string[];
      count: number;
    }>,
    invalidate?:
      | Invalidator<{
          hashes: string[];
          count: number;
        }>
      | undefined,
  ) => Unsubscriber;
}

export function createBucketStore(
  dnaHashB64: DnaHashB64,
  bucket: number,
  initialHashes: ActionHashB64[] = [],
) {
  const hashes = persisted(
    `CONVERSATIONS.${dnaHashB64}.BUCKETS.${bucket}`,
    Array.from(new Set(initialHashes)),
    { storage: "local" },
  );

  const { subscribe } = derived(hashes, ($hashes) => {
    return {
      hashes: $hashes,
      count: $hashes.length,
    };
  });

  function add(newHashes: ActionHashB64[]) {
    hashes.update(($hashes) => Array.from(new Set([...$hashes, ...newHashes])));
  }

  function missingHashes(allHashes: ActionHashB64[]): ActionHashB64[] {
    return Array.from(new Set(allHashes).difference(new Set(get(hashes))));
  }

  return {
    add,
    missingHashes,
    subscribe,
  };
}
