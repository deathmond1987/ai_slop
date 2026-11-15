use serde::Serialize;
use std::fs::{create_dir_all, OpenOptions};
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU16, AtomicU8, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::{CommandEvent, CommandChild};
use tauri_plugin_shell::ShellExt;

const SIDECAR_NAME: &str = "steam-calendar-node";
const DEFAULT_PORT: u16 = 3721;
const PORT_SCAN_LIMIT: u16 = 20;
const READY_TIMEOUT_SECS: u64 = 20;

const STATUS_IDLE: u8 = 0;
const STATUS_STARTING: u8 = 1;
const STATUS_READY: u8 = 2;
const STATUS_EXITED: u8 = 3;
const STATUS_FAILED: u8 = 4;

#[derive(Serialize)]
pub struct SidecarStatus {
    pub status: String,
    pub port: u16,
    pub log_path: String,
}

pub struct SidecarState {
    child: Mutex<Option<CommandChild>>,
    status: AtomicU8,
    port: AtomicU16,
    log_path: PathBuf,
}

impl SidecarState {
    pub fn new(app: &AppHandle) -> Self {
        let data_dir = app_data_dir(app);
        let log_path = data_dir.join("sidecar.log");
        touch_log(&log_path);

        Self {
            child: Mutex::new(None),
            status: AtomicU8::new(STATUS_IDLE),
            port: AtomicU16::new(DEFAULT_PORT),
            log_path,
        }
    }
}

#[tauri::command]
pub fn sidecar_status(app: AppHandle) -> SidecarStatus {
    let state = app.state::<SidecarState>();

    SidecarStatus {
        status: status_text(state.status.load(Ordering::SeqCst)).to_string(),
        port: state.port.load(Ordering::SeqCst),
        log_path: state.log_path.display().to_string(),
    }
}

#[tauri::command]
pub fn restart_sidecar(app: AppHandle) -> Result<SidecarStatus, String> {
    kill_sidecar(&app);
    ensure_sidecar(&app);
    Ok(sidecar_status(app))
}

pub fn ensure_sidecar(app: &AppHandle) {
    let state = app.state::<SidecarState>();

    if matches!(
        state.status.load(Ordering::SeqCst),
        STATUS_STARTING | STATUS_READY
    ) {
        return;
    }

    for _attempt in 0..=PORT_SCAN_LIMIT {
        let Some(port) = pick_free_port(DEFAULT_PORT) else {
            append_log(&state.log_path, b"no free local sidecar port found\n");
            state.status.store(STATUS_FAILED, Ordering::SeqCst);
            return;
        };

        state.port.store(port, Ordering::SeqCst);

        match spawn_sidecar(app, &state, port) {
            Ok(child) => {
                *state.child.lock().unwrap() = Some(child);
                state.status.store(STATUS_STARTING, Ordering::SeqCst);
                return;
            }
            Err(error) => {
                append_log(&state.log_path, format!("sidecar spawn failed: {}\n", error).as_bytes());
            }
        }
    }

    state.status.store(STATUS_FAILED, Ordering::SeqCst);
}

pub fn kill_sidecar(app: &AppHandle) {
    let Some(state) = app.try_state::<SidecarState>() else {
        return;
    };

    let child = state.child.lock().unwrap().take();
    if let Some(child) = child {
        append_log(&state.log_path, b"stopping sidecar\n");
        let _ = child.kill();
    }

    state.status.store(STATUS_IDLE, Ordering::SeqCst);
}

