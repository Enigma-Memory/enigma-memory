use crate::connector::engine::*;
use serde_json::Value;

pub fn profile(ctx: &EngineContext) -> ClientProfile {
    build_profile(ClientId::ClaudeDesktop, ctx)
}

pub fn detect(engine: &ConnectorEngine, ctx: &EngineContext) -> Result<DetectResult, ConnectorError> {
    engine.detect(ClientId::ClaudeDesktop, ctx)
}

pub fn preview_connect(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &ConnectOptions,
) -> Result<Plan, ConnectorError> {
    engine.preview_connect(ClientId::ClaudeDesktop, ctx, opts)
}

pub fn connect(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &ConnectOptions,
) -> Result<Plan, ConnectorError> {
    engine.connect(ClientId::ClaudeDesktop, ctx, opts)
}

pub fn preview_disconnect(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &ConnectOptions,
) -> Result<Plan, ConnectorError> {
    engine.preview_disconnect(ClientId::ClaudeDesktop, ctx, opts)
}

pub fn disconnect(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &ConnectOptions,
) -> Result<Plan, ConnectorError> {
    engine.disconnect(ClientId::ClaudeDesktop, ctx, opts)
}

pub fn repair(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &ConnectOptions,
) -> Result<RepairResult, ConnectorError> {
    engine.repair(ClientId::ClaudeDesktop, ctx, opts)
}

pub fn rollback(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &RollbackOptions,
) -> Result<Plan, ConnectorError> {
    engine.rollback(ClientId::ClaudeDesktop, ctx, opts)
}

pub fn test(
    engine: &ConnectorEngine,
    ctx: &EngineContext,
    opts: &TestOptions,
) -> Result<TestResult, ConnectorError> {
    engine.test(ClientId::ClaudeDesktop, ctx, opts)
}

pub fn restart_guidance() -> &'static str {
    "Fully quit and reopen Claude Desktop."
}

fn claim_boundary() -> Value {
    serde_json::json!({
        "public_payload_only": true,
        "raw_memory_included": false,
        "raw_prompt_included": false,
        "raw_transcript_included": false,
        "raw_embedding_included": false,
        "private_key_included": false,
        "credential_included": false,
        "local_path_included": false,
        "provider_deletion_claim": false,
        "model_forgetting_claim": false,
        "hosted_saas_ready_claim": false,
        "provider_native_memory_control_claim": false,
        "compliance_certification_claim": false,
        "benchmark_superiority_claim": false,
        "legal_or_patent_conclusion_claim": false,
        "chain_submission_claim": false,
        "tamper_proof_claim": false,
    })
}

pub fn create_claude_desktop_mcpb_manifest(version: &str) -> Value {
    serde_json::json!({
        "ok": true,
        "schema": "enigma.claude_desktop_mcpb_manifest.v1",
        "manifest_version": "0.3",
        "name": "enigma-memory",
        "display_name": "Enigma Memory",
        "version": version,
        "author": { "name": "Enigma Memory" },
        "description": "Claude Desktop extension contract for the local Enigma Memory MCP bridge.",
        "server": {
            "transport": "stdio",
            "command": {
                "name": "enigma-mcp",
                "description": "Starts the Enigma Memory MCP bridge through the Enigma-managed runtime.",
            },
            "args": [],
            "environment_names": ["ENIGMA_BUNDLE"],
            "type": "binary",
            "entry_point": "bin/enigma-mcp",
            "mcp_config": {
                "command": "enigma-mcp",
                "args": [],
                "environment_names": ["ENIGMA_BUNDLE"],
            },
        },
        "environment_names": ["ENIGMA_BUNDLE"],
        "supported_platforms": ["win32", "darwin", "linux"],
        "compatibility": {
            "platforms": ["win32", "darwin", "linux"],
            "runtimes": { "enigma_desktop": "bundled-runtime-required" },
        },
        "required_runtime": {
            "note": "Requires Enigma Desktop bundled runtime or an Enigma-managed MCP bridge; the public manifest does not carry local paths or config bodies.",
        },
        "required_runtime_note": "Requires Enigma Desktop bundled runtime or an Enigma-managed MCP bridge; the public manifest does not carry local paths or config bodies.",
        "claim_boundary": claim_boundary(),
        "public_safety": {
            "public_payload_only": true,
            "raw_config_body_included": false,
            "local_absolute_path_included": false,
            "credential_included": false,
            "token_included": false,
            "signing_secret_included": false,
        },
    })
}

