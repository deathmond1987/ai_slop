#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sidecar;

use tauri::Manager;

use sidecar::{ensure_sidecar, kill_sidecar, restart_sidecar, sidecar_status, SidecarState};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(SidecarState::new(&handle));
            ensure_sidecar(&handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![sidecar_status, restart_sidecar])
        .build(tauri::generate_context!())
        .expect("error while building Steam Calendar desktop application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                kill_sidecar(app_handle);
            }
        });
}
