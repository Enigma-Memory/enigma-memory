# Workflowz frictionless launch goal

## One-sentence goal

Launch Enigma Memory for the general public as a signed, local-first desktop product where a non-technical user downloads the app, creates a private Memory Drive, connects a supported AI app, sees Memory Drive health, imports or reviews memory when ready, and exports privacy-safe proof summaries without using a terminal, installing Node/npm, editing JSON, checking out source, or managing provider/developer infrastructure.

The CLI, npm package, manual MCP JSON, source checkout, proof schemas, verifier internals, and developer APIs remain advanced/support paths. They are never the default consumer journey.

## Default consumer journey

1. Visit the public website and click **Download Enigma Memory**.
2. Install a signed Windows or signed/notarized macOS desktop app.
3. Open Enigma and click **Create my Memory Drive**.
4. Let Enigma create or detect the local Memory Drive in an OS app-data location shown as a friendly label, not a raw path.
5. Let Enigma find supported AI apps read-only.
6. Connect one supported app through the lowest-friction path available, starting with Claude Desktop `.mcpb` when validated.
7. Review a human-readable change preview before any app config write, connector install, import commit, diagnostics share, telemetry/crash upload, or destructive vault action.
8. See **Memory Drive ready** or exactly one primary fix-it action in the dashboard.
9. Use optional post-setup actions from the dashboard: import memory, review held-back items, refresh activity/proof details, preview a safe support report, or manage app permissions.
10. Export only public-safe proof/support summaries after an allowlist/privacy scan passes.

## Advisor gate

The Advisor is the required phase gatekeeper for this launch. A phase may not advance from concept, design, implementation, evidence, public copy, beta, or GA unless the Advisor records a ship/hold/rollback decision against observed evidence.

The Advisor owns the friction budget, privacy/export allowlist, and claim boundary as standing governance rules, not as one-time review notes. Engineering owners may propose evidence; the Advisor decides whether the evidence is enough for phase promotion.

The Advisor blocks promotion when any of these are true:

- the default user must use terminal, Node, npm, source checkout, provider keys, cloud accounts, or manual JSON;
- public artifacts leak raw memory, prompts, transcripts, local absolute paths, credentials, tokens, private keys, account IDs, customer identifiers, provider responses, realistic private data, or signing secrets;
- copy claims more than Enigma-controlled local evidence proves;
- connector/config/update/import writes lack preview, explicit consent, backup/rollback where applicable, or unrelated-setting preservation;
- signing, notarization, update verification, clean-machine install evidence, support owner, or rollback evidence is missing;
- public docs lead with CLI/npm/developer setup instead of the signed desktop path.

## Evidence and privacy allowlist

Public artifacts may expose only public-safe facts that Enigma controls or can observe locally:

- app version, release channel, platform bucket, signed artifact names, file sizes, and hashes;
- local Memory Drive lifecycle state shown as friendly labels, not expanded paths;
- connector labels, connector readiness, restart-needed states, rollback status, and Enigma-managed permission/grant state;
- local activity/proof refs, counts, roots/hashes, schema versions, timestamps/time buckets, verifier status, redaction scan status, and support codes;
- import/export batch counts, duplicate/quarantine totals, source-type labels, limitations, and receipt refs;
- diagnostic category names and parsed validation summaries that passed the forbidden-field scanner.

Everything else is private by default. Raw memory, prompts, transcripts, completions, embeddings, realistic customer examples, complete client configs, local absolute paths, credentials, tokens, private keys, account IDs, customer identifiers, provider responses, signing secrets, and provider account material are not public evidence.

## Eight-direction integration

