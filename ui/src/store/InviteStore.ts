import type { CellIdB64 } from "$lib/types";
import type { AgentPubKeyB64 } from "@holochain/client";
import { persisted } from "./generic/GenericPersistedStore";
import { type Subscriber, type Invalidator, type Unsubscriber, derived } from "svelte/store";

export interface InviteStore {
  invite: (key: CellIdB64, agentPubKeyB64s: AgentPubKeyB64[]) => Promise<void>;
  subscribe: (
    this: void,
    run: Subscriber<{
      [cellIdB64: string]: string[];
    }>,
    invalidate?:
      | Invalidator<{
          [cellIdB64: string]: string[];
        }>
      | undefined,
  ) => Unsubscriber;
}

export function createInviteStore(): InviteStore {
  // List of invited agents is persisted to localstorage as it is not stored via holochain
  const invited = persisted<{ [cellIdB64: CellIdB64]: AgentPubKeyB64[] }>(
    "CONVERSATION.INVITED",
    {},
  );

  async function invite(key: CellIdB64, agentPubKeyB64s: AgentPubKeyB64[]): Promise<void> {
    invited.update((c) => ({
      ...c,
      [key]: [...(c[key] || []), ...agentPubKeyB64s],
    }));
  }

  return {
    invite,
    subscribe: invited.subscribe,
  };
}

export function deriveCellInviteStore(inviteStore: InviteStore, cellIdB64: CellIdB64) {
  const { subscribe } = derived(inviteStore, ($inviteStore) => $inviteStore[cellIdB64]);
  return {
    invite: (agentPubKeyB64s: AgentPubKeyB64[]) => inviteStore.invite(cellIdB64, agentPubKeyB64s),
    subscribe,
  };
}
