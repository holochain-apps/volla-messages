pub mod conference;
pub mod config;
pub mod contact;
pub mod helper;
pub mod message;
pub mod ping;
use hdk::prelude::*;
use relay_integrity::*;

#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
pub enum RemoteSignal {
    Message(MessageRecord),
    Conference(ConferenceRecord),
}

#[hdk_extern]
fn recv_remote_signal(signal: RemoteSignal) -> ExternResult<()> {
    info!("[Rust] ========== recv_remote_signal() called ==========");
    
    match signal {
        RemoteSignal::Conference(conference_record) => {
            info!("[Rust] ========== Processing ConferenceRecord signal ==========");
            info!("[Rust] Signal type: {:?}", conference_record.signal_type);
            info!("[Rust] Full conference record: {:?}", conference_record);
            
            match conference_record.signal_type {
                ConferenceSignalType::Invite => {
                    info!("[Rust] ** INVITE signal detected **");
                    let room = conference_record
                        .room
                        .ok_or(wasm_error!(WasmErrorInner::Guest(
                            "Room field required for Invite signal".into()
                        )))?;
                    let agent =
                        conference_record
                            .agent
                            .ok_or(wasm_error!(WasmErrorInner::Guest(
                                "Agent field required for Invite signal".into()
                            )))?;
                    info!("[Rust] Room: {:?}", room);
                    info!("[Rust] Inviter agent: {:?}", agent);
                    info!("[Rust] About to emit ConferenceInvite signal");
                    let result = emit_signal(Signal::ConferenceInvite { room, agent });
                    info!("[Rust] emit_signal result: {:?}", result);
                    result
                }
                ConferenceSignalType::Join => {
                    info!("[Rust] ** JOIN signal detected **");
                    let room_id = conference_record
                        .room_id
                        .ok_or(wasm_error!(WasmErrorInner::Guest(
                            "Room ID required for Join signal".into()
                        )))?;
                    let agent = conference_record
                        .agent
                        .ok_or(wasm_error!(WasmErrorInner::Guest(
                            "Agent field required for Join signal".into()
                        )))?;
                    info!("[Rust] Room ID: {}", room_id);
                    info!("[Rust] Joining agent: {:?}", agent);
                    emit_signal(Signal::ConferenceJoined { room_id, agent })
                }
                ConferenceSignalType::Leave => {
                    info!("[Rust] ** LEAVE signal detected **");
                    let room_id = conference_record
                        .room_id
                        .ok_or(wasm_error!(WasmErrorInner::Guest(
                            "Room ID required for Leave signal".into()
                        )))?;
                    let agent = conference_record
                        .agent
                        .ok_or(wasm_error!(WasmErrorInner::Guest(
                            "Agent field required for Leave signal".into()
                        )))?;
                    emit_signal(Signal::ConferenceLeft { room_id, agent })
                }
                ConferenceSignalType::Reject => {
                    info!("[Rust] ** REJECT signal detected **");
                    let room_id = conference_record
                        .room_id
                        .ok_or(wasm_error!(WasmErrorInner::Guest(
                            "Room ID required for Reject signal".into()
                        )))?;
                    let agent = conference_record
                        .agent
                        .ok_or(wasm_error!(WasmErrorInner::Guest(
                            "Agent field required for Reject signal".into()
                        )))?;
                    emit_signal(Signal::ConferenceRejected { room_id, agent })
                }
                ConferenceSignalType::End => {
                    info!("[Rust] ** END signal detected **");
                    let room_id = conference_record
                        .room_id
                        .ok_or(wasm_error!(WasmErrorInner::Guest(
                            "Room ID required for End signal".into()
                        )))?;
                    let ended_by = conference_record
                        .agent
                        .ok_or(wasm_error!(WasmErrorInner::Guest(
                            "Agent field required for End signal".into()
                        )))?;
                    emit_signal(Signal::ConferenceEnded { room_id, ended_by })
                }
                ConferenceSignalType::WebRTC => {
                    info!("[Rust] ** WebRTC signal detected **");
                    let signal_payload = conference_record
                        .signal_payload
                        .ok_or(wasm_error!(WasmErrorInner::Guest(
                            "Signal payload required for WebRTC signal".into()
                        )))?;
                    info!("[Rust] WebRTC payload type: {:?}", signal_payload.payload_type);
                    emit_signal(Signal::WebRTCSignal(signal_payload))
                }
                ConferenceSignalType::Ack => {
                    info!("[Rust] ** ACK signal detected **");
                    let signal_id = conference_record
                        .ack_signal_id
                        .ok_or(wasm_error!(WasmErrorInner::Guest(
                            "Signal ID required for Ack signal".into()
                        )))?;
                    let from = conference_record
                        .agent
                        .ok_or(wasm_error!(WasmErrorInner::Guest(
                            "Agent field required for Ack signal".into()
                        )))?;
                    info!("[Rust] Acknowledging signal ID: {}", signal_id);
                    emit_signal(Signal::SignalAck { signal_id, from })
                }
            }
        }
        RemoteSignal::Message(message_record) => {
            info!("[Rust] Processing MessageRecord signal");
            let info: CallInfo = call_info()?;
            let is_deletion = match message_record.signed_action.action() {
                Action::Delete(_) => true,
                _ => false,
            };
            if is_deletion {
                let signal = Signal::MessageDeleted {
                    action: message_record.signed_action.clone(),
                    original_action: message_record.original_action.clone(),
                    from: info.provenance,
                };

                info!("recv_remote_signal: signal: {:?}", signal);

                emit_signal(signal)
            } else if let Some(message) = message_record.message {
                let signal = Signal::Message {
                    action: message_record.signed_action.clone(),
                    message,
                    from: info.provenance,
                };
                emit_signal(signal)
            } else {
                Err(wasm_error!(WasmErrorInner::Guest(
                    "Invalid message record".to_string()
                )))
            }
        }
    }
}

