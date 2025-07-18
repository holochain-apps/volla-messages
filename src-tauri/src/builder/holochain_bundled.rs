use crate::config::{APP_ID, HAPP_BUNDLE_BYTES};
use holochain_types::prelude::AppBundle;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::PathBuf;
use tauri::{AppHandle, Builder, EventLoopMessage, Listener, Manager, Runtime};
use tauri_plugin_holochain::{vec_to_locked, HolochainExt, HolochainPluginConfig, NetworkConfig};
use url2::Url2;
use uuid::Uuid;

pub const DEFAULT_SIGNAL_URL: &'static str = "wss://dev-test-bootstrap2.holochain.org/";

pub const DEFAULT_BOOTSTRAP_URL: &'static str = "https://dev-test-bootstrap2.holochain.org/";

pub static DEFAULT_ICE_URLS: &'static [&str] = &["stun://stun.l.google.com:19302"];

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserNetworkConfig {
    bootstrap_url: Option<Url2>,
    signal_url: Option<Url2>,
    ice_servers: Option<Vec<Url2>>,
}

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
        .invoke_handler(tauri::generate_handler![
            default_user_network_config,
            get_user_network_config,
            set_user_network_config
        ])
        .plugin(tauri_plugin_holochain::async_init(
            vec_to_locked(vec![]),
            HolochainPluginConfig::new(holochain_dir(), network_config()),
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
    if let Ok(Some(user_network_config)) = read_user_network_config() {
        if let Some(bootstrap_url) = user_network_config.bootstrap_url {
            config.bootstrap_url = bootstrap_url;
        }
        if let Some(signal_url) = user_network_config.signal_url {
            config.signal_url = signal_url;
        }
        if let Some(ice_servers) = user_network_config.ice_servers {
            config.webrtc_config = Some(json!({ "iceServers": [ { "urls": ice_servers }]}));
        }
    } else {
        config.signal_url = url2::url2!("{}", DEFAULT_SIGNAL_URL);
        config.bootstrap_url = url2::url2!("{}", DEFAULT_BOOTSTRAP_URL);
        config.webrtc_config = Some(json!({ "iceServers": [ { "urls": DEFAULT_ICE_URLS }]}));
    }
    // // Don't hold any slice of the DHT in mobile
    // if cfg!(mobile) {
    //     config.target_arc_factor = 0;
    // }
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

#[tauri::command]
pub fn set_user_network_config<R: Runtime>(
    app: AppHandle<R>,
    bootstrap_url: Url2,
    signal_url: Url2,
    ice_servers: Vec<Url2>,
) -> Result<(), String> {
    let config = UserNetworkConfig {
        bootstrap_url: Some(bootstrap_url),
        signal_url: Some(signal_url),
        ice_servers: Some(ice_servers),
    };
    write_user_network_config(config).map_err(|e| e.to_string())?;

    app.restart();
    // Ok(())
}

#[tauri::command]
fn get_user_network_config() -> Result<Option<UserNetworkConfig>, String> {
    let config = read_user_network_config().map_err(|e| e.to_string())?;
    Ok(config)
}

#[tauri::command]
fn default_user_network_config() -> UserNetworkConfig {
    let config = UserNetworkConfig {
        bootstrap_url: Some(url2::url2!("{}", DEFAULT_BOOTSTRAP_URL)),
        signal_url: Some(url2::url2!("{}", DEFAULT_SIGNAL_URL)),
        ice_servers: Some(
            DEFAULT_ICE_URLS
                .into_iter()
                .map(|url| url2::url2!("{}", url))
                .collect(),
        ),
    };
    config
}

fn user_network_config_path() -> PathBuf {
    app_dirs2::app_root(
        app_dirs2::AppDataType::UserData,
        &app_dirs2::AppInfo {
            name: APP_ID,
            author: std::env!("CARGO_PKG_AUTHORS"),
        },
    )
    .expect("Could not get app root")
    .join("user-network-config.json")
}

fn write_user_network_config(config: UserNetworkConfig) -> anyhow::Result<()> {
    let contents = serde_json::to_string(&config)?;

    std::fs::write(user_network_config_path(), contents)?;
    Ok(())
}

fn read_user_network_config() -> anyhow::Result<Option<UserNetworkConfig>> {
    let path = user_network_config_path();
    if !std::fs::exists(&path)? {
        return Ok(None);
    }
    let contents = std::fs::read_to_string(path)?;

    let config: UserNetworkConfig = serde_json::from_str(contents.as_str())?;
    Ok(Some(config))
}
