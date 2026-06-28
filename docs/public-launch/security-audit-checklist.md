# Enigma Memory — Security Audit Readiness Checklist

**Purpose:** Verify that Enigma Memory is ready to engage an external security auditor before public launch. Each item below should be completed or explicitly deferred with documented risk before the audit kickoff. This document is public-safe: it contains no secrets, private keys, RPC endpoints, or internal paths.

**Target state:** A reputable external auditor can run this checklist, access a clean source snapshot, and begin review within one business day.

---

## 1. Source-code readiness

| # | Item | Definition of ready | Evidence / artifact |
| --- | --- | --- | --- |
| 1.1 | **Tagged audit snapshot** | A Git tag (e.g., `audit-YYYY-MM-DD`) exists for the exact commit under review. The snapshot is frozen for the duration of the audit. | Git tag and release notes. |
| 1.2 | **Clean build** | `cargo check --workspace` passes in the Anchor workspace; `npm test` passes in the off-chain node; `npm run build` and `typecheck` pass in the webapp. | CI logs and local run records. |
| 1.3 | **Documented architecture** | Architecture specs describe the smart contracts, node/MCP, webapp, desktop app, encryption layer, and custody model. | `cortex-v3/specs/unified-architecture.md`, `cortex-v3/specs/design-*.json`, and this RFP. |
| 1.4 | **Known issues list** | All acknowledged bugs, TODOs, and deferred risks are written down and linked to the relevant code. | `BLOCKERS.md` or equivalent issue tracker. |
| 1.5 | **No test-only backdoors** | All fixed test entropy, mock signers, and bypass flags are clearly marked and removed from production builds. | Code review + grep for `TEST_MASTER_ENTROPY`, `debug`, `skip_auth`, etc. |
| 1.6 | **Dependency inventory** | A complete dependency list is available, including Rust crates, npm packages, and any vendored or forked code. | `Cargo.lock`, `package-lock.json`, `pnpm-lock.yaml`, SBOM. |

---

## 2. Smart-contract readiness

| # | Item | Definition of ready | Evidence / artifact |
| --- | --- | --- | --- |
| 2.1 | **All programs compile** | `anchor build --no-idl` (or equivalent) succeeds for all six programs. | Build log. |
| 2.2 | **Tests pass** | `anchor test --skip-build` passes; integration tests cover the happy path and key failure modes. | Test log with pass count. |
| 2.3 | **PDA and seed documentation** | Every PDA seed derivation, bump usage, and `init_if_needed` constraint is documented in a single reference. | Spec table or inline Rust docs. |
| 2.4 | **Access-control matrix** | Each instruction lists required signers, writable accounts, and authorization checks. | Access-control spreadsheet or spec. |
| 2.5 | **Arithmetic review** | All `u64` arithmetic (balances, fees, royalties, caps) has been manually checked for overflow/underflow and unit consistency. | Review notes in issue tracker. |
| 2.6 | **SPL token safety** | All token transfers use `transfer_checked` with verified mint decimals; token account ownership is validated. | Code review + tests. |
| 2.7 | **IDL accuracy** | Committed IDL files match the source and include no placeholder or stale accounts. | Diff between generated and committed IDLs. |
| 2.8 | **Verifiable build** | The build can be reproduced by a third party and produces a deterministic program hash. | `solana-verify` or Anchor verify instructions. |
| 2.9 | **Upgrade authority documented** | Current upgrade authority for each program is documented; a plan exists to transfer authority to a multisig before mainnet. | `deploy/MAINNET_SETUP.md` or equivalent. |

---

## 3. Off-chain node and MCP server readiness

| # | Item | Definition of ready | Evidence / artifact |
| --- | --- | --- | --- |
| 3.1 | **Endpoint inventory** | Every HTTP and MCP endpoint is listed with method, required authentication, and authorization scope. | API reference doc. |
| 3.2 | **Session verification** | Every privileged operation validates the on-chain `Session` PDA (exists, not revoked, not expired, correct scope, within caps). | Unit/integration tests. |
| 3.3 | **OAuth 2.1 + PKCE** | The authorization server uses PKCE, validates state and redirect URI, and stores tokens securely. | Code review + OAuth test flow. |
| 3.4 | **Input validation** | All user-provided input (memory text, IDs, query strings, JSON-RPC) is length-limited and sanitized before processing. | Unit tests, fuzz seeds. |
| 3.5 | **Rate limiting** | Public endpoints enforce per-user and per-IP rate limits to prevent abuse. | Configuration + load test. |
| 3.6 | **Logging hygiene** | No plaintext memory, embeddings, private keys, seed phrases, or wallet entropy is logged at any log level. | Log sample review. |
| 3.7 | **Error messages** | Error responses do not leak internal paths, stack traces, account details, or cryptographic material. | API error test suite. |
| 3.8 | **Secret management** | Runtime secrets (RPC URLs, OAuth client secrets, encryption keys) are loaded from environment or a secrets manager, never hard-coded. | Env-only code review. |
| 3.9 | **Container / deployment** | Dockerfile and docker-compose use non-root users, pin base images, and expose only required ports. | Container scan report. |

---

## 4. Desktop application readiness

