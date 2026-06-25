# Enigma overnight build master plan

This plan is the execution contract for taking Enigma from the current local production foundation to a professional launch package by the 9:00 AM Central Standard Time review, with continuation rules if any release-critical slice remains unfinished.

The objective does not change overnight: Enigma must remain a provider-neutral AI memory custody and proof layer with a local canonical vault, offline-verifiable receipts for Enigma-controlled lifecycle events, installable CLI/MCP surfaces, connector/importer paths, plaintext-minimized proof artifacts, and honest hosted/BYOC collateral that states what is live, what is local-only, and what still needs operator infrastructure.

## Ownership model

### GPT-5.5 owns architecture, design, and review

GPT-5.5 is the architecture, protocol, product, security, and claim-boundary owner. GPT-5.5 decides phase order, writes implementation briefs, reviews Kimi Code patches, rejects unsupported claims, and accepts or blocks release readiness.

GPT-5.5 acceptance authority covers:

- system architecture and dependency boundaries,
- cryptographic receipt/proof semantics,
- privacy and plaintext-minimization rules,
- CLI/MCP/user experience design,
- test strategy and adversarial cases,
- collateral accuracy,
- launch claim boundaries,
- release/no-release decisions.

### Kimi Code owns implementation

Kimi Code is the implementation owner. Kimi edits the repository, writes tests/fixtures, wires CLI/MCP/server surfaces, fixes bugs found in review, and produces targeted evidence for the slice it implemented.

Kimi must not:

- change the product thesis or claim boundaries,
- weaken tests to make a slice pass,
- add mocks for proof behavior,
- make provider-native memory canonical,
- emit raw memory plaintext in receipts, witness records, relay records, SIEM events, or public proof examples,
- imply hosted cloud, BYOC deployment, customer KMS, domain, TLS, durable storage, monitoring, or SIEM integrations are live without credentials and deployment evidence.

## Hard claim boundaries

These are non-negotiable release boundaries. Every implementation brief, code review, README section, whitepaper section, website section, demo script, and social launch asset must preserve them.

### Allowed claims

- Enigma can operate a local canonical memory vault controlled by the user or operator.
- Enigma can emit receipts for Enigma-controlled lifecycle events.
- Enigma can verify supported Enigma receipts, bundles, checkpoints, and gateway decisions offline.
- Enigma can prove a local active set includes or excludes a committed memory address.
- Enigma can prove a tombstone exists in Enigma-controlled state.
- Enigma can treat provider-native memory as cache only.
- Enigma can import/export memory candidates while preserving source limitations and completeness flags.
- Enigma relay/gateway demos can run locally from repository/package artifacts when the corresponding commands pass.
- Enigma can run a local/offline memory optimizer that reduces repeated context spend through deterministic dedupe, tiering, and receipt-backed access decisions, with outputs limited to hashes, commitments, counts, and token/cost estimates.
- Hosted and BYOC modes are deployable patterns only after credentials, domain/DNS, TLS, durable storage, KMS/secrets, monitoring/alerting, network policy, tenant policy, usage metering, settlement, public-site security, threat model, legal/compliance, support/SLA, backup/restore, incident response, and SIEM/log ownership are configured.
- Enigma can generate public-safe Cloudflare Pages release packets, Cloudflare token-policy packets, production handoff packets, infrastructure readiness manifests, and operator acceptance results that name blockers without printing secrets.

### Exact non-claims

Do not claim or imply:

- provider deletion proof,
- model forgetting,
- semantic forgetting,
- deletion from provider hidden caches, telemetry, backups, logs, personalization stores, or model weights,
- token ROI, profit, equity, revenue-share, investment return, or token price expectation,
- tamper-proof hardware,
- raw compute superiority,
- benchmark leadership unless measured in repository tests and documented with the command and result,
- SOC 2, HIPAA, GDPR, or other compliance status without a separate audit and approval,
- hosted Enigma cloud is live before deployment credentials, Cloudflare account/token evidence, domain/DNS, TLS, durable storage, KMS/secrets, monitoring/alerting, network policy, tenant policy, usage metering, settlement, public-site security, threat model, legal/compliance, support/SLA, backup/restore, and incident response are in place,
- BYOC is live for a customer before that customer supplies cloud/VPC/cluster/private-network access, KMS/secrets, storage, backup/restore owner, SIEM/log route, residency policy, tenant policy, support/SLA owner, legal/compliance approval, and admin access.