pub fn create_claude_desktop_mcpb_connection_plan(platform: Platform) -> Value {
    serde_json::json!({
        "ok": true,
        "schema": "enigma.claude_desktop_mcpb_connection_plan.v1",
        "client_id": "claude-desktop",
        "display_name": "Claude Desktop",
        "platform": platform.as_str(),
        "preferred_path": "mcpb_extension",
        "writes_performed": false,
        "writesPerformed": false,
        "automatic_config_write": false,
        "default_manual_json_fallback": false,
        "states": [
            { "order": 1, "id": "detect", "write": false },
            { "order": 2, "id": "preview", "write": false },
            { "order": 3, "id": "consent", "write": false },
            { "order": 4, "id": "install_handoff", "write": false },
            { "order": 5, "id": "restart", "write": false },
            { "order": 6, "id": "test", "write": false },
            { "order": 7, "id": "ready", "write": false },
        ],
        "install_handoff": {
            "artifact": ".mcpb",
            "user_confirms_in_claude": true,
            "enigma_writes_claude_config": false,
        },
        "bridge_pairing": {
            "scope": "current_os_user",
            "local_service_required": true,
            "public_payload_only": true,
            "pairing_secret_in_manifest": false,
            "pairing_secret_in_support_export": false,
            "raw_local_service_endpoint_included": false,
        },
        "repair_boundaries": {
            "primary_action_per_state": true,
            "writes_only_after_explicit_consent": true,
            "public_logs_redacted": true,
            "raw_config_body_included": false,
        },
        "disconnect_boundaries": {
            "mcpb_path": "Guide the user to remove or disable the Enigma Memory extension in Claude Desktop.",
            "fallback_path": "Remove only the Enigma MCP server entry after advanced-user consent.",
            "automatic_config_write": false,
        },
        "fallback_boundaries": {
            "manual_json": {
                "available": true,
                "default": false,
                "audience": "advanced",
                "requires_explicit_selection": true,
                "automatic_config_write": false,
            },
        },
        "manual_json_fallback": {
            "available": true,
            "default": false,
            "audience": "advanced",
            "advanced_only": true,
            "requires_explicit_selection": true,
            "automatic_config_write": false,
        },
        "test_boundary": {
            "ready_requires_test_evidence": true,
            "local_checks_only_before_user_test": true,
        },
        "claim_boundary": claim_boundary(),
    })
}

#[derive(Debug, Clone, Default)]
pub struct McpbHealthOptions {
    pub test_evidence: Option<Value>,
    pub mcpb_installed: bool,
    pub restart_required: bool,
    pub testing: bool,
    pub advanced_fallback: bool,
    pub repair_required: bool,
    pub repair_reasons: Vec<String>,
}

fn has_passing_evidence(evidence: &Value) -> bool {
    matches!(evidence.as_bool(), Some(true))
        || matches!(evidence.get("passed").and_then(Value::as_bool), Some(true))
        || matches!(evidence.get("ok").and_then(Value::as_bool), Some(true))
        || matches!(evidence.get("status").and_then(Value::as_str), Some("passed"))
}

fn has_failing_evidence(evidence: &Value) -> bool {
    matches!(evidence.as_bool(), Some(false))
        || matches!(evidence.get("passed").and_then(Value::as_bool), Some(false))
        || matches!(evidence.get("ok").and_then(Value::as_bool), Some(false))
        || matches!(evidence.get("status").and_then(Value::as_str), Some("failed"))
}

pub fn create_claude_desktop_mcpb_health(options: McpbHealthOptions) -> Value {
    let mcpb_installed = options.mcpb_installed;
    let advanced_fallback = options.advanced_fallback;
    let testing = options.testing;
    let restart_required = options.restart_required;
    let repair_required = options.repair_required
        || options
            .test_evidence
            .as_ref()
            .is_some_and(has_failing_evidence);
    let test_passed = options
        .test_evidence
        .as_ref()
        .is_some_and(has_passing_evidence);
    let test_evidence_present = options.test_evidence.is_some();

    let status = if advanced_fallback {
        "advanced_fallback"
    } else if testing {
        "testing"
    } else if repair_required {
        "repair_required"
    } else if !mcpb_installed {
        "not_installed"
    } else if restart_required {
        "restart_required"
    } else if test_passed {
        "ready"
    } else {
        "mcpb_ready"
    };

    let reasons = if status == "repair_required" {
        if options.repair_reasons.is_empty() {
            vec!["test_failed_or_repair_required".to_string()]
        } else {
            options.repair_reasons
        }
    } else {
        Vec::new()
    };

    serde_json::json!({
        "ok": status == "ready",
        "schema": "enigma.claude_desktop_mcpb_health.v1",
        "client_id": "claude-desktop",
        "display_name": "Claude Desktop",
        "status": status,
        "state": status,
        "health_status": status,
        "supported_statuses": [
            "not_installed",
            "mcpb_ready",
            "restart_required",
            "testing",
            "ready",
            "repair_required",
            "advanced_fallback",
        ],
        "installed": mcpb_installed,
        "connected": status == "ready",
        "ready": status == "ready",
        "test_evidence_present": test_evidence_present,
        "test_passed": test_passed,
        "ready_requires_test_evidence": true,
        "repair_reasons": reasons,
        "advanced_fallback": advanced_fallback,
        "automatic_config_write": false,
        "claim_boundary": claim_boundary(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mcpb_health_fails_closed_without_test_evidence() {
        let health = create_claude_desktop_mcpb_health(McpbHealthOptions {
            mcpb_installed: true,
            ..Default::default()
        });
        assert_eq!(health.get("status").unwrap().as_str().unwrap(), "mcpb_ready");
        assert!(!health.get("ready").unwrap().as_bool().unwrap());
    }

    #[test]
    fn mcpb_health_ready_after_passing_test() {
        let health = create_claude_desktop_mcpb_health(McpbHealthOptions {
            mcpb_installed: true,
            test_evidence: Some(Value::Bool(true)),
            ..Default::default()
        });
        assert_eq!(health.get("status").unwrap().as_str().unwrap(), "ready");
        assert!(health.get("ready").unwrap().as_bool().unwrap());
    }

    #[test]
    fn mcpb_health_failed_test_requires_repair() {
        let health = create_claude_desktop_mcpb_health(McpbHealthOptions {
            mcpb_installed: true,
            test_evidence: Some(Value::Bool(false)),
            ..Default::default()
        });
        assert_eq!(
            health.get("status").unwrap().as_str().unwrap(),
            "repair_required"
        );
        assert!(!health.get("ready").unwrap().as_bool().unwrap());
        assert!(!health.get("test_passed").unwrap().as_bool().unwrap());
    }
}
