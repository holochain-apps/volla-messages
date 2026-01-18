import type { AgentPubKeyB64 } from "@holochain/client";
import { ConferenceRole } from "$lib/types";

export interface ParticipantData {
  pubKey: AgentPubKeyB64;
  publicKey: AgentPubKeyB64;
  isLocal: boolean;
  hasJoined: boolean;
  connectionStatus?: "idle" | "init-sent" | "init-received" | "connecting" | "connected" | "failed";
  videoEnabled?: boolean;
  audioEnabled?: boolean;
  connectionQuality?: string;
  role?: ConferenceRole;
  _stream?: MediaStream | null;
  _connected: boolean;
}
