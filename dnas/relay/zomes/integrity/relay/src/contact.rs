use hdi::prelude::*;

#[derive(Clone, PartialEq)]
#[hdk_entry_helper]
pub struct Contact {
    pub public_key: AgentPubKey,
    pub first_name: String,
    pub last_name: String,
    pub avatar: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ContactRecord {
    pub original_action: ActionHash,
    pub signed_action: SignedActionHashed,
    pub contact: Option<Contact>,
}

pub fn validate_create_contact(
    _action: EntryCreationAction,
    _contact: Contact,
) -> ExternResult<ValidateCallbackResult> {
    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_update_contact(
    action: Update,
    _contact: Contact,
    original_action: EntryCreationAction,
    _original_contact: Contact,
) -> ExternResult<ValidateCallbackResult> {
    if &action.author != original_action.author() {
        return Ok(ValidateCallbackResult::Invalid("Only the contact author can update their contact".to_string()));
    }

    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_delete_contact(
    action: Delete,
    original_action: EntryCreationAction,
    _original_contact: Contact,
) -> ExternResult<ValidateCallbackResult> {
    if &action.author != original_action.author() {
        return Ok(ValidateCallbackResult::Invalid("Only the contact author can delete their contact".to_string()));
    }

    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_create_link_contact_to_contacts(
    _action: CreateLink,
    _base_address: AnyLinkableHash,
    target_address: AnyLinkableHash,
    _tag: LinkTag,
) -> ExternResult<ValidateCallbackResult> {
    let action_hash = target_address
        .into_action_hash()
        .ok_or(
            wasm_error!(
                WasmErrorInner::Guest("No action hash associated with link".to_string())
            ),
        )?;
    let record = must_get_valid_record(action_hash)?;
    let _contact: crate::Contact = record
        .entry()
        .to_app_option()
        .map_err(|e| wasm_error!(e))?
        .ok_or(
            wasm_error!(
                WasmErrorInner::Guest("Linked action must reference a Contact entry"
                .to_string())
            ),
        )?;
    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_delete_link_contact_to_contacts(
    action: DeleteLink,
    original_action: CreateLink,
    _base: AnyLinkableHash,
    _target: AnyLinkableHash,
    _tag: LinkTag,
) -> ExternResult<ValidateCallbackResult> {
    if action.author != original_action.author {
        return Ok(ValidateCallbackResult::Invalid("Only the contact author can delete their contact".to_string()));
    }

    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_create_link_contact_updates(
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
    let _contact: crate::Contact = record
        .entry()
        .to_app_option()
        .map_err(|e| wasm_error!(e))?
        .ok_or(
            wasm_error!(
                WasmErrorInner::Guest("Linked action must reference a Contact entry"
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
    let _contact: crate::Contact = record
        .entry()
        .to_app_option()
        .map_err(|e| wasm_error!(e))?
        .ok_or(
            wasm_error!(
                WasmErrorInner::Guest("Linked action must reference an entry"
                .to_string())
            ),
        )?;
    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_delete_link_contact_updates(
    _action: DeleteLink,
    _original_action: CreateLink,
    _base: AnyLinkableHash,
    _target: AnyLinkableHash,
    _tag: LinkTag,
) -> ExternResult<ValidateCallbackResult> {
    Ok(
        ValidateCallbackResult::Invalid(
            String::from("ContactUpdates links cannot be deleted"),
        ),
    )
}

pub fn validate_create_link_all_contacts(
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
    let _contact: crate::Contact = record
        .entry()
        .to_app_option()
        .map_err(|e| wasm_error!(e))?
        .ok_or(
            wasm_error!(
                WasmErrorInner::Guest("Linked action must reference an entry"
                .to_string())
            ),
        )?;
    
    // base_address is hash of 'all_contacts'
    let base_path = Path::from("all_contacts");
    let base_path_hash = base_path.path_entry_hash()?;
    if base_address != base_path_hash.into() {
        return Ok(ValidateCallbackResult::Invalid("Base address must be hash of 'all_contacts'".to_string()));
    }

    // action author must be contact author
    if &action.author != record.signed_action.hashed.author() {
        return Ok(ValidateCallbackResult::Invalid("Only the contact author can create an AllContacts link to their contact".to_string()));
    }

    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_delete_link_all_contacts(
    action: DeleteLink,
    original_action: CreateLink,
    _base: AnyLinkableHash,
    _target: AnyLinkableHash,
    _tag: LinkTag,
) -> ExternResult<ValidateCallbackResult> {
    if action.author != original_action.author {
        return Ok(ValidateCallbackResult::Invalid("Only the orignal author can delete their contacts".to_string()));
    }

    Ok(ValidateCallbackResult::Valid)
}
