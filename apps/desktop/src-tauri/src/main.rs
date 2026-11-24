// Sticial Studio desktop app.
//
// Shows the static export of apps/web (built with `npm run build:desktop`) and provides the
// native pieces the browser version gets from its API server or from Web Serial:
//   projects_load / projects_save   projects.json in the app data folder
//   ensure_arduino_core             installs the Arduino AVR tools on first use (offline from the
//                                   bundled download cache when present)
//   compile_sketch                  arduino-cli compile -> .hex
//   arduino_cli_json                arduino-cli lib list/search/install/uninstall
//   serial_*                        native serial ports behind navigator.serial
//                                   (serial_close_all frees ports a reloaded page forgot)
//                                   (apps/web/src/lib/desktop/desktopSerial.ts)
// The web side of each command lives in apps/web/src/lib/desktop/.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Run arduino-cli without flashing a console window.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

// ---------------------------------------------------------------------------------------------
// arduino-cli
// ---------------------------------------------------------------------------------------------

#[derive(Serialize)]
struct CliOutput {
    code: i32,
    stdout: String,
    stderr: String,
}

fn to_args(list: &[&str]) -> Vec<String> {
    list.iter().map(|value| value.to_string()).collect()
}

fn cli_path(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .resolve("bin/arduino-cli.exe", BaseDirectory::Resource)
        .map_err(|error| error.to_string())?;
    if path.exists() {
        Ok(path)
    } else {
        Err(format!("arduino-cli was not found at {}", path.display()))
    }
}

/// Download cache bundled with the installer (Arduino AVR core and tools), so the first
/// compile works without internet. Built by .github/workflows/desktop-app.yml.
fn arduino_staging_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .resolve("arduino-staging", BaseDirectory::Resource)
        .ok()
        .filter(|path| path.exists())
}

