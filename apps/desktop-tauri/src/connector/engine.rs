use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::fmt;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// Supported AI clients.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ClientId {
    #[serde(rename = "claude-desktop")]
    ClaudeDesktop,
    Cursor,
    #[serde(rename = "kimi-code")]
    Kimi,
    #[serde(rename = "vscode-cline")]
    VscodeCline,
    Roo,
    Opencode,
    #[serde(rename = "generic-mcp")]
    Generic,
}

impl ClientId {
    pub fn as_str(&self) -> &'static str {
        match self {
            ClientId::ClaudeDesktop => "claude-desktop",
            ClientId::Cursor => "cursor",
            ClientId::Kimi => "kimi-code",
            ClientId::VscodeCline => "vscode-cline",
            ClientId::Roo => "roo",
            ClientId::Opencode => "opencode",
            ClientId::Generic => "generic-mcp",
        }
    }

    pub fn all() -> &'static [ClientId] {
        &[
            ClientId::ClaudeDesktop,
            ClientId::Cursor,
            ClientId::Kimi,
            ClientId::VscodeCline,
            ClientId::Roo,
            ClientId::Opencode,
            ClientId::Generic,
        ]
    }
}

impl fmt::Display for ClientId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for ClientId {
    type Err = ConnectorError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "claude-desktop" => Ok(ClientId::ClaudeDesktop),
            "cursor" => Ok(ClientId::Cursor),
            "kimi-code" => Ok(ClientId::Kimi),
            "vscode-cline" => Ok(ClientId::VscodeCline),
            "roo" => Ok(ClientId::Roo),
            "opencode" => Ok(ClientId::Opencode),
            "generic-mcp" => Ok(ClientId::Generic),
            _ => Err(ConnectorError::UnsupportedClient(s.to_string())),
        }
    }
}

/// Supported operating systems.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    #[serde(rename = "win32")]
    Win32,
    #[serde(rename = "darwin")]
    Darwin,
    #[serde(rename = "linux")]
    Linux,
}

impl Platform {
    pub fn as_str(&self) -> &'static str {
        match self {
            Platform::Win32 => "win32",
            Platform::Darwin => "darwin",
            Platform::Linux => "linux",
        }
    }

    pub fn current() -> Result<Self, ConnectorError> {
        match std::env::consts::OS {
            "windows" => Ok(Platform::Win32),
            "macos" => Ok(Platform::Darwin),
            "linux" => Ok(Platform::Linux),
            other => Err(ConnectorError::UnsupportedPlatform(other.to_string())),
        }
    }
}

impl fmt::Display for Platform {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for Platform {
    type Err = ConnectorError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "win32" => Ok(Platform::Win32),
            "darwin" => Ok(Platform::Darwin),
            "linux" => Ok(Platform::Linux),
            _ => Err(ConnectorError::UnsupportedPlatform(s.to_string())),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConnectorError {
    #[error("unsupported connector client: {0}")]
    UnsupportedClient(String),
    #[error("unsupported connector platform: {0}")]
    UnsupportedPlatform(String),
    #[error("config parse error: {0}")]
    ConfigParse(String),
    #[error("config type error: connector config must be a JSON object")]
    ConfigType,
    #[error("write blocked: explicit user consent is required")]
    ConsentRequired,
    #[error("rollback failed: no usable backup found")]
    NoBackup,
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),
    #[error("{0}")]
    Other(String),
}

/// Abstraction over filesystem operations so the engine can be unit-tested
/// without touching real client configs.
pub trait FileSystem: Send + Sync {
    fn exists(&self, path: &Path) -> bool;
    fn read(&self, path: &Path) -> io::Result<Vec<u8>>;
    fn write(&self, path: &Path, data: &[u8]) -> io::Result<()>;
    fn copy(&self, from: &Path, to: &Path) -> io::Result<()>;
    fn rename(&self, from: &Path, to: &Path) -> io::Result<()>;
    fn remove_file(&self, path: &Path) -> io::Result<()>;
    fn create_dir_all(&self, path: &Path) -> io::Result<()>;
}

/// Default filesystem implementation backed by `std::fs`.
pub struct RealFileSystem;

impl FileSystem for RealFileSystem {
    fn exists(&self, path: &Path) -> bool {
        path.exists()
    }

    fn read(&self, path: &Path) -> io::Result<Vec<u8>> {
        std::fs::read(path)
    }

    fn write(&self, path: &Path, data: &[u8]) -> io::Result<()> {
        std::fs::write(path, data)
    }

    fn copy(&self, from: &Path, to: &Path) -> io::Result<()> {
        std::fs::copy(from, to).map(|_| ())
    }

    fn rename(&self, from: &Path, to: &Path) -> io::Result<()> {
        std::fs::rename(from, to)
    }

    fn remove_file(&self, path: &Path) -> io::Result<()> {
        std::fs::remove_file(path)
    }

    fn create_dir_all(&self, path: &Path) -> io::Result<()> {
        std::fs::create_dir_all(path)
    }
}

/// Runtime context used by the connector engine. All path resolution is
/// explicit and platform-aware; no shell commands are spawned.
#[derive(Debug, Clone)]
pub struct EngineContext {
    pub platform: Platform,
    pub home_dir: PathBuf,
    pub app_data_dir: PathBuf,
    pub bundle_path: PathBuf,
    pub mcp_command: String,
    pub server_name: String,
    pub redact_paths: bool,
    pub now: Option<chrono::DateTime<Utc>>,
}

impl EngineContext {
    /// Build a context from the current environment.
    pub fn from_env() -> Result<Self, ConnectorError> {
        let platform = Platform::current()?;
        let home_dir = default_home_dir(&platform)?;
        let app_data_dir = default_app_data_dir(&platform, &home_dir);
        let bundle_path = default_bundle_path(&platform, &home_dir);
        Ok(Self {
            platform,
            home_dir,
            app_data_dir,
            bundle_path,
            mcp_command: "enigma-mcp".to_string(),
            server_name: "enigma".to_string(),
            redact_paths: true,
            now: None,
        })
    }

    /// Build a test context with explicit directories. Public outputs will
    /// still be redacted so raw absolute paths do not leak.
    pub fn test(platform: Platform, home: PathBuf, app_data: PathBuf) -> Self {
        let bundle_path = default_bundle_path(&platform, &home);
        Self {
            platform,
            home_dir: home,
            app_data_dir: app_data,
            bundle_path,
            mcp_command: "enigma-mcp".to_string(),
            server_name: "enigma".to_string(),
            redact_paths: true,
            now: None,
        }
    }