## Memory optimization thesis

Enigma's memory analogue to inference optimization is a centralized optimized memory fabric for high-performance memory optimization: keep canonical memory under Enigma/user/operator control, dedupe repeated candidates, tier what is worth recalling, and emit receipts for the memory/context boundary. Blockchain/permissionless access, when used, is for access/settlement/anchoring boundaries only: access control, settlement, and proof/receipt anchoring. It is not the source of memory-context cost reduction, and raw memory plaintext must never be placed on-chain, in receipts, in SIEM, in public examples, or in output artifacts.

Users buy lower memory/context cost, proof, portability, and no lock-in. They do not need ideological decentralization to get value. Public collateral must say this as a memory-cost and proof product, not as token ROI, investment return, provider deletion proof, model forgetting, compliance status, or benchmark leadership. Explicitly avoid measured discount claims until repository benchmarks exist and document the command, inputs, and result.

The package surface expected for this slice is `enigma-memory/optimizer` (`./optimizer`) with `MEMORY_OPTIMIZATION_PRODUCT_THESIS`, `MEMORY_OPTIMIZATION_PLAN_SCHEMA`, `MEMORY_ACCESS_RECEIPT_SCHEMA`, `estimateTextTokens`, `estimateTokenCost`, `createMemoryOptimizationPlan`, `createMemoryAccessReceipt`, and `assertNoRawMemoryOutput`. These APIs may accept local plaintext candidates as private input, but public outputs and output artifacts must contain commitments/hashes and explicit token/cost estimates only.

## Priority order

If time becomes constrained, do not redefine success. Preserve the full objective and continue past 9:00 AM CST with the same order until release-critical gates are satisfied.

1. Backend correctness and proof integrity.
2. Installability and local no-network user path.
3. MCP protocol compatibility and connector safety.
4. Plaintext-minimized importer/capsule flows.
5. Relay/gateway local demos with explicit non-hosted posture.
6. Browser/desktop product surfaces that do not overclaim.
7. Production release checklist and deployment blockers.
8. Whitepaper math, diagrams, and claim-bounded technical explanation.
9. Website/README/collateral launch copy.

Collateral can move in parallel with implementation, but no collateral claim may outrun the code and tests that support it.

## Current production action order

The generated dependency report and AI orchestration plan use this action order whenever hosted evidence is still blocked:

1. Generate the operator evidence starter with `npm run production:evidence-starter -- --out-dir <evidence-dir> --domain enigmamemory.com --tenant <tenant-id>`.
2. Generate the backend environment kit with `npm run production:backend-env -- --out-dir <backend-env-kit-dir> --domain enigmamemory.com --tenant <tenant-id> --environment production`.
   For an urgent <$50 live edge bootstrap, generate Cloudflare custom-domain Worker configs with `npm run production:edge-backend -- --out-dir <edge-backend-workers-dir> --domain enigmamemory.com` and deploy `relay.enigmamemory.com` / `gateway.enigmamemory.com`; this proves public health routing only and must stay fail-closed until the remaining hosted refs are real.
3. Provision relay/gateway, durable storage, KMS/secrets, monitoring, SIEM/log sink, backup/restore, DNS/TLS, network policy, tenant policy, metering, settlement, public-site security, threat model, legal/compliance, support/SLA, incident drill, and deployment rollout evidence outside public artifacts.
4. Validate hosted-live evidence with `npm run production:hosted-live -- --evidence <hosted-backend-live.json>`.
5. Build and validate the final operator packet with `npm run production:acceptance:packet ... --validate` and `npm run production:acceptance -- --packet <operator-acceptance-packet.json>`.

The 25 hosted refs are grouped for execution into deployment, security, resilience, operations, governance, and commercial workstreams. `production:status` and `production:orchestrate` expose the grouped detail through `next_phase.details` / `next_phase_details`. Any missing group remains a launch blocker; no AI lane may collapse, waive, or mark those refs complete without real external evidence.