| # | Item | Definition of ready | Evidence / artifact |
| --- | --- | --- | --- |
| 4.1 | **Command surface inventory** | All Tauri commands are listed with allowed inputs and returned data. | Command table. |
| 4.2 | **Path sandboxing** | The app cannot read or write outside its designated vault and config directories. | Permission audit + tests. |
| 4.3 | **Signed updates** | The updater verifies the signature of every downloaded manifest and payload before installation. | Update test + signature verification log. |
| 4.4 | **Crash-report redaction** | Opt-in crash reports exclude memory, wallet data, local paths, and credentials. | Sample crash report review. |
| 4.5 | **Connector safety** | Client connector backup/repair writes preserve JSON structure and cannot target arbitrary files. | Connector tests. |
| 4.6 | **Build reproducibility** | The desktop app build is documented and can be reproduced from a clean checkout. | CI build log. |

---

## 5. Encryption layer readiness

| # | Item | Definition of ready | Evidence / artifact |
| --- | --- | --- | --- |
| 5.1 | **DEK derivation documented** | The HKDF-SHA256 inputs (IKM, salt, info) are specified, unique per user, and resistant to rainbow-table attacks. | Encryption design doc. |
| 5.2 | **AES-256-GCM correctness** | IVs are 96-bit random/non-repeating, tags are verified on decrypt, and keys are 256-bit. | Code review + test vectors. |
| 5.3 | **Key separation** | Encryption keys, signing keys, and API credentials are never reused across different purposes. | Key-usage matrix. |
| 5.4 | **No fixed test keys in production** | Production builds cannot use the fixed test master entropy or all-zero salts. | Build-time assertion or env check. |
| 5.5 | **Recovery documented** | Users can recover access to their vault through wallet recovery or passphrase if applicable, with clear limitations. | User-facing recovery doc. |
| 5.6 | **Future migration path** | A plan exists to migrate from the current SQLite-backed keys to TEE/HSM/KMS storage without data loss. | Migration design note. |

---

## 6. Key custody and operational readiness

| # | Item | Definition of ready | Evidence / artifact |
| --- | --- | --- | --- |
| 6.1 | **Session delegation documented** | The Session PDA lifecycle (create, extend, revoke, pause-all) is documented with scope bitmaps and caps. | `cortex-v3/specs/frictionless-first-architecture.md`. |
| 6.2 | **Session key storage** | Session private keys are encrypted at rest and isolated from public repository and logs. | Key-storage review. |
| 6.3 | **Embedded-wallet integration** | The chosen embedded-wallet provider’s non-custodial claims, key export, and server-signing boundaries are reviewed. | Provider due-diligence notes. |
| 6.4 | **Mainnet custody plan** | A multisig-based custody plan is documented for program upgrade authority and treasury. | `deploy/MAINNET_SETUP.md` or equivalent. |
| 6.5 | **CI/CD hardening** | GitHub Actions workflows pin third-party Actions by SHA, use required reviewers for production jobs, and never log secrets. | Workflow review + `zizmor`/`actionlint` scan. |
| 6.6 | **No committed secrets** | A repository scan confirms no private keys, seeds, RPC tokens, or API secrets are committed. | Secret-scan report. |
| 6.7 | **Incident response plan** | A documented process exists to revoke sessions, pause contracts, and communicate with users if a critical vulnerability is found. | Runbook. |

---

## 7. Documentation and handoff readiness

| # | Item | Definition of ready | Evidence / artifact |
| --- | --- | --- | --- |
| 7.1 | **RFP distributed** | This RFP and checklist have been sent to at least three shortlisted vendors. | Email/portal records. |
| 7.2 | **Vendor access** | Audit repository or read-only access is provisioned for the selected vendor. | Access log. |
| 7.3 | **Walkthrough scheduled** | A live architecture walkthrough is scheduled with the audit team before the review begins. | Calendar invite. |
| 7.4 | **Single point of contact** | An Enigma engineer is assigned as the auditor’s daily technical contact. | Assignment documented. |
| 7.5 | **Triage process** | A daily standup or async triage rhythm is agreed for severity alignment and question resolution. | Process doc or Slack channel. |
| 7.6 | **Remediation plan** | A post-report remediation sprint is planned before mainnet deployment. | Sprint plan. |
| 7.7 | **Public summary plan** | A plan exists to publish a consumer-safe audit summary after remediation. | Launch comms plan. |

---

## 8. Pre-audit sign-off

Before kicking off the external audit, the release owner should confirm:

- [ ] All Critical and High risks from internal review are either fixed or explicitly accepted in writing.
- [ ] The audit snapshot is frozen and tagged.
- [ ] The selected vendor has signed an NDA and Statement of Work.
- [ ] A not-to-exceed budget is approved.
- [ ] The auditor has access to source, specs, devnet deployment, and a technical walkthrough.
- [ ] A remediation sprint is reserved on the engineering calendar immediately after the draft report.
- [ ] Legal/compliance has reviewed the public-facing audit summary plan.

---

## 9. Items that can be deferred with documented risk

The following items do not block the audit but should be tracked:

| # | Item | Deferred risk | Tracking artifact |
| --- | --- | --- | --- |
| 9.1 | Production TEE/HSM key storage | Session keys remain in encrypted SQLite; higher node-compromise impact. | Encryption roadmap issue. |
| 9.2 | Full TEE/STARK verifiable memory | Node is semi-trusted; users must trust operator not to read plaintext. | Research roadmap issue. |
| 9.3 | Token legal review | Token mechanics may be classified differently by regulators. | Legal tracker. |
| 9.4 | Mainnet deployment | Audit occurs before mainnet, so findings can still be fixed without on-chain upgrade. | Mainnet deployment plan. |
| 9.5 | Formal penetration test of third-party providers | Wallet provider and RPC provider infrastructure are out of scope. | Provider security questionnaire. |

---

_External security audit readiness checklist — Enigma Memory — public-launch draft_
