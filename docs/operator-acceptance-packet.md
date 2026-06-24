# Operator acceptance packet

Use this packet before any hosted or customer BYOC Enigma deployment is called live. It is a required review artifact, not evidence by itself. Hosted/BYOC remains blocked until the named operator or customer supplies the external infrastructure, credentials, approvals, and rehearsal evidence below.

Machine-readable acceptance packets can be generated with `npm run production:acceptance:packet -- --out <packet.json>` and validated with `npm run production:acceptance -- --packet <packet.json>`. The packet builder accepts `--owners-json <owners.json>` and `--evidence-refs <evidence-refs.json>` so operators can assemble a go packet from real approval refs without using fixture mode. The validator requires complete metadata, named owners, evidence refs for infrastructure, network, storage, KMS custody, tenant policy, monitoring, legal/compliance, usage metering, service settlement, public site security, security threat model review, target-environment readiness output with `hosted_live_ready:true`, a blocker-free readiness manifest, accepted `enigma.production_manifest_result.v1` output for the exact Compose/Kubernetes backend manifests, a production storage migration artifact, and green release-audit evidence. It rejects secret-looking values, raw-memory fields, prompt/transcript/provider-response material, private keys, and incomplete owner approvals.

To start a public-safe operator evidence repository, run `npm run production:evidence-starter -- --out-dir <dir> --domain enigmamemory.com --project-name enigma-memory --environment production --tenant <tenant-id>`. It writes fillable JSON templates, `hosted-ref-catalog.json` evidence guidance, `hosted-ref-workstreams.json` grouped by deployment/security/resilience/operations/governance/commercial lanes, `owner-approval-refs.template.json`, `evidence-refs.template.json`, and exact validation/build commands, redacts the output path from stdout, creates no cloud resources, and keeps the bundle `blocked_until_operator_evidence` until every external evidence ref, live probe, and owner approval is supplied.

For Docker Compose/BYOC backend preparation, run `npm run production:backend-env -- --out-dir <backend-env-kit-dir> --domain enigmamemory.com --tenant <tenant-id> --environment production`. It writes relay/gateway `operator-env/*.env` templates, an `operator-secrets/placeholder-manifest.json`, and `hosted-ref-map.json`; the kit is public-safe and intentionally `launch_ready:false` until real hosted refs, mounted secrets, live probes, and operator acceptance are supplied.

Starter fill order:

1. Run `npm run production:evidence-starter -- --out-dir <evidence-dir> --domain enigmamemory.com --project-name enigma-memory --environment production --tenant <tenant-id>`.
2. Read `<evidence-dir>/hosted-ref-catalog.json` for all 25 hosted-live refs, including `relay_deployment` and `gateway_deployment`; use `<evidence-dir>/hosted-ref-workstreams.json` to assign the grouped deployment/security/resilience/operations/governance/commercial owner lanes. Fill string values in `<evidence-dir>/hosted-refs.template.json` and save the completed copy as `<evidence-dir>/hosted-refs.json`.
3. Run the generated `commands.build_readiness_manifest`, `commands.build_storage_migration`, `commands.verify_readiness_live`, `commands.collect_hosted_live`, and `commands.validate_hosted_live` entries from `<evidence-dir>/commands.json`; `collect_hosted_live` writes both `hosted-backend-live-collection.json` and `hosted-backend-live.json`, and `validate_hosted_live` consumes the generated evidence file.
4. Fill `<evidence-dir>/operator-acceptance-packet.template.json`, attach the generated readiness/storage/hosted/release evidence, then save the completed copy as `<evidence-dir>/operator-acceptance-packet.json`.
5. Run `commands.validate_operator_acceptance`; only `decision:"go"` with zero blockers can be used by `build_handoff` or `build_goal_audit`.

Accepted status vocabulary:

- Packet `metadata.decision`: `go` is the only go-live value. `blocked` and `no-go` are explicit non-live states.
- Owner `approval_status`: use `approved` for accepted owners; `pending`, `blocked`, or missing approval refs keep the packet blocked.
- Evidence `status`: use `verified` for accepted evidence refs. `pending`, `blocked`, `failed`, missing refs, or secret-looking refs keep the packet blocked.

## Claim boundary and evidence boundary

