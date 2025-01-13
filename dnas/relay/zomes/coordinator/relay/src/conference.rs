use hdk::prelude::*;
use relay_integrity::*;

#[derive(Serialize, Deserialize, Debug)]
pub struct CreateConferenceInput {
    pub participants: Vec<AgentPubKey>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct JoinConferenceInput {
    pub room_id: String,
    pub participants: Vec<AgentPubKey>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SignalInput {
    pub room_id: String,
    pub target: AgentPubKey,
    pub payload_type: CallSignalType,
    pub data: String,
}

#[hdk_extern]
pub fn create_conference(input: CreateConferenceInput) -> ExternResult<String> {
    let agent_info = agent_info()?;
    let dna_info = dna_info()?;

    let room_id = format!("room_{}", dna_info.hash.to_string());

    let conference = ConferenceRoom {
        participants: input.participants.clone(),
        room_id: room_id.clone(),
    };

    debug!("create_conference: {:?}", conference);

    let _ = send_remote_signal(
        ConferenceRecord {
            room: Some(conference),
            agent: Some(agent_info.agent_latest_pubkey),
            room_id: None,
            signal_type: ConferenceSignalType::Invite,
            signal_payload: None,
        },
        input.participants,
    );

    Ok(room_id)
}

#[hdk_extern]
pub fn join_conference(input: JoinConferenceInput) -> ExternResult<()> {
    let agent_info = agent_info()?;

    let _ = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(input.room_id),
            agent: Some(agent_info.agent_latest_pubkey),
            signal_type: ConferenceSignalType::Join,
            signal_payload: None,
        },
        input.participants,
    );

    Ok(())
}

#[hdk_extern]
pub fn send_signal(input: SignalInput) -> ExternResult<()> {
    let agent_info = agent_info()?;
    let dna_info = dna_info()?;

    let signal_payload = SignalPayload {
        room_id: input.room_id.clone(),
        from: agent_info.agent_latest_pubkey,
        to: input.target.clone(),
        payload_type: input.payload_type,
        data: input.data,
    };

    let _ = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: None,
            agent: None,
            signal_type: ConferenceSignalType::WebRTC,
            signal_payload: Some(signal_payload),
        },
        vec![input.target],
    );

    Ok(())
}

#[hdk_extern]
pub fn leave_conference(room_id: String) -> ExternResult<()> {
    let agent_info = agent_info()?;
    let dna_info = dna_info()?;

    let _ = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(room_id),
            agent: Some(agent_info.agent_latest_pubkey),
            signal_type: ConferenceSignalType::Leave,
            signal_payload: None,
        },
        Vec::new(),
    );

    Ok(())
}

fn get_active_agents() -> ExternResult<Vec<AgentPubKey>> {
    let links = get_links(
        GetLinksInputBuilder::try_new(
            AnyLinkableHash::from(agent_info()?.agent_latest_pubkey),
            LinkTypes::ActiveCalls,
        )?
        .build(),
    )?;

    Ok(links
        .into_iter()
        .filter_map(|link| link.target.into_agent_pub_key())
        .collect())
}
