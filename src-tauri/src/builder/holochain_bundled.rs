use crate::config::{APP_ID, HAPP_BUNDLE_BYTES};
use holochain_types::prelude::AppBundle;
use std::path::PathBuf;
use tauri::{AppHandle, Builder, EventLoopMessage, Listener, Manager, Runtime};
use tauri_plugin_holochain::{HolochainExt, HolochainPluginConfig, vec_to_locked};
use tauri_plugin_holochain::NetworkConfig;
use uuid::Uuid;
use serde_json::json;

pub const SIGNAL_URL: &'static str = "https://relay.volla.tech/";

pub const BOOTSTRAP_URL: &'static str = "https://relay.volla.tech/";

pub static ICE_URLS: &'static [&str] = &[
    "stun://stun.nextcloud.com:443"
];

pub fn happ_bundle() -> anyhow::Result<AppBundle> {
    let bundle = AppBundle::decode(HAPP_BUNDLE_BYTES)?;
    Ok(bundle)
}

pub fn setup_builder<R: Runtime>(builder: Builder<R>) -> Builder<R>
where
    <<R as tauri_runtime::Runtime<EventLoopMessage>>::WindowDispatcher as tauri_runtime::WindowDispatch<
        EventLoopMessage,
    >>::WindowBuilder: std::marker::Send,
{
    builder
        .plugin(tauri_plugin_holochain::async_init(
            vec_to_locked(vec![]),
            HolochainPluginConfig::new(holochain_dir(), network_config())
        ))
        .setup(|app| {
            let handle = app.handle().clone();
            let handle_fail = app.handle().clone();
            app.handle()
                .listen("holochain://setup-failed", move |_event| {
                    handle_fail.exit(1);
                });
            app.handle()
                .listen("holochain://setup-completed", move |_event| {
                    let handle = handle.clone();
                    tauri::async_runtime::spawn(async move {
                        let handle = handle.clone();

                        setup(handle.clone()).await.expect("Failed to setup");

                        let mut window = handle
                            .holochain()
                            .expect("Failed to get holochain")
                            .main_window_builder(
                                String::from("main"),
                                false,
                                Some(APP_ID.into()),
                                None,
                            )
                            .await
                            .expect("Failed to build window");

                        #[cfg(desktop)]
                        {
                            window = window.title(String::from("Volla Messages"));
                        }

                        window.build().expect("Failed to open main window");

                        #[cfg(desktop)]
                        {
                            // After it's done, close the splashscreen and display the main window
                            let splashscreen_window =
                                handle.get_webview_window("splashscreen").unwrap();
                            splashscreen_window.close().unwrap();
                        }

                        // Load barcode scanner plugin if on supported platform
                        // It is necessary to load this after we have created the new 'main' webview
                        //  which will be calling into it
                        #[cfg(mobile)]
                        handle
                            .plugin(tauri_plugin_barcode_scanner::init())
                            .expect("Failed to initiailze tauri_plugin_barcode_scanner");
                    });
                });

            Ok(())
        })
}

// Very simple setup for now:
// - On app start, list installed apps:
//   - If our hApp is not installed, this is the first time the app is opened: install our hApp
//   - If our hApp **is** installed:
//     - Check if it's necessary to update the coordinators for our hApp
//       - And do so if it is
async fn setup<R: Runtime>(handle: AppHandle<R>) -> anyhow::Result<()> {
    let admin_ws = handle.holochain()?.admin_websocket().await?;

    let installed_apps = admin_ws
        .list_apps(None)
        .await
        .map_err(|err| tauri_plugin_holochain::Error::ConductorApiError(err))?;

    // DeepKey comes preinstalled as the first app
    if installed_apps
        .iter()
        .find(|app| app.installed_app_id.as_str().eq(APP_ID))
        .is_none()
    {
        handle
            .holochain()?
            .install_app(
                String::from(APP_ID),
                happ_bundle()?,
                None,
                None,
                // Generate a random network seed so every user has their own private DHT for storing contacts
                Some(Uuid::new_v4().to_string()),
            )
            .await?;
    } else {
        handle
            .holochain()?
            .update_app_if_necessary(String::from(APP_ID), happ_bundle()?)
            .await?;
    }
    Ok(())
}
fn network_config() -> NetworkConfig {
    let mut config = NetworkConfig::default();
    config.signal_url = url2::url2!("{}", SIGNAL_URL);
    config.bootstrap_url = url2::url2!("{}", BOOTSTRAP_URL);
    config.webrtc_config = Some(json!({ "iceServers": [ { "urls": ICE_URLS }]}));
    config
}
fn holochain_dir() -> PathBuf {
    if tauri::is_dev() {
        #[cfg(target_os = "android")]
        {
            app_dirs2::app_root(
                app_dirs2::AppDataType::UserCache,
                &app_dirs2::AppInfo {
                    name: APP_ID,
                    author: std::env!("CARGO_PKG_AUTHORS"),
                },
            )
            .expect("Could not get the UserCache directory")
        }
        #[cfg(not(target_os = "android"))]
        {
            let tmp_dir =
                tempdir::TempDir::new(APP_ID).expect("Could not create temporary directory");

            // Convert `tmp_dir` into a `Path`, destroying the `TempDir`
            // without deleting the directory.
            let tmp_path = tmp_dir.into_path();
            tmp_path
        }
    } else {
        app_dirs2::app_root(
            app_dirs2::AppDataType::UserData,
            &app_dirs2::AppInfo {
                name: APP_ID,
                author: std::env!("CARGO_PKG_AUTHORS"),
            },
        )
        .expect("Could not get app root")
        .join("holochain")
        .join(get_version())
    }
}

fn get_version() -> String {
    let semver = std::env!("CARGO_PKG_VERSION");

    if semver.starts_with("0.0.") {
        return semver.to_string();
    }

    if semver.starts_with("0.") {
        let v: Vec<&str> = semver.split(".").collect();
        return format!("{}.{}", v[0], v[1]);
    }
    let v: Vec<&str> = semver.split(".").collect();
    return format!("{}", v[0]);
}