| Direction | Frictionless product role | Public beta cut | GA cut |
| --- | --- | --- | --- |
| Consumer desktop app | The default product surface: signed app, bundled runtime, local service bridge, Memory Drive setup, health/fix-it, updater, uninstall that keeps the vault by default. | Signed Windows beta and signed/notarized macOS candidate install, launch, create/detect vault, run offline local health/proof views, update-check, and uninstall on clean machines with no Node/npm/terminal/JSON. | Full supported Windows/macOS matrix for install, update, rollback, uninstall/reinstall, offline, helper crash recovery, vault retention, and channel separation. |
| Claude-first `.mcpb` | The first AI-app connection wedge: desktop-assisted Claude Desktop extension flow before manual config. | At least one Claude path has detect, readiness, `.mcpb` generation/install guidance, health/test, repair, disconnect, and fallback boundaries without default JSON editing. Programmatic install is not claimed unless proven. | Claude connection status, version drift, repair, update, enterprise policy blockers, and fallback removal are supported with clean-machine evidence. |
| Public website/download funnel | The public acquisition and help surface: homepage -> download -> setup -> help/privacy/proofs, with developer paths secondary. | Consumer pages contain no command-line/default MCP JSON setup, clearly label artifact signing/beta status, and route users to signed desktop install. | Website, README top, in-app help, release notes, screenshots, and FAQ pass claim-boundary and sensitive-data review. |
| Memory Drive dashboard | The daily control panel: Memory Drive Home / Memory Weather with one next action, app cards, activity details, needs review, and support-safe reports. | Dashboard answers whether Enigma is ready, which app is connected, and the single next fix; no raw logs, paths, protocol-first language, or health score. | Every blocked/warning/offline/recovery state has one fix-it action or support handoff, accessible labels, and public-safe support codes. |
| Import wizard | Optional post-setup Import Sandbox, not mandatory first-run setup. | Paste/drop curated memory text or supported memory files, preview locally, dedupe, quarantine risky/transcript-derived candidates, commit selected items, and produce sanitized receipt. ChatGPT full export stays advanced/preview/quarantine by default. | Hardened source adapters, parser limits, undo/tombstone by batch, receipt/export redaction, import caveats, and performance limits are proven. |
| Public beta release infrastructure | Trust, signing, updates, diagnostics, evidence, and support process. | Signed beta artifacts, update verification path, public-safe evidence packet, diagnostics preview/export rejection, support owner, release owner, signing owner, and BETA scenario results exist. | Store/MSIX or direct-download trust path, Developer ID notarization/stapling, updater rollback, key/cert custody, emergency release process, and support dry runs are complete. |
| Proof viewer/verifier | Consumer **Proof Activity**: local activity, context summary, not-shared evidence, offline verifier state, and safe export preview. | `BETA-PROOF-001` works offline from Enigma-controlled local events, says what it proves/does not prove, and contains no forbidden fields. Shape checks cannot produce a green verified state. | Verifier trust bundle, export scanner, support refs, advanced details, and all proof states are stable and claim-boundary approved. |
| Memory Controller category | The category narrative: Enigma is the private Memory Controller for AI, backed first by local permissions, Memory Drive health, recall controls, and portable proof summaries. | The category appears as plain product copy only: one Memory Drive, apps ask permission, user controls Enigma-mediated recall. No full memory OS, provider deletion, provider forgetting, hosted network, or chain claims. | Consent grants, recall veto, private bubbles, and Passport/backup flows may expand only after desktop/connector/privacy evidence remains green. |

## Friction budget

The launch budget is measured from a default public user’s first website visit through first useful connected memory.

| Budget item | Limit |
| --- | --- |
| Developer prerequisites | Zero. No terminal, Node, npm, Git, source checkout, package registry, provider key, cloud account, database setup, or manual MCP JSON in the default path. |
| Primary action density | One primary action per screen; one secondary escape hatch at most; advanced details must not interrupt first run. |
| Default setup path | Website download -> OS install -> app wizard -> create Memory Drive -> find apps -> connect one app -> health ready/fix-it. |
| Connector writes | Zero silent writes. Detection and preview are read-only; writes require preview, consent, backup where applicable, semantic merge, rollback, and restart/test guidance. |
| Privacy/export | Zero best-effort public exports. Diagnostics, proof summaries, screenshots, receipts, support bundles, and evidence packets fail closed when forbidden fields are present or scanner status is unknown. |
| Recovery | Every blocked state has one fix-it action or support handoff with a safe support code. Missing apps and offline mode are bounded states, not failures. |
| Language | Consumer copy uses Memory Drive, connected apps, permissions, activity details, safe support report, and proof summary. CLI/MCP/schema/Merkle/receipt-chain/proof-of-non-use terms stay behind advanced disclosure. |
| Evidence | Every public claim maps to an Enigma-controlled local artifact or is blocked/reworded by the Advisor. |

