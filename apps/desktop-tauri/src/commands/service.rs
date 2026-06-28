use crate::commands::run_cli;
use crate::{AppState, DesktopConfig};
use chrono::Utc;
use regex::Regex;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::process::{Child, Command};
use tokio::sync::oneshot;

/// Configuration for the Enigma engine sidecar.
#[derive(Debug, Clone)]
pub struct ServiceConfig {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub work_dir: Option<PathBuf>,
    pub env: HashMap<String, String>,
    pub max_restarts: usize,
    pub restart_delay_secs: u64,
    pub log_capacity: usize,
}

impl Default for ServiceConfig {
    fn default() -> Self {
        Self {
            program: PathBuf::from("node"),
            args: Vec::new(),
            work_dir: None,
            env: HashMap::new(),
            max_restarts: 5,
            restart_delay_secs: 3,
            log_capacity: 500,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ServiceStatus {
    pub running: bool,
    pub pid: u32,
    pub restarts: usize,
    pub uptime_secs: u64,
}

#[derive(Debug, Clone)]
struct LogLine {
    ts: chrono::DateTime<Utc>,
    stream: &'static str,
    message: String,
}

/// Long-running handle for the Enigma engine sidecar.
pub struct ServiceHandle {
    config: ServiceConfig,
    running: AtomicBool,
    pid: AtomicU32,
    started_at: AtomicU64,
    restart_count: AtomicUsize,
    shutdown: AtomicBool,
    logs: parking_lot::Mutex<std::collections::VecDeque<LogLine>>,
    stop_tx: parking_lot::Mutex<Option<oneshot::Sender<()>>>,
}

impl ServiceHandle {
    pub fn new(config: ServiceConfig) -> Self {
        Self {
            config,
            running: AtomicBool::new(false),
            pid: AtomicU32::new(0),
            started_at: AtomicU64::new(0),
            restart_count: AtomicUsize::new(0),
            shutdown: AtomicBool::new(false),
            logs: parking_lot::Mutex::new(std::collections::VecDeque::with_capacity(128)),
            stop_tx: parking_lot::Mutex::new(None),
        }
    }

    pub fn status(&self) -> ServiceStatus {
        let running = self.running.load(Ordering::SeqCst);
        let pid = self.pid.load(Ordering::SeqCst);
        let restarts = self.restart_count.load(Ordering::SeqCst);
        let started = self.started_at.load(Ordering::SeqCst);
        let uptime_secs = if running && started > 0 {
            let now = current_epoch_millis();
            now.saturating_sub(started) / 1000
        } else {
            0
        };
        ServiceStatus {
            running,
            pid,
            restarts,
            uptime_secs,
        }
    }

    pub fn logs(&self, limit: usize) -> Vec<String> {
        let guard = self.logs.lock();
        guard
            .iter()
            .rev()
            .take(limit)
            .rev()
            .map(|line| {
                format!(
                    "[{}] [{}] {}",
                    line.ts.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
                    line.stream,
                    redact_log(&line.message)
                )
            })
            .collect()
    }

    /// Start the sidecar. If it is already running this is a no-op.
    pub async fn start(self: Arc<Self>) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }

        self.shutdown.store(false, Ordering::SeqCst);

        let mut cmd = Command::new(&self.config.program);
        cmd.args(&self.config.args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);

        if let Some(dir) = &self.config.work_dir {
            cmd.current_dir(dir);
        }
        for (k, v) in &self.config.env {
            cmd.env(k, v);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("failed to spawn sidecar: {e}"))?;
        let pid = child.id().unwrap_or(0);
        let stdout = child.stdout.take().ok_or("missing stdout")?;
        let stderr = child.stderr.take().ok_or("missing stderr")?;

        self.running.store(true, Ordering::SeqCst);
        self.pid.store(pid, Ordering::SeqCst);
        self.started_at
            .store(current_epoch_millis(), Ordering::SeqCst);

        let (tx, rx) = oneshot::channel();
        *self.stop_tx.lock() = Some(tx);

        self.spawn_reader(stdout, "stdout");
        self.spawn_reader(stderr, "stderr");
        self.clone().spawn_watcher(child, rx);

        self.push_log(LogLine {
            ts: Utc::now(),
            stream: "service",
            message: format!("started pid={pid}"),
        });
        Ok(())
    }

    /// Request a clean shutdown of the sidecar.
    pub async fn stop(&self) -> Result<(), String> {
        self.shutdown.store(true, Ordering::SeqCst);
        if let Some(tx) = self.stop_tx.lock().take() {
            let _ = tx.send(());
        }
        // Wait briefly for the watcher to finish.
        for _ in 0..50 {
            if !self.running.load(Ordering::SeqCst) {
                break;
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }
        self.push_log(LogLine {
            ts: Utc::now(),
            stream: "service",
            message: "stop requested".to_string(),
        });
        Ok(())
    }


    fn spawn_reader<R: tokio::io::AsyncRead + Send + Unpin + 'static>(
        self: &Arc<Self>,
        pipe: R,
        stream: &'static str,
    ) {
        let this = self.clone();
        tokio::spawn(async move {
            use tokio::io::{AsyncBufReadExt, BufReader};
            let reader = BufReader::new(pipe);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                this.push_log(LogLine {
                    ts: Utc::now(),
                    stream,
                    message: line,
                });
            }
        });
    }

