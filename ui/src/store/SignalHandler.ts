import { type Signal, SignalType } from "@holochain/client";
import { RelayClient } from "$store/RelayClient";
import { type RelaySignal, type MessageSignal } from "$lib/types";
import { encodeCellIdToBase64 } from "$lib/utils";
import { deriveCellConversationStore, type ConversationStore } from "./ConversationStore";
import { isEqual } from "lodash-es";

export function createSignalHandler(client: RelayClient, conversationStore: ConversationStore) {
  client.client.on("signal", _handleSignalReceived);

  function _handleSignalReceived(signal: Signal) {
    if (!(SignalType.App in signal)) return;
    if ((signal[SignalType.App].payload as RelaySignal).type !== "Message") return;

    // Ignore signals for messages I sent
    if (isEqual((signal[SignalType.App].payload as MessageSignal).from, client.client.myPubKey))
      return;

    const conversation = deriveCellConversationStore(
      conversationStore,
      encodeCellIdToBase64(signal[SignalType.App].cell_id),
    );
    conversation.handleMessageSignalReceived(signal[SignalType.App].payload as MessageSignal);
  }
}
