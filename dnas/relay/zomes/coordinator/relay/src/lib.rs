pub mod conference;
pub mod config;
pub mod contact;
pub mod message;
pub mod ping;
use hdk::prelude::*;
use relay_integrity::*;

#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
pub enum SignalData {
    MessageRecord(MessageRecord),
    ConferenceRecord(ConferenceRecord),
}

#[hdk_extern]
fn recv_remote_signal(signal_data: SignalData) -> ExternResult<()> {
    match signal_data {
        SignalData::MessageRecord(message_record) => {
            let info: CallInfo = call_info()?;
            let message = message_record
                .message
                .ok_or(wasm_error!(WasmErrorInner::Guest(
                    "Message field was None".into()
                )))?;
            let signal = Signal::Message {
                action: message_record.signed_action.clone(),
                message,
                from: info.provenance,
            };
            emit_signal(signal)
        }
        SignalData::ConferenceRecord(conference_record) => {
            let room = conference_record
                .room
                .ok_or(wasm_error!(WasmErrorInner::Guest(
                    "Room field was None".into()
                )))?;
            let room_id = conference_record
                .room_id
                .ok_or(wasm_error!(WasmErrorInner::Guest(
                    "Room ID field was None".into()
                )))?;
            let agent = conference_record
                .agent
                .ok_or(wasm_error!(WasmErrorInner::Guest(
                    "Agent field was None".into()
                )))?;
            let signal_payload =
                conference_record
                    .signal_payload
                    .ok_or(wasm_error!(WasmErrorInner::Guest(
                        "Signal payload field was None".into()
                    )))?;

            // Emitting appropriate signal based on the conference record type
            match conference_record.signal_type {
                ConferenceSignalType::Invite => {
                    emit_signal(Signal::ConferenceInvite { room, agent })
                }
                ConferenceSignalType::Join => {
                    emit_signal(Signal::ConferenceJoined { room_id, agent })
                }
                ConferenceSignalType::Leave => {
                    emit_signal(Signal::ConferenceLeft { room_id, agent })
                }
                ConferenceSignalType::WebRTC => emit_signal(Signal::WebRTCSignal(signal_payload)),
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
    WebRTCSignal(SignalPayload),
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
    let me: HoloHash<holo_hash::hash_type::Agent> = agent_info()?.agent_latest_pubkey;

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
