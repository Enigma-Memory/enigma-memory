pub mod crash;
pub mod diagnostics;
pub mod service;
pub mod update;

use crate::DesktopConfig;
use serde_json::Value;
use std::process::Stdio;

/// Run the Enigma CLI with the given arguments and parse its stdout as JSON.
pub(crate) async fn run_cli(config: &DesktopConfig, args: &[&str]) -> Result<Value, String> {
    let mut cmd = tokio::process::Command::new(&config.node_path);
    cmd.arg(&config.cli_path)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("failed to spawn CLI: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "CLI exited with status {:?}: {stderr}",
            output.status.code()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout).map_err(|e| format!("CLI returned invalid JSON: {e}\n{stdout}"))
}
