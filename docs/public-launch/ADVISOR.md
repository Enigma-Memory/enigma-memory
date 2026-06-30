# Advisor operating model

This document defines the standing Workflowz Advisor role for the general-public Enigma Memory launch. The Advisor is the phase governor for the consumer path: signed desktop app, Claude-first `.mcpb`, public website/download funnel, Memory Drive dashboard, import wizard, public beta release infrastructure, proof viewer/verifier, and Memory Controller category narrative.

The Advisor does not replace engineering, design, release, support, or docs owners. The Advisor decides whether a phase can promote based on evidence, privacy/export allowlists, friction budget, rollback readiness, and claim boundary.

Source inputs: the 2026-06-27 Workflowz research pass across desktop app, Claude-first `.mcpb`, public website/download funnel, Memory Drive dashboard, import wizard, release infrastructure, proof viewer, Memory Controller category, and launch Advisor lanes, aligned with `docs/GENERAL_PUBLIC_LAUNCH_GOAL.md`, `docs/GENERAL_PUBLIC_LAUNCH_WORKPLAN.md`, and the existing `docs/public-launch/` plans.

## Workflowz role

Workflowz turns the eight research directions into phase work. The Advisor turns each phase into a governed launch decision. A Workflowz phase is allowed to move forward only when the Advisor can point to evidence that the default consumer path remains low-friction, public artifacts are safe to share, claims stay inside Enigma-controlled local facts, and every state-changing path has consent plus rollback.

The Advisor is therefore the standing Workflowz governor:

- it accepts research and implementation evidence from each direction;
- it rejects phase promotion when the work is useful but not yet public-default safe;
- it narrows claims or public scope instead of allowing roadmap ambition to become launch copy;
- it keeps advanced/developer/future lanes out of the public-beta critical path unless they directly reduce friction or risk;
- it records ship/hold/rollback decisions in the evidence ledger before public beta or GA scope expands.

## Authority

The Advisor has authority to issue one of three decisions at every phase boundary:

| Decision | Meaning | Required next action |
| --- | --- | --- |
| `ship` | Evidence proves the phase acceptance criteria, public artifacts are safe, claims are supported, default-path friction is within budget, and rollback/support are ready. | Promote the phase and record the evidence packet. |
| `hold` | The phase is not ready, but users are not yet exposed to a harmful release/update/default path. | Keep work internal, assign owners to blockers, and re-review after evidence changes. |
| `rollback` | A shipped or candidate path is unsafe, unrecoverable, privacy-leaking, overclaiming, or materially more fragile than the prior path. | Pull or pause the candidate, restore the last known safe release/config/copy path, notify support owners, and record the rollback evidence. |

Advisor authority applies to:

- phase promotion from concept through GA;
- public beta and GA launch decisions;
- public website/download readiness;
- screenshots, demo data, app copy, release notes, support macros, diagnostics, and evidence packets;
- connector writes, import/export flows, proof exports, update manifests, installer channels, and rollback plans.

The Advisor can block phase promotion on any missing or failed item below:

- missing clean-machine or scenario evidence;
- privacy leak in screenshots, public copy, support diagnostics, proof/export artifacts, examples, or evidence packets;
- default path requiring terminal, npm, Node, source checkout, provider key, cloud account, manual MCP JSON, or raw file-path navigation;
- unsafe update, unsigned/unverified artifact, wrong-channel/downgrade acceptance, or update failure that can corrupt app/vault/connector state;
- unsupported claim, especially provider deletion, provider-native memory removal, model forgetting, hosted SaaS/BYOC readiness, compliance certification, benchmark superiority, legal/patent conclusion, Solana/on-chain submission, or tamper-proof/private-forever language without exact evidence;
- absent rollback, backup, uninstall, support owner, release owner, or signing custody owner.

## Responsibilities

The Advisor owns governance, not implementation.

| Area | Advisor responsibility | Non-owner boundary |
| --- | --- | --- |
| Phase gates | Define and apply entry/exit criteria for concept, design, implementation, evidence, public-copy, release, public beta, and GA. | Does not implement the feature unless separately assigned. |
| Evidence ledger | Require public-safe evidence fields before a claim or phase promotion ships. | Does not accept intent, roadmap, or screenshots alone as proof. |
| Friction budget | Keep the default consumer path free of developer prerequisites and protocol-first UI. | Does not optimize advanced/developer paths at the expense of consumers. |
| Claim boundary | Approve, rewrite, or block copy based on Enigma-controlled local evidence. | Does not approve provider, hosted, compliance, legal, benchmark, or chain claims by inference. |
| Privacy/export allowlists | Own the allowed public/export/support field set and forbid unsafe fields. | Does not permit best-effort redaction where fail-closed rejection is required. |
| Rollback readiness | Require backup/restore/reversal before connector writes, imports, updates, and release promotion. | Does not allow destructive writes with only support instructions as recovery. |
| Public beta/GA cutlines | Convert readiness into ship/hold/rollback decisions. | Does not let marketing date, demo polish, or scope pressure override blockers. |
| Copy/screenshots/diagnostics review | Review every public artifact for friction, safety, and claims. | Does not review only the prose while ignoring images, support macros, or exports. |

