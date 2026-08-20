# Enigma deployment runbook

This runbook covers local, Docker, hosted, and BYOC operation for Enigma relay/gateway surfaces. It is intentionally honest about what works from a checkout now and what remains blocked without real infrastructure.

## Operating boundaries

- Local CLI, verifier, MCP, relay demo, and gateway demo can run from a source checkout or installed package. Relay/gateway demos may use `--state-file <path>` for file-backed local continuity across restarts.
- Hosted and BYOC deployments require real cloud/domain credentials, TLS, production durable storage, KMS/secrets, monitoring, backup/restore, and incident response ownership; the local `--state-file` demo option does not satisfy those requirements.
- Provider-native memory is cache only. Enigma receipts and proofs cover Enigma-controlled vault state, relay records, witness roots, and gateway policy decisions.
- Do not put raw memory plaintext in relay records, witness checkpoints, SIEM exports, public proof artifacts, or incident reports.
- Do not bake vault bundles, private keys, deployment credentials, tenant credentials, or cloud secrets into images.

Required live-readiness artifact: complete [`operator-acceptance-packet.md`](operator-acceptance-packet.md) for the exact hosted or BYOC tenant/environment before describing that deployment as live.

Cloudflare Pages/domain setup has a separate safe-by-default runbook: [`cloudflare-token-and-domain-runbook.md`](cloudflare-token-and-domain-runbook.md). Use it for API token scope, Registrar prerequisites, domain search/check, purchase approval gates, Pages deployment, custom-domain attachment, and token rotation.

## Infrastructure readiness evidence

Use the readiness layer to separate contract evidence from live endpoint evidence:

```sh
npm run infrastructure:readiness -- --manifest <path>
```

Without `--live`, the command is **contract-only evidence**. It reads the deployment manifest, checks required fields and declared blockers, and emits `enigma.infrastructure_readiness.v1` JSON with `schema`, `ok`, `generated_at`, `mode`, `credentials_required:false`, `credentials_used`, `readiness.contract_ready`, `readiness.public_live_ready`, `readiness.cloudflare_observed`, `readiness.hosted_live_ready`, `checks`, `external_blockers`, and `claim_boundary`. This output is suitable for release review and for the operator packet, but it does not prove that hosted relay/gateway, KMS, durable storage, SIEM, backup/restore, operator access, or token launch readiness is live.

Add `--live` only when the manifest intentionally requests public endpoint checks:

```sh
npm run infrastructure:readiness -- --manifest <path> --live
```

`--live` is public endpoint evidence only: static website, Cloudflare Pages, GitHub-hosted artifact, or explicitly declared relay/gateway health/readiness URLs can be observed from the caller's network. A passing live endpoint check does not prove production backend architecture is deployed, does not provision infrastructure, and does not replace [`operator-acceptance-packet.md`](operator-acceptance-packet.md). Review it alongside [`production-backend-architecture.md`](production-backend-architecture.md) and the exact deployment manifest before any hosted/BYOC claim changes.

Cloudflare observation is opt-in and claim-bounded:

```sh
npm run infrastructure:readiness -- --manifest <path> --live --cloudflare-live off
npm run infrastructure:readiness -- --manifest <path> --live --cloudflare-live auto
npm run infrastructure:readiness -- --manifest <path> --live --cloudflare-live required
```

- `off` performs no Cloudflare token/account observation.
- `auto` observes Cloudflare only when the local operator has supplied the expected token/account inputs.
- `required` makes missing Cloudflare token/account observation a readiness failure for the public Cloudflare portion only.

The command must never print token values or mutate Cloudflare, DNS, Pages, Registrar, KMS, storage, SIEM, backup, or deployment state. Treat Cloudflare results as account/static-site observation only, not as hosted backend or token-launch readiness.

Hosted live readiness is true only when the manifest contract is complete, requested live checks pass, the exact operator acceptance packet records a **go** decision, and external blockers are empty.

## 1. Local no-network path

Use this path for a laptop or CI-style local smoke that does not need provider, cloud, relay, or gateway credentials.

