import { derived } from "svelte/store";
import type { ConversationMessageStore } from "./ConversationMessageStore";
import { sortBy } from "lodash-es";
import type {
  GenericKeyValueStoreReadable,
  GenericValueStoreReadable,
} from "./generic/GenericKeyValueStore";
import type { CellIdB64, MessageExtended } from "$lib/types";
import type { ConversationStore } from "./ConversationStore";

export type ConversationLatestMessageStore = GenericKeyValueStoreReadable<MessageExtended>;
export function createConversationLatestMessageStore(
  conversationStore: ConversationStore,
  conversationMessageStore: ConversationMessageStore,
): ConversationLatestMessageStore {
  return derived(
    [conversationMessageStore, conversationStore],
    ([$conversationMessageStore, $conversationStore]) => {
      const d = Object.fromEntries(
        $conversationStore.list.map(([cellIdB64]) => [
          cellIdB64,
          sortBy(Object.values($conversationMessageStore.data[cellIdB64] || {}), [
            (m) => m.timestamp,
          ])[Object.keys($conversationMessageStore.data[cellIdB64] || {}).length - 1],
        ]),
      );

      return {
        data: d,
        list: sortBy(Object.entries(d || {}), [
          ([, m]) => (m === undefined ? Number.MAX_SAFE_INTEGER : -1 * m.timestamp),
        ]),
        count: Object.keys(d || {}).length,
      };
    },
  );
}

export type CellConversationLatestMessageStore = GenericValueStoreReadable<MessageExtended>;

export function deriveCellConversationLatestMessageStore(
  conversationLatestMessageStore: ConversationLatestMessageStore,
  key: CellIdB64,
): CellConversationLatestMessageStore {
  return derived(
    conversationLatestMessageStore,
    ($conversationLatestMessageStore) => $conversationLatestMessageStore.data[key],
  );
}
