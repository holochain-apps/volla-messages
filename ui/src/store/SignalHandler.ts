import { type Signal, SignalType } from "@holochain/client";
import { RelayClient } from "$store/RelayClient";
import { 
  type RelaySignal, 
  type MessageSignal
} from "$lib/types";
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
    if ((signal[SignalType.App].payload as RelaySignal).type !== "Message") return;

    // Ignore signals for messages I sent
    if (isEqual((signal[SignalType.App].payload as MessageSignal).from, client.client.myPubKey))
      return;

    // Save recieved message
    const cellIdB64 = encodeCellIdToBase64(signal[SignalType.App].cell_id);
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
  }
}
