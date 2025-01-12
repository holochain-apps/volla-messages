use hdk::prelude::*;
use relay_integrity::*;

#[derive(Serialize, Deserialize, Debug)]
pub struct CreateConferenceInput {
    pub participants: Vec<AgentPubKey>,
    pub title: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct JoinConferenceInput {
    pub room_id: ActionHash,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SignalInput {
    pub room_id: String,
    pub target: AgentPubKey,
    pub payload_type: CallSignalType,
    pub data: String,
}

#[hdk_extern]
pub fn create_conference(input: CreateConferenceInput) -> ExternResult<DnaHash> {
    let agent_info = agent_info()?;
    let dna_info = dna_info()?;

    let room_id = dna_info.hash;

    let conference = ConferenceRoom {
        initiator: agent_info.agent_latest_pubkey.clone(),
        participants: input.participants.clone(),
        created_at: sys_time()?,
        title: input.title,
        room_id: room_id.to_string(),
    };

    let peers = get_active_agents()?;
    let online_participants: Vec<AgentPubKey> = input
        .participants
        .into_iter()
        .filter(|p| peers.contains(p))
        .collect();

    if !online_participants.is_empty() {
        let _ = send_remote_signal(
            ConferenceRecord {
                room: Some(conference),
                agent: Some(agent_info.agent_latest_pubkey),
                room_id: None,
                signal_type: ConferenceSignalType::Invite,
                signal_payload: None,
            },
            online_participants,
        );
    }

    Ok(room_id)
}

#[hdk_extern]
pub fn join_conference(room_id: DnaHash) -> ExternResult<()> {
    let agent_info = agent_info()?;
    let peers = get_active_agents()?;

    if !peers.is_empty() {
        let _ = send_remote_signal(
            ConferenceRecord {
                room: None,
                room_id: Some(room_id.to_string()),
                agent: Some(agent_info.agent_latest_pubkey),
                signal_type: ConferenceSignalType::Join,
                signal_payload: None,
            },
            peers,
        );
    }

    Ok(())
}

#[hdk_extern]
pub fn send_signal(input: SignalInput) -> ExternResult<()> {
    let agent_info = agent_info()?;
    let dna_info = dna_info()?;

    let signal_payload = SignalPayload {
        room_id: dna_info.hash.to_string(),
        from: agent_info.agent_latest_pubkey,
        to: input.target.clone(),
        payload_type: input.payload_type,
        data: input.data,
    };

    let peers = get_active_agents()?;
    if peers.contains(&input.target) {
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
    }

    Ok(())
}

#[hdk_extern]
pub fn leave_conference(_room_id: DnaHash) -> ExternResult<()> {
    let agent_info = agent_info()?;
    let dna_info = dna_info()?;

    let peers = get_active_agents()?;
    if !peers.is_empty() {
        let _ = send_remote_signal(
            ConferenceRecord {
                room: None,
                room_id: Some(dna_info.hash.to_string()),
                agent: Some(agent_info.agent_latest_pubkey),
                signal_type: ConferenceSignalType::Leave,
                signal_payload: None,
            },
            peers,
        );
    }

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
