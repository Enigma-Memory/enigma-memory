# Enigma Memory — External Security Audit RFP

**Document status:** Public-launch draft  
**Target audit start:** After production signing and before mainnet deployment  
**Engagement owner:** Enigma Memory security / release team  
**Response deadline:** TBD (allow at least 2 weeks for vendor scoping and quoting)  

---

## 1. Executive summary

Enigma Memory is a local-first AI memory wallet. Users install a signed desktop application, create a private vault, and connect supported AI clients so that memory can be saved, recalled, and anchored on-chain without per-item approvals. The current public-launch scope includes:

- Six Solana Anchor programs (memory registry, budget escrow, capability registry, royalty router, treasury, and a protocol token).
- An off-chain memory node (Node.js) exposing an HTTP API and an MCP server for AI client integration.
- A Next.js progressive web app (PWA) for consumer onboarding and session management.
- A Tauri v2 desktop application that bundles the engine, PWA assets, and client connector logic.

Before mainnet deployment and consumer launch, Enigma Memory seeks an external security audit of the components described below. The audit must identify security-critical bugs, classify findings by severity, and provide concrete remediation guidance. The final report must be suitable for publication (in full or summarized form) to users, partners, and investors.

---

## 2. Audit scope

### 2.1 Smart contracts (highest priority)

**Repository context:** Rust/Anchor programs that settle memory ownership, budget, capabilities, royalties, and treasury custody on Solana.

| Program | Primary risk surface |
| --- | --- |
| `memory_registry` | PDA ownership and seed derivation, unauthorized memory updates/deletes, content-hash integrity, session-delegated writes. |
| `budget_escrow` | Native SOL and SPL/Token-2022 custody, deposit/withdraw authorization, arithmetic overflow, session spending caps. |
| `capability_registry` | Capability and Session PDA logic, scope-bit enforcement, expiry and revocation, owner nonce invalidation, privilege escalation. |
| `royalty_router` | Receipt anchoring, payee validation, correct routing of budget to creators, session authorization. |
| `cortex_treasury` | Protocol fee collection, authority checks, upgrade authority custody. |
| `cortex_token` | Token mint authority, staking/veSAL mechanics if enabled for launch, supply controls. |

**Specific checks required:**

- Correctness of all PDA seeds, bumps, and `init_if_needed` constraints.
- Privilege escalation paths (owner, session key, delegate, treasury authority).
- Arithmetic overflow/underflow, unit conversion errors, and rounding in fee/royalty calculations.
- SPL Token / Token-2022 `transfer_checked` CPI safety and account validation.
- Re-entrancy, cross-program invocation, and account-discriminator bypass risks.
- Instruction replay, seed collision, and malleability attacks.
- Program upgrade authority and finalization recommendations.
- IDL and verifiable-build integrity.

### 2.2 Off-chain memory node and MCP server

**Repository context:** Node.js ESM service (`cortex-v3/node/`) with HTTP API, OAuth 2.1 + PKCE authorization server, MCP stdio/HTTP/SSE server, encrypted SQLite persistence, and on-chain session verification.

**Specific checks required:**

- Authentication and authorization on every HTTP/MCP endpoint (no anonymous privileged operations).
- OAuth 2.1 + PKCE flow correctness, state/nonce handling, redirect URI validation, token storage, and refresh-token rotation.
- MCP tool authorization: verify that on-chain `Capability` and `Session` PDAs are validated before `store_memory`, `retrieve_memory`, or budget operations; fail closed on revocation, expiry, or missing scope.
- Input validation and sanitization for memory content, embeddings, query text, and JSON-RPC MCP frames.
- Rate limiting and abuse resistance on ingest/retrieve/spend endpoints.
- Logging hygiene: confirm no plaintext memory, embedding, seed phrase, or private key material is logged.
- Error handling: ensure failures do not leak internal paths, stack traces, or cryptographic material.
- Docker/container hardening and secret handling.

### 2.3 Desktop application

**Repository context:** Tauri v2 desktop app (`apps/desktop-tauri/`) that bundles the Enigma engine sidecar, consumer onboarding wizard, and client connector logic.

**Specific checks required:**

- Sidecar/command isolation: verify the Tauri command surface cannot be abused to execute arbitrary code or read outside the vault.
- Updater security and signature verification of signed manifests.
- Local storage permissions and path sandboxing.
- Crash-report redaction: confirm no memory, wallet, local paths, or credentials are included in opt-in reports.
- Installer signing verification (Windows SmartScreen / macOS Gatekeeper readiness is a launch blocker, but the audit should confirm the app validates its update payloads independently).
- Connector backup/repair flow: ensure client config writes cannot overwrite arbitrary files.

### 2.4 Encryption layer

**Repository context:** Client-side and node-side encryption for memory blobs, embeddings, and metadata; per-user data encryption key (DEK) derivation.

**Specific checks required:**

