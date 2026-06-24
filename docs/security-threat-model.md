# Security threat model

This source-tree review document describes the security posture Enigma can review today from the source tree and release evidence. It is not a compliance certification, provider-deletion proof, model-forgetting proof, or tamper-proof hardware guarantee.

## Scope and claim boundary

In scope:

- local vault, receipts, proof bundles, verifier, passport, and context packs;
- CLI, MCP server, connectors, importer/capsule flows, relay/witness, gateway, mesh-facing relay records, browser extension, desktop scaffold, Docker local demo, hardware collateral, and hosted/BYOC/on-prem deployment responsibilities;
- public documentation and release evidence that must avoid raw memory plaintext in proof examples.

Out of scope:

- closed-provider internals, provider-native memory deletion, hidden personalization, logs, backups, caches, embeddings, model weights, and semantic forgetting;
- third-party accounts, browser/provider pages, cloud accounts, package registries, customer networks, and hardware environments unless the owner has provided written authorization;
- compliance status or certification language unless separately approved by legal/security with scoped evidence.

## Assets

| Asset | Security goal | Notes |
| --- | --- | --- |
| Local vault bundle | Confidentiality, integrity, user custody, recoverability | Canonical Enigma memory state for local mode. Raw memory plaintext must not become public proof material. |
| Private signing keys and trust material | Integrity, non-repudiation, rotation readiness | Used for receipts, witness checkpoints, gateway decisions, and verification. Private keys must not appear in packages, images, docs, logs, or support artifacts. |
| Receipts and proof bundles | Offline verifiability, chain integrity, plaintext minimization | Public/exported views should carry commitments, roots, hashes, sequence links, signer metadata, and signatures rather than raw memory bodies. |
| Context packs | Purpose-scoped retrieval, receipt-bound injection, local confidentiality | Private context may be insertable after user/operator approval; public verification output must be redacted/minimized. |
| MCP messages and tool calls | Protocol correctness, fail-closed validation, client compatibility | MCP inputs should be schema/protocol validated and must not make provider-native memory canonical. |
| Connector configs and backups | Safe client setup, atomic writes, minimal secrets | Connector writes should be idempotent and preserve user config without leaking memory content. |
| Import reports and capsules | Source caveat preservation, custody continuity, failed-import safety | Imports are candidates until written through an Enigma vault and receipted. Source completeness limitations remain visible. |
| Relay records and witness checkpoints | Opaque transport, ordering/accountability, plaintext rejection | Relay/witness artifacts must not receive raw memory plaintext. Witnesses sign roots/checkpoint metadata, not memory bodies. |
| Gateway policies and decisions | Default-deny policy enforcement, auditability, tenant control | Decisions should reference policy hashes and minimized metadata. SIEM export must not carry raw memory bodies. |
| Browser extension/native bridge | User-approved insertion, origin/path restrictions, no sync plaintext | Extension records only target metadata, insertion metadata, and receipt metadata. |
| Desktop scaffold | Accurate operator UX, no false cryptographic proof from UI state | UI state is operational evidence only; verifier/proof output remains the cryptographic evidence source. |
| Docker/local services | Reproducible local demo without baked secrets | Images/manifests must not embed vaults, keys, credentials, or raw memory examples. |
| Hosted/BYOC/on-prem deployments | Clear responsibility boundary, operator evidence, incident readiness | Live production language requires credentials, TLS, durable storage, KMS/secrets, monitoring, backups, support, and incident ownership evidence. |
| Hardware concepts | Key visibility/locality/custody demos | Hardware can anchor device identity or signing workflows; it is not claimed tamper-proof. |

## Trust boundaries

1. **User/local machine boundary:** vault files, private context, native host, CLI, verifier, desktop, browser extension, and connector configs share a local trust domain controlled by the user or enterprise workstation policy.
2. **Public proof boundary:** exported receipts, public verifier output, public roots, documentation examples, launch site artifacts, and support-safe evidence must be plaintext-minimized.
3. **MCP/client boundary:** MCP clients can request memory operations, but server validation and receipt generation remain Enigma responsibilities. Provider-native memory is cache only.
4. **Browser/provider boundary:** the extension runs inside provider pages but must require user approval before insertion and cannot prove provider-side deletion or model behavior.
5. **Relay/witness boundary:** network services handle opaque encrypted records, roots, checkpoint metadata, signatures, pairing, and authorization, not raw memory plaintext.
6. **Gateway/enterprise policy boundary:** gateway policy evaluation produces signed decisions and minimized SIEM/eDiscovery metadata. Customer/operator policy and KMS/SIEM controls are outside the package by default.
7. **Importer/capsule boundary:** source exports enter as untrusted inputs with limitations and completeness flags. Canonicalization occurs only after a vault write and receipt.
8. **Hosted/BYOC/on-prem boundary:** hosted mode is operator controlled; BYOC/on-prem mode is customer controlled. Responsibility for KMS/BYOK, cloud accounts, logs, backups, data residency, and incident response must be explicit.
9. **Hardware/physical boundary:** devices may hold/display signing or proof state. Physical compromise, side-channel resistance, secure manufacturing, and tamper resistance require separate evidence.
10. **Docker/package boundary:** package and image artifacts are distribution boundaries and must not contain local vaults, secrets, private keys, or customer data.

