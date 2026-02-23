use hdk::prelude::*;
use relay_integrity::*;

fn generate_signal_id() -> String {
    let timestamp = sys_time().unwrap();
    let (secs, nanos) = timestamp.as_seconds_and_nanos();
    format!("sig_{}_{}", secs, nanos)
}

fn room_path(room_id: &str) -> Path {
    Path::from(format!("conference_rooms.{}", room_id))
}

fn get_conference(room_id: &str) -> ExternResult<Option<(ActionHash, Conference)>> {
    let path = room_path(room_id);
    let links = get_links(
        LinkQuery {
            base: path.path_entry_hash()?.into(),
            link_type: LinkTypes::RoomIdToConference.try_into_filter()?,
            tag_prefix: None,
            after: None,
            before: None,
            author: None,
        },
        GetStrategy::Local,
    )?;

    for link in links {
        if let Some(action_hash) = link.target.into_action_hash() {
            if let Some(record) = get(action_hash.clone(), GetOptions::default())? {
                if let Some(conference) = record.entry().to_app_option::<Conference>().ok().flatten() {
                    if conference.is_active {
                        return Ok(Some((action_hash, conference)));
                    }
                }
            }
        }
    }
    Ok(None)
}

fn get_participant(
    conference_hash: &ActionHash,
    agent: &AgentPubKey,
) -> ExternResult<Option<(ActionHash, ConferenceParticipant)>> {
    let links = get_links(
        LinkQuery {
            base: conference_hash.clone().into(),
            link_type: LinkTypes::ConferenceToParticipants.try_into_filter()?,
            tag_prefix: None,
            after: None,
            before: None,
            author: None,
        },
        GetStrategy::Local,
    )?;

    for link in links {
        if let Some(action_hash) = link.target.into_action_hash() {
            if let Some(record) = get(action_hash.clone(), GetOptions::default())? {
                if let Some(participant) = record.entry().to_app_option::<ConferenceParticipant>().ok().flatten() {
                    if participant.agent == *agent && participant.is_active {
                        return Ok(Some((action_hash, participant)));
                    }
                }
            }
        }
    }
    Ok(None)
}

fn get_caller_role(room_id: &str) -> ExternResult<Option<ConferenceRole>> {
    let agent = agent_info()?.agent_initial_pubkey;

    if let Some((conference_hash, _)) = get_conference(room_id)? {
        if let Some((_, participant)) = get_participant(&conference_hash, &agent)? {
            return Ok(Some(participant.role));
        }
    }
    Ok(None)
}

