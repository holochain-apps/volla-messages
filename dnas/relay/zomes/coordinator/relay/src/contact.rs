use hdk::prelude::*;
use relay_integrity::*;

use crate::helper::ZomeFnInput;

#[hdk_extern]
pub fn create_contact(contact: Contact) -> ExternResult<Record> {
    let contact_hash = create_entry(&EntryTypes::Contact(contact.clone()))?;
    create_link(
        contact.public_key.clone(),
        contact_hash.clone(),
        LinkTypes::ContactToContacts,
        (),
    )?;
    let record = get(contact_hash.clone(), GetOptions::default())?.ok_or(wasm_error!(
        WasmErrorInner::Guest("Could not find the newly created Contact".to_string())
    ))?;
    let path = Path::from("all_contacts");
    create_link(
        path.path_entry_hash()?,
        contact_hash.clone(),
        LinkTypes::AllContacts,
        (),
    )?;
    Ok(record)
}

#[hdk_extern]
pub fn get_latest_contact(
    original_contact_hash: ZomeFnInput<ActionHash>,
) -> ExternResult<Option<ContactRecord>> {
    let links = get_links(
        GetLinksInputBuilder::try_new(
            original_contact_hash.input.clone(),
            LinkTypes::ContactUpdates,
        )?
        .get_options(original_contact_hash.get_strategy())
        .build(),
    )?;
    let latest_link = links
        .into_iter()
        .max_by(|link_a, link_b| link_a.timestamp.cmp(&link_b.timestamp));
    let latest_contact_hash = match latest_link {
        Some(link) => {
            link.target
                .clone()
                .into_action_hash()
                .ok_or(wasm_error!(WasmErrorInner::Guest(
                    "No action hash associated with link".to_string()
                )))?
        }
        None => original_contact_hash.input.clone(),
    };
    match get(latest_contact_hash, GetOptions::default())? {
        Some(record) => Ok(Some(ContactRecord {
            original_action: original_contact_hash.input,
            signed_action: record.signed_action().clone(),
            contact: record.entry().to_app_option().map_err(|e| wasm_error!(e))?,
        })),
        None => Ok(None),
    }
}

#[hdk_extern]
pub fn get_original_contact(
    original_contact_hash: ZomeFnInput<ActionHash>,
) -> ExternResult<Option<Record>> {
    let strategy = original_contact_hash.get_strategy();
    let Some(details) = get_details(original_contact_hash.input, GetOptions { strategy })? else {
        return Ok(None);
    };
    match details {
        Details::Record(details) => Ok(Some(details.record)),
        _ => Err(wasm_error!(WasmErrorInner::Guest(
            "Malformed get details response".to_string()
        ))),
    }
}

#[hdk_extern]
pub fn get_all_revisions_for_contact(
    original_contact_hash: ZomeFnInput<ActionHash>,
) -> ExternResult<Vec<Record>> {
    let Some(original_record) = get_original_contact(original_contact_hash.clone())? else {
        return Ok(vec![]);
    };
    let links = get_links(
        GetLinksInputBuilder::try_new(
            original_contact_hash.input.clone(),
            LinkTypes::ContactUpdates,
        )?
        .get_options(original_contact_hash.get_strategy())
        .build(),
    )?;
    let get_input: Vec<GetInput> = links
        .into_iter()
        .map(|link| {
            Ok(GetInput::new(
                link.target
                    .into_action_hash()
                    .ok_or(wasm_error!(WasmErrorInner::Guest(
                        "No action hash associated with link".to_string()
                    )))?
                    .into(),
                GetOptions::default(),
            ))
        })
        .collect::<ExternResult<Vec<GetInput>>>()?;
    let records = HDK.with(|hdk| hdk.borrow().get(get_input))?;
    let mut records: Vec<Record> = records.into_iter().flatten().collect();
    records.insert(0, original_record);
    Ok(records)
}

#[hdk_extern]
pub fn get_all_contacts(input: ZomeFnInput<()>) -> ExternResult<Vec<Link>> {
    let path = Path::from("all_contacts");
    get_links(
        GetLinksInputBuilder::try_new(path.path_entry_hash()?, LinkTypes::AllContacts)?
            .get_options(input.get_strategy())
            .build(),
    )
}