## Adversaries and abuse cases

| Adversary / abuse case | Example | Primary controls |
| --- | --- | --- |
| Malicious local process | Reads vault files, native-host messages, connector configs, or private context. | OS permissions, local custody guidance, secret handling, minimal public exports, no connector memory backups. |
| Malicious or compromised MCP client | Sends malformed JSON-RPC, unsupported protocol versions, unknown tools, bad params, or destructive requests. | Protocol/id/param/tool validation, fail-closed errors, receipt verification, bundle-bound verification. |
| Provider page or extension abuse | Auto-inserts context, captures selected text unexpectedly, records raw context in extension storage. | Explicit user click, HTTPS/known-provider checks, no sync storage, transient context, receipt-shape rejection, plain-text insertion only. |
| Import poisoning | Imports incomplete, forged, misleading, or overbroad provider exports/capsules. | Source limitation fields, completeness flags, manifest/payload/trust verification, failed-import no-write behavior, canonical vault receipts only after import. |
| Relay plaintext leakage | Client pushes payload fields such as memory bodies, prompts, transcripts, or content. | Plaintext-looking field rejection, opaque/encrypted record model, hash-only public relay records, paired/signed auth by default. |
| Witness equivocation or bad checkpoint | Witness signs wrong roots, discontinuous checkpoints, or memory-bearing payloads. | Root/continuity checks, signed checkpoints, metadata-only witness artifacts, offline verification. |
| Gateway policy bypass | Unknown provider/region/purpose is allowed or SIEM event leaks memory content. | Default-deny unknowns, policy hashes, signed decisions, trusted key requirement for offline verification, plaintext-minimized SIEM export. |
| Receipt/proof tampering | Receipt is changed, reordered, truncated, signed by wrong key, or extended with unsigned/plaintext fields. | Chain verification, signer verification, prefix-before-current receipt-log semantics, strict public receipt verification, extension-field rejection. |
| Context-pack overexposure | Public verifier or logs reveal private context text. | Redacted public verification, private context used only for local insertion, public-key/trust requirement before `valid:true` public checks. |
| Connector config corruption | Repeated install corrupts client config or leaks backups. | Semantic idempotent writes, atomic writes, backups only on real changes, command/bundle path explicitness. |
| Docker/image secret bake-in | Image includes vault bundle, keys, tokens, or demo memory. | Source-checkout Docker demo only, deployment-runbook secret restrictions, external secret/KMS requirements for production. |
| Hosted/BYOC operator mistake | Missing TLS, weak KMS, overbroad operator access, no backup, no SIEM route, wrong data region. | Production readiness gates, BYOC runbook, responsibility matrix, named owners, least privilege, monitoring, backup/restore, incident drill. |
| Hardware loss or compromise | Device signing key is extracted or appliance is modified. | Key rotation/incident handling, visible custody limitations, no tamper-proof claim, separate hardware evidence required. |
| Documentation overclaim | Public copy implies compliance, provider deletion, model forgetting, token ROI, or tamper-proof hardware. | Claim-boundary review, production readiness gates, explicit non-claims in README/security docs. |

## Component controls and residual risks

### Local vault and receipts

Controls:

- Enigma vault state is the canonical local source for Enigma-controlled memory.
- Receipt verification covers event signatures, signer identity, active/log roots, sequence links, and tamper scenarios such as changed, reordered, inserted, stale, or wrong-signer receipts.
- Export/public surfaces are expected to avoid enumerable plaintext and sanitize plaintext-like keys.

Residual risks:

- Local OS compromise, weak filesystem permissions, user clipboard/history, backups, malware, or support mishandling can expose raw memory outside Enigma's proof controls.
- Receipts prove custody/lifecycle events, not factual truth of memory statements.
- Enigma receipts do not prove deletion from third-party providers, backups, logs, screenshots, or model state.

Verification evidence:

- `docs/release-evidence-2026-06-23.md` records strict public receipt verification, vault plaintext minimization, receipt-log semantics, and bundle-bound verification evidence.
- `docs/production-readiness.md` Gates 1 and 2 enumerate proof integrity and memory lifecycle evidence required before production language.

