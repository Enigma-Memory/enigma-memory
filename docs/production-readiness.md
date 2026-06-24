# Production readiness gates

Use these gates before public launch, hosted availability, BYOC pilot handoff, or on-prem production language. A gate passes only when evidence exists in the release or customer evidence repository. Legal/security review is required before any SOC 2, HIPAA, GDPR, certification, regulatory, or compliance-status claim is used externally. Provider deletion and model forgetting claims remain out of scope.

Security review inputs: [`../SECURITY.md`](../SECURITY.md) defines supported versions, vulnerability reporting, disclosure, secret-handling, and incident policy; [`security-threat-model.md`](security-threat-model.md) defines assets, trust boundaries, adversaries, abuse cases, controls, residual risks, and verification evidence.

## Gate 1 — Proof integrity

Required evidence:

- valid receipt verifies,
- changed receipt fails,
- wrong signer fails,
- deleted receipt breaks the chain,
- reordered receipt breaks the chain,
- inserted receipt breaks the chain,
- stale checkpoint fails,
- non-membership proof rejects present item,
- non-membership proof rejects wrong root.

## Gate 2 — Memory lifecycle

Required evidence:

- memory create emits a signed receipt,
- memory retrieval emits a signed receipt,
- context injection emits a signed receipt,
- memory deletion emits a tombstone,
- deleted memory is absent from active state,
- deleted memory is not served by context compiler,
- proof bundle verifies offline,
- provider-native memory is documented as cache only, not canonical durable memory state.

## Gate 3 — Boundary honesty

Required evidence:

- committed canary crossing is detected,
- scratchpad leak produces false-assurance finding when uninstrumented,
- tool-output leak produces false-assurance finding when uninstrumented,
- mitigated scratchpad route-through-channel removes false assurance,
- unknown boundary path fails,
- semantic/RAG leakage is either solved or declared out-of-scope as `NARROW_GO`,
- public and enterprise docs do not claim provider deletion, semantic forgetting, model-weight forgetting, complete side-channel absence, or factual truth.

## Gate 4 — Provider-neutral interface

Required evidence:

- CLI works without network,
- verifier works without network,
- MCP tools expose remember, search, context pack, delete, and receipt verification,
- adapter contracts do not make provider-native memory canonical,
- hosted, BYOC, and on-prem/air-gapped deployment responsibilities are distinguished in docs and sales materials.

## Gate 5 — Honest release language

Required evidence:

- deletion claim says Enigma active serving state, not global AI forgetting,
- non-membership claim says committed channel or active set, not never learned,
- import claim preserves source limitations,
- product docs do not claim compliance, provider deletion, semantic forgetting, or model-weight deletion,
- SOC 2, HIPAA, GDPR, certification, regulatory, and compliance-status wording is absent unless legal/security have approved the exact claim and scope,
- hosted cloud is not described as live until deployment credentials, domains, TLS, durable storage, KMS/secrets, monitoring, backups, support, and incident response are production-ready.
- security policy and threat model review confirms vulnerability intake, disclosure, incident handling, secret handling, plaintext minimization, and proof-boundary non-claims are current.

## Gate 6 — Enterprise deployment modes

Required evidence:

- hosted mode identifies Enigma/operator responsibilities for infrastructure, KMS/secrets, logging, support, backups, monitoring, and incident response,
- BYOC mode points to `enigma/docs/enterprise-byoc-runbook.md` and identifies customer control over cloud account, VPC/cluster/private network, KMS/BYOK, logs, SIEM export, network policy, backups, data residency, operator access, and incident response,
- on-prem/air-gapped mode has a separate package distribution, update, verifier, backup/restore, support, and offline-operations plan before production language is used,
- all modes keep raw memory plaintext out of receipts, relay records, witness checkpoints, SIEM events, public proof artifacts, public roots, and support artifacts; any customer-approved content review must use the approved vault/eDiscovery path instead of these artifacts.

## Gate 7 — BYOC operational acceptance

Required evidence from the BYOC runbook:

- ingress policy allows only approved networks and endpoints,
- egress policy is default-deny with documented exceptions,
- tenant policy lifecycle has versioned policy references and fail-closed deny cases,
- KMS/BYOK evidence includes key reference/version without raw key material,
- SIEM export is plaintext-minimized,
- data residency is documented for storage, backups, logs, SIEM, relay/witness persistence, and support access,
- legal hold blocks destructive delete/tombstone workflows for held records,
- backup/restore rehearsal succeeds and restored proof bundles verify,
- incident response drill identifies commander, contacts, evidence preservation, communications, and remediation path,
- operator access uses named accounts, least privilege, logging, and approved break-glass flow.

## Gate 8 — Enterprise pilot exit packet

Required evidence:

- deployment mode and responsibility matrix are approved by customer and Enigma owners,
- proof bundle location and verifier output are stored in the approved evidence repository,
- gateway allow/deny/legal-hold decisions include policy references and no plaintext memory bodies,
- SIEM/eDiscovery sample includes minimized metadata only,
- BYOC/on-prem acceptance-test status is recorded when customer-controlled deployment is in scope,
- proof boundary statement is included with the packet,
- legal/security review status is recorded for any compliance-status language,
- security policy and threat model links are included in the public/customer review packet,
- production blockers have owners and next review dates.

## Gate 9 — Infrastructure readiness and backend architecture

Required evidence:

- `npm run infrastructure:readiness -- --manifest <path>` emits `enigma.infrastructure_readiness.v1` JSON for the exact `enigma.infrastructure_readiness_manifest.v1` manifest under review,
- the readiness JSON records `schema`, `ok`, `generated_at`, `mode`, `credentials_required:false`, `credentials_used`, `readiness.contract_ready`, `readiness.public_live_ready`, `readiness.cloudflare_observed`, `readiness.hosted_live_ready`, `checks`, `external_blockers`, and `claim_boundary`,
- contract-only readiness is accepted as local/release evidence only and does not claim hosted relay/gateway, KMS, durable storage, SIEM, backup/restore, operator, or token readiness is live,
- any `--live` run is limited to declared public endpoint observation; relay/gateway public live evidence must use exact `/readyz` or `/livez` probe paths, while existing `/health` remains local/demo or private service evidence only; probe reachability is not proof of production storage, KMS, private auth, SIEM, backup, or operator acceptance,
- `--cloudflare-live off|auto|required` is used only for optional Cloudflare token/account/static-site observation and never for mutation, purchase, deployment, DNS, storage, KMS, SIEM, backup, or token-launch readiness,
- [`production-backend-architecture.md`](production-backend-architecture.md), deployment manifests, and [`deployment-runbook.md`](deployment-runbook.md) agree on relay/gateway responsibilities, runtime auth, durable storage, KMS signer/key references, audit outbox/SIEM routing, backup/restore, and network policy,
- hosted live readiness is true only when the manifest contract is complete, requested live checks pass, [`operator-acceptance-packet.md`](operator-acceptance-packet.md) records a **go** decision, and external blockers are empty.