fn get_all_participants(conference_hash: &ActionHash) -> ExternResult<Vec<ConferenceParticipant>> {
    let links = get_links(
        LinkQuery {
            base: conference_hash.clone().into(),
            link_type: LinkTypes::ConferenceToParticipants.try_into_filter()?,
            tag_prefix: None,
            after: None,
            before: None,
            author: None,
        },
        GetStrategy::Local,
    )?;

    let mut participants = Vec::new();
    for link in links {
        if let Some(action_hash) = link.target.into_action_hash() {
            if let Some(record) = get(action_hash, GetOptions::default())? {
                if let Some(participant) = record.entry().to_app_option::<ConferenceParticipant>().ok().flatten() {
                    if participant.is_active {
                        participants.push(participant);
                    }
                }
            }
        }
    }
    Ok(participants)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AckSignalInput {
    pub signal_id: String,
    pub target: AgentPubKey,
}

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

    let agent_info = agent_info()?;
    let dna_info = dna_info()?;
    let timestamp = sys_time()?;
    let (secs, nanos) = timestamp.as_seconds_and_nanos();
    let room_id = format!("room_{}_{}_{}", dna_info.hash.to_string(), secs, nanos);

    info!("[Rust] Generated room ID: {}", room_id);

    // Create Conference entry in DHT
    let conference = Conference {
        room_id: room_id.clone(),
        creator: agent_info.agent_initial_pubkey.clone(),
        current_host: agent_info.agent_initial_pubkey.clone(),
        created_at: timestamp,
        is_active: true,
        max_participants: None,
    };

    let conference_hash = create_entry(&EntryTypes::Conference(conference.clone()))?;
    info!("[Rust] Created Conference entry: {:?}", conference_hash);

    // Link room_id path to Conference
    let path = room_path(&room_id);
    create_link(
        path.path_entry_hash()?,
        conference_hash.clone(),
        LinkTypes::RoomIdToConference,
        (),
    )?;

    // Create Participant entry for creator as Host
    let participant = ConferenceParticipant {
        room_id: room_id.clone(),
        agent: agent_info.agent_initial_pubkey.clone(),
        role: ConferenceRole::Host,
        joined_at: timestamp,
        is_active: true,
        conference_hash: conference_hash.clone(),
    };

    let participant_hash = create_entry(&EntryTypes::ConferenceParticipant(participant))?;
    create_link(
        conference_hash,
        participant_hash,
        LinkTypes::ConferenceToParticipants,
        (),
    )?;
    info!("[Rust] Created Host participant entry");

    add_room_participant(&room_id)?;

    let conference_room = ConferenceRoom {
        participants: input.participants.clone(),
        room_id: room_id.clone(),
    };

    let _ = send_remote_signal(
        ConferenceRecord {
            room: Some(conference_room),
            agent: Some(agent_info.agent_initial_pubkey),
            room_id: None,
            signal_type: ConferenceSignalType::Invite,
            signal_payload: None,
            ack_signal_id: None,
            new_role: None,
            new_host: None,
        },
        input.participants,
    );

    info!("[Rust] ========== create_conference() complete ==========");
    Ok(room_id)
}

#[hdk_extern]
pub fn join_conference(input: JoinConferenceInput) -> ExternResult<()> {
    info!("[Rust] ========== join_conference() called ==========");
    info!("[Rust] Room ID: {}", input.room_id);

    let agent_info = agent_info()?;
    let timestamp = sys_time()?;

    // Get the conference entry
    let (conference_hash, _conference) = get_conference(&input.room_id)?
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Conference not found".to_string())))?;

    // Check if already a participant
    if get_participant(&conference_hash, &agent_info.agent_initial_pubkey)?.is_some() {
        info!("[Rust] Already a participant, skipping creation");
    } else {
        // Create Participant entry as Member
        let participant = ConferenceParticipant {
            room_id: input.room_id.clone(),
            agent: agent_info.agent_initial_pubkey.clone(),
            role: ConferenceRole::Member,
            joined_at: timestamp,
            is_active: true,
            conference_hash: conference_hash.clone(),
        };

        let participant_hash = create_entry(&EntryTypes::ConferenceParticipant(participant))?;
        create_link(
            conference_hash,
            participant_hash,
            LinkTypes::ConferenceToParticipants,
            (),
        )?;
        info!("[Rust] Created Member participant entry");
    }

    add_room_participant(&input.room_id)?;

    let _ = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(input.room_id.clone()),
            agent: Some(agent_info.agent_initial_pubkey),
            signal_type: ConferenceSignalType::Join,
            signal_payload: None,
            ack_signal_id: None,
            new_role: None,
            new_host: None,
        },
        input.participants,
    );

    info!("[Rust] ========== join_conference() complete ==========");
    Ok(())
}

#[hdk_extern]
pub fn send_signal(input: SignalInput) -> ExternResult<()> {
    let agent_info = agent_info()?;

    let signal_payload = SignalPayload {
        room_id: input.room_id,
        from: agent_info.agent_initial_pubkey,
        to: input.target.clone(),
        payload_type: input.payload_type,
        data: input.data,
        signal_id: Some(generate_signal_id()),
    };

    let _ = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: None,
            agent: None,
            signal_type: ConferenceSignalType::WebRTC,
            signal_payload: Some(signal_payload),
            ack_signal_id: None,
            new_role: None,
            new_host: None,
        },
        vec![input.target],
    );

    Ok(())
}