- DEK derivation from wallet entropy: review HKDF-SHA256 parameters, salt/info uniqueness, and passphrase handling.
- AES-256-GCM usage: IV generation, tag verification, key separation, and resistance to nonce reuse.
- Encryption boundary: confirm plaintext leaves the user-controlled boundary only in encrypted form.
- Key rotation and recovery story for lost/forgotten passphrases or wallet rotation.
- Migration path from the current prototype to a TEE/HSM-backed production key store.
- Side-channel resistance of the current Node.js crypto implementation.

### 2.5 Key custody and operational security

**Repository context:** Solana program authority, session-key delegation, embedded-wallet integration, and deployment custody.

**Specific checks required:**

- Session PDA scope enforcement and fail-closed behavior.
- Session-key storage in the node (currently encrypted SQLite; production target is TEE/HSM/KMS).
- Embedded-wallet integration (Privy/Dynamic or similar): assess non-custodial claims, key export, and server-side signing boundaries.
- Recommended mainnet custody model: review the proposed Squads v4 multisig program-upgrade authority, treasury control, and CI proposer-key separation.
- GitHub Actions workflow security for devnet and proposed mainnet deployment.
- Secret management: verify no plaintext keys, seeds, or RPC tokens are committed.

---

## 3. Out of scope

The following items are intentionally excluded from this audit engagement. They may be addressed in later engagements:

- Formal legal or regulatory review of token classification, securities law, or royalty mechanics.
- Production TEE/STARK verifiable-computation implementation audit (design review only, if requested).
- Penetration testing of third-party services (Privy, Helius, OpenAI, etc.).
- Source-code audit of Solana runtime, Anchor framework, or embedded-wallet provider SDKs.
- Operational penetration testing of Enigma corporate infrastructure or employee endpoints.

---

## 4. Deliverables

### 4.1 Final audit report

A single, publication-ready PDF report including:

- Executive summary with overall risk rating.
- Scope confirmation and methodology.
- List of findings, each with:
  - Severity (Critical / High / Medium / Low / Informational).
  - Likelihood and impact assessment.
  - Exact file, function, instruction, or line reference where possible.
  - Proof-of-concept or detailed reproduction steps.
  - Recommended remediation with code-level guidance.
- Severity-ranked finding summary table.
- Remediation validation criteria.
- Optional public-facing executive summary suitable for investors and users.

### 4.2 Severity definitions

| Severity | Definition |
| --- | --- |
| **Critical** | Direct, unauthenticated loss or theft of user funds; unauthorized program upgrade; arbitrary code execution; plaintext memory exfiltration at scale. |
| **High** | Privilege escalation bypassing session scope; unauthorized modification of user memory or budget; replay/malleability leading to financial loss; key material exposure. |
| **Medium** | Denial of service; logic errors reducing intended access control; fee/royalty calculation errors within bounded impact; information disclosure not exposing raw memory. |
| **Low** | Best-practice deviations, defense-in-depth gaps, or minor gas inefficiencies with no direct security impact. |
| **Informational** | Architecture suggestions, documentation improvements, or future-hardening recommendations. |

### 4.3 Remediation review

After Enigma delivers patched code, the vendor will:

- Re-review each Critical and High finding and confirm closure or residual risk.
- Spot-check Medium findings at vendor discretion.
- Provide a remediation verification addendum to the report.
- Optionally issue a final letter or certificate of review.

### 4.4 Optional add-ons

- Fuzz-testing campaign for instruction handlers (e.g., Trident or custom harness).
- Continuous monitoring / retainer for the first 90 days post-launch.
- On-chain verification of deployed mainnet program hashes against audited source.

---

## 5. Timeline

The audit is expected to run **2–4 weeks** from kickoff to draft report, assuming the readiness checklist in `security-audit-checklist.md` is satisfied before kickoff.

| Phase | Duration | Activities |
| --- | --- | --- |
| Kickoff / onboarding | 1–2 days | Scope confirmation, repo access, environment setup, Q&A. |
| Smart-contract review | 1–2 weeks | Anchor/Rust source review, static analysis, manual logic review. |
| Node / MCP / desktop review | 3–5 days | API/MCP surface, encryption layer, Tauri command surface. |
| Custody / ops review | 2–3 days | Session delegation, custody model, CI/workflow review. |
| Draft report + readout | 2–3 days | Internal draft, severity alignment, clarification questions. |
| Remediation period | 1–2 weeks | Enigma fixes; vendor validates Critical/High findings. |
| Final report | 2–3 days | Remediation addendum, public summary. |

Total calendar time: **approximately 4–7 weeks including remediation**. The core audit phase (pre-remediation) is **2–4 weeks**.

---

## 6. Budget placeholder

The following budget ranges are placeholders for planning and vendor quoting. Final spend depends on scope depth, number of auditors, and optional add-ons.

| Component | Estimated range (USD) | Notes |
| --- | --- | --- |
| Smart-contract audit (6 programs) | $60,000 – $150,000 | Primary cost driver; depends on program complexity. |
| Node / MCP server review | $20,000 – $50,000 | Includes OAuth, session verification, and API surface. |
| Desktop app / Tauri review | $15,000 – $35,000 | Focused on command surface, updater, and local sandbox. |
| Encryption / custody review | $15,000 – $40,000 | Includes DEK derivation, key custody, and operational model. |
| Remediation validation | $10,000 – $25,000 | Re-review of Critical/High findings. |
| **Total placeholder** | **$120,000 – $300,000** | Exclude optional fuzzing/retainer work. |