#[hdk_extern]
pub fn init(_: ()) -> ExternResult<InitCallbackResult> {
    let mut fns = BTreeSet::new();
    fns.insert((zome_info()?.name, "recv_remote_signal".into()));
    let functions = GrantedFunctions::Listed(fns);
    create_cap_grant(CapGrantEntry {
        tag: "".into(),
        access: CapAccess::Unrestricted,
        functions,
    })?;

    Ok(InitCallbackResult::Pass)
}
#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
pub enum Signal {
    Message {
        action: SignedActionHashed,
        message: Message,
        from: AgentPubKey,
    },
    MessageDeleted {
        action: SignedActionHashed,
        original_action: ActionHash,
        from: AgentPubKey,
    },
    LinkCreated {
        action: SignedActionHashed,
        link_type: LinkTypes,
    },
    LinkDeleted {
        action: SignedActionHashed,
        create_link_action: SignedActionHashed,
        link_type: LinkTypes,
    },
    EntryCreated {
        action: SignedActionHashed,
        app_entry: EntryTypes,
    },
    EntryUpdated {
        action: SignedActionHashed,
        app_entry: EntryTypes,
        original_app_entry: EntryTypes,
    },
    EntryDeleted {
        action: SignedActionHashed,
        original_app_entry: EntryTypes,
    },
    ConferenceInvite {
        room: ConferenceRoom,
        agent: AgentPubKey,
    },
    ConferenceJoined {
        room_id: String,
        agent: AgentPubKey,
    },
    ConferenceLeft {
        room_id: String,
        agent: AgentPubKey,
    },
    ConferenceRejected {
        room_id: String,
        agent: AgentPubKey,
    },
    ConferenceEnded {
        room_id: String,
        ended_by: AgentPubKey,
    },
    WebRTCSignal(SignalPayload),
    SignalAck {
        signal_id: String,
        from: AgentPubKey,
    },
}
#[hdk_extern(infallible)]
pub fn post_commit(committed_actions: Vec<SignedActionHashed>) {
    for action in committed_actions {
        if let Err(err) = signal_action(action) {
            error!("Error signaling new action: {:?}", err);
        }
    }
}
fn signal_action(action: SignedActionHashed) -> ExternResult<()> {
    match action.hashed.content.clone() {
        Action::CreateLink(create_link) => {
            if let Ok(Some(link_type)) =
                LinkTypes::from_type(create_link.zome_index, create_link.link_type)
            {
                emit_signal(Signal::LinkCreated { action, link_type })?;
            }
            Ok(())
        }
        Action::DeleteLink(delete_link) => {
            let record = get(delete_link.link_add_address.clone(), GetOptions::default())?.ok_or(
                wasm_error!(WasmErrorInner::Guest(
                    "Failed to fetch CreateLink action".to_string()
                )),
            )?;
            match record.action() {
                Action::CreateLink(create_link) => {
                    if let Ok(Some(link_type)) =
                        LinkTypes::from_type(create_link.zome_index, create_link.link_type)
                    {
                        emit_signal(Signal::LinkDeleted {
                            action,
                            link_type,
                            create_link_action: record.signed_action.clone(),
                        })?;
                    }
                    Ok(())
                }
                _ => Err(wasm_error!(WasmErrorInner::Guest(
                    "Create Link should exist".to_string()
                ))),
            }
        }
        Action::Create(_create) => {
            if let Ok(Some(app_entry)) = get_entry_for_action(&action.hashed.hash) {
                emit_signal(Signal::EntryCreated { action, app_entry })?;
            }
            Ok(())
        }
        Action::Update(update) => {
            if let Ok(Some(app_entry)) = get_entry_for_action(&action.hashed.hash) {
                if let Ok(Some(original_app_entry)) =
                    get_entry_for_action(&update.original_action_address)
                {
                    emit_signal(Signal::EntryUpdated {
                        action,
                        app_entry,
                        original_app_entry,
                    })?;
                }
            }
            Ok(())
        }
        Action::Delete(delete) => {
            if let Ok(Some(original_app_entry)) = get_entry_for_action(&delete.deletes_address) {
                emit_signal(Signal::EntryDeleted {
                    action,
                    original_app_entry,
                })?;
            }
            Ok(())
        }
        _ => Ok(()),
    }
}
fn get_entry_for_action(action_hash: &ActionHash) -> ExternResult<Option<EntryTypes>> {
    let record = match get_details(action_hash.clone(), GetOptions::default())? {
        Some(Details::Record(record_details)) => record_details.record,
        _ => {
            return Ok(None);
        }
    };
    let entry = match record.entry().as_option() {
        Some(entry) => entry,
        None => {
            return Ok(None);
        }
    };
    let (zome_index, entry_index) = match record.action().entry_type() {
        Some(EntryType::App(AppEntryDef {
            zome_index,
            entry_index,
            ..
        })) => (zome_index, entry_index),
        _ => {
            return Ok(None);
        }
    };
    EntryTypes::deserialize_from_type(*zome_index, *entry_index, entry)
}

