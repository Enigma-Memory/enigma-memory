use crate::AppState;
use serde_json::{json, Value};
use std::cmp::Ordering;

/// Fetch the signed update manifest and report current/available versions.
/// Auto-download is intentionally not implemented.
#[tauri::command]
pub async fn check_update(state: tauri::State<'_, AppState>) -> Result<Value, String> {
    let current_version = &state.config.version;
    let manifest_url = &state.config.update_manifest_url;

    let manifest = match reqwest::get(manifest_url).await {
        Ok(resp) => match resp.json::<Value>().await {
            Ok(v) => v,
            Err(e) => {
                return Ok(json!({
                    "status": "error",
                    "current_version": current_version,
                    "available_version": current_version,
                    "manifest_url": manifest_url,
                    "signature_present": false,
                    "error": format!("invalid manifest JSON: {e}"),
                }));
            }
        },
        Err(e) => {
            return Ok(json!({
                "status": "offline",
                "current_version": current_version,
                "available_version": current_version,
                "manifest_url": manifest_url,
                "signature_present": false,
                "error": e.to_string(),
            }));
        }
    };

    let available_version = manifest
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or(current_version)
        .to_string();
    let manifest_channel = manifest.get("channel").and_then(|v| v.as_str());

    let signature_present = signed_manifest_signature_present(&manifest);
    let payload_url_present = payload_url_present(&manifest);
    let payload_hash_present = payload_hash_present(&manifest);
    let payload_ready = payload_url_present && payload_hash_present;
    let status = update_status(
        current_version,
        &available_version,
        signature_present,
        payload_ready,
        manifest_channel,
        &state.config.release_channel,
    );
    let requires_signed_manifest = status == "blocked_unsigned";

    Ok(json!({
        "status": status,
        "current_version": current_version,
        "available_version": available_version,
        "manifest_url": manifest_url,
        "signature_present": signature_present,
        "requires_signed_manifest": requires_signed_manifest,
        "manifest_channel": manifest_channel.unwrap_or("unspecified"),
        "expected_channel": state.config.release_channel,
        "payload_url_present": payload_url_present,
        "payload_hash_present": payload_hash_present,
        "notes": manifest.get("notes").and_then(|v| v.as_str()).unwrap_or("")
    }))
}

fn update_status(
    current: &str,
    available: &str,
    signature_present: bool,
    payload_ready: bool,
    manifest_channel: Option<&str>,
    expected_channel: &str,
) -> &'static str {
    if manifest_channel.is_some_and(|channel| channel != expected_channel) {
        return "blocked_channel";
    }
    match compare_versions(current, available) {
        Some(Ordering::Equal) => "current",
        Some(Ordering::Greater) => "blocked_downgrade",
        Some(Ordering::Less) if !signature_present => "blocked_unsigned",
        Some(Ordering::Less) if !payload_ready => "blocked_incomplete",
        Some(Ordering::Less) => "available",
        None => "blocked_version",
    }
}

fn signed_manifest_signature_present(manifest: &Value) -> bool {
    manifest
        .get("signature")
        .and_then(Value::as_str)
        .is_some_and(|signature| !signature.trim().is_empty())
}

fn payload_url_present(manifest: &Value) -> bool {
    manifest_string(manifest, "url", "download_url").is_some_and(is_https_url)
}

fn payload_hash_present(manifest: &Value) -> bool {
    manifest_string(manifest, "sha256", "payload_sha256").is_some_and(is_sha256_hex)
}

fn is_https_url(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.len() > "https://".len() && trimmed.starts_with("https://")
}

fn manifest_string<'a>(manifest: &'a Value, primary: &str, fallback: &str) -> Option<&'a str> {
    manifest
        .get(primary)
        .or_else(|| manifest.get(fallback))
        .and_then(Value::as_str)
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.as_bytes().iter().all(|byte| byte.is_ascii_hexdigit())
}

fn compare_versions(current: &str, available: &str) -> Option<Ordering> {
    let current = parse_version(current)?;
    let available = parse_version(available)?;
    let max = current.len().max(available.len());
    for index in 0..max {
        let lhs = *current.get(index).unwrap_or(&0);
        let rhs = *available.get(index).unwrap_or(&0);
        match lhs.cmp(&rhs) {
            Ordering::Equal => {}
            other => return Some(other),
        }
    }
    Some(Ordering::Equal)
}

fn parse_version(value: &str) -> Option<Vec<u64>> {
    let core = value.split_once('-').map_or(value, |(core, _)| core);
    if core.is_empty() {
        return None;
    }
    core.split('.')
        .map(|part| part.parse::<u64>().ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{
        payload_hash_present, payload_url_present, signed_manifest_signature_present, update_status,
    };

    #[test]
    fn update_status_requires_safe_manifest_progression() {
        assert_eq!(
            "current",
            update_status("0.1.18", "0.1.18", false, false, None, "stable")
        );
        assert_eq!(
            "available",
            update_status("0.1.18", "0.1.19", true, true, Some("stable"), "stable")
        );
        assert_eq!(
            "blocked_unsigned",
            update_status("0.1.18", "0.1.19", false, true, None, "stable")
        );
        assert_eq!(
            "blocked_incomplete",
            update_status("0.1.18", "0.1.19", true, false, None, "stable")
        );
        assert_eq!(
            "blocked_downgrade",
            update_status("0.1.19", "0.1.18", true, true, None, "stable")
        );
        assert_eq!(
            "blocked_channel",
            update_status("0.1.19", "0.1.20", true, true, Some("beta"), "stable")
        );
        assert_eq!(
            "blocked_version",
            update_status("0.1.19", "not-a-version", true, true, None, "stable")
        );
    }

    #[test]
    fn update_manifest_metadata_must_be_public_safe_strings() {
        let complete = serde_json::json!({
            "signature": "signed-manifest",
            "url": "https://downloads.enigmamemory.com/enigma.msi",
            "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        });
        assert!(signed_manifest_signature_present(&complete));
        assert!(payload_url_present(&complete));
        assert!(payload_hash_present(&complete));

        let fallback = serde_json::json!({
            "signature": "signed-manifest",
            "download_url": "https://downloads.enigmamemory.com/enigma.msi",
            "payload_sha256": "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
        });
        assert!(payload_url_present(&fallback));
        assert!(payload_hash_present(&fallback));

        let insecure = serde_json::json!({
            "url": "http://downloads.enigmamemory.com/enigma.msi"
        });
        assert!(!payload_url_present(&insecure));

        let local_file = serde_json::json!({
            "download_url": "file:///tmp/enigma.msi"
        });
        assert!(!payload_url_present(&local_file));

        let malformed = serde_json::json!({
            "signature": "",
            "url": " ",
            "sha256": "not-a-sha256"
        });
        assert!(!signed_manifest_signature_present(&malformed));
        assert!(!payload_url_present(&malformed));
        assert!(!payload_hash_present(&malformed));

        let wrong_types = serde_json::json!({
            "signature": true,
            "url": null,
            "sha256": 42
        });
        assert!(!signed_manifest_signature_present(&wrong_types));
        assert!(!payload_url_present(&wrong_types));
        assert!(!payload_hash_present(&wrong_types));
    }
}