```sh
cd enigma
npm install -g .
mkdir -p .enigma
enigma init --bundle ./.enigma/bundle.json --subject local-user --display-name "Local user"
enigma remember --bundle ./.enigma/bundle.json --text "tenant-approved-placeholder-memory" --purpose user_memory --tags preference
enigma context --bundle ./.enigma/bundle.json --query "placeholder-memory" --purpose local_context --out ./.enigma/context-pack.json
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --bundle ./.enigma/export.json
```

Keep `.enigma/bundle.json` local or in an approved encrypted backup location. Treat exported bundles as proof material; do not publish them unless the release owner has confirmed that the artifact contains only allowed committed/encrypted state and metadata.

## 2. MCP and connector deployment

Run MCP over stdio:

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma-mcp
```

Connect Claude with the extension package first; use config-writing commands for other clients:

```sh
enigma doctor
enigma claude-mcpb package --plain
enigma connect kimi-code --bundle "$HOME/.enigma/bundle.json" --mcp-command "/absolute/path/to/enigma-mcp"
```

Use `--mcp-command` when a GUI client cannot resolve shell PATH or needs a Windows `.cmd` shim. Connector writes must preserve unrelated client config and back up configs only when the semantic JSON changes.

## 3. Local relay

Run the relay demo:

```sh
enigma-relay demo
```

Start the relay server:

```sh
enigma-relay serve --host 127.0.0.1 --port 8787
curl http://127.0.0.1:8787/health
```

Push only opaque encrypted records:

```sh
curl -X POST http://127.0.0.1:8787/relay/push \
  -H 'content-type: application/json' \
  --data '{"capsule_id":"cap_local_1","opaque_encrypted_record":"age1-example-ciphertext-only"}'
```

Operational rule: reject payloads that contain plaintext-looking fields such as `memory`, `plaintext`, `content`, `text`, `prompt`, transcripts, or conversation bodies.

### Optional local relay state file

Use `--state-file <path>` when a source/package relay demo needs to survive a local restart:

```sh
mkdir -p .enigma/state
enigma-relay serve --host 127.0.0.1 --port 8787 --state-file ./.enigma/state/relay-state.json
enigma relay serve --host 127.0.0.1 --port 8787 --state-file ./.enigma/state/relay-state.json
```

The relay state file is local demo durability only. It may persist relay node signing material/trust descriptor, relay store metadata, hash-only/opaque relay records, witness checkpoint log, completed pairings, authorization mode, and generation metadata. Treat relay signing material as a local demo secret. The file must not contain raw memory plaintext, prompts, transcripts, decrypted capsule contents, raw request bodies, or pending pairing challenges. Unknown, malformed, or plaintext-looking state fails closed instead of silently resetting; for an intentional demo reset, stop the service and choose a new state file or remove the old one under operator control.

Create the parent directory as private to the local user or service account. On POSIX systems use owner-only permissions such as `0700` for the directory and `0600` for the file; on Windows restrict the file ACL to the demo user/service account. Do not commit state files. If backing them up for a demo, use an encrypted local backup and keep the restore boundary to the same demo environment/package version.

## 4. Local gateway

Run the gateway demo:

```sh
enigma-gateway demo
```

Start the gateway server:

```sh
enigma-gateway serve --host 127.0.0.1 --port 8797
curl http://127.0.0.1:8797/health
curl http://127.0.0.1:8797/policy
```

Evaluate by metadata and committed addresses, not raw memory:

```sh
curl -X POST http://127.0.0.1:8797/gateway/decision \
  -H 'content-type: application/json' \
  --data '{"schema":"enigma.gateway_request.v1","operation":"retrieve","provider":"kimi","model":"kimi-k2","region":"us-east-1","purpose":"support_retrieval","sensitivity":"internal","memory_addr":"addr_committed_memory","memory_id":"mem_allowed","subject_id":"employee_123"}'