    pub fn with_bundle(mut self, bundle_path: PathBuf) -> Self {
        self.bundle_path = bundle_path;
        self
    }

    pub fn with_redact_paths(mut self, redact: bool) -> Self {
        self.redact_paths = redact;
        self
    }

    pub fn with_now(mut self, now: chrono::DateTime<Utc>) -> Self {
        self.now = Some(now);
        self
    }
}

fn default_home_dir(platform: &Platform) -> Result<PathBuf, ConnectorError> {
    match platform {
        Platform::Win32 => {
            if let Ok(profile) = std::env::var("USERPROFILE") {
                return Ok(PathBuf::from(profile));
            }
            if let (Ok(drive), Ok(path)) = (std::env::var("HOMEDRIVE"), std::env::var("HOMEPATH")) {
                return Ok(PathBuf::from(format!("{}{}", drive, path)));
            }
        }
        Platform::Darwin | Platform::Linux => {
            if let Ok(home) = std::env::var("HOME") {
                return Ok(PathBuf::from(home));
            }
        }
    }
    Err(ConnectorError::Other("Cannot resolve home directory. Pass homeDir or configPath explicitly.".to_string()))
}

fn default_app_data_dir(platform: &Platform, home: &Path) -> PathBuf {
    match platform {
        Platform::Win32 => {
            if let Ok(app_data) = std::env::var("APPDATA") {
                return PathBuf::from(app_data);
            }
            home.join("AppData").join("Roaming")
        }
        Platform::Darwin => home.join("Library").join("Application Support"),
        Platform::Linux => home.join(".config"),
    }
}

fn default_bundle_path(platform: &Platform, home: &Path) -> PathBuf {
    match platform {
        Platform::Win32 => home.join(".enigma").join("bundle.json"),
        Platform::Darwin | Platform::Linux => home.join(".enigma").join("bundle.json"),
    }
}

/// Per-client static metadata.
#[derive(Debug, Clone)]
pub struct ClientProfile {
    pub client_id: ClientId,
    pub display_name: &'static str,
    pub description: &'static str,
    pub default_config_path: PathBuf,
    pub public_config_label: &'static str,
    pub server_container_path: Vec<&'static str>,
    pub server_name: &'static str,
    pub command: &'static str,
    pub restart_guidance: &'static str,
}

/// Options for connect/disconnect/repair operations.
#[derive(Debug, Clone, Default)]
pub struct ConnectOptions {
    pub dry_run: bool,
    pub confirmed: bool,
    pub command_override: Option<String>,
    pub args: Vec<String>,
    pub env: BTreeMap<String, String>,
    pub config_path_override: Option<PathBuf>,
}

impl ConnectOptions {
    pub fn dry_run() -> Self {
        Self {
            dry_run: true,
            ..Default::default()
        }
    }