## Launch spine governed by the Advisor

The eight launch directions are one public path, not eight competing launches:

1. **Consumer desktop app** — signed Windows/macOS desktop app with bundled runtime, local Memory Drive creation, typed app actions, local health, signed update, and vault-preserving uninstall.
2. **Claude-first `.mcpb`** — Claude Desktop is the first low-friction connector path when validated; manual MCP JSON remains advanced/fallback only.
3. **Website/download funnel** — public website leads with signed desktop download, setup guide, privacy/proof explainers, help center, and developer appendix only as secondary navigation.
4. **Memory Drive dashboard** — default home answers whether the local Memory Drive is ready, which apps are connected, what needs review, and the one next fix-it action.
5. **Import wizard** — post-setup local Import Sandbox for paste/drop curated memory lists and caveated advanced provider exports; never a required first-run step.
6. **Public beta release infrastructure** — signed artifacts, update channels, diagnostic scrubber, support codes, release evidence packets, and clean-machine scenario matrix.
7. **Proof viewer/verifier** — consumer Proof Activity view with local evidence scope, offline verifier status, safe export preview, and explicit “does not prove” boundary.
8. **Memory Controller category** — public category language frames Enigma as a private local Memory Controller, with app permissions/recall control/Memory Drive health, without provider-deletion or model-forgetting claims.

The Advisor keeps the desktop-first, local-first path as the launch wedge. Mobile, hosted SaaS, BYOC, enterprise admin/SIEM, public proof network, Solana settlement, broad benchmarks, and marketplace work remain future or advanced lanes unless they directly reduce friction or evidence risk for this default path.

## Decision rules

These rules are applied before every promotion, screenshot, copy review, beta announcement, and GA decision.

1. **Default-path rule:** if a consumer must use terminal, npm, Node, Git/source checkout, provider key, cloud account, manual MCP JSON, or raw filesystem navigation, the path is not public-default ready.
2. **Evidence-before-claim rule:** a claim ships only when an Enigma-controlled artifact proves that exact claim. Otherwise the claim is removed, rewritten, or held.
3. **Privacy fail-closed rule:** if the scanner, reviewer, or owner cannot prove a public/export/support artifact is safe, sharing/export/publishing is blocked.
4. **Allowlist-over-redaction rule:** public artifacts and support diagnostics are built from approved fields. Redaction is a safety net, not the data model.
5. **Consent-before-write rule:** connector config writes, imports into the Memory Drive, destructive Memory Drive actions, telemetry/crash upload, diagnostic sharing, and proof export require human-readable preview and explicit consent.
6. **Rollback-before-write rule:** no connector/update/import/config write may ship without backup, rollback/undo semantics, and unrelated-setting preservation.
7. **One-primary-action rule:** consumer screens show one main action and at most one secondary escape hatch; advanced details never interrupt first run.
8. **Narrow-support rule:** claim support only for clients/platforms/channels with fixture evidence plus clean-machine/manual evidence. Unsupported clients go to clearly labeled advanced paths.
9. **Offline-local rule:** Memory Drive health, dashboard, proof/activity summaries, diagnostics preview, and already-installed app launch must work offline where the feature is local. Network failures defer network actions only.
10. **Channel-integrity rule:** beta, stable, and internal update channels are separate; wrong-channel and downgrade updates are rejected unless an emergency rollback process explicitly authorizes the action.
11. **Supportability rule:** every blocking state has a stable support code, one fix-it action or safe handoff, public-safe diagnostics, owner escalation, and closure rule.
12. **Claim-boundary rule:** public materials may claim Enigma-controlled Memory Drive state, connector setup/repair status, local receipt/proof summaries, signed installer/update status, health checks, support codes, and public-safe schema/evidence metadata only.
13. **Advisor veto rule:** one open privacy leak, unsupported public claim, unsafe update, unrecoverable connector/import write, default-path developer prerequisite, or missing rollback blocks promotion.

## Friction budget

The Advisor budgets friction by the default user journey, not by internal ease of implementation.

### Default consumer path budget

