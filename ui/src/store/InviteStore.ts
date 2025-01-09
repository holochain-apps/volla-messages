import type { CellIdB64 } from "$lib/types";
import type { AgentPubKeyB64 } from "@holochain/client";
import { persisted } from "./generic/GenericPersistedStore";
import { type Subscriber, type Invalidator, type Unsubscriber, derived } from "svelte/store";
import type { GenericKeyValueStoreDataExtended } from "./generic/GenericKeyValueStore";

export interface InviteStore {
  invite: (key: CellIdB64, agentPubKeyB64s: AgentPubKeyB64[]) => Promise<void>;
  subscribe: (
    this: void,
    run: Subscriber<GenericKeyValueStoreDataExtended<AgentPubKeyB64[]>>,
    invalidate?: Invalidator<GenericKeyValueStoreDataExtended<AgentPubKeyB64[]>> | undefined,
  ) => Unsubscriber;
}

export function createInviteStore(): InviteStore {
  // List of invited agents is persisted to localstorage as it is not stored via holochain
  const data = persisted<{ [cellIdB64: CellIdB64]: AgentPubKeyB64[] }>("CONVERSATION.INVITED", {});

  const { subscribe } = derived(data, ($data) => ({
    data: $data,
    list: Object.entries($data || {}),
    count: Object.keys($data || {}).length,
  }));

  async function invite(key: CellIdB64, agentPubKeyB64s: AgentPubKeyB64[]): Promise<void> {
    data.update((c) => ({
      ...c,
      [key]: [...(c[key] || []), ...agentPubKeyB64s],
    }));
  }

  return {
    invite,
    subscribe,
  };
}

export function deriveCellInviteStore(inviteStore: InviteStore, cellIdB64: CellIdB64) {
  const { subscribe } = derived(inviteStore, ($inviteStore) => $inviteStore.data[cellIdB64]);
  return {
    invite: (agentPubKeyB64s: AgentPubKeyB64[]) => inviteStore.invite(cellIdB64, agentPubKeyB64s),
    subscribe,
  };
}