    pub fn confirmed() -> Self {
        Self {
            confirmed: true,
            ..Default::default()
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct RollbackOptions {
    pub backup_path: Option<PathBuf>,
    pub confirmed: bool,
}

#[derive(Debug, Clone, Default)]
pub struct TestOptions {
    pub require_handshake: bool,
}

#[derive(Debug, Clone)]
pub struct PlannedWrite {
    pub kind: &'static str,
    pub path: String,
    pub content_preview: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Plan {
    pub ok: bool,
    pub action: &'static str,
    pub client_id: String,
    pub config_path: String,
    pub server_name: String,
    pub changed: bool,
    pub dry_run: bool,
    pub writes_performed: bool,
    pub backup_id: Option<String>,
    pub planned_writes: Vec<PlannedWrite>,
    pub config: Value,
    pub generated_json: String,
    pub restart_guidance: &'static str,
    pub raw_backup_path: Option<PathBuf>,
}

impl Plan {
    /// Public-safe preview with raw local paths and the config body redacted.
    pub fn public_preview(&self) -> Value {
        serde_json::json!({
            "ok": self.ok,
            "action": self.action,
            "client_id": self.client_id,
            "config_path": self.config_path,
            "server_name": self.server_name,
            "changed": self.changed,
            "dry_run": self.dry_run,
            "writes_performed": self.writes_performed,
            "backup_id": self.backup_id,
            "planned_writes": self.planned_writes.iter().map(|w| serde_json::json!({
                "kind": w.kind,
                "path": w.path,
                "content_preview": w.content_preview,
            })).collect::<Vec<_>>(),
            "restart_guidance": self.restart_guidance,
            "config_present": !self.config.is_null(),
        })
    }
}

#[derive(Debug, Clone)]
pub struct DetectResult {
    pub ok: bool,
    pub client_id: String,
    pub display_name: &'static str,
    pub platform: Platform,
    pub config_path: String,
    pub exists: bool,
    pub installed: bool,
    pub server_entry_exists: bool,
    pub command_ok: bool,
    pub args_ok: bool,
    pub bundle_env_present: bool,
    pub bundle_env_ok: bool,
    pub env_ok: bool,
    pub action: &'static str,
    pub repair_reasons: Vec<String>,
    pub parse_error: bool,
    pub error: Option<String>,
    pub restart_guidance: &'static str,
}

#[derive(Debug, Clone)]
pub struct TestResult {
    pub ok: bool,
    pub parse_ok: bool,
    pub entry_present: bool,
    pub entry_correct: bool,
    pub bundle_ok: bool,
    pub restart_needed: bool,
    pub details: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct RepairResult {
    pub ok: bool,
    pub action: &'static str,
    pub plan: Option<Plan>,
    pub test: Option<TestResult>,
}

/// The one-click connector engine.
#[derive(Clone)]
pub struct ConnectorEngine {
    fs: Arc<dyn FileSystem>,
}

impl ConnectorEngine {
    pub fn new() -> Self {
        Self {
            fs: Arc::new(RealFileSystem),
        }
    }

    pub fn with_fs(fs: Arc<dyn FileSystem>) -> Self {
        Self { fs }
    }

    pub fn detect_all(&self, ctx: &EngineContext) -> Vec<DetectResult> {
        ClientId::all()
            .iter()
            .filter_map(|id| self.detect(*id, ctx).ok())
            .collect()
    }

    pub fn detect(&self, client: ClientId, ctx: &EngineContext) -> Result<DetectResult, ConnectorError> {
        let profile = build_profile(client, ctx);
        let config_path = resolve_config_path(&profile, ctx, None);
        let public_path = redact_path(&config_path, profile.public_config_label, ctx.redact_paths);

        let base = DetectResult {
            ok: false,
            client_id: client.as_str().to_string(),
            display_name: profile.display_name,
            platform: ctx.platform,
            config_path: public_path,
            exists: false,
            installed: false,
            server_entry_exists: false,
            command_ok: false,
            args_ok: false,
            bundle_env_present: false,
            bundle_env_ok: false,
            env_ok: false,
            action: "missing_client_config",
            repair_reasons: vec!["client_config_missing".to_string()],
            parse_error: false,
            error: None,
            restart_guidance: profile.restart_guidance,
        };

        match read_json_config(&*self.fs, &config_path) {
            Ok((false, _)) => Ok(base),
            Ok((true, Some(config))) => {
                let state = installed_state(&config, &profile, ctx, &ConnectOptions::default());
                let action = recommended_action(true, &state, None);
                let repair_reasons = repair_reasons(true, &state, None);
                Ok(DetectResult {
                    ok: action == "already_configured" || action == "missing_client_config",
                    exists: true,
                    installed: state.installed,
                    server_entry_exists: state.server_entry_exists,
                    command_ok: state.command_ok,
                    args_ok: state.args_ok,
                    bundle_env_present: state.bundle_env_present,
                    bundle_env_ok: state.bundle_env_ok,
                    env_ok: state.env_ok,
                    action,
                    repair_reasons,
                    ..base
                })
            }
            Ok((true, None)) => {
                // Defensive: config existed but parsed to nothing. Treat as empty.
                Ok(base)
            }
            Err(e) => {
                let state = empty_installed_state();
                let action = recommended_action(true, &state, Some(&e));
                let repair_reasons = repair_reasons(true, &state, Some(&e));
                let error = Some(redact_error_message(&e.to_string(), &config_path, ctx));
                Ok(DetectResult {
                    ok: false,
                    exists: true,
                    parse_error: matches!(e, ConnectorError::ConfigParse(_) | ConnectorError::ConfigType),
                    action,
                    repair_reasons,
                    error,
                    ..base
                })
            }
        }
    }

    pub fn preview_connect(
        &self,
        client: ClientId,
        ctx: &EngineContext,
        opts: &ConnectOptions,
    ) -> Result<Plan, ConnectorError> {
        self.build_connect_plan(client, ctx, opts, false)
    }

    pub fn connect(
        &self,
        client: ClientId,
        ctx: &EngineContext,
        opts: &ConnectOptions,
    ) -> Result<Plan, ConnectorError> {
        let plan = self.build_connect_plan(client, ctx, opts, true)?;
        if plan.dry_run || !plan.changed {
            return Ok(plan);
        }
        if !opts.confirmed {
            return Err(ConnectorError::ConsentRequired);
        }
        self.write_plan(&plan, client, ctx, opts)
    }

    pub fn preview_disconnect(
        &self,
        client: ClientId,
        ctx: &EngineContext,
        opts: &ConnectOptions,
    ) -> Result<Plan, ConnectorError> {
        self.build_disconnect_plan(client, ctx, opts, false)
    }

    pub fn disconnect(
        &self,
        client: ClientId,
        ctx: &EngineContext,
        opts: &ConnectOptions,
    ) -> Result<Plan, ConnectorError> {
        let plan = self.build_disconnect_plan(client, ctx, opts, true)?;
        if plan.dry_run || !plan.changed {
            return Ok(plan);
        }
        if !opts.confirmed {
            return Err(ConnectorError::ConsentRequired);
        }
        self.write_plan(&plan, client, ctx, opts)
    }

    pub fn repair(
        &self,
        client: ClientId,
        ctx: &EngineContext,
        opts: &ConnectOptions,
    ) -> Result<RepairResult, ConnectorError> {
        let detection = self.detect(client, ctx)?;

        if detection.parse_error {
            // Malformed config: safest fix is restore the latest Enigma backup.
            let profile = build_profile(client, ctx);
            let config_path = resolve_config_path(&profile, ctx, None);
            let latest = find_latest_backup(&*self.fs, &config_path)?;
            let plan = self.rollback_internal(client, ctx, &RollbackOptions {
                backup_path: Some(latest),
                confirmed: opts.confirmed,
            })?;
            return Ok(RepairResult {
                ok: true,
                action: "rollback",
                plan: Some(plan),
                test: None,
            });
        }

        match detection.action {
            "connect" | "repair" => {
                let plan = self.connect(client, ctx, opts)?;
                Ok(RepairResult {
                    ok: true,
                    action: "connect",
                    plan: Some(plan),
                    test: None,
                })
            }
            "already_configured" => {
                let test = self.test(client, ctx, &TestOptions::default())?;
                Ok(RepairResult {
                    ok: test.ok,
                    action: "test",
                    plan: None,
                    test: Some(test),
                })
            }
            _ => {
                let plan = self.connect(client, ctx, opts)?;
                Ok(RepairResult {
                    ok: true,
                    action: "connect",
                    plan: Some(plan),
                    test: None,
                })
            }
        }
    }

    pub fn rollback(
        &self,
        client: ClientId,
        ctx: &EngineContext,
        opts: &RollbackOptions,
    ) -> Result<Plan, ConnectorError> {
        if !opts.confirmed {
            return Err(ConnectorError::ConsentRequired);
        }
        self.rollback_internal(client, ctx, opts)
    }

    fn rollback_internal(
        &self,
        client: ClientId,
        ctx: &EngineContext,
        opts: &RollbackOptions,
    ) -> Result<Plan, ConnectorError> {
        let profile = build_profile(client, ctx);
        let config_path = resolve_config_path(&profile, ctx, None);
        let backup_path = match &opts.backup_path {
            Some(p) => p.clone(),
            None => find_latest_backup(&*self.fs, &config_path)?,
        };
        if !self.fs.exists(&backup_path) {
            return Err(ConnectorError::NoBackup);
        }
        self.fs.copy(&backup_path, &config_path)?;
        let public_backup = redact_path(&backup_path, "backup", ctx.redact_paths);
        let public_config = redact_path(&config_path, profile.public_config_label, ctx.redact_paths);
        Ok(Plan {
            ok: true,
            action: "rollback",
            client_id: client.as_str().to_string(),
            config_path: public_config,
            server_name: profile.server_name.to_string(),
            changed: true,
            dry_run: false,
            writes_performed: true,
            backup_id: backup_id_from_path(&backup_path),
            planned_writes: vec![PlannedWrite {
                kind: "restore",
                path: public_backup,
                content_preview: None,
            }],
            config: Value::Null,
            generated_json: String::new(),
            restart_guidance: profile.restart_guidance,
            raw_backup_path: Some(backup_path),
        })
    }

    pub fn test(
        &self,
        client: ClientId,
        ctx: &EngineContext,
        _opts: &TestOptions,
    ) -> Result<TestResult, ConnectorError> {
        let profile = build_profile(client, ctx);
        let config_path = resolve_config_path(&profile, ctx, None);
        let mut details = Vec::new();

        let (parse_ok, entry_present, entry_correct, bundle_ok) = match read_json_config(&*self.fs, &config_path) {
            Ok((false, _)) => {
                details.push("Config file does not exist.".to_string());
                (true, false, false, self.fs.exists(&ctx.bundle_path))
            }
            Ok((true, Some(config))) => {
                details.push("Config file parsed successfully.".to_string());
                let state = installed_state(&config, &profile, ctx, &ConnectOptions::default());
                let present = state.server_entry_exists;
                let correct = state.command_ok && state.args_ok && state.env_ok;
                if present {
                    details.push("Enigma MCP server entry is present.".to_string());
                }
                if correct {
                    details.push("Enigma MCP server entry matches expected values.".to_string());
                }
                (
                    true,
                    present,
                    correct,
                    self.fs.exists(&ctx.bundle_path),
                )
            }
            Ok((true, None)) => {
                details.push("Config file is empty.".to_string());
                (true, false, false, self.fs.exists(&ctx.bundle_path))
            }
            Err(e) => {
                details.push(format!("Config parse failed: {}", redact_error_message(&e.to_string(), &config_path, ctx)));
                (false, false, false, self.fs.exists(&ctx.bundle_path))
            }
        };

        if bundle_ok {
            details.push("Local vault bundle is reachable.".to_string());
        } else {
            details.push("Local vault bundle is missing.".to_string());
        }

        let ok = parse_ok && entry_present && entry_correct && bundle_ok;
        Ok(TestResult {
            ok,
            parse_ok,
            entry_present,
            entry_correct,
            bundle_ok,
            restart_needed: false,
            details,
        })
    }

    // ------------------------------------------------------------------
    // Plan builders
    // ------------------------------------------------------------------

    fn build_connect_plan(
        &self,
        client: ClientId,
        ctx: &EngineContext,
        opts: &ConnectOptions,
        allocate_backup: bool,
    ) -> Result<Plan, ConnectorError> {
        let profile = build_profile(client, ctx);
        let config_path = resolve_config_path(&profile, ctx, opts.config_path_override.as_deref());
        let (exists, existing_config) = read_json_config(&*self.fs, &config_path)?;
        let existing = existing_config.unwrap_or_else(|| Value::Object(Map::new()));
        let server_entry = build_server_entry(ctx, opts);
        let next_config = apply_server(&existing, &profile, profile.server_name, &server_entry)?;
        let changed = existing != next_config;
        let dry_run = opts.dry_run;
        let raw_backup_path = if exists && changed && allocate_backup {
            Some(unused_backup_path(&*self.fs, &config_path, ctx)?)
        } else {
            None
        };
        let backup_id = raw_backup_path.as_deref().and_then(backup_id_from_path);
        let planned_writes = build_planned_writes(PlannedWritesInput {
            exists,
            changed,
            dry_run,
            config_path: &config_path,
            next_config: &next_config,
            backup_path: raw_backup_path.as_deref(),
            ctx,
            label: profile.public_config_label,
        });
        let generated_json = format!("{}\n", serde_json::to_string_pretty(&next_config).map_err(|e| ConnectorError::ConfigParse(e.to_string()))?);

        Ok(Plan {
            ok: true,
            action: if changed { "connect" } else { "already_configured" },
            client_id: client.as_str().to_string(),
            config_path: redact_path(&config_path, profile.public_config_label, ctx.redact_paths),
            server_name: profile.server_name.to_string(),
            changed,
            dry_run,
            writes_performed: !dry_run && changed,
            backup_id,
            planned_writes,
            config: next_config,
            generated_json,
            restart_guidance: profile.restart_guidance,
            raw_backup_path,
        })
    }

    fn build_disconnect_plan(
        &self,
        client: ClientId,
        ctx: &EngineContext,
        opts: &ConnectOptions,
        allocate_backup: bool,
    ) -> Result<Plan, ConnectorError> {
        let profile = build_profile(client, ctx);
        let config_path = resolve_config_path(&profile, ctx, opts.config_path_override.as_deref());
        let (exists, existing_config) = read_json_config(&*self.fs, &config_path)?;
        let existing = existing_config.unwrap_or_else(|| Value::Object(Map::new()));
        let next_config = remove_server(&existing, &profile, profile.server_name);
        let changed = existing != next_config;
        let dry_run = opts.dry_run;
        let raw_backup_path = if exists && changed && allocate_backup {
            Some(unused_backup_path(&*self.fs, &config_path, ctx)?)
        } else {
            None
        };
        let backup_id = raw_backup_path.as_deref().and_then(backup_id_from_path);
        let planned_writes = build_planned_writes(PlannedWritesInput {
            exists,
            changed,
            dry_run,
            config_path: &config_path,
            next_config: &next_config,
            backup_path: raw_backup_path.as_deref(),
            ctx,
            label: profile.public_config_label,
        });
        let generated_json = format!("{}\n", serde_json::to_string_pretty(&next_config).map_err(|e| ConnectorError::ConfigParse(e.to_string()))?);

        Ok(Plan {
            ok: true,
            action: if changed { "disconnect" } else { "already_disconnected" },
            client_id: client.as_str().to_string(),
            config_path: redact_path(&config_path, profile.public_config_label, ctx.redact_paths),
            server_name: profile.server_name.to_string(),
            changed,
            dry_run,
            writes_performed: !dry_run && changed,
            backup_id,
            planned_writes,
            config: next_config,
            generated_json,
            restart_guidance: profile.restart_guidance,
            raw_backup_path,
        })
    }

    fn write_plan(
        &self,
        plan: &Plan,
        client: ClientId,
        ctx: &EngineContext,
        opts: &ConnectOptions,
    ) -> Result<Plan, ConnectorError> {
        let profile = build_profile(client, ctx);
        let config_path = resolve_config_path(&profile, ctx, opts.config_path_override.as_deref());
        let raw_backup = plan.raw_backup_path.clone();

        self.fs.create_dir_all(config_path.parent().unwrap_or(Path::new(".")))?;
        let temp_name = format!(
            "{}.tmp.{}.{}.tmp",
            config_path.file_name().unwrap_or_default().to_string_lossy(),
            std::process::id(),
            ctx.now.map(|n| n.timestamp()).unwrap_or(0)
        );
        let temp_path = config_path.with_file_name(temp_name);
        let result = (|| -> Result<(), ConnectorError> {
            self.fs.write(&temp_path, plan.generated_json.as_bytes())?;
            if let Some(backup) = &raw_backup {
                if self.fs.exists(&config_path) {
                    self.fs.copy(&config_path, backup)?;
                }
            }
            self.fs.rename(&temp_path, &config_path)?;
            Ok(())
        })();

        if result.is_err() {
            let _ = self.fs.remove_file(&temp_path);
        }
        result?;

        Ok(Plan {
            writes_performed: true,
            ..plan.clone()
        })
    }
}

impl Default for ConnectorEngine {
    fn default() -> Self {
        Self::new()
    }
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

fn read_json_config(
    fs: &dyn FileSystem,
    path: &Path,
) -> Result<(bool, Option<Value>), ConnectorError> {
    if !fs.exists(path) {
        return Ok((false, None));
    }
    let bytes = fs.read(path)?;
    let text = String::from_utf8(bytes)
        .map_err(|e| ConnectorError::ConfigParse(format!("not valid UTF-8: {}", e)))?;
    let value: Value = serde_json::from_str(&text)
        .map_err(|e| ConnectorError::ConfigParse(e.to_string()))?;
    if !value.is_object() {
        return Err(ConnectorError::ConfigType);
    }
    Ok((true, Some(value)))
}

fn apply_server(
    config: &Value,
    profile: &ClientProfile,
    server_name: &str,
    server_entry: &Value,
) -> Result<Value, ConnectorError> {
    let mut next = config.clone();
    let container =
        ensure_container(&mut next, &profile.server_container_path, true).ok_or(ConnectorError::ConfigType)?;
    container[server_name] = server_entry.clone();
    Ok(next)
}

fn remove_server(config: &Value, profile: &ClientProfile, server_name: &str) -> Value {
    let mut next = config.clone();
    if let Some(container) = ensure_container(&mut next, &profile.server_container_path, false) {
        if let Some(map) = container.as_object_mut() {
            map.remove(server_name);
        }
    }
    next
}

fn ensure_container<'a>(value: &'a mut Value, path: &[&str], create: bool) -> Option<&'a mut Value> {
    let mut cursor = value;
    for segment in path {
        if !cursor.is_object() {
            return None;
        }
        let map = cursor.as_object_mut().unwrap();
        if !map.contains_key(*segment) {
            if !create {
                return None;
            }
            map.insert((*segment).to_string(), Value::Object(Map::new()));
        }
        cursor = map.get_mut(*segment).unwrap();
        if !cursor.is_object() {
            return None;
        }
    }
    Some(cursor)
}

fn build_server_entry(ctx: &EngineContext, opts: &ConnectOptions) -> Value {
    let mut env = Map::new();
    for (k, v) in &opts.env {
        env.insert(k.clone(), Value::String(v.clone()));
    }
    env.insert(
        "ENIGMA_BUNDLE".to_string(),
        Value::String(ctx.bundle_path.to_string_lossy().into_owned()),
    );
    let command = opts
        .command_override
        .clone()
        .unwrap_or_else(|| ctx.mcp_command.clone());
    let args: Vec<Value> = opts.args.iter().map(|a| Value::String(a.clone())).collect();
    serde_json::json!({
        "command": command,
        "args": args,
        "env": env,
    })
}

#[derive(Debug, Clone)]
struct InstalledState {
    installed: bool,
    server_entry_exists: bool,
    command_ok: bool,
    args_ok: bool,
    bundle_env_present: bool,
    bundle_env_ok: bool,
    env_ok: bool,
}

fn empty_installed_state() -> InstalledState {
    InstalledState {
        installed: false,
        server_entry_exists: false,
        command_ok: false,
        args_ok: false,
        bundle_env_present: false,
        bundle_env_ok: false,
        env_ok: false,
    }
}

fn installed_state(
    config: &Value,
    profile: &ClientProfile,
    ctx: &EngineContext,
    opts: &ConnectOptions,
) -> InstalledState {
    let mut config_copy = config.clone();
    let container = ensure_container(&mut config_copy, &profile.server_container_path, false);
    let entry = match container {
        Some(c) => match c.get(profile.server_name) {
            Some(v) if v.is_object() => v.clone(),
            _ => return empty_installed_state(),
        },
        None => return empty_installed_state(),
    };

    let expected = build_server_entry(ctx, opts);
    let actual_command = entry.get("command").and_then(|v| v.as_str()).unwrap_or("");
    let expected_command = expected.get("command").and_then(|v| v.as_str()).unwrap_or("");
    let command_ok = actual_command == expected_command;

    let actual_args: Vec<String> = entry
        .get("args")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().map(|v| v.as_str().unwrap_or("").to_string()).collect())
        .unwrap_or_default();
    let expected_args: Vec<String> = expected
        .get("args")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().map(|v| v.as_str().unwrap_or("").to_string()).collect())
        .unwrap_or_default();
    let args_ok = actual_args == expected_args;

    let actual_env = entry.get("env").cloned().unwrap_or_else(|| Value::Object(Map::new()));
    let expected_env = expected.get("env").cloned().unwrap_or_else(|| Value::Object(Map::new()));
    let actual_bundle = actual_env
        .get("ENIGMA_BUNDLE")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let expected_bundle = expected_env
        .get("ENIGMA_BUNDLE")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let bundle_env_present = !actual_bundle.is_empty();
    let bundle_env_ok = actual_bundle == expected_bundle;
    let env_ok = actual_env == expected_env;

    InstalledState {
        installed: true,
        server_entry_exists: true,
        command_ok,
        args_ok,
        bundle_env_present,
        bundle_env_ok,
        env_ok,
    }
}

fn recommended_action(_exists: bool, state: &InstalledState, error: Option<&ConnectorError>) -> &'static str {
    if error.is_some() {
        return "repair";
    }
    if !state.installed {
        return "connect";
    }
    if state.command_ok && state.args_ok && state.env_ok {
        return "already_configured";
    }
    "repair"
}

fn repair_reasons(exists: bool, state: &InstalledState, error: Option<&ConnectorError>) -> Vec<String> {
    if let Some(e) = error {
        return vec![match e {
            ConnectorError::ConfigParse(_) => "config_json_invalid".to_string(),
            ConnectorError::ConfigType => "config_json_not_object".to_string(),
            _ => "config_unreadable".to_string(),
        }];
    }
    if !exists {
        return vec!["client_config_missing".to_string()];
    }
    if !state.installed {
        return vec!["enigma_server_missing".to_string()];
    }
    let mut reasons = Vec::new();
    if !state.command_ok {
        reasons.push("command_mismatch".to_string());
    }
    if !state.args_ok {
        reasons.push("args_mismatch".to_string());
    }
    if !state.bundle_env_present {
        reasons.push("bundle_env_missing".to_string());
    } else if !state.bundle_env_ok {
        reasons.push("bundle_env_mismatch".to_string());
    } else if !state.env_ok {
        reasons.push("env_mismatch".to_string());
    }
    reasons
}

fn timestamp_suffix(now: chrono::DateTime<Utc>) -> String {
    now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
        .replace([':', '.'], "")
}

fn backup_path_for(config_path: &Path, now: chrono::DateTime<Utc>) -> PathBuf {
    let suffix = timestamp_suffix(now);
    config_path.with_extension(format!(
        "{}.bak.{}",
        config_path.extension().unwrap_or_default().to_string_lossy(),
        suffix
    ))
}

fn unused_backup_path(
    fs: &dyn FileSystem,
    config_path: &Path,
    ctx: &EngineContext,
) -> Result<PathBuf, ConnectorError> {
    let now = ctx.now.unwrap_or_else(Utc::now);
    let base = backup_path_for(config_path, now);
    if !fs.exists(&base) {
        return Ok(base);
    }
    for index in 1..1000 {
        let candidate = config_path.with_extension(format!(
            "{}.bak.{}.{}",
            config_path.extension().unwrap_or_default().to_string_lossy(),
            timestamp_suffix(now),
            index
        ));
        if !fs.exists(&candidate) {
            return Ok(candidate);
        }
    }
    Err(ConnectorError::Other(
        "Cannot allocate a unique backup path".to_string(),
    ))
}

fn backup_id_from_path(path: &Path) -> Option<String> {
    path.file_stem()
        .and_then(|s| s.to_str().map(|s| s.to_string()))
}

fn find_latest_backup(
    _fs: &dyn FileSystem,
    config_path: &Path,
) -> Result<PathBuf, ConnectorError> {
    let parent = config_path.parent().unwrap_or(Path::new("."));
    let file_name = config_path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let prefix = format!("{}.bak.", file_name);

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(parent) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with(&prefix) {
                candidates.push(entry.path());
            }
        }
    }
    candidates.sort();
    candidates.last().cloned().ok_or(ConnectorError::NoBackup)
}