#[hdk_extern]
pub fn generate_membrane_proof(input: MembraneProofData) -> ExternResult<SerializedBytes> {
    let me: HoloHash<holo_hash::hash_type::Agent> = agent_info()?.agent_initial_pubkey;

    let result = MembraneProofEnvelope {
        signature: sign(me, input.clone())?,
        data: input,
    };
    let proof = SerializedBytes::try_from(result).map_err(|e| wasm_error!(e))?;
    Ok(proof)
}

#[hdk_extern]
pub fn get_membrane_proof(agent: AgentPubKey) -> ExternResult<Option<MembraneProofData>> {
    match get_details(agent, GetOptions::default())? {
        None => Ok(None),
        Some(details) => match details {
            Details::Entry(entry_details) => {
                let prev = entry_details.actions[0].action().prev_action().unwrap();
                let maybe_record = get(prev.clone(), GetOptions::default())?;
                match maybe_record {
                    None => Err(wasm_error!("expected agent validation record")),
                    Some(record) => match record.action() {
                        Action::AgentValidationPkg(AgentValidationPkg {
                            membrane_proof, ..
                        }) => match membrane_proof {
                            Some(proof) => {
                                let envelope = MembraneProofEnvelope::try_from((**proof).clone())
                                    .map_err(|e| wasm_error!(e))?;
                                Ok(Some(envelope.data))
                            }
                            None => Ok(None),
                        },
                        _ => Err(wasm_error!("expected AgentValidationPkg")),
                    },
                }
            }
            _ => Err(wasm_error!("unexpected entry type")),
        },
    }
}