fn spawn_sidecar(app: &AppHandle, state: &SidecarState, port: u16) -> Result<CommandChild, String> {
    let app_dir = app_resource_dir(app)?;
    let data_dir = app_data_dir(app);
    let log_path = state.log_path.clone();
    let envs = vec![
        ("HOSTNAME", "127.0.0.1".to_string()),
        ("PORT", port.to_string()),
        ("NODE_ENV", "production".to_string()),
        ("DB_SQLITE_PATH", data_dir.join("steam-calendar.sqlite").to_string_lossy().to_string()),
        ("AUTH_BASE_URL", format!("http://127.0.0.1:{}", port)),
        ("COOKIE_SECURE", "false".to_string()),
    ];

    append_log(
        &log_path,
        format!("spawning {} from {} on port {}\n", SIDECAR_NAME, app_dir.display(), port).as_bytes(),
    );

    let (mut rx, child) = app
        .shell()
        .sidecar(SIDECAR_NAME)
        .map_err(|error| error.to_string())?
        .args(vec!["server.js".to_string()])
        .envs(envs)
        .current_dir(app_dir)
        .spawn()
        .map_err(|error| error.to_string())?;

    let event_handle = app.clone();
    let monitor_handle = app.clone();
    let event_log_path = log_path.clone();

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => append_log(&event_log_path, &line),
                CommandEvent::Stderr(line) => append_log(&event_log_path, &line),
                CommandEvent::Error(line) => append_log(&event_log_path, line.as_bytes()),
                CommandEvent::Terminated(payload) => {
                    append_log(
                        &event_log_path,
                        format!("sidecar terminated: code={:?}\n", payload.code).as_bytes(),
                    );

                    let state = event_handle.state::<SidecarState>();
                    let _ = state.child.lock().unwrap().take();

                    if state.status.load(Ordering::SeqCst) == STATUS_STARTING {
                        state.status.store(STATUS_EXITED, Ordering::SeqCst);
                    }

                    break;
                }
                _ => {}
            }
        }
    });

    monitor_sidecar(monitor_handle, port);

    Ok(child)
}

fn monitor_sidecar(app: AppHandle, port: u16) {
    thread::spawn(move || {
        let started = Instant::now();

        while started.elapsed() < Duration::from_secs(READY_TIMEOUT_SECS) {
            let state = app.state::<SidecarState>();
            let status = state.status.load(Ordering::SeqCst);

            if status == STATUS_EXITED || status == STATUS_FAILED || status == STATUS_IDLE {
                return;
            }

            if probe_health(port) {
                let _ = state.status.compare_exchange(
                    STATUS_STARTING,
                    STATUS_READY,
                    Ordering::SeqCst,
                    Ordering::SeqCst,
                );
                append_log(&state.log_path, format!("sidecar ready on port {}\n", port).as_bytes());
                return;
            }

            thread::sleep(Duration::from_millis(250));
        }

        let state = app.state::<SidecarState>();
        let _ = state.status.compare_exchange(
            STATUS_STARTING,
            STATUS_FAILED,
            Ordering::SeqCst,
            Ordering::SeqCst,
        );
        append_log(&state.log_path, format!("sidecar readiness timeout on port {}\n", port).as_bytes());
    });
}

fn probe_health(port: u16) -> bool {
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(300)) else {
        return false;
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));

    let request = format!(
        "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
        port
    );

    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut buffer = [0_u8; 512];
    let Ok(read) = stream.read(&mut buffer) else {
        return false;
    };

    String::from_utf8_lossy(&buffer[..read]).contains("200")
}

fn pick_free_port(start: u16) -> Option<u16> {
    for offset in 0..=PORT_SCAN_LIMIT {
        let Some(port) = start.checked_add(offset) else {
            continue;
        };

        if TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, port))).is_ok() {
            return Some(port);
        }
    }

    None
}

fn app_resource_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(dev_dir) = option_env!("TAURI_DEV_APP_RESOURCE_DIR") {
        let dev_dir = Path::new(dev_dir);
        if dev_dir.is_absolute() && dev_dir.exists() {
            return Ok(dev_dir.to_path_buf());
        }
    }

    app.path()
        .resource_dir()
        .map(|dir| dir.join("app"))
        .map_err(|error| error.to_string())
}

fn app_data_dir(app: &AppHandle) -> PathBuf {
    match app.path().app_data_dir() {
        Ok(dir) => {
            let _ = create_dir_all(&dir);
            dir
        }
        Err(_) => {
            let dir = std::env::temp_dir().join("steam-calendar-desktop");
            let _ = create_dir_all(&dir);
            dir
        }
    }
}

fn status_text(status: u8) -> &'static str {
    match status {
        STATUS_STARTING => "starting",
        STATUS_READY => "ready",
        STATUS_EXITED => "exited",
        STATUS_FAILED => "failed",
        _ => "idle",
    }
}

fn touch_log(path: &Path) {
    let _ = OpenOptions::new().create(true).append(true).open(path);
}

fn append_log(path: &Path, bytes: &[u8]) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(bytes);
    }
}
