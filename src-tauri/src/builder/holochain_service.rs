use crate::config::{APP_ID, HAPP_BUNDLE_BYTES};
use tauri::{Builder, Manager, Runtime};
use tauri_plugin_holochain_service_consumer::HolochainServiceConsumerExt;
use uuid::Uuid;

pub fn setup_builder<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder
        .plugin(tauri_plugin_holochain_service_consumer::init())
        .setup(|app| {
            let handle = app.handle().clone();

            handle
                .holochain_service_consumer()
                .main_window_builder(
                    APP_ID.into(),
                    HAPP_BUNDLE_BYTES.into(),
                    Uuid::new_v4().to_string(),
                )
                .expect("Failed to build window")
                .build()
                .expect("Failed to open main window");

            // Load barcode scanner plugin
            // It is necessary to load this after we have created the new 'main' webview
            //  which will be calling into it
            handle
                .plugin(tauri_plugin_barcode_scanner::init())
                .expect("Failed to initiailze tauri_plugin_barcode_scanner");

            Ok(())
        })
}