| Step | Maximum acceptable friction | Hold if |
| --- | --- | --- |
| Discover | Homepage makes the next action obvious within one screen: download signed desktop app. | Homepage leads with npm, CLI, proof network, source checkout, Solana, benchmarks, or whitepaper-first CTAs. |
| Download | Platform-specific signed artifact, clear channel/status, version/date, known beta warning if observed. | Artifact is unsigned/unnotarized but presented as consumer-ready, or bypass-first installer instructions are the default. |
| Install | Normal OS app install; no Node/npm/Git/Homebrew/Xcode/source checkout/provider key/cloud account. | User must install developer dependencies, open terminal, or edit files before first run. |
| First run | One guided flow: create/detect Memory Drive, find apps, connect selected app, health ready/fix-it. | Setup shows protocol/schema/MCP JSON/path jargon as required steps. |
| Connect Claude | Claude card prefers `.mcpb`/extension handoff when validated; fallback config write is previewed, consented, backed up, and advanced. | Opening a bundle is treated as installed/healthy without observable user confirmation or health evidence. |
| Dashboard | Memory Drive state and one next action are visible immediately. | User must read logs, stack traces, raw config, hashes, or local paths to understand status. |
| Import | Optional after setup; paste/drop curated memory list; preview, quarantine, dedupe, explicit import. | Import is mandatory during first run or auto-writes provider transcript-derived candidates. |
| Proof | Proof Activity explains local Enigma evidence and limitations; export gated by privacy scan. | Green “verified” state comes from shape/schema checks alone, or proof copy implies provider-side effects. |
| Support | User can preview/delete/export safe diagnostics; support asks only for safe fields. | Support macro asks for raw logs, memory text, screenshots with private data, absolute paths, complete configs, or provider responses. |
| Update/rollback | Signed update, channel separation, failed-update recovery, vault preservation. | Update can corrupt app/vault/config, accepts wrong channel, or has no rollback rehearsal. |

### Friction budget labels

- `green`: no developer prerequisite, one primary action, safe copy, evidence linked.
- `yellow`: advanced detail exists but is secondary; blocker state has one fix-it action and support code.
- `red`: consumer default requires developer tooling, manual JSON, raw paths, unsupported provider/account action, or ambiguous recovery.

A phase cannot promote with any `red` default-path item.

## Evidence ledger

Every phase, scenario, public claim, screenshot set, diagnostic/export bundle, installer/update candidate, and release decision must have a ledger entry. The ledger may live in the release evidence packet or phase review artifact, but it must use these fields.

| Field | Required content |
| --- | --- |
| `ledger_id` | Stable ID for the review item, scenario, claim, or artifact. |
| `phase` | Concept, design, implementation, evidence, public-copy, release, public-beta, or GA. |
| `direction` | Desktop, Claude `.mcpb`, website, dashboard, import, release infrastructure, proof viewer, Memory Controller, or cross-cutting. |
| `owner` | Engineering/design/docs/release/support owner responsible for closing blockers. |
| `advisor_reviewer` | Advisor or delegated reviewer who made the decision. |
| `scenario_ids` | Applicable IDs such as `BETA-INSTALL-001`, `BETA-FIRST-001`, `BETA-CLIENT-002`, `BETA-PROOF-001`, `BETA-DIAG-001`, `GA-UPDATE-001`, or a new phase-local ID. |
| `artifact_refs` | Public-safe references to evidence artifacts, screenshots, release files, hashes, schema IDs, support codes, or verifier summaries. No local absolute paths. |
| `environment` | OS family/version bucket, architecture bucket, channel, client/app version bucket, and clean/upgraded profile status. No account IDs or machine/user names. |
| `claim_text` | Exact public claim or UI/support copy under review, if any. |
| `claim_scope` | What Enigma-controlled fact the claim proves: Memory Drive, connector status, proof summary, signing/update status, diagnostics, support code, or public-safe schema metadata. |
| `claim_boundary_result` | Pass, rewrite required, hold, or blocked; include unsupported-claim reason. |
| `privacy_scan_result` | Pass, fail, inconclusive, not applicable; include scanner/version/ref and blocked categories. |
| `export_allowlist_version` | Version/ref of the field allowlist used for screenshots, diagnostics, support bundle, proof export, import receipt, or evidence packet. |
| `forbidden_field_check` | Confirmation that raw memory, prompts, transcripts, completions, embeddings, credentials, tokens, private keys, account IDs, customer identifiers, provider responses, local absolute paths, private connector bodies, and signing secrets are absent. |
| `friction_result` | Green/yellow/red with the default-path reason. |
| `consent_write_result` | For writes/imports/exports/uploads: preview shown, explicit consent captured, or not applicable. |
| `backup_rollback_result` | Backup/rollback/undo/rehearsal status for connector, import, update, uninstall, or release rollback. |
| `support_result` | Support code, support owner, support-safe intake fields, and escalation path. |
| `decision` | `ship`, `hold`, or `rollback`. |
| `decision_reason` | Short reason tied to evidence, not intent. |
| `blockers` | Open blockers with owners and required evidence to clear. |
| `known_limitations` | Public-safe limitations that must appear in beta/GA copy, if applicable. |
| `expires_or_recheck_by` | Date/event that requires re-review, such as new client version, new installer channel, new screenshot set, or evidence older than the release candidate. |

### Ledger status values

Use fixed status values so phase reviews can be compared across directions:

| Field | Allowed values |
| --- | --- |
| `claim_boundary_result` | `pass`, `rewrite-required`, `hold`, `blocked` |
| `privacy_scan_result` | `pass`, `fail`, `inconclusive`, `not-applicable` |
| `friction_result` | `green`, `yellow`, `red` |
| `consent_write_result` | `preview-consent-recorded`, `read-only`, `missing-preview`, `missing-consent`, `not-applicable` |
| `backup_rollback_result` | `proven`, `partial`, `missing`, `not-applicable` |
| `support_result` | `ready`, `partial`, `missing`, `not-applicable` |
| `decision` | `ship`, `hold`, `rollback` |