## Overnight schedule to 9:00 AM CST

### 8:00 PM-8:30 PM CST — command-center lock

GPT-5.5:

- freezes the objective and claim boundaries,
- assigns Kimi implementation slices,
- assigns collateral owners,
- confirms the current release posture is local/package/Docker demo unless deployment evidence proves otherwise,
- records blockers requiring user credentials, domain, cloud, or KMS.

Kimi Code:

- confirms the repo state and target files for each slice,
- starts only assigned slices,
- avoids broad refactors outside a slice.

Acceptance gate:

- every worker has a slice, an owner, an acceptance list, and a non-claim list;
- no worker is allowed to describe hosted/BYOC infra as live.

### 8:30 PM-10:30 PM CST — backend proof and local package sprint

Parallel workstreams:

1. Proof lifecycle: receipt schemas, active-set/tombstone verification, plaintext-minimized public artifacts, adversarial verification fixtures.
2. Package and CLI: bin entry points, import-safety, local no-network `init`/`remember`/`context`/`export`/`verify` path, `doctor`, help text.
3. MCP server: stdio JSON-RPC compatibility, tools/resources/prompts, stdout/stderr separation, fail-closed errors.
4. Boundary harness: declared boundary classifications, no claims about unobserved provider behavior.

Acceptance gate:

- local no-network path works without provider, database, package-registry, cloud, relay, or gateway credentials;
- receipts and public proof artifacts do not expose raw memory plaintext;
- verification proves Enigma-controlled state only;
- MCP errors and notifications are protocol-compatible;
- failing boundary cases classify rather than overclaim.

### 10:30 PM-12:00 AM CST — connectors, importers, capsule, and verifier sprint

Parallel workstreams:

1. Connectors: Claude Desktop, Cursor, Kimi Code, VS Code/Cline, Roo, OpenCode, generic MCP; backup, idempotent reconnect, disconnect.
2. Importers: ChatGPT, Claude, Mem0, Letta, LangGraph, Zep/Graphiti, Enigma Capsule; source limitations and completeness flags preserved.
3. Capsule verification: report roots, limitations root, completeness summary, trust descriptor, no raw memory plaintext.
4. CLI docs/help: install and connector guidance generated from real command names.

Acceptance gate:

- connector writes are scoped and reversible;
- source imports become canonical only after vault writes;
- `complete: true` appears only when the source explicitly reports completeness;
- capsule public metadata contains hashes/roots/counts/limitations, not raw memory text.

### 12:00 AM-1:30 AM CST — relay, gateway, Docker, and enterprise policy sprint

Parallel workstreams:

1. Relay local service: health, opaque encrypted record push, witness checkpoint, pairing flow, plaintext rejection.
2. Gateway local service: policy read/write, default-deny evaluation, decision receipts, SIEM plaintext minimization.
3. Docker demos: source-checkout image/compose behavior for local relay/gateway demos only.
4. Enterprise runbooks: hosted/BYOC requirements, tenant policy lifecycle, legal hold, audit route, backup/restore, incident response.

Acceptance gate:

- relay stores opaque encrypted records and signs roots/checkpoint metadata only;
- gateway denies unknown providers, models, regions, purposes, and sensitivities;
- SIEM export contains identifiers, hashes, reason codes, and policy metadata only;
- Docker language stays local-demo scoped;
- hosted/BYOC sections are blocked unless real credentials and operator infrastructure exist.

### 1:30 AM-2:30 AM CST — browser and desktop product sprint

Parallel workstreams:

1. Browser bridge: Manifest V3 scaffold, native host contract, explicit user approval, injection receipts, no sync storage for raw memory.
2. Desktop scaffold: vault, MCP, clients, import/export, verifier, delete/prove, mesh, enterprise screens.
3. Product copy: local operational evidence vs cryptographic proof boundaries.

Acceptance gate:

- extension insertion requires explicit user action;
- insertion receipts contain target metadata and receipt references, not raw memory artifacts;
- desktop state is described as operational evidence only;
- neither surface claims provider-side deletion or model forgetting.

### 2:30 AM-3:30 AM CST — first GPT-5.5 architecture and security review

