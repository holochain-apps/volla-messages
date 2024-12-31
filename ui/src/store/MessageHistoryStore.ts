import { type DnaHashB64 } from "@holochain/client";
import type { Message } from "$lib/types";
import { createBucketStore, type BucketStore } from "./BucketStore";
import { derived, get, type Invalidator, type Subscriber, type Unsubscriber } from "svelte/store";
import { range, sum } from "lodash-es";

export interface MessageHistoryStore {
  add: (message: Message) => void;
  getBucket: (b: number) => BucketStore;
  bucketsForSet: (setSize: number, startingBucket: number) => number[];
  subscribe: (
    this: void,
    run: Subscriber<{
      buckets: {
        hashes: string[];
        count: number;
      }[];
      messageCount: number;
    }>,
    invalidate?:
      | Invalidator<{
          buckets: {
            hashes: string[];
            count: number;
          }[];
          messageCount: number;
        }>
      | undefined,
  ) => Unsubscriber;
}

export function createMessageHistoryStore(dnaHashB64: DnaHashB64, currentBucket: number) {
  const buckets: BucketStore[] = range(0, currentBucket).map((i) =>
    createBucketStore(dnaHashB64, i),
  );
  const { subscribe } = derived(buckets, ($buckets) => ({
    buckets: $buckets,
    messageCount: sum($buckets.map((b) => b.count)),
  }));

  function bucketsForSet(setSize: number, startingBucket: number): number[] {
    let i = startingBucket;
    const bucketsInSet: Array<number> = [];
    let count = 0;
    // add buckets until we get to threshold of what to load
    do {
      bucketsInSet.push(i);
      if (buckets[i]) {
        count += get(buckets[i]).count;
      }
      i -= 1;
    } while (i >= 0 && count < setSize);
    return bucketsInSet;
  }

  function getBucket(b: number): BucketStore {
    _ensure(b);
    return buckets[b];
  }

  function add(message: Message) {
    _ensure(message.bucket);
    buckets[message.bucket].add([message.hash]);
  }

  function _ensure(b: number) {
    if (get(buckets[b]) == undefined) {
      buckets[b] = createBucketStore(dnaHashB64, b);
    }
  }

  return {
    add,
    getBucket,
    bucketsForSet,
    subscribe,
  };
}
