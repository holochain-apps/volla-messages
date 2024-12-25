import { type DnaHashB64 } from "@holochain/client";
import type { Message } from "../types";
import { BucketStore } from "./BucketStore";
import { derived, get, type Readable, writable, type Writable } from "svelte/store";

export class MessageHistoryStore {
  private buckets: Writable<BucketStore[]>;
  public messageCount: Readable<number>;

  constructor(
    currentBucket: number,
    private dnaHashB64: DnaHashB64,
  ) {
    const buckets: BucketStore[] = [];
    for (let b = 0; b <= currentBucket; b += 1) {
      const bucketJSON = localStorage.getItem(`c.${this.dnaHashB64}.${b}`);
      const initialBuckets = bucketJSON ? JSON.parse(bucketJSON) : [];
      buckets[b] = new BucketStore(initialBuckets);
    }

    this.buckets = writable(buckets);
    this.messageCount = derived(this.buckets, ($b) => {
      let count = 0;
      $b.forEach((b) => (count += b.count));
      return count;
    });
  }

  bucketsForSet(setSize: number, startingBucket: number): number[] {
    let bucket = startingBucket;
    const bucketsInSet: Array<number> = [];
    let count = 0;
    // add buckets until we get to threshold of what to load
    let buckets = get(this.buckets);
    do {
      bucketsInSet.push(bucket);
      const h = buckets[bucket];
      if (h) {
        const size = h.count;
        count += size;
      }
      bucket -= 1;
    } while (bucket >= 0 && count < setSize);
    return bucketsInSet;
  }

  ensure(b: number) {
    if (get(this.buckets)[b] == undefined) {
      this.buckets.update((buckets) => {
        buckets[b] = new BucketStore([]);
        return buckets;
      });
    }
  }
  getBucket(b: number): BucketStore {
    this.ensure(b);
    let buckets = get(this.buckets);
    return buckets[b];
  }

  add(message: Message) {
    this.buckets.update((buckets) => {
      const bucket = buckets[message.bucket];
      if (bucket === undefined) {
        buckets[message.bucket] = new BucketStore([message.hash]);
      } else {
        bucket.add([message.hash]);
      }
      return buckets;
    });
    this.saveBucket(message.bucket);
  }

  saveBucket(b: number) {
    const bucket = this.getBucket(b);
    localStorage.setItem(`c.${this.dnaHashB64}.${b}`, bucket.toJSON());
  }
}