## Public beta cutline

Public beta can ship only when all of the following are true:

- the Advisor records a ship decision for beta entry;
- signed Windows beta artifact and signed/notarized macOS beta artifact exist for the selected channels;
- clean Windows and macOS profiles complete install, first run, local Memory Drive setup, at least one connector path, dashboard health, proof summary, diagnostic preview, offline launch, update check, and uninstall without terminal, Node, npm, or JSON editing;
- at least one supported connector has full detect, preview, connect, disconnect, repair, rollback, and test evidence on Windows and macOS; other connectors are labeled unavailable, beta, or advanced until validated;
- Claude Desktop `.mcpb` is either the validated first connector path or is explicitly labeled not yet available, with no manual JSON presented as the default replacement;
- Memory Drive dashboard covers vault, local service, connected apps, update, activity/proof, offline, diagnostics/support, and needs-review states with one primary fix action per expected issue;
- Import Sandbox is optional after setup and cannot auto-write transcript-derived or unsafe candidates;
- Proof Activity generates a public-safe local proof summary and states exactly what it proves and does not prove;
- public website/download/setup/help/privacy/proof pages are desktop-first and consumer-safe;
- update signing/channel checks, diagnostics redaction, support intake, release owner, support owner, signing owner, and public-safe beta evidence packet are complete;
- no beta evidence packet, screenshot, support artifact, proof/export, or public copy contains forbidden private fields or unsupported claims.

Beta holds if any default path requires bypass-first OS security instructions, command-line setup, manual JSON, raw logs/configs, unsafe diagnostics, unsigned/unverified updates, missing rollback, missing support ownership, or overclaiming.

## GA cutline

General availability can ship only when all public beta criteria remain green and:

- the Advisor records a ship decision for GA entry;
- public beta exit has no open blocker in install, first run, connector writes, update, vault retention, diagnostics, support, privacy/export, or public claims;
- install, update, rollback, uninstall/reinstall, reconnect, offline mode, corrupted-config recovery, partial uninstall, failed update, app crash recovery, helper/service recovery, and vault retention pass across every supported Windows/macOS version, architecture, and channel;
- stable, beta, and internal update channels are separated, downgrade/wrong-channel rejection is proven, and emergency rollback/revocation is rehearsed;
- signing key/certificate custody, renewal, revocation, update-key rotation, release-pull authority, and owner escalation are documented privately;
- support can triage installer warnings, vault recovery, connector setup, update failures, diagnostics, proof/privacy confusion, and uninstall/reinstall issues from public-safe fields only;
- consumer website, README top, app copy, in-app help, FAQ, release notes, screenshots, proof exports, diagnostics, and evidence packets pass claim-boundary and sensitive-data review;
- final public-safe evidence packet is approved for sharing.

GA holds if any beta blocker remains, public docs still lead consumers to npm/CLI, support needs private data to diagnose expected failures, update rollback is unrehearsed, key/cert incident ownership is missing, or GA evidence is incomplete/unsafe.

## Do-not-claim list

Public launch copy, UI, docs, demos, support artifacts, proof exports, release notes, and evidence packets must not claim or imply:

- provider deletion;
- provider-native memory removal;
- model forgetting;
- hidden cache removal, provider log deletion, or provider non-use;
- hosted SaaS, relay/gateway, cloud Memory Drive, or BYOC readiness without separate live infrastructure/operator evidence;
- compliance certification;
- benchmark superiority, ROI superiority, token-savings superiority, or security leadership without separate evidence;
- legal, regulatory, or patent conclusions;
- Solana/on-chain submission, anchoring, settlement, finality, or public proof-network participation without transaction evidence;
- tamper-proof, private-forever, impossible-to-leak, or device-tamper-proof security;
- warning-free Windows/macOS install before observed OS trust evidence supports it;
- connector support for any app/platform that lacks fixture plus clean-machine/manual evidence;
- provider import completeness, account identity, deletion, or retention effects from exported files alone.