### Review packet template

Every Advisor review should be reducible to this packet before a decision is recorded:

1. **Scope:** direction, phase, owner, target user, default path, and non-goals.
2. **Evidence:** scenario IDs, artifact refs, environment buckets, screenshot/demo refs, and release/update/proof/import refs where applicable.
3. **Friction:** one-line default-path summary and green/yellow/red rating.
4. **Privacy/export:** allowlist version, scan result, forbidden-field result, screenshot/demo data source, and support diagnostic/export result.
5. **Claims:** exact claim text, evidence mapping, rewrite notes, and limitation text required in public copy.
6. **State changes:** consent preview, write/import/update/export action, backup/rollback/undo proof, and unrelated-setting preservation.
7. **Support:** support code, owner, safe intake fields, escalation path, and public-safe known limitation if users may hit the condition.
8. **Decision:** `ship`, `hold`, or `rollback`, with blocker owners and the specific evidence needed to change the decision.

### Approved public/export/support field families

The Advisor owns this allowlist and must version changes before use:

- app name, app version, release channel, build hash/ref, artifact hash, artifact size, release date;
- OS family/version bucket and architecture bucket;
- installer/update signing status, signer display name, notarization/staple status, update manifest hash, update signature verification result;
- Memory Drive friendly label, vault lifecycle state, schema/version, storage status bucket, lock/service state;
- connector app label, connector status, permission/grant status, restart-needed flag, backup/rollback status, support code;
- dashboard status domain, severity, issue code, one primary action ID, last-checked time bucket;
- import source type, file type bucket, candidate counts, duplicate counts, quarantine counts, batch ID/ref, receipt hashes/refs, source limitations;
- proof/activity event type, opaque refs, roots/hashes, counts, time buckets, policy/capability refs, verifier status, schema IDs, privacy scan status;
- diagnostic category names, scrubber version, scan result, issue codes, redacted config validation summaries, public-safe support notes.

### Forbidden public/export/support fields

These fields block publication/export/share when present or when their absence cannot be proven:

- raw memory text or imported candidate text;
- prompts, transcripts, completions, embeddings, provider responses, query text, context pack body, complete client configs, private connector bodies;
- credentials, tokens, API keys, private keys, signing secrets, pairing secrets, recovery secrets, account IDs, tenant/customer identifiers, real support cases;
- local absolute paths, usernames, machine names, repository checkout paths, private app-data paths, unredacted filenames that identify a person/customer/project;
- realistic private data in screenshots, demos, support macros, sample imports, proof examples, or release evidence.

If an export/screenshot/support artifact needs more data than the allowlist, the Advisor must approve a new allowlist version before the artifact is generated. The default answer is hold.

## Privacy/export allowlist ownership

The Advisor is the accountable owner for privacy/export allowlists across:

- website screenshots and public images;
- desktop app screenshots and demo videos;
- diagnostic bundles and support intake forms;
- proof summaries, verifier reports, and evidence packets;
- import receipts and quarantine reports;
- release notes, public beta known limitations, and GA launch copy.

Operational rules:

1. All public/export/support projections are generated from allowlisted fields, not raw logs or raw app state.
2. Any unknown field in a proof/import/diagnostic/release artifact is dropped for display and blocks export until classified.
3. Any forbidden-field match blocks export/publication. The product may show a local private review screen, but it cannot create a shareable artifact.
4. Screenshots must use synthetic data, friendly labels, opaque refs, time buckets, and status codes only.
5. Support diagnostics are local-only until previewed and explicitly exported by the user.
6. Telemetry/crash reporting is off by default and cannot be bundled into setup, support, update, or proof-export consent.
7. Support may ask for app version, OS bucket, release channel, issue code, safe diagnostic bundle, and public-safe proof/support refs only.
8. Provider exports/imports are treated as incomplete and potentially sensitive unless the provider evidence proves otherwise; Enigma receipts prove only Enigma local handling.

## Phase gates and checklists

Each gate produces a ledger entry and a ship/hold/rollback decision. A checklist item marked “block” means one failure blocks phase promotion.

### Concept gate checklist

Purpose: decide whether the idea belongs in the desktop-first public path.

- [ ] Default user is a non-technical consumer on supported Windows/macOS. **Block** if the default user is a developer/power user unless the item is explicitly advanced.
- [ ] The concept advances one of the eight launch directions or directly reduces launch risk. **Block** if it introduces mobile/hosted/enterprise/chain/benchmark scope as a beta dependency without direct evidence need.
- [ ] Default path requires no terminal, npm, Node, Git/source checkout, provider key, cloud account, or manual MCP JSON. **Block** on any default prerequisite.
- [ ] Public value can be stated in plain language without unsupported claims. **Block** on provider deletion, model forgetting, hosted/BYOC readiness, compliance, benchmark, legal, patent, chain, or tamper-proof claims.
- [ ] Phase owner, support owner if user-facing, and release owner if artifact/update-facing are named. **Block** if owner is absent.
- [ ] Evidence needed for promotion is named before work starts. **Block** if the concept cannot define what would prove it.
- [ ] Privacy/export surface is identified: screenshot, diagnostic, proof, import, support, website, release, or none. **Block** if data exposure is unknown.
- [ ] Rollback/undo/reversal expectation is stated for any write/update/import/connector action. **Block** if the concept changes user state with no reversal model.

