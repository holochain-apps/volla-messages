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
pub struct RejectConferenceInput {
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

    let timestamp = sys_time()?;
    let (secs, nanos) = timestamp.as_seconds_and_nanos();
    let room_id = format!("room_{}_{}_{}", dna_info.hash.to_string(), secs, nanos);

    let conference = ConferenceRoom {
        participants: input.participants.clone(),
        room_id: room_id.clone(),
    };

    debug!("create_conference: {:?}", conference);

    // send invitation signals to all participants
    let signal_result = send_remote_signal(
        ConferenceRecord {
            room: Some(conference.clone()),
            agent: Some(agent_info.agent_initial_pubkey),
            room_id: None,
            signal_type: ConferenceSignalType::Invite,
            signal_payload: None,
        },
        input.participants.clone(),
    );

    if let Err(e) = signal_result {
        debug!(
            "Warning: Failed to send conference invitation signals: {:?}",
            e
        );
    }

    Ok(room_id)
}

#[hdk_extern]
pub fn join_conference(input: JoinConferenceInput) -> ExternResult<()> {
    let agent_info = agent_info()?;

    add_room_participant(&input.room_id)?;

    let signal_result = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(input.room_id.clone()),
            agent: Some(agent_info.agent_initial_pubkey),
            signal_type: ConferenceSignalType::Join,
            signal_payload: None,
        },
        input.participants,
    );

    if let Err(e) = signal_result {
        debug!("Warning: Failed to send conference join signal: {:?}", e);
    }

    Ok(())
}

#[hdk_extern]
pub fn send_signal(input: SignalInput) -> ExternResult<()> {
    let agent_info = agent_info()?;

    let signal_payload = SignalPayload {
        room_id: input.room_id.clone(),
        from: agent_info.agent_initial_pubkey,
        to: input.target.clone(),
        payload_type: input.payload_type,
        data: input.data,
    };

    let signal_result = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: None,
            agent: None,
            signal_type: ConferenceSignalType::WebRTC,
            signal_payload: Some(signal_payload),
        },
        vec![input.target],
    );

    if let Err(e) = signal_result {
        debug!("Warning: Failed to send WebRTC signal: {:?}", e);
    }

    Ok(())
}

#[hdk_extern]
pub fn leave_conference(room_id: String) -> ExternResult<()> {
    let agent_info = agent_info()?;

    let active_participants = get_room_participants(&room_id)?;

    let signal_result = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(room_id.clone()),
            agent: Some(agent_info.agent_initial_pubkey),
            signal_type: ConferenceSignalType::Leave,
            signal_payload: None,
        },
        active_participants,
    );

    if let Err(e) = signal_result {
        debug!("Warning: Failed to send conference leave signal: {:?}", e);
    }

    remove_room_participant(&room_id)?;

    Ok(())
}

#[hdk_extern]
pub fn reject_conference(input: RejectConferenceInput) -> ExternResult<()> {
    let agent_info = agent_info()?;

    let signal_result = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(input.room_id.clone()),
            agent: Some(agent_info.agent_initial_pubkey),
            signal_type: ConferenceSignalType::Reject,
            signal_payload: None,
        },
        input.participants,
    );

    if let Err(e) = signal_result {
        debug!("Warning: Failed to send conference reject signal: {:?}", e);
    }

    Ok(())
}

fn add_room_participant(room_id: &String) -> ExternResult<()> {
    let agent_info = agent_info()?;
    let room_path = Path::from(format!("conference_rooms.{}", room_id));

    create_link(
        room_path.path_entry_hash()?,
        agent_info.agent_initial_pubkey.clone(),
        LinkTypes::RoomParticipants,
        (),
    )?;

    Ok(())
}

fn remove_room_participant(room_id: &String) -> ExternResult<()> {
    let agent_info = agent_info()?;
    let room_path = Path::from(format!("conference_rooms.{}", room_id));

    let links = get_links(
        GetLinksInputBuilder::try_new(room_path.path_entry_hash()?, LinkTypes::RoomParticipants)?
            .build(),
    )?;

    for link in links {
        if let Some(target_agent) = link.target.into_agent_pub_key() {
            if target_agent == agent_info.agent_initial_pubkey {
                delete_link(link.create_link_hash)?;
            }
        }
    }

    Ok(())
}

fn get_room_participants(room_id: &String) -> ExternResult<Vec<AgentPubKey>> {
    let room_path = Path::from(format!("conference_rooms.{}", room_id));

    let links = get_links(
        GetLinksInputBuilder::try_new(room_path.path_entry_hash()?, LinkTypes::RoomParticipants)?
            .build(),
    )?;

    Ok(links
        .into_iter()
        .filter_map(|link| link.target.into_agent_pub_key())
        .collect())
}

fn _get_active_agents() -> ExternResult<Vec<AgentPubKey>> {
    let links = get_links(
        GetLinksInputBuilder::try_new(
            AnyLinkableHash::from(agent_info()?.agent_initial_pubkey),
            LinkTypes::ActiveCalls,
        )?
        .build(),
    )?;

    Ok(links
        .into_iter()
        .filter_map(|link| link.target.into_agent_pub_key())
        .collect())
}