- Enigma evidence covers Enigma-controlled vault state, receipt chains, relay records, witness checkpoints, gateway decisions, policy hashes, and verifier output.
- Do not claim provider deletion, model forgetting, semantic erasure, imported-source completeness, token ROI/profit/equity/revenue share, tamper-proof hardware, raw compute superiority, or compliance status.
- Do not place raw memory plaintext, prompts, transcripts, completion bodies, embeddings, customer secrets, or decrypted capsules in this packet, public proof examples, relay records, witness checkpoints, SIEM exports, or support tickets.
- CI/package/demo evidence, including local relay/gateway `--state-file` evidence, does not replace this acceptance packet.

## Required packet metadata

| Field | Value |
| --- | --- |
| Packet ID |  |
| Customer / tenant |  |
| Deployment mode | Hosted / BYOC / on-prem-air-gapped |
| Environment | production / staging / pilot |
| Target regions |  |
| Requested go-live date |  |
| Evidence repository / ticket |  |
| Packet owner |  |
| Last updated |  |
| Decision | blocked / go / no-go |

## Required owners

| Role | Named owner | Organization | Contact / escalation | Approval status | Date |
| --- | --- | --- | --- | --- | --- |
| Business owner |  |  |  | pending |  |
| Enigma operator owner |  |  |  | pending |  |
| Customer infrastructure owner |  |  |  | pending |  |
| Security owner |  |  |  | pending |  |
| Legal/privacy owner |  |  |  | pending |  |
| Incident commander |  |  |  | pending |  |
| Support/SLA owner |  |  |  | pending |  |
| Tenant policy owner |  |  |  | pending |  |
| Backup/restore owner |  |  |  | pending |  |
| KMS/secrets owner |  |  |  | pending |  |
| SIEM/log owner |  |  |  | pending |  |

## Required external inputs

| Input | Required evidence | Owner | Status | External blocker if missing |
| --- | --- | --- | --- | --- |
| Cloud account/project, VPC/network, cluster, or deployment target | Account/project ID or customer-controlled target reference; access path recorded outside this public packet if sensitive |  | pending | Hosted/BYOC cannot be called live. |
| Deployment credentials | Runtime secret reference and operator access approval; no secrets in repo or packet |  | pending | Deployment cannot proceed. |
| Runtime authentication and operator access | Auth mode, named operator roles, least-privilege access path, break-glass approval, and audit logging reference |  | pending | Runtime cannot accept tenant traffic. |
| Domain and DNS | Domain, zone owner, DNS record plan, propagation evidence |  | pending | Public hosted endpoint cannot be called live. |
| Cloudflare account prerequisites, if Cloudflare Registrar/Pages is used | Account ID, billing profile/default payment method, default registrant contact, Domain Registration Agreement acceptance, and token owner/expiry recorded with no token value |  | pending | Registrar search/check/deploy may be planned, but billable registration and Pages custom-domain setup cannot proceed. |
| TLS certificates | Certificate issuer/reference, renewal path, expiry alert |  | pending | Public endpoints cannot accept tenant traffic. |
| KMS/secrets manager | KMS/BYOK reference, key/credential custody owner, signing/bearer-hash/database/SIEM/backup/TLS custody refs, rotation cadence, emergency rotation path, public-key registry, dual-control operator access, and explicit no-value-export prohibitions |  | pending | Signing, storage, and service credentials are not production-ready. |
| Durable storage | Storage service/reference, encryption-at-rest setting, retention/legal-hold policy, migration owner |  | pending | Relay/gateway state cannot be treated as production durable; local `--state-file` JSON is demo evidence only. |
| Backup target and restore process | Backup scope, RPO/RTO, restore rehearsal evidence, restored verifier output |  | pending | Production recovery is unproven. |
| Monitoring and alerting | Health, latency, 5xx, signing failure, policy load failure, storage failure, plaintext-rejection spike, certificate-expiry, KMS/secret-access, and SIEM-delivery alerts plus readiness synthetics and escalation routing |  | pending | Operator readiness is incomplete. |
| Network policy | Ingress/egress policy, private admin path, authenticated data-plane routes, rate/request-size limits, approved public `/livez`/`/readyz` endpoint list, default-deny egress, and break-glass controls. Machine-readable network policies can be validated with `npm run production:network -- --policy <network-policy.json>` using `enigma.network_access_policy.v1`. |  | pending | Endpoint exposure and admin access are not accepted. |
| SIEM/log destination | Approved sink, minimized field list, sample export without raw memory plaintext |  | pending | Audit routing is incomplete. |
| Incident response contacts | Incident commander, security/legal contacts, escalation path, customer notification path |  | pending | Incident handling is not accepted. |
| Support and SLA terms | Support hours, severity definitions, response targets, escalation channel, maintenance window |  | pending | Customer-facing operations cannot be called live. |
| Legal/compliance review | Approved wording and status for any compliance-sensitive external statement |  | pending | Compliance-sensitive claims remain blocked. |

