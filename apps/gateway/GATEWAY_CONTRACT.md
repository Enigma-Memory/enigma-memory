# Gateway contract

The gateway app is Enigma's enterprise HTTP policy enforcement surface. It is MCP-first and provider-neutral: it evaluates requests against Enigma enterprise policy primitives and never calls a model provider.

## Required exports

- `createGatewayState(options)` creates mutable gateway state with a default-deny enterprise policy, signing key pair, active root, and in-memory SIEM event buffer.
- `createGatewayServer(options)` returns a `node:http` server with `server.gatewayState` attached.
- `handleGatewayRequest(state, request, response?)` handles HTTP requests and can also return `{ status, headers, body }` without a real response object for harnesses.
- `runGatewayDemo()` returns an end-to-end proof object whose `ok` field is true only when allow, deny, signature verification, and SIEM minimization checks all pass.

## HTTP API

- `GET /health` returns gateway identity and active policy hash.
- `GET /policy` returns the active enterprise policy for an authenticated admin plane.
- `PUT /policy` replaces policy only when it is an `enigma.enterprise_policy.v1` object with `default_action: "deny_unknown"` and `provider_native_memory: "cache_only"`.
- `POST /gateway/evaluate` accepts an `enigma.gateway_request.v1` request and returns `allowed`, `decision`, and `reason_codes` from `packages/enterprise` policy evaluation.
- `POST /gateway/decision` evaluates the request, emits a signed gateway decision, verifies that decision locally, and appends a plaintext-minimized SIEM event.
- `GET /siem/export` returns `enigma.gateway_siem_export.v1` with hashes, ids, decisions, and reason codes only.

## Invariants

- Unknown HTTP paths fail closed with `UNKNOWN_PATH_DENIED`.
- Unknown provider, model, region, purpose, sensitivity, or policy shape denies through the enterprise policy engine.
- Provider-native memory remains cache-only; Enigma policy and proof artifacts remain canonical.
- Requests containing raw memory plaintext fields are rejected.
- Gateway decisions do not egress raw memory plaintext; memory addresses are reduced to commitments before export.
- SIEM export never contains provider, model, region, purpose, sensitivity, memory address, key evidence, or raw memory plaintext fields; those values are represented as hashes, ids, and reason codes only.