GPT-5.5 reviews all completed Kimi slices for:

- architecture drift,
- proof semantics,
- plaintext leaks,
- fail-open behavior,
- installability regressions,
- connector config safety,
- protocol compatibility,
- claim overreach.

Kimi Code fixes only review findings and their direct tests. Do not start cosmetic work while a release-critical blocker is open.

Acceptance gate:

- every rejection has an owner and fix path;
- every accepted slice has targeted evidence;
- unresolved hosted/BYOC blockers remain explicit blockers, not launch claims.

### 3:30 AM-5:00 AM CST — collateral and technical narrative sprint

Parallel workstreams:

1. Whitepaper math and diagrams: receipt lifecycle, active set/tombstone proof, checkpoint/witness flow, gateway decision proof, importer/capsule limitation roots.
2. Website technical sections: install path, MCP, proof, importer/capsule, relay/gateway local demos, hosted/BYOC blockers.
3. Competitive analysis: Enigma vs provider-native memory, vector DBs, agent frameworks, cloud memory APIs, enterprise gateways, decentralized storage.
4. Claim-boundary audit: README, website, docs, whitepaper, demos, checklist.

Acceptance gate:

- diagrams explain Enigma-controlled proofs without provider deletion claims;
- no public proof example shows raw memory plaintext;
- competitive analysis is precise and does not invent competitor weakness;
- website/README says hosted/BYOC requires infrastructure and credentials.

### 5:00 AM-6:30 AM CST — second implementation review and release checklist pass

GPT-5.5:

- reviews Kimi fixes,
- maps each production-release checklist item to evidence or blocker,
- blocks any unsupported launch claim,
- confirms package/local/Docker demo posture,
- confirms CI uses the same local package gates (`npm run check`, `npm test`, and `npm pack --dry-run`) on Node 24 for Ubuntu and Windows where practical, with only optional Ubuntu `release:audit` when the script exists.

Kimi Code:

- closes remaining slice defects,
- updates targeted tests and fixtures,
- removes obsolete scaffolding introduced during the night.

Acceptance gate:

- checklist differentiates released, local-demo, source-only, and blocked hosted/BYOC surfaces;
- no compatibility shim or deprecated path remains unless explicitly required by the checklist;
- release notes use only approved wording.

### 6:30 AM-7:30 AM CST — launch package assembly

Parallel workstreams:

1. README: install, local smoke, MCP, connectors, relay/gateway, enterprise blockers, claim boundary, links.
2. Whitepaper: final proof flow, limitations, diagrams, no unsupported benchmarks.
3. Website: technical sections, CTA path, local-first setup, hosted/BYOC waitlist language if infrastructure is not live.
4. Release checklist: final gates and blockers.
5. Internal handoff: open risks, evidence locations, reviewer notes, `production:handoff`, Cloudflare Pages release packet, and Cloudflare token-policy packet.

Acceptance gate:

- a new reader can install and run the local no-network path from README/checklist;
- a buyer can tell exactly what is local, what is demo, and what needs operator/customer infrastructure;
- a reviewer can find every proof claim's supporting surface.

### 7:30 AM-8:30 AM CST — final GPT-5.5 release review

GPT-5.5 runs the final review as release owner:

- verify backend/test/collateral alignment,
- verify all non-claims are absent,
- verify blockers are explicit,
- verify no raw memory plaintext appears in public proof examples,
- verify no hosted/BYOC live claim exists without credentials and deployment evidence,
- verify any benchmark, if present, includes the exact measured repo command and result.

Acceptance gate:

- ACCEPT: launch package can be presented with listed blockers;
- ACCEPT_WITH_FIXES: only narrow fixes remain and owners are assigned before 9:00 AM CST;
- REJECT: proof integrity, installability, or claim-boundary issue remains.

### 8:30 AM-9:00 AM CST — handoff package

GPT-5.5 produces the 9:00 AM CST handoff:

- accepted surfaces,
- blocked surfaces,
- evidence commands/results collected by the orchestrator, including release audit, public-site preflight/security, Cloudflare Pages packet, Cloudflare token policy, production handoff, and infrastructure readiness,
- exact claim boundaries,
- credential/domain/cloud/KMS blockers,
- next implementation queue.

