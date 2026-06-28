pub mod commands;
pub mod connector;

use commands::service::{default_sidecar_config, ServiceHandle};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;

pub use connector::engine::*;

#[derive(Clone)]
pub struct DesktopConfig {
    pub version: String,
    pub bundle_path: PathBuf,
    pub cli_path: PathBuf,
    pub node_path: PathBuf,
    pub update_manifest_url: String,
}

pub struct AppState {
    pub service: Arc<ServiceHandle>,
    pub config: DesktopConfig,
}

fn build_config() -> DesktopConfig {
    let version = env!("CARGO_PKG_VERSION").to_string();
    let ctx = EngineContext::from_env().unwrap_or_else(|_| {
        EngineContext::test(
            connector::engine::Platform::Win32,
            std::env::temp_dir(),
            std::env::temp_dir(),
        )
    });
    let bundle_path = ctx.bundle_path;

    let cli_path = if let Ok(p) = std::env::var("ENIGMA_CLI_PATH") {
        PathBuf::from(p)
    } else {
        resolve_cli_path_from_exe().unwrap_or_else(|| PathBuf::from("apps/cli/bin/enigma.mjs"))
    };

    let node_path = std::env::var("ENIGMA_NODE_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("node"));

    let update_manifest_url = std::env::var("UPDATER_MANIFEST_URL")
        .or_else(|_| std::env::var("ENIGMA_UPDATE_URL"))
        .unwrap_or_else(|_| "https://enigmamemory.com/releases/desktop/manifest.json".to_string());

    DesktopConfig {
        version,
        bundle_path,
        cli_path,
        node_path,
        update_manifest_url,
    }
}

fn resolve_cli_path_from_exe() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let candidate = exe.ancestors().nth(4)?.join("cli/bin/enigma.mjs");
    if candidate.exists() {
        Some(candidate)
    } else {
        None
    }
}

pub fn run() {
    commands::crash::init_panic_hook();

    let config = build_config();
    let service_config = default_sidecar_config(&config);
    let service = Arc::new(ServiceHandle::new(service_config));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState { service, config })
        .invoke_handler(tauri::generate_handler![
            commands::service::start_service,
            commands::service::stop_service,
            commands::service::get_service_status,
            commands::service::get_service_logs,
            commands::service::create_memory_drive,
            commands::service::get_memory_drive_status,
            commands::service::create_vault,
            commands::service::detect_clients,
            commands::service::connect_client,
            commands::service::disconnect_client,
            commands::service::repair_client_config,
            commands::service::test_client_config,
            commands::service::rollback_client_config,
            commands::service::preview_import_text,
            commands::service::approve_import_text,
            commands::service::rollback_import_text,
            commands::service::get_support_summary,
            commands::service::export_support_summary,
            commands::service::get_proof_activity,
            commands::service::get_health,
            commands::service::shutdown_service,
            commands::diagnostics::get_diagnostics,
            commands::diagnostics::export_diagnostics,
            commands::update::check_update,
            commands::crash::get_crash_reporting_status,
            commands::crash::set_crash_reporting_enabled,
            commands::crash::submit_pending_crash_reports,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<AppState>();
                let _ = tauri::async_runtime::block_on(state.service.stop());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
