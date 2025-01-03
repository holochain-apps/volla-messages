use hdk::prelude::*;
use relay_integrity::*;

use crate::get_entry_for_action;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageInput {
    pub message: Message,
    pub agents: Vec<AgentPubKey>,
}

#[hdk_extern]
pub fn create_message(input: SendMessageInput) -> ExternResult<Record> {
    let message_hash = create_entry(&EntryTypes::Message(input.message.clone()))?;
    let record = get(message_hash.clone(), GetOptions::default())?.ok_or(wasm_error!(
        WasmErrorInner::Guest("Could not find the newly created Message".to_string())
    ))?;

    let path = messages_path(input.message.bucket);
    debug!("create_message path {:?}", path);
    let link = create_link(
        path.path_entry_hash()?,
        message_hash.clone(),
        LinkTypes::AllMessages,
        (),
    )?;

    let _ = send_remote_signal(
        MessageRecord {
            message: Some(input.message),
            original_action: message_hash.clone(),
            signed_action: record.signed_action().clone(),
        },
        input.agents,
    );

    debug!("create message all messages link: {:?}", link);
    Ok(record)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct BucketInput {
    pub bucket: u32,
    pub count: usize,
}

#[hdk_extern]
pub fn get_message_hashes(input: BucketInput) -> ExternResult<Vec<ActionHash>> {
    let mut hashes: Vec<ActionHash> = Vec::new();
    let path: Path = messages_path(input.bucket);
    let links = get_links(
        GetLinksInputBuilder::try_new(path.path_entry_hash()?, LinkTypes::AllMessages)?.build(),
    )?;

    // only return the hashes if the counts don't match
    if links.len() != input.count {
        for l in links {
            hashes.push(ActionHash::try_from(l.target).map_err(|e| wasm_error!(e))?);
        }
    }
    Ok(hashes)
}

#[hdk_extern]
pub fn get_message_links_for_buckets(buckets: Vec<u32>) -> ExternResult<Vec<Link>> {
    let mut links: Vec<Link> = Vec::new();
    for bucket in buckets {
        let path = messages_path(bucket);
        let mut l = get_links(
            GetLinksInputBuilder::try_new(path.path_entry_hash()?, LinkTypes::AllMessages)?.build(),
        )?;
        links.append(&mut l);
    }
    Ok(links)
}

#[derive(Serialize, Deserialize, Debug)]
struct GetAgenProfileInput {
    agent_key: AgentPubKey,
}

#[hdk_extern]
pub fn get_message_entries(hashes: Vec<ActionHash>) -> ExternResult<Vec<MessageRecord>> {
    let mut results: Vec<MessageRecord> = Vec::new();
    for hash in hashes {
        if let Some(r) = get_latest_message(hash)? {
            results.push(r);
        }
    }
    Ok(results)
}

#[hdk_extern]
pub fn get_messages_for_buckets(buckets: Vec<u32>) -> ExternResult<Vec<MessageRecord>> {
    let links = get_message_links_for_buckets(buckets)?;
    let mut results: Vec<MessageRecord> = Vec::new();
    for l in links {
        let hash = ActionHash::try_from(l.target).map_err(|e| wasm_error!(e))?;
        if let Some(r) = get_latest_message(hash)? {
            results.push(r);
        }
    }

    Ok(results)
}

#[hdk_extern]
pub fn get_latest_message(
    original_message_hash: ActionHash,
) -> ExternResult<Option<MessageRecord>> {
    let links = get_links(
        GetLinksInputBuilder::try_new(original_message_hash.clone(), LinkTypes::MessageUpdates)?
            .build(),
    )?;
    let latest_link = links
        .into_iter()
        .max_by(|link_a, link_b| link_a.timestamp.cmp(&link_b.timestamp));
    let latest_message_hash = match latest_link {
        Some(link) => {
            link.target
                .clone()
                .into_action_hash()
                .ok_or(wasm_error!(WasmErrorInner::Guest(
                    "No action hash associated with link".to_string()
                )))?
        }
        None => original_message_hash.clone(),
    };

    match get(latest_message_hash, GetOptions::default())? {
        Some(record) => Ok(Some(MessageRecord {
            original_action: original_message_hash,
            signed_action: record.signed_action().clone(),
            message: record.entry().to_app_option().map_err(|e| wasm_error!(e))?,
        })),
        None => Ok(None),
    }
}

#[hdk_extern]
pub fn get_original_message(original_message_hash: ActionHash) -> ExternResult<Option<Record>> {
    let Some(details) = get_details(original_message_hash, GetOptions::default())? else {
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
pub fn get_all_revisions_for_message(
    original_message_hash: ActionHash,
) -> ExternResult<Vec<Record>> {
    let Some(original_record) = get_original_message(original_message_hash.clone())? else {
        return Ok(vec![]);
    };
    let links = get_links(
        GetLinksInputBuilder::try_new(original_message_hash.clone(), LinkTypes::MessageUpdates)?
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

#[derive(Serialize, Deserialize, Debug)]
pub struct UpdateMessageInput {
    pub original_message_hash: ActionHash,
    pub previous_message_hash: ActionHash,
    pub updated_message: Message,
}
#[hdk_extern]
pub fn update_message(input: UpdateMessageInput) -> ExternResult<Record> {
    let updated_message_hash =
        update_entry(input.previous_message_hash.clone(), &input.updated_message)?;
    create_link(
        input.original_message_hash.clone(),
        updated_message_hash.clone(),
        LinkTypes::MessageUpdates,
        (),
    )?;
    let record = get(updated_message_hash.clone(), GetOptions::default())?.ok_or(wasm_error!(
        WasmErrorInner::Guest("Could not find the newly updated Message".to_string())
    ))?;
    Ok(record)
}

#[hdk_extern]
pub fn delete_message(original_message_hash: ActionHash) -> ExternResult<ActionHash> {
    let maybe_entry = get_entry_for_action(&original_message_hash)?;
    let message = if let Some(app_entry) = maybe_entry {
        match app_entry {
            EntryTypes::Message(message) => Ok(message),
            _ => Err(wasm_error!(WasmErrorInner::Guest(
                "Malformed get details response".to_string()
            ))),
        }
    } else {
        Err(wasm_error!(WasmErrorInner::Guest(
            "Entry not found".to_string()
        )))
    }?;

    let path = messages_path(message.bucket);
    let links = get_links(
        GetLinksInputBuilder::try_new(path.path_entry_hash()?, LinkTypes::AllMessages)?.build(),
    )?;
    for link in links {
        if let Some(hash) = link.target.into_action_hash() {
            if hash.eq(&original_message_hash) {
                delete_link(link.create_link_hash)?;
            }
        }
    }
    delete_entry(original_message_hash)
}

#[hdk_extern]
pub fn get_all_deletes_for_message(
    original_message_hash: ActionHash,
) -> ExternResult<Option<Vec<SignedActionHashed>>> {
    let Some(details) = get_details(original_message_hash, GetOptions::default())? else {
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
pub fn get_oldest_delete_for_message(
    original_message_hash: ActionHash,
) -> ExternResult<Option<SignedActionHashed>> {
    let Some(mut deletes) = get_all_deletes_for_message(original_message_hash)? else {
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