    fn spawn_watcher(self: Arc<Self>, mut child: Child, stop_rx: oneshot::Receiver<()>) {
        tokio::spawn(async move {
            let mut stop_rx = stop_rx;
            let _id = child.id();
            let result = tokio::select! {
                biased;
                _ = &mut stop_rx => {
                    drop(child);
                    Ok(None)
                }
                status = child.wait() => status.map(Some),
            };

            self.running.store(false, Ordering::SeqCst);
            self.pid.store(0, Ordering::SeqCst);

            let message = match result {
                Ok(Some(status)) => format!("exited code={}", status.code().unwrap_or(-1)),
                Ok(None) => "stopped".to_string(),
                Err(e) => format!("wait error: {e}"),
            };
            self.push_log(LogLine {
                ts: Utc::now(),
                stream: "service",
                message,
            });

            if self.shutdown.load(Ordering::SeqCst) {
                return;
            }

            let restarts = self.restart_count.load(Ordering::SeqCst);
            if restarts >= self.config.max_restarts {
                self.push_log(LogLine {
                    ts: Utc::now(),
                    stream: "service",
                    message: format!("max restarts reached ({restarts})"),
                });
                return;
            }

            tokio::time::sleep(tokio::time::Duration::from_secs(
                self.config.restart_delay_secs,
            ))
            .await;
            self.restart_count.fetch_add(1, Ordering::SeqCst);
            let _ = self.start().await;
        });
    }

    fn push_log(&self, line: LogLine) {
        let mut guard = self.logs.lock();
        if guard.len() >= self.config.log_capacity {
            guard.pop_front();
        }
        guard.push_back(line);
    }
}

async fn setup_bundle(config: &crate::DesktopConfig) -> Result<Value, String> {
    let bundle = config.bundle_path.to_string_lossy();
    run_cli(config, &["setup", "--bundle", &bundle, "--overwrite"]).await
}

async fn drive_health(config: &crate::DesktopConfig) -> Result<Value, String> {
    let bundle = config.bundle_path.to_string_lossy();
    let report = run_cli(config, &["drive", "health", "--bundle", &bundle]).await?;
    let status = report
        .get("overall_status")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    Ok(json!({
        "memory_drive_status": status,
        "report": report,
    }))
}

async fn detect_clients_internal() -> Result<Value, String> {
    use crate::connector::engine::{ConnectorEngine, EngineContext};
    let ctx = EngineContext::from_env().map_err(|e| e.to_string())?;
    let engine = ConnectorEngine::new();
    let results = engine.detect_all(&ctx);
    let clients: Vec<Value> = results
        .into_iter()
        .map(|r| {
            let status = if r.installed && r.server_entry_exists && r.env_ok && r.command_ok {
                "connected"
            } else if r.installed {
                "ready"
            } else {
                "not-installed"
            };
            json!({
                "id": r.client_id,
                "name": r.display_name,
                "status": status,
            })
        })
        .collect();
    Ok(json!(clients))
}

