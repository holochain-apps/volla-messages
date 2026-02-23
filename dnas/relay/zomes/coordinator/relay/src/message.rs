use crate::helper::*;
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
    let record = get(message_hash.clone(), GetOptions::local())?.ok_or(wasm_error!(
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

    // Create reply link if this is a reply
    if let Some(reply_to_hash) = &input.message.reply_to {
        create_link(
            reply_to_hash.clone(),
            message_hash.clone(),
            LinkTypes::MessageReplies,
            (),
        )?;
    }

    // Create thread link if this is part of a thread
    if let Some(thread_root_hash) = &input.message.thread_root {
        create_link(
            thread_root_hash.clone(),
            message_hash.clone(),
            LinkTypes::ThreadMessages,
            (),
        )?;
    }

    // Signal other agents that a message was created
    let my_pub_key = agent_info()?.agent_initial_pubkey;
    let agents = input
        .agents
        .into_iter()
        .filter(|a| a != &my_pub_key)
        .collect();
    let _ = send_remote_signal(
        MessageRecord {
            message: Some(input.message),
            original_action: message_hash.clone(),
            signed_action: record.signed_action().clone(),
        },
        agents,
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
pub fn get_message_hashes(bucket: ZomeFnInput<BucketInput>) -> ExternResult<Vec<ActionHash>> {
    let mut hashes: Vec<ActionHash> = Vec::new();
    let path: Path = messages_path(bucket.input.bucket);

    let links = get_links(
        LinkQuery {
            base: path.path_entry_hash()?.into(),
            link_type: LinkTypes::AllMessages.try_into_filter()?,
            tag_prefix: None,
            after: None,
            before: None,
            author: None,
        },
        bucket.get_strategy(),
    )?;

    // only return the hashes if the counts don't match
    if links.len() != bucket.input.count {
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
            LinkQuery {
                base: path.path_entry_hash()?.into(),
                link_type: LinkTypes::AllMessages.try_into_filter()?,
                tag_prefix: None,
                after: None,
                before: None,
                author: None,
            },
            GetStrategy::Local,
        )?;
        links.append(&mut l);
    }
    Ok(links)
}

#[hdk_extern]
pub fn get_message_entries(
    hashes: ZomeFnInput<Vec<ActionHash>>,
) -> ExternResult<Vec<MessageRecord>> {
    let mut results: Vec<MessageRecord> = Vec::new();
    for hash in hashes.input {
        if let Some(r) = get_latest_message(ZomeFnInput {
            input: hash,
            local: hashes.local,
        })? {
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
        if let Some(r) = get_latest_message(ZomeFnInput {
            input: hash,
            local: None,
        })? {
            results.push(r);
        }
    }

    Ok(results)
}

#[hdk_extern]
pub fn get_latest_message(
    original_message_hash: ZomeFnInput<ActionHash>,
) -> ExternResult<Option<MessageRecord>> {
    let links = get_links(
        LinkQuery {
            base: original_message_hash.input.clone().into(),
            link_type: LinkTypes::MessageUpdates.try_into_filter()?,
            tag_prefix: None,
            after: None,
            before: None,
            author: None,
        },
        original_message_hash.get_strategy(),
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
        None => original_message_hash.input.clone(),
    };

    match get(latest_message_hash, GetOptions::local())? {
        Some(record) => Ok(Some(MessageRecord {
            original_action: original_message_hash.input,
            signed_action: record.signed_action().clone(),
            message: record.entry().to_app_option().map_err(|e| wasm_error!(e))?,
        })),
        None => Ok(None),
    }
}

#[hdk_extern]
pub fn get_original_message(original_message_hash: ActionHash) -> ExternResult<Option<Record>> {
    let Some(details) = get_details(original_message_hash, GetOptions::local())? else {
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
        LinkQuery {
            base: original_message_hash.clone().into(),
            link_type: LinkTypes::MessageUpdates.try_into_filter()?,
            tag_prefix: None,
            after: None,
            before: None,
            author: None,
        },
        GetStrategy::Local,
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
                GetOptions::local(),
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
    let record = get(updated_message_hash.clone(), GetOptions::local())?.ok_or(wasm_error!(
        WasmErrorInner::Guest("Could not find the newly updated Message".to_string())
    ))?;
    Ok(record)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DeleteMessageInput {
    pub original_message_hash: ActionHash,
    pub agents: Vec<AgentPubKey>,
}

#[hdk_extern]
pub fn delete_message(input: DeleteMessageInput) -> ExternResult<ActionHash> {
    let maybe_entry = get_entry_for_action(&input.original_message_hash)?;
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
        LinkQuery {
            base: path.path_entry_hash()?.into(),
            link_type: LinkTypes::AllMessages.try_into_filter()?,
            tag_prefix: None,
            after: None,
            before: None,
            author: None,
        },
        GetStrategy::Local,
    )?;
    for link in links {
        if let Some(hash) = link.target.into_action_hash() {
            if hash.eq(&input.original_message_hash) {
                delete_link(link.create_link_hash, GetOptions::local())?;
            }
        }
    }
    let delete_hash = delete_entry(input.original_message_hash.clone())?;

    let delete_record = get(delete_hash.clone(), GetOptions::local())?.ok_or(wasm_error!(
        WasmErrorInner::Guest("Could not find the delete action".to_string())
    ))?;

    // Signal other agents that a message was created
    let my_pub_key = agent_info()?.agent_initial_pubkey;
    let agents = input
        .agents
        .into_iter()
        .filter(|a| a != &my_pub_key)
        .collect();
    let _ = send_remote_signal(
        MessageRecord {
            message: None,
            original_action: input.original_message_hash,
            signed_action: delete_record.signed_action().clone(),
        },
        agents,
    );

    Ok(delete_hash)
}

#[hdk_extern]
pub fn get_all_deletes_for_message(
    original_message_hash: ActionHash,
) -> ExternResult<Option<Vec<SignedActionHashed>>> {
    let Some(details) = get_details(original_message_hash, GetOptions::local())? else {
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

/// Get all direct replies to a message
#[hdk_extern]
pub fn get_replies_for_message(
    message_hash: ZomeFnInput<ActionHash>,
) -> ExternResult<Vec<MessageRecord>> {
    let links = get_links(
        GetLinksInputBuilder::try_new(
            message_hash.input.clone(),
            LinkTypes::MessageReplies,
        )?
        .get_options(message_hash.get_strategy())
        .build(),
    )?;

    let mut replies = Vec::new();
    for link in links {
        if let Some(reply_hash) = link.target.into_action_hash() {
            if let Some(record) = get_latest_message(ZomeFnInput {
                input: reply_hash,
                local: message_hash.local,
            })? {
                replies.push(record);
            }
        }
    }

    // Sort by timestamp
    replies.sort_by(|a, b| {
        a.signed_action
            .hashed
            .content
            .timestamp()
            .cmp(&b.signed_action.hashed.content.timestamp())
    });

    Ok(replies)
}

/// Get all messages in a thread
#[hdk_extern]
pub fn get_thread_messages(
    thread_root: ZomeFnInput<ActionHash>,
) -> ExternResult<Vec<MessageRecord>> {
    let links = get_links(
        GetLinksInputBuilder::try_new(thread_root.input.clone(), LinkTypes::ThreadMessages)?
            .get_options(thread_root.get_strategy())
            .build(),
    )?;

    let mut thread_messages = Vec::new();

    // Include the root message first
    if let Some(root_record) = get_latest_message(ZomeFnInput {
        input: thread_root.input.clone(),
        local: thread_root.local,
    })? {
        thread_messages.push(root_record);
    }

    // Add all replies
    for link in links {
        if let Some(msg_hash) = link.target.into_action_hash() {
            if let Some(record) = get_latest_message(ZomeFnInput {
                input: msg_hash,
                local: thread_root.local,
            })? {
                thread_messages.push(record);
            }
        }
    }

    // Sort by timestamp
    thread_messages.sort_by(|a, b| {
        a.signed_action
            .hashed
            .content
            .timestamp()
            .cmp(&b.signed_action.hashed.content.timestamp())
    });

    Ok(thread_messages)
}

/// Get reply count for a message (for thread indicators)
#[hdk_extern]
pub fn get_reply_count(message_hash: ActionHash) -> ExternResult<usize> {
    let links = get_links(
        GetLinksInputBuilder::try_new(message_hash, LinkTypes::MessageReplies)?.build(),
    )?;
    Ok(links.len())
}