#[hdk_extern]
pub fn get_all_contact_entries(input: ZomeFnInput<()>) -> ExternResult<Vec<ContactRecord>> {
    let local: Option<bool> = input.local;
    let links = get_all_contacts(input)?;
    let mut results: Vec<ContactRecord> = Vec::new();
    for l in links {
        let hash = ActionHash::try_from(l.target).map_err(|e| wasm_error!(e))?;
        if let Some(r) = get_latest_contact(ZomeFnInput { input: hash, local })? {
            results.push(r);
        }
    }

    Ok(results)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct UpdateContactInput {
    pub original_contact_hash: ActionHash,
    pub previous_contact_hash: ActionHash,
    pub updated_contact: Contact,
}

#[hdk_extern]
pub fn update_contact(input: UpdateContactInput) -> ExternResult<Record> {
    let updated_contact_hash =
        update_entry(input.previous_contact_hash.clone(), &input.updated_contact)?;
    create_link(
        input.original_contact_hash.clone(),
        updated_contact_hash.clone(),
        LinkTypes::ContactUpdates,
        (),
    )?;
    let record = get(updated_contact_hash.clone(), GetOptions::default())?.ok_or(wasm_error!(
        WasmErrorInner::Guest("Could not find the newly updated Contact".to_string())
    ))?;
    Ok(record)
}

#[hdk_extern]
pub fn delete_contact(original_contact_hash: ActionHash) -> ExternResult<ActionHash> {
    let details = get_details(original_contact_hash.clone(), GetOptions::default())?.ok_or(
        wasm_error!(WasmErrorInner::Guest("Contact not found".to_string())),
    )?;
    let record = match details {
        Details::Record(details) => Ok(details.record),
        _ => Err(wasm_error!(WasmErrorInner::Guest(
            "Malformed get details response".to_string()
        ))),
    }?;
    let entry = record
        .entry()
        .as_option()
        .ok_or(wasm_error!(WasmErrorInner::Guest(
            "Contact record has no entry".to_string()
        )))?;
    let contact = <Contact>::try_from(entry)?;
    let links = get_links(
        GetLinksInputBuilder::try_new(contact.public_key.clone(), LinkTypes::ContactToContacts)?
            .build(),
    )?;
    for link in links {
        if let Some(action_hash) = link.target.into_action_hash() {
            if action_hash == original_contact_hash {
                delete_link(link.create_link_hash)?;
            }
        }
    }
    let path = Path::from("all_contacts");
    let links = get_links(
        GetLinksInputBuilder::try_new(path.path_entry_hash()?, LinkTypes::AllContacts)?.build(),
    )?;
    for link in links {
        if let Some(hash) = link.target.into_action_hash() {
            if hash == original_contact_hash {
                delete_link(link.create_link_hash)?;
            }
        }
    }
    delete_entry(original_contact_hash)
}

#[hdk_extern]
pub fn get_all_deletes_for_contact(
    original_contact_hash: ActionHash,
) -> ExternResult<Option<Vec<SignedActionHashed>>> {
    let Some(details) = get_details(original_contact_hash, GetOptions::default())? else {
        return Ok(None);
    };
    match details {
        Details::Entry(_) => Err(wasm_error!(WasmErrorInner::Guest(
            "Malformed details".into()
        ))),
        Details::Record(record_details) => Ok(Some(record_details.deletes)),
    }
}

#[hdk_extern]
pub fn get_oldest_delete_for_contact(
    original_contact_hash: ActionHash,
) -> ExternResult<Option<SignedActionHashed>> {
    let Some(mut deletes) = get_all_deletes_for_contact(original_contact_hash)? else {
        return Ok(None);
    };
    deletes.sort_by(|delete_a, delete_b| {
        delete_a
            .action()
            .timestamp()
            .cmp(&delete_b.action().timestamp())
    });
    Ok(deletes.first().cloned())
}

#[hdk_extern]
pub fn get_contacts_for_contact(contact: ZomeFnInput<AgentPubKey>) -> ExternResult<Vec<Link>> {
    let strategy = contact.get_strategy();
    get_links(
        GetLinksInputBuilder::try_new(contact.input, LinkTypes::ContactToContacts)?
            .get_options(strategy)
            .build(),
    )
}

#[hdk_extern]
pub fn get_deleted_contacts_for_contact(
    contact: AgentPubKey,
) -> ExternResult<Vec<(SignedActionHashed, Vec<SignedActionHashed>)>> {
    let details = get_link_details(
        contact,
        LinkTypes::ContactToContacts,
        None,
        GetOptions::default(),
    )?;
    Ok(details
        .into_inner()
        .into_iter()
        .filter(|(_link, deletes)| !deletes.is_empty())
        .collect())
}