### Context packs

Controls:

- Context packs are purpose-scoped retrieval artifacts tied to Enigma receipts.
- Public context-pack verification is redacted/minimized and requires explicit public-key/trust material before returning verified success.
- Raw memory text belongs in approved local/private insertion paths, not public proof examples.

Residual risks:

- User-approved insertion intentionally sends selected context to a provider page; after insertion, provider behavior is outside Enigma's control.
- Overbroad query/purpose policy can expose more local context than intended if operator policy is weak.

Verification evidence:

- Release evidence records redacted public context-pack verification and private/public output separation.
- Browser and MCP docs identify user approval and cache-only provider-native memory constraints.

### MCP server

Controls:

- MCP server exposes Enigma operations for init, remember, search, context pack, delete, and receipt verification.
- Protocol versions, ids, params, tool args, notifications, batches, and error codes are validated.
- Provider-native memory remains cache only; Enigma vault state remains canonical.

Residual risks:

- A malicious local MCP client can request authorized operations if it has local access to the configured bundle and process environment.
- Client UX may display private context after an approved context-pack operation.

Verification evidence:

- Release evidence records MCP validation coverage.
- README documents the concrete stdio server command and exposed tools.

### Connectors

Controls:

- Connector profiles target known MCP clients and use explicit command and bundle paths.
- Writes are semantic, idempotent, backed up only on real changes, and atomic.
- Connector configs must not become memory-content backups.

Residual risks:

- Client-specific config locations, environment expansion, and GUI launcher behavior can differ by OS.
- Existing user config may contain unrelated secrets that Enigma must preserve but not expose.

Verification evidence:

- Release evidence records connector write hardening.
- README and `docs/client-connectors.md` document supported profiles and command overrides.

### Importer and capsule flows

Controls:

- Imports from providers/frameworks remain candidates until written into an Enigma vault and receipted.
- Source limitations, confidence, and completeness flags are preserved.
- Capsule verification checks manifest, payload, verifier metadata, trust descriptor, limitations roots, and embedded matching receipt objects before vault writes; failed imports write nothing.

Residual risks:

- Source exports may omit data, include inaccurate content, or encode provider-specific caveats Enigma cannot independently verify.
- Imported memories can be sensitive even when metadata is minimized.

Verification evidence:

- Release evidence records importer/capsule verification and failed-import no-write behavior.
- README import section states canonicalization requires an Enigma vault write and receipts.

### Relay and witness

Controls:

- Relay stores opaque encrypted records and hash-only public relay records.
- Relay rejects plaintext-looking fields and requires paired/signed authorization by default; unauthenticated relay is explicit local/demo mode only.
- Witness checkpoints sign roots and checkpoint/order metadata, enforce root and continuity checks, and must not receive raw memory plaintext.

Residual risks:

- Metadata such as timing, tenant ids, addresses, counts, and service endpoints can still reveal operational patterns.
- Local/demo unauthenticated mode is not production authorization.
- Hosted relay/witness operation requires TLS, durable storage, monitoring, backup, KMS/secrets, incident response, and operator ownership.

Verification evidence:

- Release evidence records relay/mesh plaintext rejection, paired/signed relay authorization, and witness root continuity checks.
- Deployment and production readiness docs require opaque relay/witness artifacts and production operator evidence.

### Gateway and enterprise policy

Controls:

- Gateway evaluates Enigma enterprise policy and emits signed decisions.
- Unknown operations default deny.
- Public decisions and policy responses are plaintext-minimized; internal raw evaluation exposure requires explicit internal state configuration.
- SIEM/eDiscovery export carries minimized metadata, not raw memory bodies.

Residual risks:

- Bad tenant policy can authorize the wrong provider, model, region, purpose, retention, or legal-hold behavior.
- Gateway evidence does not prove provider-side handling after a request leaves Enigma-controlled systems.
- Customer-controlled SIEM/log pipelines may add data outside Enigma's minimization controls.

Verification evidence:

- Release evidence records default-deny gateway behavior and trusted-key requirement for offline decision verification.
- `docs/enterprise-byoc-runbook.md` and `docs/production-readiness.md` define BYOC/on-prem acceptance evidence.

### Browser extension

Controls:

- Manifest V3 scaffold uses the configured native messaging host `com.enigma.native_host`.
- The extension requires explicit user approval before inserting context.
- It avoids sync storage for raw memory and records target metadata, timestamps, receipt metadata, and counts only.
- Unknown or non-HTTPS provider paths fail closed; all insertion is plain text.

Residual risks:

- Provider pages can read inserted context after the user approves insertion.
- Browser extension store review, native-host installation, enterprise browser policy, and provider DOM changes are external operational dependencies.

Verification evidence:

- `apps/browser-extension/README.md` documents custody, approval, native-host envelope, and insertion-record constraints.
- Release evidence records browser approval, URL minimization, no sync storage permission, and sanitized native-bridge errors.

### Desktop shell

Controls:

- Desktop scaffold models local operations and labels UI state as operational evidence.
- Cryptographic proof remains verifier/proof-bundle output, not visual UI state.
- Raw-looking imports are rejected or redacted in the product surface evidence.

Residual risks:

- Static scaffold packaging inside a desktop shell still needs OS-specific signing, auto-update, sandboxing, secret storage, and crash-report controls before production desktop claims.

Verification evidence:

- Release evidence records desktop copy/inspection hardening.
- README states desktop UI state is operational evidence only.

### Docker and package distribution

Controls:

- Docker Compose is a source-checkout local relay/gateway demo path.
- Package files list excludes local vaults and deployment credentials.
- Deployment docs prohibit baking vault bundles, private keys, tenant credentials, or cloud secrets into images.

Residual risks:

- A production container deployment still needs external secret injection, TLS, network policy, durable storage, monitoring, backups, and image provenance controls.
- `npm pack --dry-run` and CI are package evidence only, not cloud deployment evidence.

Verification evidence:

- README and deployment docs separate source Docker demos from hosted/BYOC readiness.
- Release evidence states local audit excludes Docker daemon runtime and external deployment credentials.

### Hosted, BYOC, and on-prem operation

Controls:

- Hosted mode requires Enigma/operator responsibility for infrastructure, TLS, durable storage, KMS/secrets, logging, support, backups, monitoring, and incident response.
- BYOC/on-prem mode requires customer-controlled cloud/network, KMS/BYOK, logs, SIEM, backups, data residency, operator access, and incident response.
- Production readiness gates require responsibility matrices, acceptance packets, proof boundaries, legal/security review for compliance wording, and owners for blockers.

Residual risks:

- Until deployment evidence exists, hosted/BYOC/on-prem should not be described as live production.
- Shared responsibility mistakes can create gaps in backups, key rotation, incident notice, support access, or data residency.

Verification evidence:

- `docs/enterprise-byoc-runbook.md` and `docs/production-readiness.md` define operator acceptance requirements.
- README states hosted cloud is not included by default and requires deployment credentials and infrastructure.

### Hardware

Controls:

- Hardware collateral frames devices as proof/custody visibility, locality, device identity, and signing/workflow anchors.
- Security docs explicitly avoid tamper-proof, raw compute superiority, and provider-internal claims.

Residual risks:

- Physical compromise, manufacturing supply chain, secure-element configuration, key extraction, enclosure tampering, updates, and field servicing require separate hardware security evidence.

Verification evidence:

- `hardware/README.md` states the hardware claim boundary and excludes physical-compromise resistance and provider-internal proof.

## Verification checklist for reviewers

Before approving release, public launch, hosted availability, or BYOC pilot language, reviewers should confirm:

- target docs link this threat model and `SECURITY.md`;
- no public proof example contains raw memory plaintext;
- receipts, public verifier output, relay records, witness checkpoints, gateway decisions, SIEM exports, browser insertion records, connector backups, Docker images, and support artifacts are plaintext-minimized;
- local verifier evidence covers changed/wrong-signer/reordered/inserted/truncated/stale proof failures;
- MCP fails closed on malformed protocol inputs and unsupported tool calls;
- relay/witness require production authorization and reject plaintext-looking memory fields;
- gateway default-denies unknown inputs and signs decisions with trusted verification material;
- importer/capsule failed verification writes nothing and preserves source limitations;
- browser extension requires user approval and records no raw memory plaintext in extension storage;
- desktop copy does not equate UI state with cryptographic proof;
- Docker and packages contain no vault bundles, keys, credentials, or private memory examples;
- hosted/BYOC/on-prem language is blocked until credentials, TLS/domain, storage, KMS/secrets, monitoring, backups, support, incident response, and tenant/customer acceptance evidence exist;
- no copy claims compliance/certification, provider deletion, model forgetting, token ROI/profit/equity/revenue share, tamper-proof hardware, raw compute superiority, or benchmark leadership without scoped evidence.

## Residual-risk summary

Enigma reduces ambiguity around Enigma-controlled memory custody by making local vault state, receipts, context packs, relay/witness records, and gateway decisions verifiable and plaintext-minimized. It does not remove the need for host security, browser/provider trust decisions, customer policy review, deployment hardening, key management, backups, incident response, legal/compliance approval, or separate hardware security evidence.
