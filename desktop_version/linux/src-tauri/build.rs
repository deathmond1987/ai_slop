use std::env;
use std::path::Path;

fn main() {
    let profile = env::var("PROFILE").unwrap_or_default();
    if profile == "debug" {
        let manifest_dir = env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR missing");
        let dev_app_dir = Path::new(&manifest_dir)
            .parent()
            .map(|desktop_dir| desktop_dir.join(".build").join("app"))
            .unwrap_or_default();

        if dev_app_dir.exists() && dev_app_dir.join("server.js").exists() {
            println!(
                "cargo:rustc-env=TAURI_DEV_APP_RESOURCE_DIR={}",
                dev_app_dir.display()
            );
        }
    }

    tauri_build::build();
}