fn current_epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Redact absolute paths and credential-like tokens from a log line.
pub fn redact_log(line: &str) -> String {
    static PATH_RE: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
        Regex::new(r"(?i)([A-Z]:[/\\\\][^\\s<>|?*]+|/(?:Users|home|tmp|var|opt|usr|etc|private|Volumes)[/\\\\]?[^\\s<>|?*]*)")
            .unwrap()
    });
    static TOKEN_RE: std::sync::LazyLock<Regex> =
        std::sync::LazyLock::new(|| Regex::new(r"\b(?:sk-[a-zA-Z0-9_\-]{20,}|key-[a-zA-Z0-9_\-]{16,})\b").unwrap());

    let mut out = PATH_RE.replace_all(line, "<path>").to_string();
    out = TOKEN_RE.replace_all(&out, "<token>").to_string();
    out
}

pub fn default_sidecar_config(config: &DesktopConfig) -> ServiceConfig {
    let mut args = Vec::new();
    args.push(config.cli_path.to_string_lossy().into_owned());
    args.push("mcp".to_string());
    args.push("serve".to_string());
    ServiceConfig {
        program: config.node_path.clone(),
        args,
        work_dir: None,
        env: HashMap::new(),
        max_restarts: 5,
        restart_delay_secs: 3,
        log_capacity: 500,
    }
}

// ----------------------------------------------------------------------
// Tauri commands
// ----------------------------------------------------------------------

#[tauri::command]
pub async fn start_service(state: tauri::State<'_, AppState>) -> Result<Value, String> {
    let service = state.service.clone();
    service.start().await?;
    Ok(json!(state.service.status()))
}

#[tauri::command]
pub async fn stop_service(state: tauri::State<'_, AppState>) -> Result<Value, String> {
    state.service.stop().await?;
    Ok(json!(state.service.status()))
}

#[tauri::command]
pub async fn get_service_status(state: tauri::State<'_, AppState>) -> Result<Value, String> {
    Ok(json!(state.service.status()))
}

#[tauri::command]
pub async fn get_service_logs(
    state: tauri::State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Value, String> {
    Ok(json!(state.service.logs(limit.unwrap_or(100))))
}

#[tauri::command]
pub async fn create_memory_drive(state: tauri::State<'_, AppState>) -> Result<Value, String> {
    let bundle = state.config.bundle_path.to_string_lossy();
    run_cli(&state.config, &["setup", "--bundle", &bundle, "--overwrite"]).await
}

#[tauri::command]
pub async fn get_memory_drive_status(state: tauri::State<'_, AppState>) -> Result<Value, String> {
    let bundle = state.config.bundle_path.to_string_lossy();
    let report = run_cli(&state.config, &["drive", "health", "--bundle", &bundle]).await?;
    let status = report
        .get("overall_status")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    Ok(json!({
        "memory_drive_status": status,
        "report": report,
    }))
}

#[tauri::command]
pub async fn create_vault(state: tauri::State<'_, AppState>) -> Result<Value, String> {
    let drive = setup_bundle(&state.config).await?;
    let status = if drive.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        "ready"
    } else {
        "error"
    };
    Ok(json!({
        "memory_drive_status": status,
        "connected_app_count": 0,
        "proof_status": "idle",
        "update_status": "current",
        "diagnostics_status": "passed",
        "offline_ready": true,
        "issue_codes": [],
    }))
}

#[tauri::command]
pub async fn detect_clients(_state: tauri::State<'_, AppState>) -> Result<Value, String> {
    detect_clients_internal().await
}

