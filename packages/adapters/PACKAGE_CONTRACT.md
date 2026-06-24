# Production dependency adapters contract

`@enigma-ai/enigma/adapters` is a pure local evidence-normalization package. It does not provision cloud resources, open sockets, read environment variables, or load secrets.

## Purpose

The package turns operator/provider references into public-safe readiness evidence for:

- `backend_host`
- `dns_tls`
- `durable_storage`
- `kms_or_secret_custody`
- `backup_restore`
- `monitoring`
- `siem_or_log_sink`
- `operator_acceptance`
- `runtime_auth`
- `admin_auth`
- `data_plane_auth`
- `network_access_policy`
- `kms_custody`
- `tenant_policy_approval`
- `usage_metering`
- `service_settlement`
- `monitoring_alerting`
- `public_site_security`
- `security_threat_model`
- `legal_compliance_approval`
- `support_sla`
- `incident_drill`
- `backup_restore_drill`

## Hard boundary

Evidence refs are pointers only: ARNs, dashboard IDs, deployment IDs, URLs without credentials, runbook refs, or restore-test refs. They are not proof by themselves that hosted infrastructure is live.

The package rejects:
- bearer/basic credentials,
- API keys or token-looking strings,
- private-key PEM blocks,
- URLs with embedded username/password,
- password/token/private-key/plaintext/raw-memory/prompt/transcript/completion fields,
- raw-memory-looking values.

## Hosted readiness

`normalizeDependencyEvidence(...)` can show which dependency categories have safe references and which are still missing. `hosted_live_ready` must remain false until runtime `/readyz` probes, dependency-specific checks, operator acceptance, and external-blocker checks also pass.