struct PlannedWritesInput<'a> {
    exists: bool,
    changed: bool,
    dry_run: bool,
    config_path: &'a Path,
    next_config: &'a Value,
    backup_path: Option<&'a Path>,
    ctx: &'a EngineContext,
    label: &'a str,
}

fn build_planned_writes(input: PlannedWritesInput<'_>) -> Vec<PlannedWrite> {
    if input.dry_run || !input.changed {
        return Vec::new();
    }
    let mut writes = Vec::with_capacity(2);
    if let (true, Some(bp)) = (input.exists, input.backup_path) {
        writes.push(PlannedWrite {
            kind: "backup",
            path: redact_path(bp, "backup", input.ctx.redact_paths),
            content_preview: None,
        });
    }
    let preview = input
        .next_config
        .get("mcpServers")
        .and_then(|s| s.get("enigma"))
        .map(|_| "Enigma MCP server entry".to_string());
    writes.push(PlannedWrite {
        kind: "write",
        path: redact_path(input.config_path, input.label, input.ctx.redact_paths),
        content_preview: preview,
    });
    writes
}

fn redact_path(path: &Path, label: &str, redact: bool) -> String {
    if redact {
        format!("[redacted:{}]", label)
    } else {
        path.to_string_lossy().into_owned()
    }
}

