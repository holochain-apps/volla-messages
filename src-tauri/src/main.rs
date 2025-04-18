// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Workaround for linux webkit issues where screen is blank.
    // They seem to only arise on the version of webkitgtk
    // that is included in ubuntu 22.04.
    eprintln!("[DEBUG] MAIN");
    #[cfg(all(desktop, target_os = "linux"))]
    {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
    eprintln!("[DEBUG] tauri_app_lib::run()");
    tauri_app_lib::run();
    eprintln!("[DEBUG] tauri_app_lib::run() DONE ");
    // Remove workaround env vars
    #[cfg(all(desktop, target_os = "linux"))]
    {
        std::env::remove_var("WEBKIT_DISABLE_COMPOSITING_MODE");
    }
}
