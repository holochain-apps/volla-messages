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
pub struct EndConferenceInput {
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
    info!("[Rust] ========== create_conference() called ==========");
    info!("[Rust] Input participants: {:?}", input.participants);
    info!("[Rust] Number of participants: {}", input.participants.len());
    
    let agent_info = agent_info()?;
    let dna_info = dna_info()?;
    info!("[Rust] My agent pubkey: {:?}", agent_info.agent_initial_pubkey);
    info!("[Rust] DNA hash: {:?}", dna_info.hash);

    let timestamp = sys_time()?;
    let (secs, nanos) = timestamp.as_seconds_and_nanos();
    let room_id = format!("room_{}_{}_{}", dna_info.hash.to_string(), secs, nanos);
    info!("[Rust] Generated room ID: {}", room_id);

    let conference = ConferenceRoom {
        participants: input.participants.clone(),
        room_id: room_id.clone(),
    };

    info!("[Rust] Conference room created: {:?}", conference);
    info!("[Rust] About to send INVITE signals to {} participants", input.participants.len());

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
        info!(
            "[Rust] ERROR: Failed to send conference invitation signals: {:?}",
            e
        );
    } else {
        info!("[Rust] SUCCESS: Invitation signals sent to all participants");
    }
    
    info!("[Rust] ========== create_conference() complete, returning room_id ==========");
    Ok(room_id)
}

#[hdk_extern]
pub fn join_conference(input: JoinConferenceInput) -> ExternResult<()> {
    info!("[Rust] ========== join_conference() called ==========");
    info!("[Rust] Room ID: {}", input.room_id);
    info!("[Rust] Participants to signal: {:?}", input.participants);
    info!("[Rust] Number of participants: {}", input.participants.len());
    
    let agent_info = agent_info()?;
    info!("[Rust] My agent pubkey: {:?}", agent_info.agent_initial_pubkey);

    info!("[Rust] Adding myself to room participants...");
    add_room_participant(&input.room_id)?;
    info!("[Rust] Successfully added to room participants");

    info!("[Rust] Sending JOIN signal to {} participants", input.participants.len());
    let signal_result = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(input.room_id.clone()),
            agent: Some(agent_info.agent_initial_pubkey),
            signal_type: ConferenceSignalType::Join,
            signal_payload: None,
        },
        input.participants.clone(),
    );

    if let Err(e) = signal_result {
        info!("[Rust] ERROR: Failed to send conference join signal: {:?}", e);
    } else {
        info!("[Rust] SUCCESS: Join signals sent to all {} participants", input.participants.len());
    }
    
    info!("[Rust] ========== join_conference() complete ==========");
    Ok(())
}

#[hdk_extern]
pub fn send_signal(input: SignalInput) -> ExternResult<()> {
    info!("[Rust] ========== send_signal() called (WebRTC) ==========");
    info!("[Rust] Room ID: {}", input.room_id);
    info!("[Rust] Target agent: {:?}", input.target);
    info!("[Rust] Signal type: {:?}", input.payload_type);
    info!("[Rust] Data length: {}", input.data.len());
    
    let agent_info = agent_info()?;
    info!("[Rust] My agent pubkey: {:?}", agent_info.agent_initial_pubkey);

    let signal_payload = SignalPayload {
        room_id: input.room_id.clone(),
        from: agent_info.agent_initial_pubkey,
        to: input.target.clone(),
        payload_type: input.payload_type,
        data: input.data,
    };
    
    info!("[Rust] Sending WebRTC signal to target");
    let signal_result = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: None,
            agent: None,
            signal_type: ConferenceSignalType::WebRTC,
            signal_payload: Some(signal_payload),
        },
        vec![input.target.clone()],
    );

    if let Err(e) = signal_result {
        info!("[Rust] ERROR: Failed to send WebRTC signal: {:?}", e);
    } else {
        info!("[Rust] SUCCESS: WebRTC signal sent to {:?}", input.target);
    }
    
    info!("[Rust] ========== send_signal() complete ==========");
    Ok(())
}

#[hdk_extern]
pub fn leave_conference(room_id: String) -> ExternResult<()> {
    info!("[Rust] ========== leave_conference() called ==========");
    info!("[Rust] Room ID: {}", room_id);
    
    let agent_info = agent_info()?;

    let active_participants = get_room_participants(&room_id)?;
    info!("[Rust] Found {} active participants", active_participants.len());

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
        info!("[Rust] Warning: Failed to send conference leave signal: {:?}", e);
    }

    // Try to remove participant link, but don't fail the whole operation if it errors
    // This can fail due to source chain head conflicts when multiple operations happen simultaneously
    if let Err(e) = remove_room_participant(&room_id) {
        info!("[Rust] Warning: Failed to remove room participant link (non-critical): {:?}", e);
        // Don't return error - the leave operation succeeded even if cleanup failed
    }

    info!("[Rust] ========== leave_conference() complete ==========");
    Ok(())
}

#[hdk_extern]
pub fn end_conference_for_all(input: EndConferenceInput) -> ExternResult<()> {
    info!("[Rust] ========== end_conference_for_all() called ==========");
    info!("[Rust] Room ID: {}", input.room_id);
    info!("[Rust] Participants: {:?}", input.participants);
    
    let agent_info = agent_info()?;

    info!("[Rust] Sending END signal to {} participants (including invited but not joined)", input.participants.len());

    let signal_result = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(input.room_id.clone()),
            agent: Some(agent_info.agent_initial_pubkey.clone()),
            signal_type: ConferenceSignalType::End,
            signal_payload: None,
        },
        input.participants.clone(),
    );

    if let Err(e) = signal_result {
        info!("[Rust] Warning: Failed to send conference end signal: {:?}", e);
    }

    // Remove all participant links for this room
    let room_path = Path::from(format!("conference_rooms.{}", input.room_id));
    let links = get_links(
        GetLinksInputBuilder::try_new(room_path.path_entry_hash()?, LinkTypes::RoomParticipants)?
            .build(),
    )?;
    
    info!("[Rust] Removing {} participant links", links.len());
    for link in links {
        if let Err(e) = delete_link(link.create_link_hash) {
            info!("[Rust] Warning: Failed to remove participant link (non-critical): {:?}", e);
        }
    }

    info!("[Rust] ========== end_conference_for_all() complete ==========");
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
        info!("Warning: Failed to send conference reject signal: {:?}", e);
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
