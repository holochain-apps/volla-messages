import { encodeHashToBase64, type Signal, SignalType } from "@holochain/client";
import { RelayClient } from "$store/RelayClient";
import { type RelaySignal, type MessageSignal } from "$lib/types";
import { encodeCellIdToBase64 } from "$lib/utils";
import { type ConversationStore } from "./ConversationStore";
import { isEqual } from "lodash-es";
import type { ConversationMessageStore } from "./ConversationMessageStore";
import { page } from "$app/stores";
import { get } from "svelte/store";

export function createSignalHandler(
  client: RelayClient,
  conversationStore: ConversationStore,
  conversationMessageStore: ConversationMessageStore,
) {
  client.client.on("signal", _handleSignalReceived);

  async function _handleSignalReceived(signal: Signal) {
    if (!(SignalType.App in signal)) return;

    const payload = signal[SignalType.App].payload as RelaySignal;
    const cellIdB64 = encodeCellIdToBase64(signal[SignalType.App].cell_id);

    if (payload.type === "Message") {
      // Ignore signals for messages I sent
      if (isEqual(payload.from, client.client.myPubKey)) return;
      await conversationMessageStore.handleMessageSignalReceived(
        cellIdB64,
        signal[SignalType.App].payload as MessageSignal,
      );
      // Mark conversation as unread
      // Unless user is currently viewing the conversation page.
      const $page = get(page);
      if ($page.params.id !== cellIdB64 || $page.route.id !== "/conversations/[id]") {
        await conversationStore.updateUnread(cellIdB64, true);
      }
    } else if (payload.type === "EntryDeleted" && payload.original_app_entry.type === "Message") {
      const originalActionHashB64 = payload.action.hashed.hash;
      conversationMessageStore.markMessageAsDeleted(
        cellIdB64,
        encodeHashToBase64(originalActionHashB64),
      );
    }
  }
}