Allowed public claims stay inside Enigma-controlled local facts: local Memory Drive lifecycle, local connector setup/repair status, Enigma-mediated permissions/recall decisions, local receipt/proof summaries, signed installer/update status, local health checks, redaction scan status, and public-safe support codes.

## First, second, later

### First: make the public path real

- Advisor evidence ledger and phase gates.
- Signed desktop shell with bundled runtime/local service bridge.
- Local Memory Drive creation/detection, vault retention, and redacted labels.
- Privacy/export scanner shared by diagnostics, proof exports, screenshots, import receipts, and evidence packets.
- Memory Drive dashboard with one next action.
- One validated connector path, preferably Claude Desktop `.mcpb` if runtime/install evidence supports it.
- Proof Activity public-safe summary.
- Consumer website/download/setup/help pages that lead with signed desktop install.
- Public beta release evidence, support ownership, and diagnostics preview/export.

### Second: make the product feel complete

- Additional connector cards only as evidence supports them: Cursor, VS Code/Cline, Roo, OpenCode, Kimi Code, Generic MCP advanced.
- Import Sandbox for curated memory text/files, Claude memory text, Enigma capsules/reports, and advanced ChatGPT export preview/quarantine.
- Health/fix-it expansion for corrupted configs, restart-needed states, stale connector versions, update states, and support codes.
- Recall permissions as app-level grants with revoke/expiry copy.
- Safe export/backup/Passport proof-only summary as an advanced post-setup action.
- Store/MSIX evaluation if it lowers Windows friction without breaking vault retention.

### Later: keep out of the public-beta critical path

- Hosted SaaS, BYOC, cloud Memory Drive, relay/gateway production data plane, account system, and enterprise admin/SIEM.
- Mobile companion, native share extensions, recovery capsules, push approvals, multi-device sync, team memory, and browser-native surfaces.
- Solana anchoring, proof registry, marketplace, settlement, public operator network, token/economic rails, and chain-submission UX.
- Benchmark leaderboards, superiority claims, certification/conformance programs, legal/patent narratives, and compliance claims.
- Broad automatic provider import/deletion/forgetting flows.
- Proof cinema, complex graph visualizations, ontologies, or protocol-heavy dashboards before the desktop happy path is trusted.

## Source research inputs

This goal is based on the 2026-06-27 Workflowz research pass across these lanes:

- desktop app and bundled runtime;
- Claude-first MCP Bundle / `.mcpb`;
- public website and download funnel;
- Memory Drive dashboard / Memory Weather;
- Import Sandbox / import wizard;
- release, signing, updates, diagnostics, and beta evidence;
- Proof Activity viewer/verifier;
- Memory Controller category;
- standing launch Advisor and cutlines.

Repository plans aligned by this goal:

- [`docs/GENERAL_PUBLIC_LAUNCH_GOAL.md`](GENERAL_PUBLIC_LAUNCH_GOAL.md)
- [`docs/GENERAL_PUBLIC_LAUNCH_WORKPLAN.md`](GENERAL_PUBLIC_LAUNCH_WORKPLAN.md)
- [`docs/public-launch/desktop-app-plan.md`](public-launch/desktop-app-plan.md)
- [`docs/public-launch/consumer-onboarding-ux.md`](public-launch/consumer-onboarding-ux.md)
- [`docs/public-launch/one-click-connectors.md`](public-launch/one-click-connectors.md)
- [`docs/public-launch/trust-signing-release.md`](public-launch/trust-signing-release.md)
- [`docs/public-launch/qa-support-observability.md`](public-launch/qa-support-observability.md)
- [`docs/public-launch/public-launch-docs.md`](public-launch/public-launch-docs.md)
- [`docs/public-launch/ADVISOR.md`](public-launch/ADVISOR.md)