#[hdk_extern]
pub fn leave_conference(room_id: String) -> ExternResult<()> {
    info!("[Rust] ========== leave_conference() called ==========");

    let agent_info = agent_info()?;

    // Mark participant as inactive in DHT
    if let Some((conference_hash, _)) = get_conference(&room_id)? {
        if let Some((participant_hash, mut participant)) = get_participant(&conference_hash, &agent_info.agent_initial_pubkey)? {
            participant.is_active = false;
            update_entry(participant_hash, &EntryTypes::ConferenceParticipant(participant))?;
        }
    }

    let active_participants = get_room_participants(&room_id)?;

    let _ = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(room_id.clone()),
            agent: Some(agent_info.agent_initial_pubkey),
            signal_type: ConferenceSignalType::Leave,
            signal_payload: None,
            ack_signal_id: None,
            new_role: None,
            new_host: None,
        },
        active_participants,
    );

    if let Err(e) = remove_room_participant(&room_id) {
        info!("[Rust] Warning: Failed to remove room participant link: {:?}", e);
    }

    info!("[Rust] ========== leave_conference() complete ==========");
    Ok(())
}

#[hdk_extern]
pub fn end_conference_for_all(input: EndConferenceInput) -> ExternResult<()> {
    info!("[Rust] ========== end_conference_for_all() called ==========");
    info!("[Rust] Room ID: {}", input.room_id);

    let agent_info = agent_info()?;

    // If conference is already ended or not found, return success
    // This prevents source chain conflicts when multiple participants try to end simultaneously
    let (conference_hash, conference) = match get_conference(&input.room_id)? {
        Some(c) => c,
        None => {
            info!("[Rust] Conference already ended or not found, returning success (idempotent)");
            return Ok(());
        }
    };

    // Early return if already inactive
    if !conference.is_active {
        info!("[Rust] Conference already inactive, skipping (idempotent)");
        return Ok(());
    }

    // Caller must be Host or CoHost
    let caller_role = get_caller_role(&input.room_id)?
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest(
            "Permission denied: You are not a participant in this conference".to_string()
        )))?;

    if !caller_role.has_at_least(ConferenceRole::CoHost) {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "Permission denied: Only Host or CoHost can end the conference for all".to_string()
        )));
    }

    info!("[Rust] Permission check passed, caller role: {:?}", caller_role);

    // Mark conference as inactive
    let mut conference = conference;
    conference.is_active = false;
    update_entry(conference_hash.clone(), &EntryTypes::Conference(conference))?;

    // Mark all participants as inactive
    let participants = get_all_participants(&conference_hash)?;
    for participant in participants {
        if let Some((p_hash, mut p)) = get_participant(&conference_hash, &participant.agent)? {
            p.is_active = false;
            let _ = update_entry(p_hash, &EntryTypes::ConferenceParticipant(p));
        }
    }

    let _ = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(input.room_id.clone()),
            agent: Some(agent_info.agent_initial_pubkey),
            signal_type: ConferenceSignalType::End,
            signal_payload: None,
            ack_signal_id: None,
            new_role: None,
            new_host: None,
        },
        input.participants,
    );

    let room_path = room_path(&input.room_id);
    let links = get_links(
        LinkQuery {
            base: room_path.path_entry_hash()?.into(),
            link_type: LinkTypes::RoomParticipants.try_into_filter()?,
            tag_prefix: None,
            after: None,
            before: None,
            author: None,
        },
        GetStrategy::Local,
    )?;

    for link in links {
        let _ = delete_link(link.create_link_hash, GetOptions::local());
    }

    info!("[Rust] ========== end_conference_for_all() complete ==========");
    Ok(())
}

#[hdk_extern]
pub fn reject_conference(input: RejectConferenceInput) -> ExternResult<()> {
    let agent_info = agent_info()?;

    let _ = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(input.room_id),
            agent: Some(agent_info.agent_initial_pubkey),
            signal_type: ConferenceSignalType::Reject,
            signal_payload: None,
            ack_signal_id: None,
            new_role: None,
            new_host: None,
        },
        input.participants,
    );

    Ok(())
}