### Design gate checklist

Purpose: prove the proposed user experience can be safe, understandable, and recoverable.

- [ ] One primary action per default screen, with advanced details behind disclosure. **Block** if the default screen leads with logs, schemas, hashes, raw paths, command lines, MCP JSON, or protocol terms.
- [ ] Failure states are designed before happy-path approval: missing app, unsupported client, permission denied, corrupted config, offline, update failed, export blocked, import quarantined, verifier inconclusive. **Block** if failure states are absent.
- [ ] Every blocking state has one fix-it action or safe support handoff with support code. **Block** if the user must guess or contact support with private data.
- [ ] Consent preview exists before connector writes, imports, destructive vault actions, diagnostics sharing, telemetry/crash upload, proof export, or update install. **Block** if consent is implicit.
- [ ] Backup/rollback/undo is visible where user state can change. **Block** if write/update/import actions have no user-understandable recovery.
- [ ] Public/export view model uses the Advisor allowlist. **Block** if design depends on raw logs, raw memory, raw provider data, complete configs, or local absolute paths.
- [ ] Copy has “what this proves / does not prove” for proof, import, Memory Controller, and privacy surfaces. **Block** if users can reasonably infer provider-side deletion/forgetting or legal/compliance effect.
- [ ] Accessibility basics are included: text labels, not color alone, keyboard reachability, focus/error behavior, readable status language. **Hold** until remediated for public surfaces.
- [ ] Screenshot/demo data plan uses only synthetic data and opaque refs. **Block** if any real user/customer/provider/private data is needed.

### Implementation gate checklist

Purpose: prove the implementation follows the governed contract before evidence or public copy uses it.

- [ ] Desktop UI calls typed app/service actions, not shell strings assembled from user input. **Block** on shell-string construction from UI input.
- [ ] Bundled runtime/sidecar/service works without user-installed Node/npm for the default desktop path. **Block** if developer dependency is required.
- [ ] Local service/control channel is scoped to current user and fails closed. **Block** if globally reachable, unauthenticated, or predictable.
- [ ] Detection/preflight/test operations are read-only. **Block** if scan creates third-party config files or mutates state.
- [ ] Connector config writes are semantic, previewed, approved, backed up, atomic where possible, idempotent, and preserve unrelated settings. **Block** if sibling MCP servers/settings can be lost.
- [ ] Import parser uses local-only file/paste intake, extension/type/size limits, ZIP/path traversal protections where applicable, preview before write, quarantine, dedupe, and batch undo. **Block** if provider transcript-derived candidates auto-write.
- [ ] Proof viewer distinguishes shape/schema inspection from verifier-backed status. **Block** if a green verified state can come from shape checks alone.
- [ ] Diagnostics/proof/import/release exporters use allowlisted projections and fail closed on forbidden fields. **Block** if exporter reads raw logs/state directly.
- [ ] Updates verify signed manifest and payload, reject wrong channel/downgrade, preserve vault/connectors, and fail safely. **Block** on unsafe update behavior.
- [ ] Default uninstall keeps Memory Drive data/backups unless explicit destructive removal is separately chosen. **Block** if normal uninstall silently removes user memory.
- [ ] Support codes are stable and emitted for expected blocker classes. **Hold** if support cannot triage expected failures from safe fields.

### Evidence gate checklist

Purpose: prove the feature/release works in the environments and scenarios claimed.

- [ ] Clean-machine evidence exists for the claimed OS/channel/profile. **Block** if only developer machine or source checkout evidence exists.
- [ ] Evidence maps to scenario IDs and acceptance criteria. **Block** if evidence is anecdotal or cannot be tied to the claim.
- [ ] Public-safe evidence packet includes artifact refs/hashes, version/channel, OS bucket, signer/notarization/update verification where relevant, support owner, known limitations, and decision. **Block** if required fields are absent.
- [ ] Privacy scan passes on screenshots, diagnostic bundles, proof exports, import receipts, support macros, and evidence packets. **Block** on fail or inconclusive scan for shared artifacts.
- [ ] Required beta scenarios pass before public beta: `BETA-INSTALL-001`, `BETA-FIRST-001`, `BETA-CLIENT-001`, `BETA-CLIENT-002`, `BETA-CLIENT-003`, `BETA-PROOF-001`, `BETA-OFFLINE-001`, `BETA-CONFIG-001`, `BETA-CONFIG-002`, `BETA-DIAG-001`, `BETA-CRASH-001`. **Block** if any selected-platform beta scenario fails.
- [ ] Required GA scenarios pass before GA: beta scenarios plus update, uninstall, rollback, reconnect, offline, corrupted-config recovery, partial uninstall, failed update, crash recovery, vault retention, and telemetry controls across every supported OS/version/channel. **Block** if any claimed GA platform lacks evidence.
- [ ] Rollback/undo rehearsal evidence exists for connector writes, imports, updates, uninstall/reinstall, and release pull/pause. **Block** if rollback is untested.
- [ ] Support dry run proves expected issue classes can be triaged without private data. **Block** if support needs raw logs, memory, screenshots, configs, provider responses, account IDs, or paths.
- [ ] Known limitations are public-safe and reflected in copy. **Hold** if limitations are hidden or contradicted by marketing copy.