## Evidence table

Store evidence in the repository/ticket named above. Link only to approved locations; do not paste secrets or raw memory content.

| Evidence item | Minimum acceptable evidence | Link / reference | Owner | Status |
| --- | --- | --- | --- | --- |
| Infrastructure readiness JSON | `npm run infrastructure:readiness -- --manifest <path>` output with `schema:"enigma.infrastructure_readiness.v1"`, `ok`, `generated_at`, `mode`, `credentials_required:false`, `credentials_used` recorded, `readiness.contract_ready`, `readiness.public_live_ready`, `readiness.cloudflare_observed`, `readiness.hosted_live_ready`, `checks`, `external_blockers`, and `claim_boundary`; without `--live`, this is contract-only evidence |  |  | pending |
| Deployment manifests | Versioned `enigma.infrastructure_readiness_manifest.v1` manifest(s), deployment change ticket, backend architecture reference, and accepted `npm run production:manifests -- --compose <compose.yml> --kubernetes <backend.yaml>` output for the exact tenant/environment. Static manifest acceptance is required but still does not prove live hosted readiness. |  |  | pending |
| Runtime auth and operator access | Auth mode, named runtime/operator roles, least-privilege bindings, break-glass path, and audit logging reference; no credentials or tokens in this packet |  |  | pending |
| Network access policy | Public endpoints limited to `/livez`/`/readyz`, private authenticated admin/data-plane routes, request limits, default-deny egress, break-glass controls, and no bearer/token values. Validate with `npm run production:network -- --policy <network-policy.json>` using `enigma.network_access_policy.v1`. |  |  | pending |
| Domain/TLS and public endpoint checks | DNS and HTTPS validation, renewal alert, and any `--live` public endpoint readiness output; validate declared domain evidence with `npm run production:domain -- --evidence <domain-tls.json>` using `enigma.domain_tls_evidence.v1`. This proves public reachability only, not backend storage/KMS/SIEM readiness. |  |  | pending |
| Cloudflare token/account observation, if used | Completed checklist from `cloudflare-token-and-domain-runbook.md` and any `--cloudflare-live off|auto|required` result; token/account observation only, with no token value and no mutation unless separately approved |  |  | optional / public-site only |
| Durable storage | Storage endpoint/reference, encryption setting, retention/legal-hold policy, migration/rollback note, durability owner, and evidence that local `--state-file` JSON was not counted as hosted/BYOC storage |  |  | pending |
| Local state-file demo, if used | Relay/gateway state-file path, permission model, backup/restore note, and evidence that snapshots contain no raw memory plaintext |  |  | optional / demo-only |
| KMS signer/key refs | KMS/BYOK signer references, public key ids/versions, rotation owner/cadence, emergency rotation path, custody/access policy, and no raw key or credential material. Machine-readable custody artifacts can be validated with `npm run production:kms -- --custody <custody.json>` using `enigma.kms_custody.v1`. |  |  | pending |
| Tenant policy | Policy version/hash, approver, rollback version/hash, retention/deletion/legal-hold settings, provider-native-memory cache-only posture, minimized audit route, and change-control refs. Machine-readable tenant policy approvals can be validated with `npm run production:tenant-policy -- --approval <tenant-policy.json>` using `enigma.tenant_policy_approval.v1`. |  |  | pending |
| Runtime health and readiness JSON | Private relay/gateway `/health` output plus `/readyz`/`/livez` readiness JSON for requested public endpoints; health alone is not hosted readiness |  |  | pending |
| Hosted backend live evidence | `npm run production:hosted-live -- --evidence <hosted-backend-live.json>` accepted result proving public HTTPS `/livez` and `/readyz` probes for relay/gateway, all hosted production refs, and operator acceptance `go`. This is required before claiming hosted cloud/BYOC backend is live. |  |  | pending |
| Gateway allow/deny checks | Signed decisions for approved allow and fail-closed deny cases using metadata/committed addresses only |  |  | pending |
| Usage metering | Content-minimized `enigma.usage_event.v1` / `enigma.usage_aggregate.v1` evidence for memory baseline/optimized token counts, settlement boundary, and no provider-invoice or token-ROI claim. Generate locally with `enigma meter event` and `enigma meter aggregate`. |  |  | pending |
| Service settlement | Hash-only permissionless job, operator quote, service settlement receipt, and optional batch evidence using `@enigma-ai/enigma/settlement`; prove `settlement.amount <= quote.price <= job.max_price` and no raw memory, provider-invoice, token ROI, or investment claim. Validate with `npm run production:settlement -- --settlement <settlement.json>` using `enigma.service_settlement_result.v1`. |  |  | pending |
| Public site security | Static public-site artifact passes `npm run production:site -- --site <dir>` with security headers, no personal contact data, no private/generated collateral, no source maps, no local development hosts, no external scripts, and no broken local links. |  |  | pending |
| Security threat model review | Reviewed `enigma.security_threat_model_review.v1` evidence covering assets, trust boundaries, abuse cases, controls, tests, residual risks, non-claims, and review cadence. Validate with `npm run production:threat-model -- --review <threat-model.json>`. |  |  | pending |
| Cloudflare Pages release packet | `npm run cloudflare:pages:packet -- --site <dir> --project-name enigma-memory --domain enigmamemory.com --live-url https://enigmamemory.com/ --expect-title Enigma` output with local artifact readiness, deploy blockers, root hash, and no token values. Required when Cloudflare Pages is the public-site deployment target. |  |  | pending |
| Cloudflare token policy | `npm run cloudflare:token-policy -- --mode all --account-id <account-id> --project-name enigma-memory --domain enigmamemory.com` output with least-privilege permission names, API paths, dashboard steps, token-handling boundaries, and no token value. |  |  | pending |
| Production handoff packet | `npm run production:handoff -- --site <dir> --project-name enigma-memory --domain enigmamemory.com --live-url https://enigmamemory.com/ --expect-title Enigma` output showing local artifact readiness, deploy/backend/operator blockers, and exact next actions for the follow-on operator or AI. |  |  | pending |
| Goal completion audit | `npm run production:goal-audit -- --site <dir> --project-name enigma-memory --domain enigmamemory.com --live-url https://enigmamemory.com/ --expect-title Enigma --account-id <account-id>` output mapping the active objective to deliverables and keeping `complete:false` until direct live/provider/operator evidence exists. |  |  | pending |
| Relay plaintext rejection | Rejection of plaintext-looking fields; acceptance of opaque encrypted record metadata only |  |  | pending |
| Witness/checkpoint minimization | Checkpoint/root/order metadata only; no raw memory plaintext |  |  | pending |
| Audit outbox/SIEM | Audit outbox reference, approved SIEM/log sink, minimized field list, sample export without raw memory plaintext, delivery owner, and retention path |  |  | pending |
| Monitoring/alerting | Active health, latency, 5xx, signing, policy load, storage, plaintext-rejection, certificate, KMS/secret-access, SIEM-delivery alerts plus readiness synthetics and escalation routing. Validate with `npm run production:monitoring -- --monitoring <monitoring.json>` using `enigma.monitoring_alerting.v1`. |  |  | pending |
| Offline verification | Verifier output for accepted proof bundle or restored evidence bundle |  |  | pending |
| Backup/restore rehearsal | Backup scope, target reference, restore run result, RPO/RTO result, verifier output after restore, and failure owner if rehearsal failed. Machine-readable drills can be validated with `npm run production:backup-drill -- --drill <drill.json>` using `enigma.backup_restore_drill.v1`. |  |  | pending |
| Incident drill | Drill notes, commander, contacts, evidence preservation, communications path. Machine-readable drills can be validated with `npm run production:incident-drill -- --drill <drill.json>` using `enigma.incident_drill.v1`. |  |  | pending |
| Support/SLA | Signed support model, escalation matrix, maintenance window. Machine-readable SLA artifacts can be validated with `npm run production:sla -- --sla <sla.json>` using `enigma.support_sla.v1`. |  |  | pending |
| Legal/compliance approval | Approved statement scope or explicit no-claim decision. Machine-readable legal/privacy/marketing review artifacts can be validated with `npm run production:legal -- --approval <approval.json>` using `enigma.legal_compliance_approval.v1`; approved statements must not claim provider deletion, model forgetting, compliance status, token ROI/profit/equity, guaranteed savings, hosted-live readiness, or unsupported superlatives. |  |  | pending |

