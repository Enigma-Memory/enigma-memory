# Enigma production backend architecture

This document describes the production-shaped relay and gateway backend surface. It is a deployment reference, not a launch claim: static Cloudflare Pages/GitHub collateral can be live as the public surface, while the relay/gateway production backend remains blocked until an operator wires real dependencies and records acceptance evidence.

## Runtime services

- Relay service (`enigma-relay`, default port `8787`) accepts opaque encrypted relay records, pairing flows, and witness checkpoints. It must not receive plaintext prompts, transcripts, memory bodies, credentials, or raw provider data.
- Gateway service (`enigma-gateway`, default port `8797`) evaluates Enigma enterprise policy and returns minimized decisions/SIEM events. It does not call model providers and does not prove provider deletion or model forgetting.
- In production mode both services are expected to fail closed unless required external dependencies are configured through operator-owned environment files, secret managers, and network policies.

`enigma-memory/storage` defines the production PostgreSQL storage contract used by operators before wiring a real database: relay records, witness checkpoints, pairings, gateway policy versions, gateway decisions, SIEM events, and readiness evidence refs. The schema is intentionally hash/opaque-ref based and excludes raw prompts, transcripts, decrypted memory, provider response bodies, embeddings, tokens, passwords, and private keys.

## Public probes and private service paths

Only the exact operational probes belong on public ingress:

- `GET /livez` means the process is alive and can answer a minimal local health request.
- `GET /readyz` means the process is ready for production traffic: backend host and DNS/TLS references are present, runtime/auth evidence is configured, storage is reachable, signing/KMS material is available, SIEM export is configured where required, backup target configuration is present, monitoring/alerting is declared, network-access, KMS-custody, tenant-policy, usage-metering, service-settlement, public-site-security, security-threat-model, legal/compliance, support/SLA, incident-drill, backup/restore-drill, and operator-acceptance refs are present, and public-safe `evidence_refs` contain references rather than secrets.

Relay data-plane service paths are private/admin routes unless an operator explicitly places them behind authenticated internal access:

- `POST /relay/push`
- `GET /relay/pull?id=...`
- `POST /witness/checkpoint`
- `GET /witness/log`
- `POST /pairing/challenge`
- `POST /pairing/complete`

Gateway policy, decision, and SIEM paths are private/admin/data-plane service routes:

- `GET /policy`
- `PUT /policy`
- `POST /gateway/evaluate`
- `POST /gateway/decision`
- `GET /siem/export`

In production-like mode the gateway enforces a second boundary in code: private/admin routes require a Bearer token whose SHA-256 hash matches `ENIGMA_GATEWAY_ADMIN_AUTH_BEARER_SHA256`; data-plane decision/evaluation routes require a Bearer token whose SHA-256 hash matches `ENIGMA_GATEWAY_DATA_PLANE_AUTH_BEARER_SHA256`. The bearer values themselves stay outside readiness JSON, manifests, docs, repo files, and logs. Missing hash configuration returns `503`; missing credentials return `401`; mismatched credentials return `403`.

Existing local/demo flows may expose `/health`; production public ingress and live-readiness manifests intentionally use `/livez` and `/readyz` so traffic stays blocked until production readiness semantics are implemented or explicitly mapped by the operator.

The Kubernetes example separates public health-probe ingress (`relay.example.invalid`, `gateway.example.invalid`) from private admin/data-plane ingress (`admin.example.invalid`). Operators must replace those placeholders with controlled hosts, TLS, auth, WAF/rate-limit policy, and private admin access rules.

## Required external blockers

The example manifests and Compose file contain no secret literal values. They reference operator-provided secret files or Kubernetes secret keys only. A production backend is blocked until all of the following are real and verified:

- durable external storage for relay state, witness logs, gateway policy, and SIEM export state;
- KMS-backed signing key custody or equivalent hardened key management for relay and gateway signing material;
- SIEM/export destination with plaintext-minimization checks and retention controls;
- backup target, restore procedure, and scheduled backup evidence;
- monitoring, alerting, dashboards, and incident-response ownership;
- ingress/TLS, rate limiting, admin access control, network-policy allow-lists, and validated `enigma.network_access_policy.v1` evidence;
- operator acceptance packet showing dependency checks, readiness behavior, KMS custody, tenant policy approval, usage metering, service settlement, public site security, security threat model review, monitoring/alerting, legal/compliance approval, support SLA, incident drill, restore drill, and rollback plan.

If any required dependency is absent, production mode should return not-ready, refuse traffic, or fail startup rather than silently falling back to local/demo state.

## Deployment references

- `deploy/kubernetes/enigma-backend.example.yaml` provides namespace, config map, empty secret placeholder, relay/gateway deployments and services, `/livez` liveness probes, `/readyz` readiness probes, separate public/admin ingress placeholders, default-deny network-policy skeleton, non-root/read-only pod security posture, PDBs, and a backup CronJob placeholder that exits until an operator replaces it.
- `deploy/docker-compose.production.example.yml` is an operator reference for a hardened single-host shape. It uses external env files and secret file placeholders, non-root/read-only containers, dropped Linux capabilities, tmpfs for `/tmp`, and health checks.

These files are scaffolding only. Manifests are not go-live evidence by themselves; applying them, committing them, or serving documentation that mentions them is not backend availability evidence. Hosted or BYOC backend claims require real infrastructure plus operator acceptance evidence.