fn redact_error_message(message: &str, config_path: &Path, ctx: &EngineContext) -> String {
    if !ctx.redact_paths {
        return message.to_string();
    }
    let candidates: Vec<String> = [
        config_path.to_string_lossy().into_owned(),
        ctx.home_dir.to_string_lossy().into_owned(),
        ctx.app_data_dir.to_string_lossy().into_owned(),
        ctx.bundle_path.to_string_lossy().into_owned(),
    ]
    .into_iter()
    .filter(|s| !s.is_empty())
    .collect();
    let mut redacted = message.to_string();
    for candidate in candidates {
        redacted = redacted.replace(&candidate, "[redacted:path]");
    }
    redacted.replace("[redacted:path]", "[redacted:config_path]")
}

fn resolve_config_path(
    profile: &ClientProfile,
    _ctx: &EngineContext,
    override_path: Option<&Path>,
) -> PathBuf {
    override_path
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| profile.default_config_path.clone())
}

pub fn build_profile(client: ClientId, ctx: &EngineContext) -> ClientProfile {
    match client {
        ClientId::ClaudeDesktop => ClientProfile {
            client_id: ClientId::ClaudeDesktop,
            display_name: "Claude Desktop",
            description: "Anthropic Claude Desktop MCP server configuration.",
            default_config_path: resolve_default_config_path(
                client,
                ctx.platform,
                &ctx.home_dir,
                &ctx.app_data_dir,
            ),
            public_config_label: "Claude Desktop config",
            server_container_path: vec!["mcpServers"],
            server_name: "enigma",
            command: "enigma-mcp",
            restart_guidance: "Fully quit and reopen Claude Desktop.",
        },
        ClientId::Cursor => ClientProfile {
            client_id: ClientId::Cursor,
            display_name: "Cursor",
            description: "Cursor global MCP configuration.",
            default_config_path: resolve_default_config_path(
                client,
                ctx.platform,
                &ctx.home_dir,
                &ctx.app_data_dir,
            ),
            public_config_label: "Cursor MCP config",
            server_container_path: vec!["mcpServers"],
            server_name: "enigma",
            command: "enigma-mcp",
            restart_guidance: "Reload or restart Cursor.",
        },
        ClientId::Kimi => ClientProfile {
            client_id: ClientId::Kimi,
            display_name: "Kimi Code",
            description: "Kimi Code MCP configuration.",
            default_config_path: resolve_default_config_path(
                client,
                ctx.platform,
                &ctx.home_dir,
                &ctx.app_data_dir,
            ),
            public_config_label: "Kimi Code MCP config",
            server_container_path: vec!["mcpServers"],
            server_name: "enigma",
            command: "enigma-mcp",
            restart_guidance: "Restart Kimi Code.",
        },
        ClientId::VscodeCline => ClientProfile {
            client_id: ClientId::VscodeCline,
            display_name: "VS Code Cline",
            description: "Cline extension MCP settings for VS Code.",
            default_config_path: resolve_default_config_path(
                client,
                ctx.platform,
                &ctx.home_dir,
                &ctx.app_data_dir,
            ),
            public_config_label: "VS Code/Cline MCP config",
            server_container_path: vec!["mcpServers"],
            server_name: "enigma",
            command: "enigma-mcp",
            restart_guidance: "Reload the VS Code window.",
        },
        ClientId::Roo => ClientProfile {
            client_id: ClientId::Roo,
            display_name: "Roo Code",
            description: "Roo Code extension MCP settings for VS Code.",
            default_config_path: resolve_default_config_path(
                client,
                ctx.platform,
                &ctx.home_dir,
                &ctx.app_data_dir,
            ),
            public_config_label: "Roo MCP config",
            server_container_path: vec!["mcpServers"],
            server_name: "enigma",
            command: "enigma-mcp",
            restart_guidance: "Reload or restart the Roo host.",
        },
        ClientId::Opencode => ClientProfile {
            client_id: ClientId::Opencode,
            display_name: "OpenCode",
            description: "OpenCode local MCP configuration.",
            default_config_path: resolve_default_config_path(
                client,
                ctx.platform,
                &ctx.home_dir,
                &ctx.app_data_dir,
            ),
            public_config_label: "OpenCode config",
            server_container_path: vec!["mcpServers"],
            server_name: "enigma",
            command: "enigma-mcp",
            restart_guidance: "Restart or reload MCP servers in OpenCode.",
        },
        ClientId::Generic => ClientProfile {
            client_id: ClientId::Generic,
            display_name: "Generic MCP Client",
            description: "Portable MCP config using the standard mcpServers object.",
            default_config_path: resolve_default_config_path(
                client,
                ctx.platform,
                &ctx.home_dir,
                &ctx.app_data_dir,
            ),
            public_config_label: "Selected MCP config",
            server_container_path: vec!["mcpServers"],
            server_name: "enigma",
            command: "enigma-mcp",
            restart_guidance: "Restart or reload the chosen MCP client.",
        },
    }
}

