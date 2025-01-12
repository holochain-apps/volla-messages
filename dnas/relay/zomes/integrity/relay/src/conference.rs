use hdi::prelude::*;

#[derive(Clone, PartialEq, Serialize, Deserialize, Debug, SerializedBytes)]
pub struct ConferenceRoom {
    pub initiator: AgentPubKey,
    pub participants: Vec<AgentPubKey>,
    pub created_at: Timestamp,
    pub title: String,
    pub room_id: String,
}

#[derive(Clone, PartialEq, Serialize, Deserialize, Debug, SerializedBytes)]
pub struct SignalPayload {
    pub room_id: String,
    pub from: AgentPubKey,
    pub to: AgentPubKey,
    pub payload_type: CallSignalType,
    // JSON stringified sdp or ice candidate
    pub data: String,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct ConferenceRecord {
    pub room: Option<ConferenceRoom>,
    pub room_id: Option<String>,
    pub agent: Option<AgentPubKey>,
    pub signal_type: ConferenceSignalType,
    pub signal_payload: Option<SignalPayload>,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum ConferenceSignalType {
    Invite,
    Join,
    Leave,
    WebRTC,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum CallSignalType {
    Offer,
    Answer,
    IceCandidate,
}

pub fn validate_create_conference(
    _action: EntryCreationAction,
    conference: ConferenceRoom,
) -> ExternResult<ValidateCallbackResult> {
    if conference.participants.is_empty() {
        return Ok(ValidateCallbackResult::Invalid(
            "Conference room must have at least one participant".into(),
        ));
    }
    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_create_signal(
    _action: EntryCreationAction,
    signal: SignalPayload,
) -> ExternResult<ValidateCallbackResult> {
    if signal.data.is_empty() {
        return Ok(ValidateCallbackResult::Invalid(
            "Signal payload cannot be empty".into(),
        ));
    }
    Ok(ValidateCallbackResult::Valid)
}