Vendors should quote as a fixed fee or time-and-materials with a not-to-exceed cap. Travel and on-site presence are not required.

---

## 7. Vendor shortlist

The following firms are pre-qualified based on demonstrated Solana/Anchor smart-contract audit experience, web application and operational security depth, and reputation in the blockchain security industry. Enigma Memory expects at least three firms to submit quotes.

### 7.1 Trail of Bits

**Why shortlist:** One of the most widely recognized software-assurance firms, with deep Rust, cryptography, and blockchain program audit practices. Trail of Bits has audited major L1 and DeFi protocols and publishes open-source security tools (Slither, Manticore, Echidna, medusa). Their reports are highly regarded by institutional investors and exchanges.

**Fit for Enigma:** Strong for the combined smart-contract, encryption-layer, and operational-security review. They are not Solana-exclusive, so Anchor-specific depth should be confirmed during scoping.

**Likely role:** Lead auditor for smart contracts and custody model; optional cryptography deep-dive.

### 7.2 OtterSec

**Why shortlist:** A Solana-native audit firm with extensive Anchor and Rust experience. OtterSec has reviewed many high-value Solana programs and is familiar with PDA seeds, CPI patterns, and Solana-specific attack classes (e.g., account confusion, seed collision, signer substitution).

**Fit for Enigma:** Excellent fit for the six-program Anchor scope and on-chain session delegation logic. OtterSec understands Solana mainnet deployment and multisig custody patterns.

**Likely role:** Primary smart-contract auditor, especially for `capability_registry`, `budget_escrow`, and `royalty_router`.

### 7.3 Neodyme

**Why shortlist:** A Solana-focused security research collective known for competitive audit contests and high-severity bug discoveries on Solana mainnet. Neodyme brings strong Rust and program-analysis skills and has published detailed write-ups of Solana-specific vulnerabilities.

**Fit for Enigma:** Strong for finding subtle PDA/seed and CPI bugs across the program suite. Their contest background can complement a more traditional audit firm.

**Likely role:** Smart-contract co-auditor or secondary review, particularly for adversarial edge cases.

### 7.4 OpenZeppelin Defender / OpenZeppelin Audit

**Why shortlist:** OpenZeppelin is the best-known name in smart-contract security, with a long track record in EVM audits and growing Solana/Anchor coverage through its Defender and audit services. Their reports are trusted by institutions and often required by launch partners.

**Fit for Enigma:** Strong brand recognition for public launch credibility and investor confidence. Solana-specific scoping is required to confirm Anchor program capacity and timeline.

**Likely role:** Lead or co-lead auditor; valuable if institutional partners expect a recognized audit brand.

### 7.5 Zellic

**Why shortlist:** Zellic is a modern blockchain security firm with strong Rust/ZK and Solana audit experience. They are known for clear, well-structured reports and fast turnaround, and they have audited several high-profile Solana programs.

**Fit for Enigma:** Good balance of Solana depth, cryptography knowledge, and responsiveness. Zellic can cover smart contracts and the encryption/custody layer in one engagement.

**Likely role:** Full-scope auditor (smart contracts + node/encryption) or secondary review.

---

## 8. Selection criteria

Vendors will be evaluated on:

1. **Solana/Anchor audit experience** — demonstrated reviews of live Solana programs.
2. **Scope coverage** — ability to audit Rust/Anchor, Node.js, Next.js/Tauri, and encryption/key custody together or in a coordinated team.
3. **Report quality** — clarity, reproducibility, severity discipline, and public-ready executive summary.
4. **Timeline and availability** — ability to start within the public-launch window.
5. **Price and value** — fixed-fee quote with not-to-exceed cap and clear assumptions.
6. **Remediation support** — included re-review of Critical/High findings.
7. **Independence and reputation** — no material conflict of interest with Enigma, its investors, or launch partners.

---

## 9. Information to provide vendors

- Clean, tagged source snapshot of the audit scope.
- `cortex-v3/specs/unified-architecture.md` and `cortex-v3/specs/design-*.json`.
- This RFP and `security-audit-checklist.md`.
- Devnet deployment addresses and IDL files.
- Test credentials for devnet smoke testing (no mainnet keys).
- Recorded walkthrough of the consumer flow and session delegation architecture.

---

## 10. Next steps

1. Confirm final budget and procurement authority.
2. Send this RFP to the shortlisted vendors.
3. Collect quotes and sample reports within 2 weeks.
4. Select vendor and execute Statement of Work.
5. Complete the readiness checklist before audit kickoff.
6. Kick off audit; maintain daily triage standup during the engagement.
7. Publish a public-facing audit summary after remediation.

---

_External security audit RFP — Enigma Memory — public-launch draft_