### Public-copy gate checklist

Purpose: ensure the public story matches evidence and protects user privacy.

- [ ] Homepage, download, setup, README top, in-app first-run, release notes, FAQ, and support macros lead with signed desktop/default local path once available. **Block** if consumer default leads with npm/CLI/source/MCP JSON.
- [ ] Developer CLI/source/manual JSON content is clearly advanced, secondary, or footer/developer appendix. **Hold** if advanced content competes with the primary CTA.
- [ ] Every claim maps to a ledger entry and Enigma-controlled evidence. **Block** if a claim is unsupported or broader than the evidence.
- [ ] Proof copy says local proof/activity summary and states what it does not prove. **Block** if it implies provider deletion, provider non-use, model forgetting, legal/compliance proof, hosted readiness, benchmark superiority, chain submission, or tamper-proof status.
- [ ] Import copy says imports affect Enigma only and provider exports may be incomplete. **Block** if copy implies Enigma can delete, fully import, or verify provider memory outside Enigma-controlled evidence.
- [ ] Memory Controller/category copy says local Memory Drive, app permissions, recall control, and public-safe proof summaries. **Block** if category language implies control over provider logs, model weights, compliance status, or external retention.
- [ ] Screenshots/demo videos use synthetic data, safe labels, opaque refs, support codes, time buckets, and no private paths or provider data. **Block** on real-looking private data.
- [ ] Support diagnostics copy says preview before share and lists do-not-share fields. **Block** if support asks for raw memory, logs, transcripts, complete configs, or screenshots containing private data.
- [ ] Website/download copy does not present unavailable, unsigned, unnotarized, unverified, or unsupported artifacts as ready. **Block** if unsafe workaround instructions are the default.

### Release gate checklist

Purpose: decide whether a candidate can reach public beta, GA, or must roll back.

- [ ] Windows distribution path is selected and evidence matches the claim: Store/MSIX, signed direct installer, or bounded beta fallback with honest SmartScreen observations. **Block** if Windows artifact trust is missing or overstated.
- [ ] macOS artifact is Developer ID signed, hardened runtime where applicable, notarized, and stapled for the claimed channel. **Block** if Gatekeeper bypass is required for the default GA path.
- [ ] Every surfaced binary/helper/runtime/updater is signed as required by the platform. **Block** on unsigned bundled runtime/helper in public candidate.
- [ ] Update manifest/payload verification, channel separation, downgrade/wrong-channel rejection, and failed-update rollback are proven. **Block** if update can strand users or corrupt vault/connectors.
- [ ] Vault retention across update, uninstall, reinstall, and rollback is proven. **Block** if normal uninstall or failed update can silently lose user memory.
- [ ] Public-safe evidence packet is complete and approved. **Block** if evidence packet leaks forbidden fields or lacks ship/hold/rollback decision.
- [ ] Release, support, signing custody, and emergency rollback owners are named. **Block** if any owner is absent.
- [ ] Support playbooks cover installer warnings, first-run stuck, connector failure, proof/export confusion, import quarantine, update failure, uninstall/reinstall, and privacy concern. **Block** if support cannot handle expected classes safely.
- [ ] Known limitations are documented without overclaiming. **Hold** if limitations create a surprise for the target beta/GA audience.
- [ ] Emergency release pause/pull/rollback route is rehearsed and support-notification copy is ready. **Block** if a bad candidate cannot be stopped or reversed.

## Public beta decision

### Public beta can ship only if all are true

- Signed Windows beta artifact exists for the selected Windows path and signed/notarized macOS beta artifact exists for the selected macOS path.
- Default install, first run, Memory Drive creation, at least one connector path, proof summary, diagnostics, update check, offline launch, and uninstall require no terminal, npm, Node, source checkout, provider key, cloud account, or manual MCP JSON.
- At least one supported connector has detect, preview, connect, disconnect/disable guidance, repair, rollback, and test evidence on Windows and macOS. Claude `.mcpb` is preferred where validated; otherwise the support claim must be narrowed.
- Dashboard covers Memory Drive, connected apps, proof/activity, update/offline, diagnostics/support, and one next fix-it action per expected blocker.
- Required `BETA-*` scenarios pass on both Windows and macOS for the selected beta channel using synthetic/public-safe data.
- Public-safe beta evidence packet contains no forbidden fields, names release/support/signing owners, lists known limitations, and records Advisor `ship`.
- Website, README top, app first-run, setup help, support macros, screenshots, and release notes no longer present npm/CLI/manual JSON as the default consumer path.
- Rollback/pause path exists for the release candidate, update channel, connector writes, and support guidance.

