pub mod contact;
pub use contact::*;
pub mod message;
pub use message::*;
pub mod config;
pub use config::*;
use hdi::prelude::*;

pub const MESSAGES_PATH_PREFIX: &str = "msg";

pub fn messages_path(bucket: u32) -> Path {
    Path::from(format!("{}.{}", MESSAGES_PATH_PREFIX, bucket))
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
#[hdk_entry_types]
#[unit_enum(UnitEntryTypes)]
pub enum EntryTypes {
    Config(Config),
    Message(Message),
    Contact(Contact),
}

#[derive(Serialize, Deserialize)]
#[hdk_link_types]
pub enum LinkTypes {
    ConfigUpdates,
    MessageUpdates,
    AllMessages,
    ContactToContacts,
    ContactUpdates,
    AllContacts,
}

#[derive(Serialize, Deserialize, Debug, SerializedBytes, Clone)]
pub struct MembraneProofData {
    pub conversation_id: String,
    pub for_agent: AgentPubKey,
    pub as_role: u32,
}

#[derive(Serialize, Deserialize, Debug, SerializedBytes)]
pub struct MembraneProofEnvelope {
    pub signature: Signature,
    pub data: MembraneProofData,
}

#[derive(Serialize, Deserialize, Debug, Clone, SerializedBytes, PartialEq)]
pub enum Privacy {
    Private,
    Public,
}

#[derive(Serialize, Deserialize, Debug, SerializedBytes, Clone)]
pub struct Properties {
    pub created: Timestamp,
    pub privacy: Privacy,
    pub progenitor: AgentPubKey,
}

pub fn check_agent(
    agent_pub_key: AgentPubKey,
    membrane_proof: Option<MembraneProof>,
) -> ExternResult<ValidateCallbackResult> {
    let info = dna_info()?;
    if info.modifiers.properties.bytes().len() == 1 {
        return Ok(ValidateCallbackResult::Valid);
    }
    let props = Properties::try_from(info.modifiers.properties)
        .map_err(|e| wasm_error!(e))?;
    if props.privacy == Privacy::Public {
        return Ok(ValidateCallbackResult::Valid);
    }
    if agent_pub_key == props.progenitor {
        return Ok(ValidateCallbackResult::Valid);
    }
    match membrane_proof {
        None => {
            Ok(
                ValidateCallbackResult::Invalid(
                    "membrane proof must be provided".to_string(),
                ),
            )
        }
        Some(serialized_proof) => {
            let envelope = MembraneProofEnvelope::try_from((*serialized_proof).clone())
                .map_err(|e| wasm_error!(e))?;
            if envelope.data.conversation_id != info.modifiers.network_seed {
                return Ok(
                    ValidateCallbackResult::Invalid(
                        "membrane proof is not for this conversation".to_string(),
                    ),
                );
            }
            if envelope.data.for_agent != agent_pub_key {
                return Ok(
                    ValidateCallbackResult::Invalid(
                        "membrane proof is not for this agent".to_string(),
                    ),
                );
            }
            if verify_signature(props.progenitor, envelope.signature, envelope.data)? {
                return Ok(ValidateCallbackResult::Valid);
            }
            Ok(
                ValidateCallbackResult::Invalid(
                    "membrane proof signature invalid".to_string(),
                ),
            )
        }
    }
}

#[hdk_extern]
pub fn genesis_self_check(
    data: GenesisSelfCheckData,
) -> ExternResult<ValidateCallbackResult> {
    check_agent(data.agent_key, data.membrane_proof)
}

pub fn validate_agent_joining(
    agent_pub_key: AgentPubKey,
    membrane_proof: &Option<MembraneProof>,
) -> ExternResult<ValidateCallbackResult> {
    check_agent(agent_pub_key, (*membrane_proof).clone())
}

#[hdk_extern]
pub fn validate(op: Op) -> ExternResult<ValidateCallbackResult> {
    match op.flattened::<EntryTypes, LinkTypes>()? {
        FlatOp::StoreEntry(store_entry) => {
            match store_entry {
                OpEntry::CreateEntry { app_entry, action } => {
                    match app_entry {
                        EntryTypes::Config(config) => {
                            validate_create_config(
                                EntryCreationAction::Create(action),
                                config,
                            )
                        }
                        EntryTypes::Message(message) => {
                            validate_create_message(
                                EntryCreationAction::Create(action),
                                message,
                            )
                        }
                        EntryTypes::Contact(contact) => {
                            validate_create_contact(
                                EntryCreationAction::Create(action),
                                contact,
                            )
                        }
                    }
                }
                OpEntry::UpdateEntry { app_entry, action, .. } => {
                    match app_entry {
                        EntryTypes::Config(config) => {
                            validate_create_config(
                                EntryCreationAction::Update(action),
                                config,
                            )
                        }
                        EntryTypes::Message(message) => {
                            validate_create_message(
                                EntryCreationAction::Update(action),
                                message,
                            )
                        }
                        EntryTypes::Contact(contact) => {
                            validate_create_contact(
                                EntryCreationAction::Update(action),
                                contact,
                            )
                        }
                    }
                }
                _ => Ok(ValidateCallbackResult::Valid),
            }
        }
        FlatOp::RegisterUpdate(update_entry) => {
            match update_entry {
                OpUpdate::Entry { app_entry, action } => {
                    let original_action = must_get_action(
                            action.clone().original_action_address,
                        )?
                        .action()
                        .to_owned();
                    let original_create_action = match EntryCreationAction::try_from(
                        original_action,
                    ) {
                        Ok(action) => action,
                        Err(e) => {
                            return Ok(
                                ValidateCallbackResult::Invalid(
                                    format!(
                                        "Expected to get EntryCreationAction from Action: {e:?}"
                                    ),
                                ),
                            );
                        }
                    };
                    match app_entry {
                        EntryTypes::Contact(contact) => {
                            let original_app_entry = must_get_valid_record(
                                action.clone().original_action_address,
                            )?;
                            let original_contact = match Contact::try_from(
                                original_app_entry,
                            ) {
                                Ok(entry) => entry,
                                Err(e) => {
                                    return Ok(
                                        ValidateCallbackResult::Invalid(
                                            format!("Expected to get Contact from Record: {e:?}"),
                                        ),
                                    );
                                }
                            };
                            validate_update_contact(
                                action,
                                contact,
                                original_create_action,
                                original_contact,
                            )
                        }
                        EntryTypes::Message(message) => {
                            let original_app_entry = must_get_valid_record(
                                action.clone().original_action_address,
                            )?;
                            let original_message = match Message::try_from(
                                original_app_entry,
                            ) {
                                Ok(entry) => entry,
                                Err(e) => {
                                    return Ok(
                                        ValidateCallbackResult::Invalid(
                                            format!("Expected to get Message from Record: {e:?}"),
                                        ),
                                    );
                                }
                            };
                            validate_update_message(
                                action,
                                message,
                                original_create_action,
                                original_message
                            )
                        }
                        EntryTypes::Config(config) => {
                            validate_update_config(action, config)
                        }
                        _ => {
                            Ok(
                                ValidateCallbackResult::Invalid(
                                    "Original and updated entry types must be the same"
                                        .to_string(),
                                ),
                            )
                        }
                    }
                }
                _ => Ok(ValidateCallbackResult::Valid),
            }
        }
        FlatOp::RegisterDelete(delete_entry) => {
            let original_action_hash = delete_entry.clone().action.deletes_address;
            let original_record = must_get_valid_record(original_action_hash)?;
            let original_record_action = original_record.action().clone();
            let original_action = match EntryCreationAction::try_from(
                original_record_action,
            ) {
                Ok(action) => action,
                Err(e) => {
                    return Ok(
                        ValidateCallbackResult::Invalid(
                            format!(
                                "Expected to get EntryCreationAction from Action: {e:?}"
                            ),
                        ),
                    );
                }
            };
            let app_entry_type = match original_action.entry_type() {
                EntryType::App(app_entry_type) => app_entry_type,
                _ => {
                    return Ok(ValidateCallbackResult::Valid);
                }
            };
            let entry = match original_record.entry().as_option() {
                Some(entry) => entry,
                None => {
                    return Ok(
                        ValidateCallbackResult::Invalid(
                            "Original record for a delete must contain an entry"
                                .to_string(),
                        ),
                    );
                }
            };
            let original_app_entry = match EntryTypes::deserialize_from_type(
                app_entry_type.zome_index,
                app_entry_type.entry_index,
                entry,
            )? {
                Some(app_entry) => app_entry,
                None => {
                    return Ok(
                        ValidateCallbackResult::Invalid(
                            "Original app entry must be one of the defined entry types for this zome"
                                .to_string(),
                        ),
                    );
                }
            };
            match original_app_entry {
                EntryTypes::Contact(original_contact) => {
                    validate_delete_contact(
                        delete_entry.clone().action,
                        original_action,
                        original_contact,
                    )
                }
                EntryTypes::Message(original_message) => {
                    validate_delete_message(
                        delete_entry.clone().action,
                        original_action,
                        original_message,
                    )
                }
                EntryTypes::Config(_original_config) => {
                    return Ok(
                        ValidateCallbackResult::Invalid(
                            "Cannot delete Config Entry".to_string(),
                        ),
                    );
                }
            }
        }
        FlatOp::RegisterCreateLink {
            link_type,
            base_address,
            target_address,
            tag,
            action,
        } => {
            match link_type {
                LinkTypes::ConfigUpdates => {
                    validate_create_link_config_updates(
                        action,
                        base_address,
                        target_address,
                        tag,
                    )
                }
                LinkTypes::MessageUpdates => {
                    validate_create_link_message_updates(
                        action,
                        base_address,
                        target_address,
                        tag,
                    )
                }
                LinkTypes::AllMessages => {
                    validate_create_link_all_messages(
                        action,
                        base_address,
                        target_address,
                        tag,
                    )
                }
                LinkTypes::ContactToContacts => {
                    validate_create_link_contact_to_contacts(
                        action,
                        base_address,
                        target_address,
                        tag,
                    )
                }
                LinkTypes::ContactUpdates => {
                    validate_create_link_contact_updates(
                        action,
                        base_address,
                        target_address,
                        tag,
                    )
                }
                LinkTypes::AllContacts => {
                    validate_create_link_all_contacts(
                        action,
                        base_address,
                        target_address,
                        tag,
                    )
                }
            }
        }
        FlatOp::RegisterDeleteLink {
            link_type,
            base_address,
            target_address,
            tag,
            original_action,
            action,
        } => {
            match link_type {
                LinkTypes::ConfigUpdates => {
                    validate_delete_link_config_updates(
                        action,
                        original_action,
                        base_address,
                        target_address,
                        tag,
                    )
                }
                LinkTypes::MessageUpdates => {
                    validate_delete_link_message_updates(
                        action,
                        original_action,
                        base_address,
                        target_address,
                        tag,
                    )
                }
                LinkTypes::AllMessages => {
                    validate_delete_link_all_messages(
                        action,
                        original_action,
                        base_address,
                        target_address,
                        tag,
                    )
                }
                LinkTypes::ContactToContacts => {
                    validate_delete_link_contact_to_contacts(
                        action,
                        original_action,
                        base_address,
                        target_address,
                        tag,
                    )
                }
                LinkTypes::ContactUpdates => {
                    validate_delete_link_contact_updates(
                        action,
                        original_action,
                        base_address,
                        target_address,
                        tag,
                    )
                }
                LinkTypes::AllContacts => {
                    validate_delete_link_all_contacts(
                        action,
                        original_action,
                        base_address,
                        target_address,
                        tag,
                    )
                }
            }
        }
        FlatOp::StoreRecord(store_record) => {
            match store_record {
                OpRecord::CreateEntry { app_entry, action } => {
                    match app_entry {
                        EntryTypes::Config(config) => {
                            validate_create_config(
                                EntryCreationAction::Create(action),
                                config,
                            )
                        }
                        EntryTypes::Message(message) => {
                            validate_create_message(
                                EntryCreationAction::Create(action),
                                message,
                            )
                        }
                        EntryTypes::Contact(contact) => {
                            validate_create_contact(
                                EntryCreationAction::Create(action),
                                contact,
                            )
                        }
                    }
                }
                OpRecord::UpdateEntry {
                    original_action_hash,
                    app_entry,
                    action,
                    ..
                } => {
                    let original_record = must_get_valid_record(original_action_hash)?;
                    let original_action = original_record.action().clone();
                    let original_action = match original_action {
                        Action::Create(create) => EntryCreationAction::Create(create),
                        Action::Update(update) => EntryCreationAction::Update(update),
                        _ => {
                            return Ok(
                                ValidateCallbackResult::Invalid(
                                    "Original action for an update must be a Create or Update action"
                                        .to_string(),
                                ),
                            );
                        }
                    };
                    match app_entry {
                        EntryTypes::Config(config) => {
                            let result = validate_create_config(
                                EntryCreationAction::Update(action.clone()),
                                config.clone(),
                            )?;
                            if let ValidateCallbackResult::Valid = result {
                                let original_config: Option<Config> = original_record
                                    .entry()
                                    .to_app_option()
                                    .map_err(|e| wasm_error!(e))?;
                                let _original_config = match original_config {
                                    Some(config) => config,
                                    None => {
                                        return Ok(
                                            ValidateCallbackResult::Invalid(
                                                "The updated entry type must be the same as the original entry type"
                                                    .to_string(),
                                            ),
                                        );
                                    }
                                };
                                validate_update_config(action, config)
                            } else {
                                Ok(result)
                            }
                        }
                        EntryTypes::Message(message) => {
                            let result = validate_create_message(
                                EntryCreationAction::Update(action.clone()),
                                message.clone(),
                            )?;
                            if let ValidateCallbackResult::Valid = result {
                                let original_message: Option<Message> = original_record
                                    .entry()
                                    .to_app_option()
                                    .map_err(|e| wasm_error!(e))?;
                                let original_message = match original_message {
                                    Some(message) => message,
                                    None => {
                                        return Ok(
                                            ValidateCallbackResult::Invalid(
                                                "The updated entry type must be the same as the original entry type"
                                                    .to_string(),
                                            ),
                                        );
                                    }
                                };
                                validate_update_message(
                                    action,
                                    message,
                                    original_action,
                                    original_message
                                )
                            } else {
                                Ok(result)
                            }
                        }
                        EntryTypes::Contact(contact) => {
                            let result = validate_create_contact(
                                EntryCreationAction::Update(action.clone()),
                                contact.clone(),
                            )?;
                            if let ValidateCallbackResult::Valid = result {
                                let original_contact: Option<Contact> = original_record
                                    .entry()
                                    .to_app_option()
                                    .map_err(|e| wasm_error!(e))?;
                                let original_contact = match original_contact {
                                    Some(contact) => contact,
                                    None => {
                                        return Ok(
                                            ValidateCallbackResult::Invalid(
                                                "The updated entry type must be the same as the original entry type"
                                                    .to_string(),
                                            ),
                                        );
                                    }
                                };
                                validate_update_contact(
                                    action,
                                    contact,
                                    original_action,
                                    original_contact,
                                )
                            } else {
                                Ok(result)
                            }
                        }
                    }
                }
                OpRecord::DeleteEntry { original_action_hash, action, .. } => {
                    let original_record = must_get_valid_record(original_action_hash)?;
                    let original_action = original_record.action().clone();
                    let original_action = match original_action {
                        Action::Create(create) => EntryCreationAction::Create(create),
                        Action::Update(update) => EntryCreationAction::Update(update),
                        _ => {
                            return Ok(
                                ValidateCallbackResult::Invalid(
                                    "Original action for a delete must be a Create or Update action"
                                        .to_string(),
                                ),
                            );
                        }
                    };
                    let app_entry_type = match original_action.entry_type() {
                        EntryType::App(app_entry_type) => app_entry_type,
                        _ => {
                            return Ok(ValidateCallbackResult::Valid);
                        }
                    };
                    let entry = match original_record.entry().as_option() {
                        Some(entry) => entry,
                        None => {
                            if original_action.entry_type().visibility().is_public() {
                                return Ok(
                                    ValidateCallbackResult::Invalid(
                                        "Original record for a delete of a public entry must contain an entry"
                                            .to_string(),
                                    ),
                                );
                            } else {
                                return Ok(ValidateCallbackResult::Valid);
                            }
                        }
                    };
                    let original_app_entry = match EntryTypes::deserialize_from_type(
                        app_entry_type.zome_index,
                        app_entry_type.entry_index,
                        entry,
                    )? {
                        Some(app_entry) => app_entry,
                        None => {
                            return Ok(
                                ValidateCallbackResult::Invalid(
                                    "Original app entry must be one of the defined entry types for this zome"
                                        .to_string(),
                                ),
                            );
                        }
                    };
                    match original_app_entry {
                        EntryTypes::Config(original_config) => {
                            validate_delete_config(
                                action,
                                original_action,
                                original_config,
                            )
                        }
                        EntryTypes::Message(original_message) => {
                            validate_delete_message(
                                action,
                                original_action,
                                original_message,
                            )
                        }
                        EntryTypes::Contact(original_contact) => {
                            validate_delete_contact(
                                action,
                                original_action,
                                original_contact,
                            )
                        }
                    }
                }
                OpRecord::CreateLink {
                    base_address,
                    target_address,
                    tag,
                    link_type,
                    action,
                } => {
                    match link_type {
                        LinkTypes::ConfigUpdates => {
                            validate_create_link_config_updates(
                                action,
                                base_address,
                                target_address,
                                tag,
                            )
                        }
                        LinkTypes::MessageUpdates => {
                            validate_create_link_message_updates(
                                action,
                                base_address,
                                target_address,
                                tag,
                            )
                        }
                        LinkTypes::AllMessages => {
                            validate_create_link_all_messages(
                                action,
                                base_address,
                                target_address,
                                tag,
                            )
                        }
                        LinkTypes::ContactToContacts => {
                            validate_create_link_contact_to_contacts(
                                action,
                                base_address,
                                target_address,
                                tag,
                            )
                        }
                        LinkTypes::ContactUpdates => {
                            validate_create_link_contact_updates(
                                action,
                                base_address,
                                target_address,
                                tag,
                            )
                        }
                        LinkTypes::AllContacts => {
                            validate_create_link_all_contacts(
                                action,
                                base_address,
                                target_address,
                                tag,
                            )
                        }
                    }
                }
                OpRecord::DeleteLink { original_action_hash, base_address, action } => {
                    let record = must_get_valid_record(original_action_hash)?;
                    let create_link = match record.action() {
                        Action::CreateLink(create_link) => create_link.clone(),
                        _ => {
                            return Ok(
                                ValidateCallbackResult::Invalid(
                                    "The action that a DeleteLink deletes must be a CreateLink"
                                        .to_string(),
                                ),
                            );
                        }
                    };
                    let link_type = match LinkTypes::from_type(
                        create_link.zome_index,
                        create_link.link_type,
                    )? {
                        Some(lt) => lt,
                        None => {
                            return Ok(ValidateCallbackResult::Valid);
                        }
                    };
                    match link_type {
                        LinkTypes::ConfigUpdates => {
                            validate_delete_link_config_updates(
                                action,
                                create_link.clone(),
                                base_address,
                                create_link.target_address,
                                create_link.tag,
                            )
                        }
                        LinkTypes::MessageUpdates => {
                            validate_delete_link_message_updates(
                                action,
                                create_link.clone(),
                                base_address,
                                create_link.target_address,
                                create_link.tag,
                            )
                        }
                        LinkTypes::AllMessages => {
                            validate_delete_link_all_messages(
                                action,
                                create_link.clone(),
                                base_address,
                                create_link.target_address,
                                create_link.tag,
                            )
                        }
                        LinkTypes::ContactToContacts => {
                            validate_delete_link_contact_to_contacts(
                                action,
                                create_link.clone(),
                                base_address,
                                create_link.target_address,
                                create_link.tag,
                            )
                        }
                        LinkTypes::ContactUpdates => {
                            validate_delete_link_contact_updates(
                                action,
                                create_link.clone(),
                                base_address,
                                create_link.target_address,
                                create_link.tag,
                            )
                        }
                        LinkTypes::AllContacts => {
                            validate_delete_link_all_contacts(
                                action,
                                create_link.clone(),
                                base_address,
                                create_link.target_address,
                                create_link.tag,
                            )
                        }
                    }
                }
                OpRecord::CreatePrivateEntry { .. } => Ok(ValidateCallbackResult::Valid),
                OpRecord::UpdatePrivateEntry { .. } => Ok(ValidateCallbackResult::Valid),
                OpRecord::CreateCapClaim { .. } => Ok(ValidateCallbackResult::Valid),
                OpRecord::CreateCapGrant { .. } => Ok(ValidateCallbackResult::Valid),
                OpRecord::UpdateCapClaim { .. } => Ok(ValidateCallbackResult::Valid),
                OpRecord::UpdateCapGrant { .. } => Ok(ValidateCallbackResult::Valid),
                OpRecord::Dna { .. } => Ok(ValidateCallbackResult::Valid),
                OpRecord::OpenChain { .. } => Ok(ValidateCallbackResult::Valid),
                OpRecord::CloseChain { .. } => Ok(ValidateCallbackResult::Valid),
                OpRecord::InitZomesComplete { .. } => Ok(ValidateCallbackResult::Valid),
                _ => Ok(ValidateCallbackResult::Valid),
            }
        }
        FlatOp::RegisterAgentActivity(agent_activity) => {
            match agent_activity {
                OpActivity::CreateAgent { agent, action } => {
                    let previous_action = must_get_action(action.prev_action)?;
                    match previous_action.action() {
                        Action::AgentValidationPkg(
                            AgentValidationPkg { membrane_proof, .. },
                        ) => validate_agent_joining(agent, membrane_proof),
                        _ => {
                            Ok(
                                ValidateCallbackResult::Invalid(
                                    "The previous action for a `CreateAgent` action must be an `AgentValidationPkg`"
                                        .to_string(),
                                ),
                            )
                        }
                    }
                }
                _ => Ok(ValidateCallbackResult::Valid),
            }
        }
    }
}