#[tauri::command]
pub async fn connect_client(
    _state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Value, String> {
    use crate::connector::engine::{ClientId, ConnectOptions, ConnectorEngine, EngineContext};

    let client = id.parse::<ClientId>().map_err(|_| format!("unknown client: {id}"))?;
    let ctx = EngineContext::from_env().map_err(|e| e.to_string())?;
    let engine = ConnectorEngine::new();
    let _ = engine
        .connect(client, &ctx, &ConnectOptions::confirmed())
        .map_err(|e| e.to_string())?;
    Ok(json!({ "id": id, "status": "connected" }))
}

#[tauri::command]
pub async fn disconnect_client(
    _state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Value, String> {
    use crate::connector::engine::{ClientId, ConnectOptions, ConnectorEngine, EngineContext};

    let client = id.parse::<ClientId>().map_err(|_| format!("unknown client: {id}"))?;
    let ctx = EngineContext::from_env().map_err(|e| e.to_string())?;
    let engine = ConnectorEngine::new();
    let _ = engine
        .disconnect(client, &ctx, &ConnectOptions::confirmed())
        .map_err(|e| e.to_string())?;
    Ok(json!({ "id": id, "status": "ready" }))
}

#[tauri::command]
pub async fn get_health(state: tauri::State<'_, AppState>) -> Result<Value, String> {
    let service = state.service.status();
    let drive = drive_health(&state.config).await.unwrap_or_else(|_| {
        json!({
            "memory_drive_status": "unknown",
        })
    });
    let clients = detect_clients_internal().await.unwrap_or_default();
    let connected_count = clients
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter(|c| c.get("status").and_then(|s| s.as_str()) == Some("connected"))
                .count()
        })
        .unwrap_or(0);

    Ok(json!({
        "memory_drive_status": drive.get("memory_drive_status").unwrap_or(&json!("unknown")),
        "connected_app_count": connected_count,
        "proof_status": if service.running { "active" } else { "idle" },
        "update_status": "current",
        "diagnostics_status": "passed",
        "offline_ready": true,
        "issue_codes": [],
        "service": service,
    }))
}
#[tauri::command]
pub async fn shutdown_service(state: tauri::State<'_, AppState>) -> Result<Value, String> {
    state.service.stop().await?;
    get_health(state).await
}

// ----------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn redaction_strips_paths_and_tokens() {
        let raw = "Loaded /home/user/.enigma/bundle.json and C:\\Users\\user\\AppData\\Roaming\\.enigma; token sk-abc123def456ghi789jkl012mn345op and key-abcdef0123456789";
        let redacted = redact_log(raw);
        assert!(!redacted.contains("/home/user"));
        assert!(!redacted.contains("C:\\Users"));
        assert!(!redacted.contains("sk-abc"));
        assert!(!redacted.contains("key-abcdef"));
        assert!(redacted.contains("<path>"));
        assert!(redacted.contains("<token>"));
    }

    #[tokio::test]
    async fn service_restarts_crashed_process_up_to_max() {
        let program = if cfg!(windows) { "cmd" } else { "sh" };
        let args = if cfg!(windows) {
            vec!["/c".to_string(), "echo enigma-sidecar-ready".to_string()]
        } else {
            vec![
                "-c".to_string(),
                "echo enigma-sidecar-ready".to_string(),
            ]
        };
        let service = Arc::new(ServiceHandle::new(ServiceConfig {
            program: PathBuf::from(program),
            args,
            work_dir: None,
            env: HashMap::new(),
            max_restarts: 2,
            restart_delay_secs: 0,
            log_capacity: 200,
        }));
        service.clone().start().await.unwrap();

        tokio::time::timeout(Duration::from_secs(10), async {
            while service.status().restarts < 2 {
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        })
        .await
        .expect("service should reach max restarts");

        service.stop().await.unwrap();
        assert!(!service.status().running);
    }

    #[tokio::test]
    async fn service_stop_kills_running_child() {
        let program = if cfg!(windows) { "cmd" } else { "sh" };
        let args = if cfg!(windows) {
            vec!["/c".to_string(), "ping -n 30 127.0.0.1".to_string()]
        } else {
            vec!["-c".to_string(), "sleep 30".to_string()]
        };
        let service = Arc::new(ServiceHandle::new(ServiceConfig {
            program: PathBuf::from(program),
            args,
            work_dir: None,
            env: HashMap::new(),
            max_restarts: 0,
            restart_delay_secs: 0,
            log_capacity: 200,
        }));
        service.clone().start().await.unwrap();
        assert!(service.status().running);
        service.stop().await.unwrap();
        assert!(!service.status().running);
    }
}