### Public beta veto conditions

Any one item below forces `hold` or `rollback`:

- SmartScreen/Gatekeeper/install trust friction is unbounded or requires bypass-first instructions for the target beta audience.
- Any screenshot, diagnostic bundle, proof export, import receipt, support macro, public evidence packet, or release artifact leaks forbidden fields.
- Update path is unsigned, unverified, channel-confused, downgrade-accepting, or can corrupt app/vault/connectors on failure.
- Connector writes can overwrite unrelated settings, lack backup/rollback, or report connected before observable user confirmation/health evidence.
- Default path requires terminal, npm, Node, source checkout, manual MCP JSON, provider keys, cloud account, or raw filesystem navigation.
- Public copy claims provider deletion, provider-native memory removal, model forgetting, hosted SaaS/BYOC readiness, compliance certification, benchmark superiority, legal/patent conclusion, chain submission, or tamper-proof/private-forever status without exact evidence.
- Support has no owner, safe intake process, support codes, or privacy-safe diagnostic dry run.
- Public beta evidence packet is missing, stale for the candidate, private, or not tied to scenario IDs.

## GA decision

### GA can ship only if all are true

- All public beta criteria remain green after beta exit.
- Install, update, rollback, uninstall, reconnect, offline mode, corrupted-config recovery, partial uninstall, failed update, crash recovery, Memory Drive retention, and telemetry controls pass across every supported Windows/macOS version, architecture, and channel claimed for GA.
- Stable, beta, and internal update channels are separated; emergency update revocation/rollback is rehearsed.
- Signing key/certificate custody, renewal, revocation, rotation, and release authority are privately documented with owners.
- Support has approved playbooks for installer warnings, first-run failures, Memory Drive recovery, connector setup/repair, import quarantine, proof/export confusion, update failures, diagnostic bundles, uninstall/reinstall, and privacy boundaries.
- Consumer website, in-app help, release notes, screenshots, demo scripts, support macros, and evidence packets pass claim-boundary and privacy/export allowlist review.
- Final public-safe GA evidence packet is approved and records Advisor `ship`.

### GA veto conditions

Any one item below forces `hold` or `rollback`:

- Any public beta veto remains open.
- No documented key/cert rotation, signing credential custody owner, or emergency release-pull process.
- GA matrix lacks evidence for any supported OS/version/architecture/channel claim.
- Support cannot diagnose expected failures without private data.
- Public docs still lead consumers to npm/CLI/source/manual MCP JSON instead of signed desktop install.
- GA evidence packet is missing, fails privacy scan, contains unsupported claims, or omits rollback/update/support ownership.
- Known beta failure class lacks a verified fix, safe workaround, public limitation, or rollback decision.

## Copy, screenshot, and support-diagnostics review

The Advisor reviews public-facing artifacts as release artifacts, not as marketing polish.

### Copy review

For each website page, in-app screen, README section, FAQ answer, release note, support macro, and screenshot caption:

1. Identify the default reader and next action.
2. Confirm desktop-first consumer path is primary where applicable.
3. Map each claim to ledger evidence.
4. Replace overclaims with Enigma-controlled local facts.
5. Move CLI/npm/source/MCP JSON/proof jargon to advanced/developer sections unless the artifact is explicitly for developers.
6. Add limitation copy where users might infer provider deletion, model forgetting, hosted readiness, compliance, benchmark, legal, patent, or chain effects.
7. Confirm no raw memory, prompts, transcripts, provider responses, private paths, credentials, account IDs, customer identifiers, or realistic private data appear.
8. Record `ship`, `hold`, or required rewrite in the ledger.

Approved wording patterns:

- “Enigma creates a local Memory Drive on this computer.”
- “Connected apps can ask Enigma for approved context.”
- “Proof summaries show Enigma-controlled local activity without exposing memory text.”
- “This does not prove that an AI provider deleted logs, forgot content, or changed its own memory.”
- “Manual CLI and MCP JSON setup are advanced developer paths, not the consumer default.”

Blocked wording patterns:

- “Deletes provider memory.”
- “Makes models forget.”
- “Compliance-certified.”
- “Tamper-proof” or “private forever.”
- “Hosted/BYOC ready” without live infrastructure/operator evidence.
- “On-chain” or “submitted to Solana” without transaction evidence.
- “Benchmarked best” or superiority claims without approved benchmark evidence.

### Screenshot and demo review

Every screenshot/demo set must pass before use:

- [ ] Synthetic data only; no real customer/user/project names, account IDs, provider responses, prompts, transcripts, memory text, credentials, tokens, private keys, or realistic private facts.
- [ ] No local absolute paths, usernames, machine names, repository paths, or private app-data paths.
- [ ] Uses friendly labels, opaque refs, time buckets, counts, status badges, and support codes.
- [ ] Shows default path without terminal/npm/Node/source/manual JSON unless the screenshot is explicitly advanced/developer.
- [ ] Shows “what this proves / does not prove” for proof/import/category surfaces where needed.
- [ ] Does not imply unsupported platform/client/channel readiness.
- [ ] Has a ledger entry with allowlist version and privacy scan result.