pub fn resolve_default_config_path(
    client: ClientId,
    platform: Platform,
    home: &Path,
    app_data: &Path,
) -> PathBuf {
    match client {
        ClientId::ClaudeDesktop => match platform {
            Platform::Win32 => app_data.join("Claude").join("claude_desktop_config.json"),
            Platform::Darwin => home
                .join("Library")
                .join("Application Support")
                .join("Claude")
                .join("claude_desktop_config.json"),
            Platform::Linux => home.join(".config").join("Claude").join("claude_desktop_config.json"),
        },
        ClientId::Cursor => match platform {
            Platform::Win32 => home.join(".cursor").join("mcp.json"),
            Platform::Darwin | Platform::Linux => home.join(".cursor").join("mcp.json"),
        },
        ClientId::Kimi => match platform {
            Platform::Win32 => app_data.join("Kimi Code").join("mcp.json"),
            Platform::Darwin => home
                .join("Library")
                .join("Application Support")
                .join("Kimi Code")
                .join("mcp.json"),
            Platform::Linux => home.join(".config").join("kimi-code").join("mcp.json"),
        },
        ClientId::VscodeCline => {
            let base = match platform {
                Platform::Win32 => app_data.to_path_buf(),
                Platform::Darwin => home.join("Library").join("Application Support"),
                Platform::Linux => home.join(".config"),
            };
            base.join("Code")
                .join("User")
                .join("globalStorage")
                .join("saoudrizwan.claude-dev")
                .join("settings")
                .join("cline_mcp_settings.json")
        }
        ClientId::Roo => {
            let base = match platform {
                Platform::Win32 => app_data.to_path_buf(),
                Platform::Darwin => home.join("Library").join("Application Support"),
                Platform::Linux => home.join(".config"),
            };
            base.join("Code")
                .join("User")
                .join("globalStorage")
                .join("rooveterinaryinc.roo-cline")
                .join("settings")
                .join("mcp_settings.json")
        }
        ClientId::Opencode => match platform {
            Platform::Win32 => app_data.join("opencode").join("opencode.json"),
            Platform::Darwin => home
                .join("Library")
                .join("Application Support")
                .join("opencode")
                .join("opencode.json"),
            Platform::Linux => home.join(".config").join("opencode").join("opencode.json"),
        },
        ClientId::Generic => match platform {
            Platform::Win32 => app_data.join("Enigma").join("mcp.json"),
            Platform::Darwin => home
                .join("Library")
                .join("Application Support")
                .join("Enigma")
                .join("mcp.json"),
            Platform::Linux => home.join(".config").join("enigma").join("mcp.json"),
        },
    }
}