fn run_cli(app: &AppHandle, args: &[String]) -> Result<CliOutput, String> {
    let mut command = Command::new(cli_path(app)?);
    command.args(args);
    if let Some(staging) = arduino_staging_dir(app) {
        command.env("ARDUINO_DIRECTORIES_DOWNLOADS", staging);
    }
    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command
        .output()
        .map_err(|error| format!("Could not run arduino-cli: {error}"))?;
    Ok(CliOutput {
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

/// Library manager commands only; the web side cannot run anything else through this.
#[tauri::command]
async fn arduino_cli_json(app: AppHandle, args: Vec<String>) -> Result<CliOutput, String> {
    let first = args.first().map(String::as_str);
    let second = args.get(1).map(String::as_str);
    let allowed = first == Some("lib") && matches!(second, Some("list" | "search" | "install" | "uninstall"));
    if !allowed {
        return Err("This arduino-cli command is not allowed from the app.".into());
    }
    tauri::async_runtime::spawn_blocking(move || run_cli(&app, &args))
        .await
        .map_err(|error| error.to_string())?
}

fn core_installed(app: &AppHandle, core: &str) -> Result<bool, String> {
    let output = run_cli(app, &to_args(&["core", "list", "--json"]))?;
    Ok(output.code == 0 && output.stdout.contains(&format!("\"{core}\"")))
}

/// arduino-cli needs package_index.json before it can install from the bundled cache.
fn seed_package_index(app: &AppHandle, staging: &Path) -> Result<(), String> {
    let output = run_cli(app, &to_args(&["config", "get", "directories.data"]))?;
    let data_dir = PathBuf::from(output.stdout.trim().trim_matches('"'));
    if output.code != 0 || data_dir.as_os_str().is_empty() {
        return Ok(());
    }
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    for name in ["package_index.json", "package_index.json.sig"] {
        let source = staging.join(name);
        let target = data_dir.join(name);
        if source.exists() && !target.exists() {
            fs::copy(&source, &target).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn ensure_core_blocking(app: &AppHandle, core: &str) -> Result<String, String> {
    if core_installed(app, core)? {
        return Ok(String::new());
    }

    let staging = arduino_staging_dir(app);
    let mut spec = core.to_string();
    match &staging {
        Some(staging) => {
            seed_package_index(app, staging)?;
            if let Ok(version) = fs::read_to_string(staging.join("avr-core-version.txt")) {
                if !version.trim().is_empty() {
                    spec = format!("{core}@{}", version.trim());
                }
            }
        }
        None => {
            run_cli(app, &to_args(&["core", "update-index"]))?;
        }
    }

    let installed = run_cli(app, &to_args(&["core", "install", spec.as_str()]))?;
    if installed.code != 0 {
        // The bundled cache did not work (or is missing): try once more online.
        let _ = run_cli(app, &to_args(&["core", "update-index"]));
        let retry = run_cli(app, &to_args(&["core", "install", core]))?;
        if retry.code != 0 {
            return Err(format!(
                "Could not install the Arduino tools ({core}). {}",
                retry.stderr.trim()
            ));
        }
    }
    Ok("Installed the Arduino tools on this computer (first run only).".into())
}

#[tauri::command]
async fn ensure_arduino_core(app: AppHandle, core: String) -> Result<String, String> {
    if core != "arduino:avr" {
        return Err(format!("Unsupported Arduino core: {core}"));
    }
    tauri::async_runtime::spawn_blocking(move || ensure_core_blocking(&app, &core))
        .await
        .map_err(|error| error.to_string())?
}

#[derive(Deserialize)]
struct SketchFile {
    path: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompileOutcome {
    success: bool,
    stdout: String,
    stderr: String,
    hex: Option<String>,
    sketch_file: String,
}

/// A relative path inside the sketch folder, or None for absolute paths and `..`.
fn safe_relative_path(raw: &str) -> Option<PathBuf> {
    let normalized = raw.replace('\\', "/");
    if normalized.starts_with('/') || normalized.contains(':') {
        return None;
    }
    let mut path = PathBuf::new();
    for segment in normalized.split('/') {
        let segment = segment.trim();
        if segment.is_empty() {
            continue;
        }
        if segment == "." || segment == ".." {
            return None;
        }
        path.push(segment);
    }
    if path.as_os_str().is_empty() {
        None
    } else {
        Some(path)
    }
}

fn compile_blocking(
    app: &AppHandle,
    fqbn: &str,
    primary: &str,
    files: &[SketchFile],
) -> Result<CompileOutcome, String> {
    if !fqbn.starts_with("arduino:avr:") {
        return Err(format!("Unsupported board: {fqbn}"));
    }

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let name = format!("sketch_{stamp}");
    let sketch_dir = std::env::temp_dir().join("sticial-studio").join(&name);
    let build_dir = sketch_dir.join("build");
    let sketch_file = sketch_dir.join(format!("{name}.ino"));

    let outcome = (|| -> Result<CompileOutcome, String> {
        fs::create_dir_all(&sketch_dir).map_err(|error| error.to_string())?;
        fs::write(&sketch_file, primary).map_err(|error| error.to_string())?;
        for file in files {
            if let Some(relative) = safe_relative_path(&file.path) {
                let destination = sketch_dir.join(relative);
                if let Some(parent) = destination.parent() {
                    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                }
                fs::write(&destination, &file.content).map_err(|error| error.to_string())?;
            }
        }

        let output = run_cli(
            app,
            &[
                "compile".to_string(),
                "--fqbn".to_string(),
                fqbn.to_string(),
                "--build-path".to_string(),
                build_dir.to_string_lossy().into_owned(),
                sketch_dir.to_string_lossy().into_owned(),
            ],
        )?;
        let hex = if output.code == 0 {
            fs::read_to_string(build_dir.join(format!("{name}.ino.hex"))).ok()
        } else {
            None
        };
        Ok(CompileOutcome {
            success: output.code == 0 && hex.is_some(),
            stdout: output.stdout,
            stderr: output.stderr,
            hex,
            sketch_file: sketch_file.to_string_lossy().into_owned(),
        })
    })();

    let _ = fs::remove_dir_all(&sketch_dir);
    outcome
}

#[tauri::command]
async fn compile_sketch(
    app: AppHandle,
    fqbn: String,
    primary: String,
    files: Vec<SketchFile>,
) -> Result<CompileOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || compile_blocking(&app, &fqbn, &primary, &files))
        .await
        .map_err(|error| error.to_string())?
}

// ---------------------------------------------------------------------------------------------
// Projects (one JSON file in the app data folder)
// ---------------------------------------------------------------------------------------------

fn projects_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    Ok(dir.join("projects.json"))
}

#[tauri::command]
fn projects_load(app: AppHandle) -> Result<String, String> {
    let path = projects_file(&app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|error| format!("Could not read {}: {error}", path.display()))
}

/// Write to a temporary file and rename it over the old one, keeping the previous save as .bak,
/// so a crash mid-write never leaves an empty or half-written projects file.
#[tauri::command]
fn projects_save(app: AppHandle, data: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&data)
        .map_err(|error| format!("Refusing to save invalid project data: {error}"))?;
    let path = projects_file(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    if path.exists() {
        let _ = fs::copy(&path, path.with_extension("json.bak"));
    }
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, data.as_bytes()).map_err(|error| error.to_string())?;
    fs::rename(&temporary, &path).map_err(|error| error.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Serial ports
// ---------------------------------------------------------------------------------------------

struct OpenPort {
    path: String,
    port: Box<dyn serialport::SerialPort>,
    stop: Arc<AtomicBool>,
    reader: Option<std::thread::JoinHandle<()>>,
}

impl OpenPort {
    /// Stops the reader thread and waits for it, so the OS handle is really released when this
    /// returns (Windows lets only one program open a COM port at a time).
    fn shut(mut self) {
        self.stop.store(true, Ordering::SeqCst);
        drop(self.port);
        if let Some(reader) = self.reader.take() {
            // The thread checks `stop` after each 20 ms read timeout. Never block the app for long.
            let deadline = std::time::Instant::now() + Duration::from_millis(500);
            while !reader.is_finished() && std::time::Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(5));
            }
            if reader.is_finished() {
                let _ = reader.join();
            }
        }
    }
}

#[derive(Default)]
struct SerialState {
    next_id: AtomicU32,
    ports: Mutex<HashMap<u32, OpenPort>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PortInfo {
    path: String,
    label: String,
    usb_vendor_id: Option<u16>,
    usb_product_id: Option<u16>,
}

#[derive(Clone, Serialize)]
struct SerialData {
    id: u32,
    data: Vec<u8>,
}

#[derive(Clone, Serialize)]
struct SerialClosed {
    id: u32,
    reason: String,
}

#[tauri::command]
fn serial_list() -> Result<Vec<PortInfo>, String> {
    let ports = serialport::available_ports().map_err(|error| error.to_string())?;
    Ok(ports
        .into_iter()
        .map(|port| match port.port_type {
            serialport::SerialPortType::UsbPort(usb) => {
                let label = usb
                    .product
                    .clone()
                    .filter(|product| !product.trim().is_empty())
                    .map(|product| format!("{} ({})", product.trim(), port.port_name))
                    .unwrap_or_else(|| port.port_name.clone());
                PortInfo {
                    path: port.port_name,
                    label,
                    usb_vendor_id: Some(usb.vid),
                    usb_product_id: Some(usb.pid),
                }
            }
            _ => PortInfo {
                label: port.port_name.clone(),
                path: port.port_name,
                usb_vendor_id: None,
                usb_product_id: None,
            },
        })
        .collect())
}

fn lock_ports(state: &SerialState) -> Result<std::sync::MutexGuard<'_, HashMap<u32, OpenPort>>, String> {
    state
        .ports
        .lock()
        .map_err(|_| "Serial port state is unavailable.".to_string())
}

#[tauri::command]
fn serial_open(
    app: AppHandle,
    state: State<'_, SerialState>,
    path: String,
    baud_rate: u32,
) -> Result<u32, String> {
    // A port this app still holds for the same device (for example after the page reloaded and
    // forgot it) is released first, or the open below would be refused.
    let stale: Vec<OpenPort> = {
        let mut ports = lock_ports(&state)?;
        let ids: Vec<u32> = ports
            .iter()
            .filter(|(_, open)| open.path == path)
            .map(|(id, _)| *id)
            .collect();
        ids.into_iter().filter_map(|id| ports.remove(&id)).collect()
    };
    for open in stale {
        open.shut();
    }

    let port = serialport::new(&path, baud_rate)
        .timeout(Duration::from_millis(20))
        .open()
        .map_err(|error| format!("Could not open {path}: {error}"))?;
    let mut reader = port.try_clone().map_err(|error| error.to_string())?;

    let id = state.next_id.fetch_add(1, Ordering::SeqCst) + 1;
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();
    let events = app.clone();

    // Reader thread: forwards bytes to the web side until the port is closed or fails.
    let reader_thread = std::thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        while !thread_stop.load(Ordering::SeqCst) {
            match reader.read(&mut buffer) {
                Ok(0) => {}
                Ok(count) => {
                    let _ = events.emit(
                        "serial-data",
                        SerialData {
                            id,
                            data: buffer[..count].to_vec(),
                        },
                    );
                }
                Err(error)
                    if matches!(
                        error.kind(),
                        std::io::ErrorKind::TimedOut | std::io::ErrorKind::Interrupted
                    ) => {}
                Err(error) => {
                    if !thread_stop.load(Ordering::SeqCst) {
                        let _ = events.emit(
                            "serial-closed",
                            SerialClosed {
                                id,
                                reason: error.to_string(),
                            },
                        );
                    }
                    break;
                }
            }
        }
    });

    lock_ports(&state)?.insert(
        id,
        OpenPort {
            path,
            port,
            stop,
            reader: Some(reader_thread),
        },
    );
    Ok(id)
}

#[tauri::command]
fn serial_write(state: State<'_, SerialState>, id: u32, data: Vec<u8>) -> Result<(), String> {
    let mut ports = lock_ports(&state)?;
    let open = ports.get_mut(&id).ok_or("The serial port is not open.")?;
    open.port.write_all(&data).map_err(|error| error.to_string())?;
    open.port.flush().map_err(|error| error.to_string())
}

#[tauri::command]
fn serial_set_signals(
    state: State<'_, SerialState>,
    id: u32,
    dtr: Option<bool>,
    rts: Option<bool>,
) -> Result<(), String> {
    let mut ports = lock_ports(&state)?;
    let open = ports.get_mut(&id).ok_or("The serial port is not open.")?;
    if let Some(level) = dtr {
        open.port
            .write_data_terminal_ready(level)
            .map_err(|error| error.to_string())?;
    }
    if let Some(level) = rts {
        open.port
            .write_request_to_send(level)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn serial_close(state: State<'_, SerialState>, id: u32) -> Result<(), String> {
    let open = lock_ports(&state)?.remove(&id);
    if let Some(open) = open {
        open.shut();
    }
    Ok(())
}

/// Called when the web page starts: a reloaded page has forgotten any port it opened before.
#[tauri::command]
fn serial_close_all(state: State<'_, SerialState>) -> Result<(), String> {
    let all: Vec<OpenPort> = lock_ports(&state)?.drain().map(|(_, open)| open).collect();
    for open in all {
        open.shut();
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(SerialState::default())
        .invoke_handler(tauri::generate_handler![
            projects_load,
            projects_save,
            ensure_arduino_core,
            compile_sketch,
            arduino_cli_json,
            serial_list,
            serial_open,
            serial_write,
            serial_set_signals,
            serial_close,
            serial_close_all
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sticial Studio");
}