```

Export SIEM evidence:

```sh
curl http://127.0.0.1:8797/siem/export
```

SIEM events must remain plaintext-minimized. They may carry policy hashes, decision ids, receipt ids, timestamps, tenant ids, subject ids, memory addresses, counts, and verification status. They must not carry raw memory text, prompts, completions, transcripts, or provider hidden-state claims.

### Optional local gateway state file

Use `--state-file <path>` when a source/package gateway demo needs policy/SIEM continuity across restarts:

```sh
mkdir -p .enigma/state
enigma-gateway serve --host 127.0.0.1 --port 8797 --state-file ./.enigma/state/gateway-state.json
enigma gateway serve --host 127.0.0.1 --port 8797 --state-file ./.enigma/state/gateway-state.json
```

The gateway state file is local demo durability only. It may persist `gateway_id`, `active_root`, active enterprise policy, demo Ed25519 public/private signing key material, plaintext-minimized `siem_events`, `expose_internal`, schema/version, and generation metadata. Treat gateway private signing material as a local demo secret. The file must not contain raw memory plaintext, prompts, completions, transcripts, provider response bodies, decrypted capsules, embeddings, tenant secrets, KMS material, or hidden-provider-state claims. Unknown, malformed, or plaintext-looking state fails closed instead of silently resetting; only an explicit demo reset path such as `allowDemoReset` may intentionally reset invalid state.

Back up gateway state only as demo evidence. Restore by stopping the gateway, restoring the exact file, checking file permissions, and starting the same compatible package version. This is not a migration system, database backup, high-availability store, or production recovery plan.

## 5. Docker local demo

Build the source-checkout image:

```sh
cd enigma
docker build -t enigma-local:dev .
```

Run direct-bin demos:

```sh
docker run --rm --entrypoint enigma-relay enigma-local:dev demo
docker run --rm --entrypoint enigma-gateway enigma-local:dev demo
```

Run the two local services with Compose:

```sh
cd enigma
docker compose up --build relay gateway
```

Check health:

```sh
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8797/health
```

The provided Docker assets are local demos. They install the local package source into an image and expose loopback-bound ports through Compose. They do not configure production secrets, TLS, production durable state, tenant policy lifecycle, or external log sinks. A mounted `--state-file` can preserve local demo relay/gateway state across container restarts, but it remains a demo file and not hosted/BYOC storage evidence.

## 6. Cloudflare Pages/domain hosting handoff

Use [`cloudflare-token-and-domain-runbook.md`](cloudflare-token-and-domain-runbook.md) before any Cloudflare API/domain/hosting operation. The safe order is:

1. Create a short-lived local setup token in the Cloudflare dashboard with account-scoped Cloudflare Pages Edit/Write, Registrar Write/Edit, Account Read as needed, and zone-scoped Zone Read plus DNS Edit.
2. Keep the token local as `CLOUDFLARE_API_TOKEN`; never paste it into chat, docs, tickets, or review packets.
3. Verify token/accounts access, then search/check domains without buying anything.
4. Stop for explicit final approval of the exact domain and exact current registration price. Domain purchases are billable and non-refundable after successful registration.
5. Register only with the exact confirmation flags or equivalent manual confirmation described in the Cloudflare runbook.
6. Build and preflight the public static artifact locally before any Pages deploy.
7. Deploy Pages only after explicit execution approval, then attach the custom domain through the dashboard/API/manual DNS steps and wait for SSL/TLS active status.

For the current `enigmamemory.com` Pages path from this workspace, use `../enigma-deploy` as the source artifact from `cd enigma`, but deploy the staged copy: run `npm run cloudflare:pages:stage`, `npm run cloudflare:pages:packet -- --site .enigma/cloudflare-pages/enigmamemory.com --project-name enigma-memory --domain enigmamemory.com --live-url https://enigmamemory.com/ --expect-title "Enigma"`, `npm run cloudflare:pages:dry-run`, `npm run cloudflare:pages:deploy`, and finally `npm run cloudflare:ops -- --cloudflare-env-file <local-secret-file> pages verify --url https://enigmamemory.com/ --project-name enigma-memory --domain enigmamemory.com --cloudflare-live required`. The staging step overlays deployment/security headers without mutating the source site artifact. If the staged packet or dry-run reports local public-site security blockers, stop and fix the artifact or staging script instead of deploying it.

The first setup token may need all-zone Zone Read/DNS Edit while the final zone does not exist or must be discovered. Rotate it after the domain exists and replace it with an exact-zone token. A Pages preview URL, domain registration receipt, or DNS record alone does not make hosted/BYOC live; the hosted/BYOC checklist and operator acceptance packet still apply.

### Relay/gateway Cloudflare Workers custom-domain bootstrap