## Go/no-go checklist

Mark **go** only when every required item is complete for the exact tenant/environment.

- [ ] Packet metadata and named owners are complete.
- [ ] Hosted/BYOC responsibility split is signed by the operator and, for BYOC, the customer.
- [ ] Domain, DNS, TLS, ingress, and renewal alerts are configured.
- [ ] If Cloudflare Registrar/Pages is used, the operator followed `cloudflare-token-and-domain-runbook.md`: account prerequisites are complete, token value stayed out of chat/source/evidence, broad all-zone setup token was rotated/narrowed after the domain zone existed, and any registration had exact domain+price approval.
- [ ] Admin endpoints are private, authenticated, least-privilege, and network-restricted.
- [ ] KMS/secrets manager is configured; custody evidence proves rotation, emergency rotation, public-key registry, dual-control access, and no-value-export controls without placing secrets, vault bundles, private keys, or tenant credentials in images, source, packets, logs, or proof artifacts.
- [ ] Durable storage is configured for required relay/gateway/witness/policy/audit state; local `--state-file` demo state is not counted as hosted/BYOC durable storage.
- [ ] Tenant policy owner approved policy version/hash, rollback version/hash, retention, deletion/tombstone, legal hold, provider-native-memory cache-only posture, minimized audit route, and change-control path.
- [ ] Usage metering evidence exists for memory baseline/optimized token counts and settlement reporting; it contains no raw prompt/completion/provider response and does not claim provider invoice savings or token ROI.
- [ ] Service settlement evidence exists for any permissionless/operator network path; receipts link job hash, quote hash, usage hash, memory root, policy hash, service receipt, and settlement ref without raw memory or investment claims, and `npm run production:settlement` accepts the artifact.
- [ ] Public site security validation passes for the exact deploy artifact; no personal email, phone, address, private collateral, source map, local dev reference, external script, secret, raw memory, prompt, transcript, or provider response is present.
- [ ] Security threat model review is accepted for the exact environment; it covers local vault, MCP, native host, relay, gateway, optimizer, metering, settlement, public site, domain/TLS, KMS, storage, SIEM, backup/restore, required trust boundaries, abuse cases, tests, and non-claims.
- [ ] SIEM/log exports are plaintext-minimized and approved by the SIEM/log owner.
- [ ] Monitoring and alerting are active for health, latency, 5xx, signing, storage, policy load, plaintext rejection spikes, certificate expiry, KMS/secret-access failure, SIEM delivery, readiness synthetics, and escalation routing.
- [ ] Infrastructure readiness JSON is attached for the exact manifest; `hosted_live_ready` is false unless the contract is complete, requested live checks pass, final acceptance is **go**, and external blockers are empty.
- [ ] Network policy and runtime authentication evidence are attached; public endpoint reachability is limited to `/livez`/`/readyz` probes and is not treated as proof of private admin access or tenant authorization.
- [ ] Backup/restore rehearsal succeeded in a non-production or approved rehearsal environment and restored evidence verifies offline.
- [ ] Incident drill completed with named commander, contacts, preservation path, customer notification path, and claim-bounded communication template.
- [ ] Support/SLA placeholders are replaced with approved customer-facing terms.
- [ ] Legal/privacy approved any external compliance-sensitive language, or the packet records that no compliance status is claimed.
- [ ] All external blockers are closed or the decision is **no-go**.