#[hdk_extern]
pub fn send_ack_signal(input: AckSignalInput) -> ExternResult<()> {
    let agent_info = agent_info()?;

    let _ = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: None,
            agent: Some(agent_info.agent_initial_pubkey),
            signal_type: ConferenceSignalType::Ack,
            signal_payload: None,
            ack_signal_id: Some(input.signal_id),
            new_role: None,
            new_host: None,
        },
        vec![input.target],
    );

    Ok(())
}

#[hdk_extern]
pub fn get_my_conference_role(room_id: String) -> ExternResult<Option<ConferenceRole>> {
    get_caller_role(&room_id)
}

#[hdk_extern]
pub fn get_conference_participants(room_id: String) -> ExternResult<Vec<ConferenceParticipantRecord>> {
    let (conference_hash, _) = get_conference(&room_id)?
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Conference not found".to_string())))?;

    let participants = get_all_participants(&conference_hash)?;

    Ok(participants.into_iter().map(|p| ConferenceParticipantRecord {
        room_id: p.room_id,
        agent: p.agent,
        role: p.role,
        joined_at: p.joined_at,
        is_active: p.is_active,
    }).collect())
}

#[hdk_extern]
pub fn transfer_host(input: TransferHostInput) -> ExternResult<()> {
    info!("[Rust] ========== transfer_host() called ==========");

    let agent_info = agent_info()?;

    let caller_role = get_caller_role(&input.room_id)?
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Not a participant".to_string())))?;

    if caller_role != ConferenceRole::Host {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "Permission denied: Only Host can transfer host role".to_string()
        )));
    }

    let (conference_hash, mut conference) = get_conference(&input.room_id)?
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Conference not found".to_string())))?;

    // Get target participant
    let (target_hash, mut target_participant) = get_participant(&conference_hash, &input.new_host)?
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Target is not a participant".to_string())))?;

    // Get caller's participant entry
    let (caller_hash, mut caller_participant) = get_participant(&conference_hash, &agent_info.agent_initial_pubkey)?
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Caller participant not found".to_string())))?;

    // Update roles
    target_participant.role = ConferenceRole::Host;
    caller_participant.role = ConferenceRole::CoHost;
    conference.current_host = input.new_host.clone();

    update_entry(target_hash, &EntryTypes::ConferenceParticipant(target_participant))?;
    update_entry(caller_hash, &EntryTypes::ConferenceParticipant(caller_participant))?;
    update_entry(conference_hash.clone(), &EntryTypes::Conference(conference))?;

    // Notify all participants
    let participants = get_all_participants(&conference_hash)?;
    let agents: Vec<AgentPubKey> = participants.iter().map(|p| p.agent.clone()).collect();

    let _ = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(input.room_id),
            agent: Some(agent_info.agent_initial_pubkey),
            signal_type: ConferenceSignalType::HostTransfer,
            signal_payload: None,
            ack_signal_id: None,
            new_role: None,
            new_host: Some(input.new_host),
        },
        agents,
    );

    info!("[Rust] ========== transfer_host() complete ==========");
    Ok(())
}

#[hdk_extern]
pub fn kick_participant(input: KickParticipantInput) -> ExternResult<()> {
    info!("[Rust] ========== kick_participant() called ==========");

    let agent_info = agent_info()?;

    let caller_role = get_caller_role(&input.room_id)?
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Not a participant".to_string())))?;

    if !caller_role.has_at_least(ConferenceRole::CoHost) {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "Permission denied: Only Host or CoHost can kick participants".to_string()
        )));
    }

    let (conference_hash, _) = get_conference(&input.room_id)?
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Conference not found".to_string())))?;

    let (target_hash, target_participant) = get_participant(&conference_hash, &input.target)?
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Target is not a participant".to_string())))?;

    // Can only kick someone with lower privilege
    if !caller_role.can_act_on(&target_participant.role) {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "Permission denied: Cannot kick someone with same or higher role".to_string()
        )));
    }

    // Mark target as inactive
    let mut updated_participant = target_participant.clone();
    updated_participant.is_active = false;
    update_entry(target_hash, &EntryTypes::ConferenceParticipant(updated_participant))?;

    // Send Kicked signal to target
    let _ = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(input.room_id.clone()),
            agent: Some(agent_info.agent_initial_pubkey.clone()),
            signal_type: ConferenceSignalType::Kicked,
            signal_payload: None,
            ack_signal_id: None,
            new_role: None,
            new_host: None,
        },
        vec![input.target.clone()],
    );

    // Notify others that participant left
    let participants = get_all_participants(&conference_hash)?;
    let agents: Vec<AgentPubKey> = participants.iter()
        .filter(|p| p.agent != input.target)
        .map(|p| p.agent.clone())
        .collect();

    let _ = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(input.room_id),
            agent: Some(input.target),
            signal_type: ConferenceSignalType::Leave,
            signal_payload: None,
            ack_signal_id: None,
            new_role: None,
            new_host: None,
        },
        agents,
    );

    info!("[Rust] ========== kick_participant() complete ==========");
    Ok(())
}

