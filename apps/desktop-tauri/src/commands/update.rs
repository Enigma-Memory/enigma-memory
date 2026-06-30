use crate::AppState;
use serde_json::{json, Value};

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

    let signature_present = manifest.get("signature").is_some();
    let status = update_status(current_version, &available_version, signature_present);
    let requires_signed_manifest = available_version != *current_version && !signature_present;

    Ok(json!({
        "status": status,
        "current_version": current_version,
        "available_version": available_version,
        "manifest_url": manifest_url,
        "signature_present": signature_present,
        "requires_signed_manifest": requires_signed_manifest,
        "notes": manifest.get("notes").and_then(|v| v.as_str()).unwrap_or("")
    }))
}

fn update_status(current: &str, available: &str, signature_present: bool) -> &'static str {
    if available == current {
        "current"
    } else if signature_present {
        "available"
    } else {
        "blocked_unsigned"
    }
}

#[cfg(test)]
mod tests {
    use super::update_status;

    #[test]
    fn update_status_requires_signed_newer_manifest() {
        assert_eq!("current", update_status("0.1.18", "0.1.18", false));
        assert_eq!("available", update_status("0.1.18", "0.1.19", true));
        assert_eq!("blocked_unsigned", update_status("0.1.18", "0.1.19", false));
    }
}