Decision rule: any unchecked item above is a **no-go** for live hosted/BYOC operation. Local package, CLI, Docker-demo, and runbook readiness may still be accepted separately.

Local `--state-file` evidence may be attached to show source/package demo continuity only. It is acceptable supporting evidence for local review when it stores relay opaque/hash records or gateway policy/minimized SIEM evidence and fails closed on malformed/plaintext-looking state. It is not acceptable evidence for production database readiness, KMS/secrets custody, tenant backup policy, legal hold, RPO/RTO, multi-instance consistency, or hosted/BYOC go-live.

## Rollback plan

| Rollback area | Required entry |
| --- | --- |
| Trigger conditions | Signing failure, policy misconfiguration, storage write failure, TLS/ingress failure, SIEM leak risk, plaintext admission, failed restore, or customer security request. |
| Owner |  |
| Last known-good package/image |  |
| Last known-good deployment manifest |  |
| Last known-good tenant policy hash/version |  |
| Data rollback boundary | Enigma-controlled state only; do not claim provider deletion or model forgetting. |
| Rollback steps | 1. Freeze policy/deploy changes. 2. Preserve plaintext-minimized evidence. 3. Revert manifest/package/policy through approved change path. 4. Verify health and offline evidence. 5. Notify approved contacts with observed facts only. |
| Customer approval required? | yes / no / condition |
| Verification after rollback |  |

