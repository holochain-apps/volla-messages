#[cfg(all(feature = "holochain_service", mobile))]
mod holochain_service;
#[cfg(all(feature = "holochain_service", mobile))]
pub use holochain_service::*;

#[cfg(all(feature = "holochain_bundled", not(feature = "holochain_service")))]
mod holochain_bundled;
#[cfg(all(feature = "holochain_bundled", not(feature = "holochain_service")))]
pub use holochain_bundled::*;

#[cfg(all(
    not(feature = "holochain_bundled"),
    not(all(feature = "holochain_service", mobile))
))]
pub fn setup_builder<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
}