// ----------------------------------------------------------------------
// Unit tests
// ----------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn linux_ctx(dir: &TempDir) -> EngineContext {
        let home = dir.path().join("home");
        let app_data = home.join(".config");
        fs::create_dir_all(&app_data).unwrap();
        let bundle = home.join(".enigma").join("bundle.json");
        fs::create_dir_all(bundle.parent().unwrap()).unwrap();
        fs::write(&bundle, "{}").unwrap();
        EngineContext::test(Platform::Linux, home, app_data)
    }

    fn cursor_config_path(ctx: &EngineContext) -> PathBuf {
        ctx.home_dir.join(".cursor").join("mcp.json")
    }

    #[test]
    fn config_path_resolution_is_os_aware() {
        let home = PathBuf::from("/home/alice");
        let app_data = PathBuf::from("/home/alice/.config");
        assert_eq!(
            resolve_default_config_path(ClientId::ClaudeDesktop, Platform::Linux, &home, &app_data),
            PathBuf::from("/home/alice/.config/Claude/claude_desktop_config.json")
        );
        assert_eq!(
            resolve_default_config_path(ClientId::Cursor, Platform::Win32, &PathBuf::from("C:\\Users\\Alice"), &PathBuf::from("C:\\Users\\Alice\\AppData\\Roaming")),
            PathBuf::from("C:\\Users\\Alice\\.cursor\\mcp.json")
        );
    }

    #[test]
    fn detect_missing_client_config() {
        let dir = TempDir::new().unwrap();
        let ctx = linux_ctx(&dir);
        let engine = ConnectorEngine::new();
        let result = engine.detect(ClientId::Cursor, &ctx).unwrap();
        assert_eq!(result.client_id, "cursor");
        assert!(!result.exists);
        assert_eq!(result.action, "missing_client_config");
        assert!(result.config_path.contains("[redacted:"));
    }

    #[test]
    fn preview_connect_adds_enigma_entry_preserving_siblings() {
        let dir = TempDir::new().unwrap();
        let ctx = linux_ctx(&dir);
        let path = cursor_config_path(&ctx);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            &path,
            r#"{"mcpServers":{"other":{"command":"other-cmd","args":[]}},"unrelated":true}"#,
        )
        .unwrap();

        let engine = ConnectorEngine::new();
        let plan = engine.preview_connect(ClientId::Cursor, &ctx, &ConnectOptions::dry_run()).unwrap();
        assert!(plan.changed);
        assert_eq!(plan.action, "connect");
        let servers = plan.config.get("mcpServers").unwrap();
        assert!(servers.get("other").is_some());
        assert!(servers.get("enigma").is_some());
        assert_eq!(plan.config.get("unrelated").unwrap(), &Value::Bool(true));
        // Public preview must not contain the raw home path or raw bundle path.
        let public = plan.public_preview();
        let public_json = serde_json::to_string(&public).unwrap();
        assert!(!public_json.contains(dir.path().to_str().unwrap()));
        assert!(!public_json.contains(ctx.bundle_path.to_str().unwrap()));
        assert_eq!(public.get("config_present").unwrap(), &Value::Bool(true));
    }

    #[test]
    fn connect_idempotent_when_equivalent_entry_exists() {
        let dir = TempDir::new().unwrap();
        let ctx = linux_ctx(&dir);
        let path = cursor_config_path(&ctx);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let engine = ConnectorEngine::new();
        engine
            .connect(ClientId::Cursor, &ctx, &ConnectOptions::confirmed())
            .unwrap();

        let plan = engine.preview_connect(ClientId::Cursor, &ctx, &ConnectOptions::dry_run()).unwrap();
        assert!(!plan.changed);
        assert_eq!(plan.action, "already_configured");
    }

    #[test]
    fn connect_creates_timestamped_backup_and_rollback_restores() {
        let dir = TempDir::new().unwrap();
        let ctx = linux_ctx(&dir);
        let path = cursor_config_path(&ctx);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let original = r#"{"mcpServers":{"other":{"command":"other-cmd","args":[]}},"unrelated":true}"#;
        fs::write(&path, original).unwrap();

        let engine = ConnectorEngine::new();
        let plan = engine
            .connect(ClientId::Cursor, &ctx, &ConnectOptions::confirmed())
            .unwrap();
        assert!(plan.changed);
        assert!(plan.backup_id.is_some());
        assert!(plan.raw_backup_path.as_ref().unwrap().exists());

        let restored = engine
            .rollback(
                ClientId::Cursor,
                &ctx,
                &RollbackOptions {
                    backup_path: plan.raw_backup_path,
                    confirmed: true,
                },
            )
            .unwrap();
        assert!(restored.writes_performed);
        let content = fs::read_to_string(&path).unwrap();
        assert_eq!(content, original);
    }

    #[test]
    fn disconnect_removes_only_enigma_entry() {
        let dir = TempDir::new().unwrap();
        let ctx = linux_ctx(&dir);
        let path = cursor_config_path(&ctx);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            &path,
            r#"{"mcpServers":{"enigma":{"command":"enigma-mcp","args":[],"env":{"ENIGMA_BUNDLE":"/tmp/bundle.json"}},"other":{"command":"x"}},"keep":1}"#,
        )
        .unwrap();

        let engine = ConnectorEngine::new();
        let plan = engine
            .disconnect(ClientId::Cursor, &ctx, &ConnectOptions::confirmed())
            .unwrap();
        assert!(plan.changed);
        let content: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert!(content.get("mcpServers").unwrap().get("enigma").is_none());
        assert!(content.get("mcpServers").unwrap().get("other").is_some());
        assert_eq!(content.get("keep").unwrap(), &Value::Number(1.into()));
    }

    #[test]
    fn malformed_config_blocks_write() {
        let dir = TempDir::new().unwrap();
        let ctx = linux_ctx(&dir);
        let path = cursor_config_path(&ctx);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "not json").unwrap();

        let engine = ConnectorEngine::new();
        let result = engine.connect(ClientId::Cursor, &ctx, &ConnectOptions::confirmed());
        assert!(result.is_err());
        let detection = engine.detect(ClientId::Cursor, &ctx).unwrap();
        assert!(detection.parse_error);
        assert_eq!(detection.action, "repair");
    }

    #[test]
    fn mcpb_manifest_has_no_local_paths() {
        let manifest = crate::connector::claude::create_claude_desktop_mcpb_manifest("1.2.3");
        let s = serde_json::to_string(&manifest).unwrap();
        assert!(s.contains("enigma-memory"));
        assert!(s.contains("1.2.3"));
        assert!(!s.contains("C:\\"));
        assert!(!s.contains("/home/"));
        assert!(!s.contains("/Users/"));
        assert_eq!(manifest.get("public_safety").unwrap().get("local_absolute_path_included").unwrap().as_bool(), Some(false));
    }
}