## Backup/restore rehearsal

| Rehearsal item | Required result | Owner | Status |
| --- | --- | --- | --- |
| Backup scope | Includes required vault-adjacent state, proof bundles, policy versions, gateway decisions, relay/witness persistence, configuration, and deployment manifests as applicable |  | pending |
| RPO/RTO | Tenant-specific RPO/RTO recorded and met or variance approved |  | pending |
| Restore location | Non-production or approved isolated environment |  | pending |
| Restore verification | Restored proof bundles and policy evidence verify offline |  | pending |
| Log minimization | Backup/restore logs contain no raw memory plaintext or secrets |  | pending |
| Failure handling | Failed restore blocks go-live and has owner/date for remediation |  | pending |

## Incident drill

| Drill item | Required result | Owner | Status |
| --- | --- | --- | --- |
| Scenario exercised | Secret exposure / plaintext admission / policy bypass / restore failure / unauthorized access / data residency exception |  | pending |
| Incident commander | Named and reachable |  | pending |
| Evidence preservation | Receipts, policy versions, gateway decisions, logs, proof bundles, and deployment state preserved with restricted access |  | pending |
| Containment | Stop affected ingress/workflow, rotate credentials if needed, freeze policy changes if needed |  | pending |
| Communications | Customer/security/legal notifications use observed facts only and stay within Enigma proof boundaries |  | pending |
| Post-incident review | Remediation owner/date and acceptance retest recorded |  | pending |

## External blockers

If any item remains pending, keep the decision at **blocked** or **no-go** and record the blocker here.

| Blocker | External owner | Needed input / approval | Impact | Target date | Status |
| --- | --- | --- | --- | --- | --- |
| Domain/DNS not supplied |  |  | Hosted public endpoint cannot be live |  | pending |
| Cloudflare Registrar/Pages prerequisites not supplied |  | Account ID, billing/default payment, default registrant contact, Domain Registration Agreement acceptance, least-privilege token owner/expiry, and final token scope | Billable registration, DNS mutation, Pages deploy, and custom-domain attachment cannot proceed |  | pending |
| Cloud/customer deployment target not supplied |  |  | Hosted/BYOC runtime cannot be accepted |  | pending |
| TLS path not supplied |  |  | Tenant traffic cannot open |  | pending |
| KMS/secrets path not supplied |  |  | Secrets/key custody is not production-ready |  | pending |
| Durable storage/backup target not supplied |  |  | Recovery and persistence are unproven; local `--state-file` demo state does not close this blocker |  | pending |
| SIEM/log sink not supplied |  |  | Audit routing is incomplete |  | pending |
| Support/SLA and incident contacts not approved |  |  | Customer operations cannot be called live |  | pending |
| Legal/compliance approval not complete |  |  | Compliance-sensitive language remains blocked |  | pending |

## Final acceptance

| Approver | Role | Decision | Conditions | Date |
| --- | --- | --- | --- | --- |
|  | Operator owner | go / no-go |  |  |
|  | Security owner | go / no-go |  |  |
|  | Legal/privacy owner | go / no-go |  |  |
|  | Customer infrastructure owner (BYOC) | go / no-go |  |  |
|  | Support/SLA owner | go / no-go |  |  |

Final statement: this environment is not live until every required owner records **go**, every blocker is closed, and evidence links show the target hosted/BYOC infrastructure was configured and rehearsed. Otherwise, state the posture as local/package/demo ready with hosted/BYOC blocked on external infrastructure and approvals.
