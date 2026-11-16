use std::fs;
use std::path::PathBuf;

const DEFAULT_EXPORT_NAME: &str = "steam-calendar.ics";

#[tauri::command]
pub fn save_calendar_export(contents: String, filename: Option<String>) -> Result<String, String> {
    let filename = safe_export_filename(filename.as_deref());
    let dir = download_directory();

    fs::create_dir_all(&dir)
        .map_err(|error| format!("could not create download directory: {error}"))?;

    let path = dir.join(filename);
    fs::write(&path, contents)
        .map_err(|error| format!("could not save calendar export: {error}"))?;

    Ok(path.display().to_string())
}

fn safe_export_filename(value: Option<&str>) -> String {
    let raw = value.unwrap_or(DEFAULT_EXPORT_NAME).trim();
    let name = raw
        .rsplit('/')
        .next()
        .and_then(|part| part.rsplit('\\').next())
        .unwrap_or(raw);

    let cleaned: String = name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
                ch
            } else {
                '-'
            }
        })
        .collect();

    let cleaned = cleaned.trim_matches('.').to_string();
    let cleaned = if cleaned.is_empty() || !cleaned.chars().any(|ch| ch.is_ascii_alphanumeric()) {
        DEFAULT_EXPORT_NAME.to_string()
    } else {
        cleaned
    };

    if cleaned.ends_with(".ics") {
        cleaned
    } else {
        format!("{cleaned}.ics")
    }
}

fn download_directory() -> PathBuf {
    for key in ["XDG_DOWNLOAD_DIR", "USERPROFILE", "HOME"] {
        if let Ok(value) = std::env::var(key) {
            let path = PathBuf::from(value);
            if path.is_absolute() {
                let downloads = path.join("Downloads");
                return if downloads.is_dir() { downloads } else { path };
            }
        }
    }

    std::env::temp_dir()
}
