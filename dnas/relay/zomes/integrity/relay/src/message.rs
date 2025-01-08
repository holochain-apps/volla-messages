use hdi::prelude::*;
use crate::messages_path;

#[derive(Serialize, Deserialize, Debug, SerializedBytes, Clone, PartialEq)]
pub struct File {
    pub name: String,
    pub last_modified: Timestamp,
    pub size: usize, // Size in bytes
    pub file_type: String,
    pub storage_entry_hash: EntryHash,
}

#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct Message {
    pub content: String,
    pub bucket: u32,
    pub images: Vec<File>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MessageRecord {
    pub original_action: ActionHash,
    pub signed_action: SignedActionHashed,
    pub message: Option<Message>,
}
pub fn validate_create_message(
    _action: EntryCreationAction,
    _message: Message,
) -> ExternResult<ValidateCallbackResult> {
    Ok(ValidateCallbackResult::Valid)
}
pub fn validate_update_message(
    action: Update,
    message: Message,
    original_action: EntryCreationAction,
    original_message: Message,
) -> ExternResult<ValidateCallbackResult> {
    if &action.author != original_action.author() {
        return Ok(ValidateCallbackResult::Invalid("Only the message author can update their message".to_string()));
    }

    if message.bucket != original_message.bucket {
        return Ok(ValidateCallbackResult::Invalid("Message bucket cannot be updated".to_string()));
    }

    Ok(ValidateCallbackResult::Valid)
}
pub fn validate_delete_message(
    action: Delete,
    original_action: EntryCreationAction,
    _original_message: Message,
) -> ExternResult<ValidateCallbackResult> {
    if &action.author != original_action.author() {
        return Ok(ValidateCallbackResult::Invalid("Only the message author can delete the link to their message".to_string()));
    }

    Ok(ValidateCallbackResult::Valid)
}
pub fn validate_create_link_message_updates(
    _action: CreateLink,
    base_address: AnyLinkableHash,
    target_address: AnyLinkableHash,
    _tag: LinkTag,
) -> ExternResult<ValidateCallbackResult> {
    let action_hash = base_address
        .into_action_hash()
        .ok_or(
            wasm_error!(
                WasmErrorInner::Guest("No action hash associated with link".to_string())
            ),
        )?;
    let record = must_get_valid_record(action_hash)?;
    let _message: crate::Message = record
        .entry()
        .to_app_option()
        .map_err(|e| wasm_error!(e))?
        .ok_or(
            wasm_error!(
                WasmErrorInner::Guest("Linked action must reference a Message entry"
                .to_string())
            ),
        )?;
    let action_hash = target_address
        .into_action_hash()
        .ok_or(
            wasm_error!(
                WasmErrorInner::Guest("No action hash associated with link".to_string())
            ),
        )?;
    let record = must_get_valid_record(action_hash)?;
    let _message: crate::Message = record
        .entry()
        .to_app_option()
        .map_err(|e| wasm_error!(e))?
        .ok_or(
            wasm_error!(
                WasmErrorInner::Guest("Linked action must reference a Message entry"
                .to_string())
            ),
        )?;
    Ok(ValidateCallbackResult::Valid)
}
pub fn validate_delete_link_message_updates(
    _action: DeleteLink,
    _original_action: CreateLink,
    _base: AnyLinkableHash,
    _target: AnyLinkableHash,
    _tag: LinkTag,
) -> ExternResult<ValidateCallbackResult> {
    Ok(
        ValidateCallbackResult::Invalid(
            String::from("MessageUpdates links cannot be deleted"),
        ),
    )
}
pub fn validate_create_link_all_messages(
    action: CreateLink,
    base_address: AnyLinkableHash,
    target_address: AnyLinkableHash,
    _tag: LinkTag,
) -> ExternResult<ValidateCallbackResult> {
    // Check the entry type for the given action hash
    let action_hash = target_address
        .into_action_hash()
        .ok_or(
            wasm_error!(
                WasmErrorInner::Guest("No action hash associated with link".to_string())
            ),
        )?;
    let record = must_get_valid_record(action_hash)?;
    let message: crate::Message = record
        .entry()
        .to_app_option()
        .map_err(|e| wasm_error!(e))?
        .ok_or(
            wasm_error!(
                WasmErrorInner::Guest("Linked action must reference an entry"
                .to_string())
            ),
        )?;
    
    // base_address is message_path for this message's bucket
    let path = messages_path(message.bucket);
    let path_hash = path.path_entry_hash()?;
    if base_address != path_hash.into() {
        return Ok(ValidateCallbackResult::Invalid("Base address must follow path structure for this message's bucket".to_string()));
    }

    // action author must be message author
    if &action.author != record.signed_action.hashed.author() {
        return Ok(ValidateCallbackResult::Invalid("Only the message author can create an AllMessages link to their message".to_string()));
    }

    Ok(ValidateCallbackResult::Valid)
}
pub fn validate_delete_link_all_messages(
    action: DeleteLink,
    original_action: CreateLink,
    _base: AnyLinkableHash,
    _target: AnyLinkableHash,
    _tag: LinkTag,
) -> ExternResult<ValidateCallbackResult> {
    if action.author != original_action.author {
        return Ok(ValidateCallbackResult::Invalid("Only the message author can delete the link to their message".to_string()));
    }

    Ok(ValidateCallbackResult::Valid)
}