#[hdk_extern]
pub fn change_participant_role(input: RoleChangeInput) -> ExternResult<()> {
    info!("[Rust] ========== change_participant_role() called ==========");

    let agent_info = agent_info()?;

    let caller_role = get_caller_role(&input.room_id)?
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Not a participant".to_string())))?;

    if caller_role != ConferenceRole::Host {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "Permission denied: Only Host can change participant roles".to_string()
        )));
    }

    if input.new_role == ConferenceRole::Host {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "Use transfer_host to make someone Host".to_string()
        )));
    }

    let (conference_hash, _) = get_conference(&input.room_id)?
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Conference not found".to_string())))?;

    let (target_hash, mut target_participant) = get_participant(&conference_hash, &input.target)?
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Target is not a participant".to_string())))?;

    if input.target == agent_info.agent_initial_pubkey {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "Cannot change your own role".to_string()
        )));
    }

    target_participant.role = input.new_role.clone();
    update_entry(target_hash, &EntryTypes::ConferenceParticipant(target_participant))?;

    // Notify the target of their new role
    let _ = send_remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(input.room_id),
            agent: Some(agent_info.agent_initial_pubkey),
            signal_type: ConferenceSignalType::RoleChanged,
            signal_payload: None,
            ack_signal_id: None,
            new_role: Some(input.new_role),
            new_host: None,
        },
        vec![input.target],
    );

    info!("[Rust] ========== change_participant_role() complete ==========");
    Ok(())
}

fn add_room_participant(room_id: &str) -> ExternResult<()> {
    let agent_info = agent_info()?;
    let path = room_path(room_id);

    create_link(
        path.path_entry_hash()?,
        agent_info.agent_initial_pubkey,
        LinkTypes::RoomParticipants,
        (),
    )?;

    Ok(())
}

fn remove_room_participant(room_id: &str) -> ExternResult<()> {
    let agent_info = agent_info()?;
    let path = room_path(room_id);

    let links = get_links(
        LinkQuery {
            base: path.path_entry_hash()?.into(),
            link_type: LinkTypes::RoomParticipants.try_into_filter()?,
            tag_prefix: None,
            after: None,
            before: None,
            author: None,
        },
        GetStrategy::Local,
    )?;

    for link in links {
        if let Some(target_agent) = link.target.into_agent_pub_key() {
            if target_agent == agent_info.agent_initial_pubkey {
                delete_link(link.create_link_hash, GetOptions::local())?;
            }
        }
    }

    Ok(())
}

fn get_room_participants(room_id: &str) -> ExternResult<Vec<AgentPubKey>> {
    let path = room_path(room_id);

    let links = get_links(
        LinkQuery {
            base: path.path_entry_hash()?.into(),
            link_type: LinkTypes::RoomParticipants.try_into_filter()?,
            tag_prefix: None,
            after: None,
            before: None,
            author: None,
        },
        GetStrategy::Local,
    )?;

    Ok(links
        .into_iter()
        .filter_map(|link| link.target.into_agent_pub_key())
        .collect())
}