For the lowest-cost hosted bootstrap on `enigmamemory.com`, use the relay/gateway edge Worker bundle as two originless Cloudflare Workers Custom Domains, not plain Workers Routes:

```sh
npm run production:edge-backend -- --out-dir .enigma/edge-backend-workers --domain enigmamemory.com
npx wrangler deploy --config .enigma/edge-backend-workers/relay/wrangler.toml --dry-run --outdir .enigma/edge-backend-workers/relay-dry-run
npx wrangler deploy --config .enigma/edge-backend-workers/gateway/wrangler.toml --dry-run --outdir .enigma/edge-backend-workers/gateway-dry-run
```

The generated Worker configs must use `workers_dev = false` and `routes = [{ pattern = "relay.enigmamemory.com", custom_domain = true }]` / `routes = [{ pattern = "gateway.enigmamemory.com", custom_domain = true }]`. Do not replace this with `--route relay.enigmamemory.com/*` unless an operator intentionally creates and verifies a proxied DNS record/origin route. Workers Routes require a proxied DNS hostname and are for routing in front of an origin; Custom Domains make the Worker the hostname origin and let Cloudflare create the DNS record and certificate after deploy.

Only an operator with local Cloudflare credentials may remove `--dry-run`:

```sh
npx wrangler deploy --config .enigma/edge-backend-workers/relay/wrangler.toml
npx wrangler deploy --config .enigma/edge-backend-workers/gateway/wrangler.toml
curl -fsS https://relay.enigmamemory.com/livez
curl -i https://relay.enigmamemory.com/readyz
curl -fsS https://gateway.enigmamemory.com/livez
curl -i https://gateway.enigmamemory.com/readyz
```

Keep `CLOUDFLARE_API_TOKEN` and account/zone identifiers in local operator configuration only. The relay/gateway Worker deploy proves edge reachability, not production readiness: `/readyz` must remain fail-closed until real evidence refs and operator acceptance are supplied, collected, and accepted by the hosted-live/readiness validators.

## 7. Hosted deployment checklist

Hosted mode means Enigma operates relay/gateway for a tenant. Do not mark hosted live until every item below is true for the specific environment and the operator acceptance packet is complete.

### Infrastructure

- Cloud account/project and deployment credentials exist outside the repository.
- Domain is delegated and DNS records point to the ingress.
- TLS certificates are provisioned and renewed automatically.
- Relay and gateway run as separately observable services.
- Ingress only exposes intended public endpoints.
- Egress policy is documented; gateway does not need provider API access for local policy decisions.

### Secrets and KMS

- Signing keys, database credentials, API tokens, and tenant credentials are stored in KMS/secrets manager.
- Containers receive secrets at runtime through the platform secret mechanism.
- Images and source archives contain no vault bundles, private keys, deployment credentials, or tenant credentials.
- Key rotation owner, cadence, and emergency rotation process are documented.

### Durable storage

- Relay opaque encrypted records, witness roots, gateway policies, signed decisions, audit metadata, and tenant configuration use durable storage where required.
- Storage encryption at rest is enabled through the cloud/customer platform.
- Retention, legal hold, deletion, and tombstone policy are explicit per tenant.
- Schema migrations have backup and rollback steps.

The local `--state-file` option is not a substitute for this section. Hosted/BYOC storage must provide an operator-owned database/object store/volume design, access control, encryption-at-rest, migration/rollback process, durability guarantees, backup target, restore rehearsal, monitoring, and KMS/secrets integration appropriate to the tenant environment.

### TLS and network

- Public endpoints require HTTPS.
- Admin endpoints are private, authenticated, and restricted by network policy.
- Service-to-service traffic is inside the trusted network or mutually authenticated.
- Rate limits and request-size limits are configured for relay and gateway endpoints.

### Monitoring and logs

- Health checks may cover existing `/health` on local/private service paths; public ingress and infrastructure-readiness live evidence for relay/gateway must use exact `/livez` or `/readyz` probes.
- Metrics include request counts, rejection counts, decision allow/deny counts, signing failures, storage errors, latency, and queue/backlog if added.
- Alerts cover service down, elevated 5xx, policy load failure, signing failure, storage write failure, unexpected plaintext rejection spikes, and certificate expiry.
- Logs and SIEM exports are plaintext-minimized and routed to the approved sink.

