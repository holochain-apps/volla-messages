use hdi::prelude::*;

// Role hierarchy for conference participants.
// Lower numeric value means higher privilege level.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u8)]
pub enum ConferenceRole {
    Host = 0,    // Full control, 1 per conference
    CoHost = 1,  // Can kick members, end conference
    Member = 2,  // Basic participant
}

impl Default for ConferenceRole {
    fn default() -> Self {
        ConferenceRole::Member
    }
}

impl ConferenceRole {
    pub fn can_act_on(&self, target: &ConferenceRole) -> bool {
        (*self as u8) < (*target as u8)
    }

    pub fn has_at_least(&self, required: ConferenceRole) -> bool {
        (*self as u8) <= (required as u8)
    }
}

#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct Conference {
    pub room_id: String,
    pub creator: AgentPubKey,
    pub current_host: AgentPubKey,
    pub created_at: Timestamp,
    pub is_active: bool,
    pub max_participants: Option<u8>,
}

#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct ConferenceParticipant {
    pub room_id: String,
    pub agent: AgentPubKey,
    pub role: ConferenceRole,
    pub joined_at: Timestamp,
    pub is_active: bool,
    pub conference_hash: ActionHash,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TransferHostInput {
    pub room_id: String,
    pub new_host: AgentPubKey,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct KickParticipantInput {
    pub room_id: String,
    pub target: AgentPubKey,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RoleChangeInput {
    pub room_id: String,
    pub target: AgentPubKey,
    pub new_role: ConferenceRole,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ConferenceParticipantRecord {
    pub room_id: String,
    pub agent: AgentPubKey,
    pub role: ConferenceRole,
    pub joined_at: Timestamp,
    pub is_active: bool,
}

#[derive(Clone, PartialEq, Serialize, Deserialize, Debug, SerializedBytes)]
pub struct ConferenceRoom {
    pub participants: Vec<AgentPubKey>,
    pub room_id: String,
}

#[derive(Clone, PartialEq, Serialize, Deserialize, Debug, SerializedBytes)]
pub struct SignalPayload {
    pub room_id: String,
    pub from: AgentPubKey,
    pub to: AgentPubKey,
    pub payload_type: CallSignalType,
    pub data: String,
    pub signal_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ConferenceRecord {
    pub room: Option<ConferenceRoom>,
    pub room_id: Option<String>,
    pub agent: Option<AgentPubKey>,
    pub signal_type: ConferenceSignalType,
    pub signal_payload: Option<SignalPayload>,
    pub ack_signal_id: Option<String>,
    pub new_role: Option<ConferenceRole>,
    pub new_host: Option<AgentPubKey>,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum ConferenceSignalType {
    Invite,
    Join,
    Leave,
    Reject,
    End,
    WebRTC,
    Ack,
    RoleChanged,
    Kicked,
    HostTransfer,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum CallSignalType {
    InitRequest,
    InitAccept,
    SdpData,
    MediaState,
}