Kimi Code remains available for narrow fixes only. Do not begin new feature scope in this window.

Acceptance gate:

- handoff preserves the original objective;
- open blockers are named without pretending completion;
- launch copy is constrained to verified local/package/demo capabilities.

## If work continues past 9:00 AM CST

Continue in this order:

1. Fix rejected proof/security/installability findings.
2. Fix checklist evidence gaps for local/package/MCP/importer/relay/gateway demos.
3. Fix collateral claim-boundary findings.
4. Finish hosted/BYOC deployment only after the user supplies credentials, domain, cloud account/project, KMS/secrets path, durable storage target, TLS ingress, monitoring, backups, incident owner, and SIEM/log routing.
5. Re-run GPT-5.5 review before any release-status change.

Do not convert a blocker into a softer success definition. If hosted/BYOC infrastructure is not configured, the release posture remains local/package/Docker demo plus deployment runbooks.

## Handoff and review cadence

Every workstream uses this cadence:

1. Kimi receives a slice brief with target files, non-goals, and acceptance criteria.
2. Kimi implements the slice and runs only targeted checks for that slice.
3. Kimi reports changed files, commands run, results, and unresolved risks.
4. GPT-5.5 reviews code, tests, docs, proof artifacts, and claims.
5. Kimi fixes accepted findings at the source.
6. GPT-5.5 accepts, accepts with narrow fixes, or rejects.

Review intervals:

- checkpoint every 60 minutes for dependency/blocker triage,
- hard reviews at 2:30 AM, 5:00 AM, and 7:30 AM CST,
- immediate review for any proof, plaintext, provider-deletion, hosted/BYOC, or token-claim change,
- 9:00 AM CST final handoff.

## Backend, tests, and collateral priority matrix

| Priority | Area | Owner | Must be true before collateral can claim it |
| --- | --- | --- | --- |
| P0 | Receipt verification and active/tombstone state | Kimi implements, GPT-5.5 reviews | Targeted tests or verifier commands show offline verification for Enigma-controlled state. |
| P0 | Plaintext minimization | Kimi implements, GPT-5.5 reviews | Public proof, relay, witness, SIEM, and capsule artifacts exclude raw memory plaintext. |
| P0 | Local no-network path | Kimi implements, GPT-5.5 reviews | CLI path works without provider/cloud credentials. |
| P0 | Claim boundaries | GPT-5.5 owns, Kimi preserves | Forbidden claims are absent from README, docs, site, demos, and release notes. |
| P1 | MCP and connectors | Kimi implements, GPT-5.5 reviews | Protocol smoke and connector backup/idempotency behavior pass targeted checks. |
| P1 | Importer/capsule | Kimi implements, GPT-5.5 reviews | Limitations and completeness flags survive import/export; canonicalization requires vault write. |
| P1 | Relay/gateway local demos | Kimi implements, GPT-5.5 reviews | Local services run as demos and reject plaintext/unknown policy cases. |
| P2 | Browser/desktop | Kimi implements, GPT-5.5 reviews | UI copy and receipts do not imply provider-side deletion or cryptographic proof from UI state. |
| P2 | Whitepaper/website/sales collateral | GPT-5.5 owns claims, writers draft | Every claim is backed by accepted implementation evidence or is labeled as a blocker/future deployment requirement. |

## Targeted evidence queue

The orchestrator, not individual collateral writers, collects final evidence. Kimi runs only targeted checks for the slice it changed; GPT-5.5 reviews whether the evidence supports the claim.

Required evidence before public launch language can use the corresponding claim:

- Local package/import safety: dry-run pack inspection, bin shebang/license check, and source import-safety check from `production-release-checklist.md`.
- CI package gates: `.github/workflows/ci.yml` mirrors the local green gates with Node 24 on Ubuntu/Windows, does not require Docker/cloud/deploy credentials, and is treated as package evidence rather than a replacement for manual website, deployment, or legal review.
- Local no-network lifecycle: `enigma init`, `enigma remember`, `enigma context`, `enigma export`, and `enigma verify` against a local bundle with non-public demo content supplied through a local variable, not pasted into public proof examples.
- MCP compatibility: stdio `initialize`, `tools/list`, `resources/list`, and `prompts/list` transcript with no non-JSON logs on stdout.
- Connector safety: targeted connector tests or demos showing backup, idempotent reconnect, explicit MCP command path handling, and scoped disconnect.
- Importer/capsule safety: importer demo or tests showing source limitations, completeness flags, limitation roots, report hashes, and no raw memory text in public capsule verifier metadata.
- Relay local demo: `enigma-relay demo`, `GET /health`, opaque `POST /relay/push`, witness checkpoint signing, and plaintext-looking payload rejection.
- Gateway local demo: `enigma-gateway demo`, `GET /health`, policy read/write, default-deny unknown inputs, signed decision verification, and plaintext-minimized SIEM export.
- Public website live evidence: `python scripts/preflight_public_site.py --site _public_site`, `npm run production:site -- --site <_public_site>`, Cloudflare Pages deploy through the local operator token, `node scripts/cloudflare-ops.mjs --cloudflare-env-file <local-secret-file> pages verify --url https://enigmamemory.com/?v=deploy-20260624-0509 --project-name enigma-memory --domain enigmamemory.com --cloudflare-live required`, and a cache-busted read confirming the Enigma title and public whitepaper updates.
- Cloudflare credential scope: `npm run cloudflare:token-policy -- --mode all --account-id <account-id> --project-name enigma-memory --domain enigmamemory.com`, `npm run cloudflare:token-request -- --permission-groups <permission-groups.json> --mode all --account-id <account-id>`, and `node scripts/cloudflare-ops.mjs token verify` only with a local secret source that is never pasted into chat, docs, review packets, or public artifacts. The current all-mode token policy includes Pages, Registrar, and Workers Scripts Read/Edit so the hosted edge probe can be deployed when an operator creates an updated token.
- Production handoff: `npm run production:handoff -- --site <_public_site> --project-name enigma-memory --domain enigmamemory.com --live-url https://enigmamemory.com/ --expect-title Enigma` and `npm run infrastructure:readiness -- --manifest <completed-manifest.json> --live --cloudflare-live required` before any hosted backend/BYOC live claim.
- Browser/desktop surfaces: manual review that approval gates and copy distinguish operational UI state from cryptographic proof.
- Collateral: search/review pass proving forbidden claims are absent or appear only as explicit non-claims.

If any evidence item is missing, collateral must either omit the claim or label the surface as blocked; it must not substitute roadmap language for release evidence.

## Blockers requiring user or operator inputs

The following cannot be completed by repository edits alone:

- npm package publishing credentials for `enigma-memory`,
- hosted backend deployment account/project credentials,
- backend DNS/TLS ingress for public relay/gateway health probes, separate from the live static website,
- durable storage account, database, volume, or bucket for hosted state,
- KMS/secrets manager for signing keys, database credentials, API tokens, tenant credentials, and rotation policy,
- monitoring, alerting, log retention, backup, restore, and incident-response ownership,
- tenant SIEM/log export destination and plaintext-minimization approval,
- BYOC customer cloud/VPC/cluster/private-network access,
- BYOC customer KMS/secrets, storage, backup, data residency, legal hold, and admin-access policy,
- compliance audit evidence for any regulated-compliance claim,
- benchmark harness and measured results for any benchmark claim.

Until these are supplied and verified, launch language must say Enigma has local/package/Docker demo surfaces and hosted/BYOC deployment runbooks, not live hosted/BYOC service availability.

## 9:00 AM CST release decision format

Use one of these outcomes:

- `ACCEPT_LOCAL_LAUNCH`: local no-network package, MCP, verifier, connectors/importers, local relay/gateway demos, and claim-bounded collateral are accepted; hosted/BYOC remains blocked on listed operator inputs.
- `ACCEPT_WITH_NARROW_FIXES`: same posture, but named non-critical fixes must land before public publication.
- `REJECT`: proof integrity, installability, plaintext minimization, or claim-boundary defects remain.

The decision must include:

- changed surfaces,
- evidence collected,
- blocked surfaces and exact missing inputs,
- forbidden claims confirmed absent,
- next Kimi queue,
- next GPT-5.5 review owner.