### Backup and restore

- Backups cover durable relay/gateway state, policies, key metadata, and tenant config.
- Restore is tested into a non-production environment before release.
- Recovery point objective and recovery time objective are recorded per tenant.
- Restore verification checks policy hash continuity, receipt/witness verification, and service health.

Local state-file backups can demonstrate demo restore mechanics only. They do not establish production RPO/RTO, multi-instance consistency, tenant data residency, key custody, migration safety, or disaster recovery.

### Incident response

- On suspected secret exposure: revoke/rotate affected secrets, preserve plaintext-minimized logs, identify impacted tenants, and publish only verified facts.
- On suspected plaintext leakage: stop affected ingress or worker, preserve evidence with restricted access, identify payload path, rotate affected credentials if needed, and patch the source of plaintext admission.
- On policy misconfiguration: freeze policy changes, export current policy hash and decision ids, restore last known-good policy, and notify tenant contacts using approved wording.
- Incident communications must stay inside the claim boundary: Enigma-controlled state, policy decisions, receipts, and observed operational facts only.

## 8. BYOC deployment checklist

BYOC mode means the customer deploys relay/gateway in its own cloud, VPC, cluster, or private network.

Required customer-owned inputs:

- Cloud account, cluster, VPC/network, DNS, TLS, and deployment credentials.
- KMS/secrets manager and key-rotation policy.
- Durable storage class, backup target, retention policy, and restore owner.
- SIEM/log destination and plaintext-minimization requirements.
- Network ingress/egress policy and private admin access path.
- Tenant policy owner and approval workflow.
- Data residency, retention, deletion, legal hold, and incident-response contacts.

Enigma supplies package artifacts, service commands, local Docker demo assets, and policy/proof semantics. The customer supplies infrastructure and credentials. Without the customer inputs above, BYOC acceptance is limited to local package/Docker smoke only.

Before BYOC is called live, the customer/operator acceptance owner must complete [`operator-acceptance-packet.md`](operator-acceptance-packet.md) with evidence links, named owners, go/no-go decision, rollback plan, backup/restore rehearsal, incident drill, support/SLA terms, and legal/compliance approval status for the specific customer environment.

## 9. Production cutover sequence

1. Build and inspect the package/image from clean source.
2. Confirm bins: `enigma`, `enigma-mcp`, `enigma-relay`, `enigma-gateway`, and `enigma-verify`.
3. Confirm images contain no secrets, vault bundles, private keys, or tenant credentials.
4. Deploy relay and gateway to the target environment with runtime secrets only.
5. Apply tenant policy and record the policy hash.
6. Verify private `/health`, `/policy`, relay push with opaque encrypted payload, gateway decision, and SIEM export behind authenticated/internal access; verify public `/livez` and `/readyz` probes only after the operator has mapped them to the target backend.
7. Run `npm run infrastructure:readiness -- --manifest <path>` for contract evidence; add `--live` only for public endpoints intentionally declared in the manifest, using `/livez` or `/readyz` for relay/gateway.
8. Verify monitoring, alerting, backup, and restore before opening tenant traffic.
9. Complete the operator acceptance packet and record any remaining domain/cloud/customer credential blockers before calling hosted or BYOC live.

## 10. Blocked without real credentials

The following cannot be completed from this repository alone:

- Publishing `enigma-memory` to npm without release credentials.
- Hosted domain, DNS, TLS, ingress, and public endpoint activation.
- Cloudflare domain registration purchase, DNS mutation, Pages deploy, and custom-domain attachment without explicit operator execution approval and the Cloudflare runbook safeguards.
- Cloud KMS/secrets provisioning and production key custody.
- Durable production database/storage provisioning; local relay/gateway `--state-file` JSON is not sufficient for hosted or BYOC acceptance.
- Tenant-specific SIEM/log routing.
- Backup target provisioning and restore validation in the target environment.
- BYOC network, KMS, storage, SIEM, and deployment acceptance inside a customer environment.
- Completed operator acceptance packet with go decisions from required owners.

Until those are present, describe the product as locally installable with source/package/Docker demos and deployment runbooks, not as a live hosted or BYOC service.
