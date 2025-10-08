use hdk::prelude::*;
use relay_integrity::*;

use crate::helper::ZomeFnInput;
#[hdk_extern]
pub fn set_config(config: Config) -> ExternResult<()> {
    let config_hash = create_entry(&EntryTypes::Config(config.clone()))?;
    let path = Path::from("config");
    let _link = create_link(
        path.path_entry_hash()?,
        config_hash.clone(),
        LinkTypes::ConfigUpdates,
        (),
    )?;
    Ok(())
}

#[hdk_extern]
pub fn get_config(input: ZomeFnInput<()>) -> ExternResult<Option<Record>> {
    let path = Path::from("config");
    let links = get_links(
        LinkQuery::try_new(path.path_entry_hash()?, LinkTypes::ConfigUpdates)?,
        input.get_strategy(),
    )?;
    let latest_link = links
        .into_iter()
        .max_by(|link_a, link_b| link_a.timestamp.cmp(&link_b.timestamp));
    if let Some(link) = latest_link {
        let latest_config_hash =
            link.target
                .clone()
                .into_action_hash()
                .ok_or(wasm_error!(WasmErrorInner::Guest(
                    "No action hash associated with link".to_string()
                )))?;
        get(latest_config_hash, GetOptions::default())
    } else {
        Ok(None)
    }
}
