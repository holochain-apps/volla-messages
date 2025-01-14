use holochain_types::prelude::AppBundle;
use lair_keystore::dependencies::sodoken::{BufRead, BufWrite};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
#[cfg(desktop)]
use tauri::Manager;
use tauri::{AppHandle, Listener};
use tauri_plugin_holochain::{
    GossipArcClamp, HolochainExt, HolochainPluginConfig, WANNetworkConfig,
};

const APP_ID: &'static str = "volla-messages";
const SIGNAL_URL: &'static str = "wss://sbd.holo.host";
const BOOTSTRAP_URL: &'static str = "https://bootstrap-0.infra.holochain.org";
static ICE_URLS: &'static [&str] = &[
    "stun:stun-0.main.infra.holo.host:443",
    "stun:stun-1.main.infra.holo.host:443",
];

pub fn happ_bundle() -> anyhow::Result<AppBundle> {
    let bytes = include_bytes!("../../workdir/relay.happ");
    let bundle = AppBundle::decode(bytes)?;
    Ok(bundle)
}

#[allow(unused_mut)]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Warn)
                .build(),
        );
    #[cfg(mobile)]
    {
        builder = builder.plugin(tauri_plugin_sharesheet::init());
    }

    #[cfg(feature = "holochain_bundled")]
    builder
        .plugin(tauri_plugin_holochain::async_init(
            vec_to_locked(vec![]).expect("Can't build passphrase"),
            HolochainPluginConfig::new(holochain_dir(), wan_network_config())
                .gossip_arc_clamp(GossipArcClamp::Full),
        ))
        .setup(|app| {
            let handle = app.handle().clone();
            let handle_fail: AppHandle = app.handle().clone();
            app.handle()
                .listen("holochain://setup-failed", move |_event| {
                    handle_fail.exit(1);
                });
            app.handle()
                .listen("holochain://setup-completed", move |_event| {
                    let handle = handle.clone();
                    tauri::async_runtime::spawn(async move {
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
                            window = window.title(String::from("Volla Messages"))
                        };

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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// Very simple setup for now:
// - On app start, list installed apps:
//   - If our hApp is not installed, this is the first time the app is opened: install our hApp
//   - If our hApp **is** installed:
//     - Check if it's necessary to update the coordinators for our hApp
//       - And do so if it is
//
// You can modify this function to suit your needs if they become more complex
async fn setup(handle: AppHandle) -> anyhow::Result<()> {
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
        // we do this because we don't want to join everybody into the same dht!
        let random_seed = format!(
            "{}",
            SystemTime::now().duration_since(UNIX_EPOCH)?.as_micros()
        );
        handle
            .holochain()?
            .install_app(
                String::from(APP_ID),
                happ_bundle()?,
                None,
                None,
                Some(random_seed),
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

fn wan_network_config() -> Option<WANNetworkConfig> {
    // Resolved at compile time to be able to point to local services
    if tauri::is_dev() {
        None
    } else {
        Some(WANNetworkConfig {
            signal_url: url2::url2!("{}", SIGNAL_URL),
            bootstrap_url: url2::url2!("{}", BOOTSTRAP_URL),
            ice_servers_urls: ICE_URLS.into_iter().map(|v| url2::url2!("{}", v)).collect(),
        })
    }
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

fn vec_to_locked(mut pass_tmp: Vec<u8>) -> std::io::Result<BufRead> {
    match BufWrite::new_mem_locked(pass_tmp.len()) {
        Err(e) => {
            pass_tmp.fill(0);
            Err(e.into())
        }
        Ok(p) => {
            {
                let mut lock = p.write_lock();
                lock.copy_from_slice(&pass_tmp);
                pass_tmp.fill(0);
            }
            Ok(p.to_read())
        }
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
