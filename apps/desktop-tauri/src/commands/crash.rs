use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::sync::Once;

/// Coarse crash report containing no PII, wallet data, or memory content.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrashReport {
    pub app_version: String,
    pub os_family: String,
    pub arch: String,
    /// ISO 8601 UTC timestamp; kept coarse to the second.
    pub timestamp: DateTime<Utc>,
    /// First line of the panic message only.
    pub summary: String,
    /// File and line only; no full paths.
    pub location: Option<String>,
    /// Randomly-generated report id used for deduplication/ack.
    pub report_id: String,
}

impl CrashReport {
    pub fn from_panic_parts(summary: &str, location: Option<String>) -> Self {
        let summary = summary
            .lines()
            .next()
            .unwrap_or("unknown panic")
            .chars()
            .take(240)
            .collect();

        Self {
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            os_family: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
            timestamp: Utc::now(),
            summary,
            location,
            report_id: uuid_like_id(),
        }
    }

    /// Convert to a public-safe JSON payload for upload.
    pub fn to_payload(&self) -> Value {
        let summary = self
            .summary
            .lines()
            .next()
            .unwrap_or("unknown panic")
            .chars()
            .take(240)
            .collect::<String>();
        json!({
            "report_id": self.report_id,
            "app_version": self.app_version,
            "os_family": self.os_family,
            "arch": self.arch,
            "timestamp": self.timestamp.to_rfc3339(),
            "summary": summary,
            "location": self.location,
        })
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct CrashReportingConfig {
    pub enabled: bool,
    /// Optional override endpoint. If unset, the default endpoint is used.
    pub endpoint: Option<String>,
}

impl CrashReportingConfig {
    fn path() -> PathBuf {
        crate_dir().join("crash-reporting.json")
    }

    pub fn load() -> Self {
        let path = Self::path();
        if let Ok(bytes) = fs::read(path) {
            serde_json::from_slice(&bytes).unwrap_or_default()
        } else {
            Self::default()
        }
    }

    pub fn save(&self) -> Result<(), String> {
        let path = Self::path();
        fs::create_dir_all(path.parent().expect("crash config parent")).map_err(|e| e.to_string())?;
        fs::write(path, serde_json::to_string_pretty(self).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())
    }
}

fn crash_reports_dir() -> PathBuf {
    crate_dir().join("pending-crash-reports")
}

fn crate_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("enigma-desktop")
}

fn uuid_like_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{:x}-{:x}", ts, rand_u32())
}

fn rand_u32() -> u32 {
    use std::sync::atomic::{AtomicU32, Ordering};
    static COUNTER: AtomicU32 = AtomicU32::new(0);
    COUNTER.fetch_add(1, Ordering::Relaxed).wrapping_add(rand_seed())
}

fn rand_seed() -> u32 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u32
}

fn write_pending_report(report: &CrashReport) -> Result<PathBuf, String> {
    let dir = crash_reports_dir();
    fs::create_dir_all(dir.as_path()).map_err(|e| e.to_string())?;
    let path = dir.join(format!("crash-{}.json", report.report_id));
    fs::write(path.as_path(), serde_json::to_string_pretty(report).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok(path)
}

fn default_endpoint() -> String {
    std::env::var("ENIGMA_CRASH_ENDPOINT")
        .unwrap_or_else(|_| "https://enigmamemory.com/telemetry/crash".to_string())
}

/// Install a global panic hook that writes a redacted crash report to disk.
/// Must be called once before the Tauri app starts.
pub fn init_panic_hook() {
    static HOOK: Once = Once::new();
    HOOK.call_once(|| {
        let default_hook = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            let summary = info
                .payload()
                .downcast_ref::<&str>()
                .copied()
                .or_else(|| info.payload().downcast_ref::<String>().map(String::as_str))
                .unwrap_or("unknown panic");
            let location = info
                .location()
                .map(|loc| format!("{}:{}", loc.file(), loc.line()));
            let report = CrashReport::from_panic_parts(summary, location);
            let _ = write_pending_report(&report);
            default_hook(info);
        }));
    });
}

#[tauri::command]
pub async fn get_crash_reporting_status() -> Result<Value, String> {
    let config = CrashReportingConfig::load();
    let endpoint = config
        .endpoint
        .as_deref()
        .map_or_else(default_endpoint, std::borrow::ToOwned::to_owned);
    Ok(json!({
        "enabled": config.enabled,
        "endpoint": endpoint,
        "pending_count": list_pending_reports().len(),
    }))
}

#[tauri::command]
pub async fn set_crash_reporting_enabled(enabled: bool) -> Result<Value, String> {
    let mut config = CrashReportingConfig::load();
    config.enabled = enabled;
    config.save()?;
    Ok(json!({ "enabled": config.enabled }))
}

/// User-triggered upload of pending crash reports. Only uploads if enabled.
#[tauri::command]
pub async fn submit_pending_crash_reports() -> Result<Value, String> {
    let config = CrashReportingConfig::load();
    if !config.enabled {
        return Ok(json!({ "submitted": 0, "skipped": 0, "reason": "opt-in required" }));
    }

    let endpoint = config.endpoint.unwrap_or_else(default_endpoint);
    let reports = list_pending_reports();
    let mut submitted = 0usize;
    let mut failed = 0usize;

    for path in reports {
        match fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<CrashReport>(&s).ok())
        {
            Some(report) => match upload_report(&endpoint, &report).await {
                Ok(true) => {
                    let _ = fs::remove_file(&path);
                    submitted += 1;
                }
                _ => failed += 1,
            },
            None => {
                let _ = fs::remove_file(&path);
            }
        }
    }

    Ok(json!({
        "submitted": submitted,
        "failed": failed,
        "remaining": list_pending_reports().len(),
    }))
}

fn list_pending_reports() -> Vec<PathBuf> {
    let dir = crash_reports_dir();
    fs::read_dir(dir)
        .ok()
        .map(|iter| {
            iter.filter_map(Result::ok)
                .map(|entry| entry.path())
                .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("json"))
                .collect()
        })
        .unwrap_or_default()
}

async fn upload_report(endpoint: &str, report: &CrashReport) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .post(endpoint)
        .json(&report.to_payload())
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(response.status().is_success())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crash_report_excludes_paths_and_long_messages() {
        let report = CrashReport {
            app_version: "0.1.0".to_string(),
            os_family: "windows".to_string(),
            arch: "x86_64".to_string(),
            timestamp: Utc::now(),
            summary: "first line\n/home/user/secret/path\nraw memory here".to_string(),
            location: Some("src/commands/crash.rs:99".to_string()),
            report_id: "abc".to_string(),
        };
        let payload = report.to_payload();
        let json = payload.to_string();
        assert!(!json.contains("secret"));
        assert!(!json.contains("raw memory"));
        assert!(json.contains("first line"));
    }

    #[test]
    fn config_round_trip() {
        let _dir = tempfile::tempdir().unwrap();
        // Monkey-patch crate_dir by relying on default dirs::data_dir; test only validates serde.
        let cfg = CrashReportingConfig {
            enabled: true,
            endpoint: Some("https://example.com/crash".to_string()),
        };
        let serialized = serde_json::to_string(&cfg).unwrap();
        let deserialized: CrashReportingConfig = serde_json::from_str(&serialized).unwrap();
        assert!(deserialized.enabled);
        assert_eq!(deserialized.endpoint.as_deref().unwrap(), "https://example.com/crash");
    }
}
