use crate::commands::run_cli;
use crate::AppState;
use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Keys that must never appear in a public diagnostics bundle.
const FORBIDDEN_KEYS: &[&str] = &[
    "private_key",
    "secret",
    "password",
    "passphrase",
    "mnemonic",
    "token",
    "api_key",
    "raw_memory",
    "plaintext",
    "bundle_path",
    "home_dir",
    "config_path",
];

#[derive(Debug, Serialize, Deserialize)]
pub struct DiagnosticsBundle {
    pub schema: &'static str,
    pub generated_at: String,
    pub app_version: String,
    pub service_running: bool,
    pub service_restarts: usize,
    pub memory_drive_status: String,
    pub update_status: String,
    pub issue_codes: Vec<String>,
}

/// Collect public-safe health metadata for preview.
#[tauri::command]
pub async fn get_diagnostics(state: tauri::State<'_, AppState>) -> Result<Value, String> {
    let bundle = build_bundle(&state).await?;
    Ok(json!({
        "status": if bundle.memory_drive_status == "healthy" || bundle.memory_drive_status == "ok" {
            "passed"
        } else {
            "warning"
        },
        "summary": format!(
            "Memory drive {}. Engine service running={}.",
            bundle.memory_drive_status, bundle.service_running
        ),
        "issue_codes": bundle.issue_codes,
        "metadata": bundle,
    }))
}

/// Export a redacted diagnostics JSON file only after explicit approval.
#[tauri::command]
pub async fn export_diagnostics(
    state: tauri::State<'_, AppState>,
    approve: bool,
    path: Option<String>,
) -> Result<Value, String> {
    if !approve {
        return Err("User approval is required before exporting diagnostics.".to_string());
    }

    let bundle = build_bundle(&state).await?;
    let forbidden = find_forbidden_keys(&json!(bundle));
    if !forbidden.is_empty() {
        return Err(format!(
            "Diagnostics bundle contains forbidden fields: {}",
            forbidden.join(", ")
        ));
    }

    let out_path = match path {
        Some(p) => PathBuf::from(p),
        None => {
            let file_name = format!(
                "enigma-diagnostics-{}.json",
                Utc::now().format("%Y%m%dT%H%M%SZ")
            );
            state
                .config
                .bundle_path
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(std::env::temp_dir)
                .join(file_name)
        }
    };

    if let Some(parent) = out_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("failed to create output directory: {e}"))?;
    }

    let redacted = redact_paths(&json!(bundle));
    let payload = serde_json::to_string_pretty(&redacted).map_err(|e| e.to_string())?;
    tokio::fs::write(out_path.as_path(), payload)
        .await
        .map_err(|e| format!("failed to write diagnostics file: {e}"))?;

    Ok(json!({
        "exported": true,
        "path": redact_path(out_path.to_string_lossy().as_ref()),
    }))
}

async fn build_bundle(state: &AppState) -> Result<DiagnosticsBundle, String> {
    let bundle_path = state.config.bundle_path.to_string_lossy();
    let drive = run_cli(&state.config,
        &["drive", "health", "--bundle", &bundle_path],
    )
    .await
    .unwrap_or_else(|_| {
        json!({
            "overall_status": "unknown",
        })
    });
    let drive_status = drive
        .get("overall_status")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let service = state.service.status();

    Ok(DiagnosticsBundle {
        schema: "enigma.diagnostics.v1",
        generated_at: Utc::now().to_rfc3339(),
        app_version: state.config.version.clone(),
        service_running: service.running,
        service_restarts: service.restarts,
        memory_drive_status: drive_status,
        update_status: "current".to_string(),
        issue_codes: Vec::new(),
    })
}

fn find_forbidden_keys(value: &Value) -> Vec<String> {
    let forbidden: HashSet<&str> = FORBIDDEN_KEYS.iter().copied().collect();
    let mut found = Vec::new();
    collect_forbidden_keys(value, &forbidden, &mut found);
    found.sort();
    found.dedup();
    found
}

fn collect_forbidden_keys(value: &Value, forbidden: &HashSet<&str>, out: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            for (k, v) in map {
                if forbidden.contains(k.as_str()) {
                    out.push(k.clone());
                }
                collect_forbidden_keys(v, forbidden, out);
            }
        }
        Value::Array(arr) => {
            for v in arr {
                collect_forbidden_keys(v, forbidden, out);
            }
        }
        _ => {}
    }
}

fn redact_paths(value: &Value) -> Value {
    match value {
        Value::String(s) => Value::String(redact_path(s)),
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (k, v) in map {
                out.insert(k.clone(), redact_paths(v));
            }
            Value::Object(out)
        }
        Value::Array(arr) => Value::Array(arr.iter().map(redact_paths).collect()),
        other => other.clone(),
    }
}

fn redact_path(s: &str) -> String {
    path_regex().replace_all(s, "<redacted-path>").to_string()
}

fn path_regex() -> &'static Regex {
    static PATH_RE: OnceLock<Regex> = OnceLock::new();
    PATH_RE.get_or_init(|| {
        Regex::new(r"(?i)([A-Z]:[/\\\\][^\\s<>|?*]+|/(?:Users|home|tmp|var|opt|usr|etc|private|Volumes)[/\\\\]?[^\\s<>|?*]*)")
            .expect("diagnostics path redaction regex must compile")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forbidden_keys_are_rejected() {
        let value = json!({
            "ok": true,
            "secret": "should-not-appear",
            "nested": { "api_key": "xxx" },
        });
        let found = find_forbidden_keys(&value);
        assert!(found.contains(&"secret".to_string()));
        assert!(found.contains(&"api_key".to_string()));
    }

    #[test]
    fn path_redaction_works() {
        let raw = "bundle at /home/user/.enigma/bundle.json on C:\\Users\\u\\.enigma";
        let redacted = redact_path(raw);
        assert!(!redacted.contains("/home/user"));
        assert!(!redacted.contains("C:\\Users"));
        assert!(redacted.contains("<redacted-path>"));
    }

    #[test]
    fn redact_paths_recursive() {
        let value = json!({
            "status": "ok",
            "paths": ["/home/user/.enigma/bundle.json"],
        });
        let redacted = redact_paths(&value);
        let arr = redacted["paths"].as_array().unwrap();
        assert!(arr[0].as_str().unwrap().contains("<redacted-path>"));
    }
}
