use hdk::prelude::*;
use hex;
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
    pub payload_type: SignalType,
    pub data: String,
}

#[hdk_extern]
pub fn create_conference(input: CreateConferenceInput) -> ExternResult<Record> {
    let agent_info = agent_info()?;

    let conference = ConferenceRoom {
        initiator: agent_info.agent_latest_pubkey.clone(),
        participants: input.participants.clone(),
        created_at: sys_time()?,
        title: input.title,
        // Assigns unique room ID
        // TODO: Implement a more secure way to generate room IDs
        room_id: hex::encode(random_bytes(32)?),
    };

    let action_hash = create_entry(&EntryTypes::ConferenceRoom(conference.clone()))?;

    // Creating participant links
    for participant in input.participants.clone() {
        create_link(
            action_hash.clone(),
            participant,
            LinkTypes::RoomParticipants,
            (),
        )?;
    }

    // let signal = Signal::ConferenceInvite {
    //     room: conference.clone(),
    //     from: agent_info.agent_latest_pubkey.clone(),
    // };

    // remote_signal(signal, input.participants.clone())?;

    let _ = remote_signal(
        ConferenceRecord {
            room: Some(conference.clone()),
            agent: Some(agent_info.agent_latest_pubkey.clone()),
            room_id: None,
            signal_type: ConferenceSignalType::Invite,
            signal_payload: None,
        },
        input.participants.clone(),
    );

    let record = get(action_hash.clone(), GetOptions::default())?
        .ok_or(wasm_error!("Could not find the newly created conference"))?;

    Ok(record)
}

#[hdk_extern]
pub fn join_conference(input: JoinConferenceInput) -> ExternResult<()> {
    let agent_info = agent_info()?;

    // Getting conference room record
    let record = get(input.room_id.clone(), GetOptions::default())?
        .ok_or(wasm_error!("Conference room not found"))?;

    let conference: ConferenceRoom = record
        .entry()
        .to_app_option()
        .map_err(|e| wasm_error!(WasmErrorInner::Serialize(e)))?
        .ok_or(wasm_error!("Invalid conference entry"))?;

    // Creating an active call link for the agent
    let agent_pubkey = agent_info.agent_latest_pubkey.clone();
    create_link(
        input.room_id.clone(),
        agent_pubkey,
        LinkTypes::ActiveCalls,
        (),
    )?;

    // let signal = Signal::ConferenceJoined {
    //     room_id: input.room_id.to_string(),
    //     agent: agent_info.agent_latest_pubkey,
    // };

    // remote_signal(signal, conference.participants)?;

    let _ = remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(input.room_id.to_string()),
            agent: Some(agent_info.agent_latest_pubkey.clone()),
            signal_type: ConferenceSignalType::Join,
            signal_payload: None,
        },
        conference.participants.clone(),
    );

    Ok(())
}

#[hdk_extern]
pub fn send_signal(input: SignalInput) -> ExternResult<()> {
    let agent_info = agent_info()?;

    let signal_payload = SignalPayload {
        room_id: input.room_id,
        from: agent_info.agent_latest_pubkey,
        to: input.target.clone(),
        payload_type: input.payload_type,
        data: input.data,
    };

    let _hash = create_entry(&EntryTypes::SignalPayload(signal_payload.clone()))?;

    // let signal = Signal::WebRTCSignal(signal_payload);
    // remote_signal(signal, vec![input.target.clone()])?;

    let _ = remote_signal(
        ConferenceRecord {
            room: None,
            room_id: None,
            agent: None,
            signal_type: ConferenceSignalType::WebRTC,
            signal_payload: Some(signal_payload.clone()),
        },
        vec![input.target.clone()],
    );

    Ok(())
}

#[hdk_extern]
pub fn leave_conference(room_id: ActionHash) -> ExternResult<()> {
    let agent_info = agent_info()?;

    let record = get(room_id.clone(), GetOptions::default())?
        .ok_or(wasm_error!("Conference room not found"))?;

    let conference: ConferenceRoom = record
        .entry()
        .to_app_option()
        .map_err(|e| wasm_error!(WasmErrorInner::Serialize(e)))?
        .ok_or(wasm_error!("Invalid conference entry"))?;

    // Removing the active call link
    let links =
        get_links(GetLinksInputBuilder::try_new(room_id.clone(), LinkTypes::ActiveCalls)?.build())?;
    for link in links {
        if let Some(agent_key) = link.target.into_agent_pub_key() {
            if agent_key == agent_info.agent_latest_pubkey {
                delete_link(link.create_link_hash)?;
            }
        }
    }

    // let signal = Signal::ConferenceLeft {
    //     room_id: conference.room_id,
    //     agent: agent_info.agent_latest_pubkey,
    // };

    // remote_signal(signal, conference.participants)?;

    let _ = remote_signal(
        ConferenceRecord {
            room: None,
            room_id: Some(conference.room_id.clone()),
            agent: Some(agent_info.agent_latest_pubkey.clone()),
            signal_type: ConferenceSignalType::Leave,
            signal_payload: None,
        },
        conference.participants.clone(),
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

fn remote_signal(signal: ConferenceRecord, targets: Vec<AgentPubKey>) -> ExternResult<()> {
    let peers = get_active_agents()?;
    let targets: Vec<AgentPubKey> = targets.into_iter().filter(|t| peers.contains(t)).collect();

    if !targets.is_empty() {
        send_remote_signal(signal, targets)?;
    }
    Ok(())
}