### Support diagnostics review

Support diagnostics and intake are approved only when:

- generation is local-only until user preview/export;
- user can delete the bundle before sharing;
- bundle uses allowlisted categories and parsed validation summaries, not raw logs/configs;
- scrubber version, scan result, issue codes, app version, OS bucket, release channel, connector labels, and safe refs are included;
- raw memory, prompts, transcripts, provider responses, credentials, tokens, private keys, account IDs, customer identifiers, local absolute paths, complete configs, private connector bodies, crash dumps with private payloads, and signing secrets are rejected;
- support macros ask only for safe fields and never request screenshots/logs/configs that bypass the preview/export path;
- unsafe or inconclusive bundles are refused by support tooling and converted into a user-facing fix/support code.

## Direction-specific Advisor watchpoints

| Direction | Advisor must verify | Automatic hold/rollback trigger |
| --- | --- | --- |
| Desktop app | Signed installer, bundled runtime, typed app commands, current-user local service, vault retention, offline local views, safe uninstall. | User needs Node/npm/terminal; sidecar/helper unsigned; vault lost on normal uninstall; UI builds shell strings from input. |
| Claude `.mcpb` | MCPB/extension path removes JSON and dependency setup; version/health state is precise; fallback config path is advanced and reversible. | “Opened bundle” is claimed as installed/connected; unverified runtime compatibility; fallback JSON writes lack backup/rollback. |
| Website/download | One primary desktop download CTA; artifact status honest; developer paths secondary; proof/privacy boundaries clear. | Unsigned/unavailable artifact presented as ready; homepage leads with npm/CLI/proof-network; bypass-first install guidance. |
| Dashboard | User can see readiness and one next fix; safe activity only; no health score overclaim; support summary safe. | Dashboard exposes logs/raw paths/private data or forces technical triage. |
| Import wizard | Post-setup optional path; local preflight/preview; quarantine/dedupe; explicit import; public-safe receipt. | Import is mandatory first-run; ChatGPT/provider transcript-derived items auto-write; import receipt contains raw memory. |
| Release infrastructure | Signed artifacts, update signatures, channel separation, evidence packet, diagnostic scrubber, support owners. | Unsafe update, missing rollback, missing signing custody owner, missing scenario evidence, or unsafe evidence packet. |
| Proof viewer/verifier | Proof Activity uses safe view model, offline verifier status, export preview, explicit limits. | Green verified state from shape checks alone; copy implies provider non-use/deletion, compliance, legal effect, or chain submission. |
| Memory Controller category | Category explains local Memory Drive, app permissions, recall control, proof summaries, provider-boundary caveat. | Category copy implies Enigma controls provider-native memory/logs/model weights/compliance/external retention. |

## Rollback playbook requirements

Before public beta and GA, every state-changing path must have a rollback playbook tied to the evidence ledger.

| Path | Minimum rollback evidence |
| --- | --- |
| Connector write | Backup created before write; unrelated settings preserved; restore path tested; disconnect removes only Enigma-owned entry/grant. |
| Claude `.mcpb` | User can disable/remove extension through Claude UI; Enigma can detect stale/missing version where observable; fallback config entries are Enigma-owned and restorable. |
| Import batch | Batch ID, candidate IDs, explicit commit, duplicates skipped by default, quarantine held back, undo/tombstone of Enigma-created records only. |
| Update | Valid update succeeds; unsigned/wrong-channel/downgrade rejected; deliberately failed update leaves prior app, Memory Drive, and connectors usable. |
| Uninstall/reinstall | Default uninstall keeps Memory Drive data and backups; reinstall detects the kept Memory Drive and offers reconnect/repair; full removal is separate destructive choice. |
| Public copy/screenshot | Bad copy/image can be pulled or replaced; support notified; evidence ledger marks unsupported claim or privacy leak. |
| Release candidate | Candidate can be paused/pulled; update manifest can be revoked or redirected safely; support knows current recommended version/channel. |

If rollback cannot be proven, Advisor decision is `hold`. If the unsafe path already shipped, decision is `rollback`.

## Advisor review cadence

- **Concept/design:** review before implementation work becomes a public-launch commitment.
- **Implementation:** review before screenshots, docs, support macros, or release notes describe the feature as working.
- **Evidence:** review every candidate evidence packet before public copy uses it.
- **Public copy:** review before announcement, website/download change, README top change, demo video, support macro, or release note.
- **Release:** review each beta/GA candidate and each emergency release/rollback.
- **Post-release:** re-review on new installer channel, updater change, connector client version change, proof/export schema change, diagnostic allowlist change, support incident class, or claim/copy update.

A phase is not done because implementation exists. A phase is done when Advisor evidence, friction, privacy/export, claim, support, and rollback reviews produce `ship` for the specific public scope claimed.
