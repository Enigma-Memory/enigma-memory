# Proof Network dashboard spec

Audience: frontend engineers building local and hosted verifier surfaces for Enigma Proof Network.

Purpose: define the screens, data contracts, field-level copy, empty states, and privacy boundaries for a dashboard that helps an operator inspect public-safe proof artifacts without turning the dashboard into the source of truth.

The dashboard is a verifier workbench. It visualizes artifacts that can also be exported and checked offline. It must not imply external-provider behavior, deployment availability, settlement, assurance status, financial outcome, or benchmark superiority unless separate reviewed evidence is loaded and the claim text is explicitly scoped.

## 1. Product principles

1. **Verifier first**: every screen answers "what can this artifact prove, and what can it not prove?"
2. **Local and hosted parity**: hosted mode may add collaboration and retained evidence indexes, but it must render the same artifact semantics as local mode.
3. **Public-safe by construction**: UI state, URLs, logs, support exports, and screenshots must use hashes, roots, refs, counts, timestamps, schema IDs, key refs, status enums, and signatures only.
4. **Dashboard is not evidence by itself**: the primary action is always to inspect, verify, export, or open the artifact bundle; screenshots are secondary convenience.
5. **No hidden success state**: pending, stale, empty, rejected, failed, superseded, revoked, and unsupported artifacts need first-class states.

## 2. Modes

| Mode | User need | Data source | Network behavior | Extra affordances |
| --- | --- | --- | --- | --- |
| Local verifier | Inspect a local proof packet, vault export, or generated chain-planning artifact. | File picker, CLI output directory, local bundle, drag-and-drop JSON. | None required for supported verification. | Import bundle, verify offline, export verifier report, copy public refs. |
| Hosted verifier | Review artifacts uploaded to a configured hosted evidence workspace. | Configured evidence index and customer-controlled uploads. | Reads the configured evidence API only after sign-in. | Assignment, comments using refs only, retained verifier reports, access logs, evidence package builder. |
| Read-only packet view | Share a single packet with an auditor or frontend demo without broader workspace access. | One packet manifest and detached public keys. | None after packet load. | Deep links by artifact hash, print-safe evidence summary. |

Mode badge copy:

- Local: `Offline verifier mode · no network required`
- Hosted: `Hosted evidence index · artifacts remain public-safe`
- Packet: `Packet view · dashboard state is not source evidence`

## 3. Information architecture

Primary navigation:

1. **Overview**: verification summary, Memory Drive health, open blockers.
2. **Memory Drive health**: SMART-style health report.
3. **Anchor batches**: Solana-ready root commitments and non-submission status.
4. **Grants and revocations**: scoped permissions, expiries, nullifiers, replay status.
5. **Benchmark attestations**: report hashes, dataset refs, runner refs, metric summaries.
6. **Connector receipts**: MCP/client connector events, cursor health, receipt coverage.
7. **Privacy scan**: rejected fields, denylist hits, leakage status, safe export checks.
8. **Enterprise evidence**: policy replay, gateway decisions, SIEM/eDiscovery refs, key refs.
9. **Artifact inspector**: raw public-safe artifact view, canonical hash, schema validation.
10. **Evidence package**: selected artifacts, verifier outputs, export manifest.

Route map:

| Route | Screen | Required query params | Optional query params |
| --- | --- | --- | --- |
| `/proof` | Overview | none | `mode`, `packet_ref` |
| `/proof/health` | Memory Drive health | none | `drive_ref`, `namespace_ref`, `status` |
| `/proof/anchors` | Anchor batches | none | `batch_ref`, `root_ref`, `status` |
| `/proof/grants` | Grants and revocations | none | `grant_ref`, `revocation_ref`, `capability_ref`, `state` |
| `/proof/benchmarks` | Benchmark attestations | none | `attestation_ref`, `dataset_ref`, `runner_ref` |
| `/proof/connectors` | Connector receipts | none | `connector_ref`, `client_kind`, `status` |
| `/proof/privacy` | Privacy scan | none | `scan_ref`, `severity` |
| `/proof/enterprise` | Enterprise evidence | none | `policy_ref`, `decision_ref`, `evidence_ref` |
| `/proof/artifacts/:artifact_ref` | Artifact inspector | `artifact_ref` | `schema_id`, `tab` |
| `/proof/package` | Evidence package | none | `package_ref` |

Do not place private identifiers, file paths, user names, organization names, account IDs, or raw artifact JSON in URLs. Use opaque refs only.

## 4. Shared layout

Use a restrained technical dashboard style:

- type: high-quality sans for UI labels and monospace for hashes, counts, refs, roots, signatures, and schema IDs;
- color: neutral base with one accent for verification state; avoid glow-heavy or entertainment styling;
- density: daily operator console, not packed SIEM cockpit;
- containers: use separators and grouped rows before stacking generic cards;
- motion: limited to opacity/transform transitions for row expansion, filters, and inspector drawer.

Global header fields:

| Field | Type | Display |
| --- | --- | --- |
| `mode` | enum | Local, hosted, packet. |
| `loaded_packet_ref` | ref | Monospace pill with copy action. |
| `latest_verifier_status` | enum | `pass`, `warn`, `fail`, `error`, `unsupported`, `not_run`. |
| `latest_verifier_run_ref` | ref | Opens Artifact inspector. |
| `artifact_count` | integer | Total loaded artifacts. |
| `private_payload_status` | enum | `not_scanned`, `pass`, `warn`, `fail`. |
| `generated_at` | timestamp | Relative and absolute timestamp. |
| `export_manifest_ref` | ref | Evidence package link when available. |

Global actions:

- **Import packet**: local file or hosted upload selector.
- **Run verifier**: validates supported artifacts and privacy boundaries.
- **Export verifier report**: writes public-safe verifier output.
- **Build evidence package**: opens selected artifact checklist.
- **Copy selected refs**: copies refs only, never raw records.

## 5. Status vocabulary

Use these states consistently across screens:

| State | Meaning | Primary UI treatment |
| --- | --- | --- |
| `not_loaded` | No packet or artifact source is loaded. | Empty state with import action. |
| `not_run` | Artifact exists but verifier has not checked it in this dashboard session. | Neutral badge and run action. |
| `pass` | Supported verification checks passed. | Positive badge. |
| `warn` | Artifact is valid but stale, incomplete for the selected claim, superseded, or needs review. | Amber badge, review action. |
| `fail` | Required validation, signature, hash, privacy, or state check failed. | Red badge, block export action. |
| `error` | Verifier could not complete because input is malformed or dependency is missing. | Inline diagnostic with safe error ref. |
| `unsupported` | Schema or version is not supported by this verifier. | Neutral badge, upgrade/help action. |
| `revoked` | Grant or capability was invalidated by a revocation/nullifier artifact. | Struck scoped label and revocation ref. |
| `superseded` | Artifact was replaced by a newer ref or root. | Previous/new refs side by side. |

## 6. Overview screen

Goal: summarize whether the loaded proof packet is useful for review.

Sections:

1. **Verification summary**
   - latest status, verifier version ref, supported schema count, unsupported schema count;
   - count of pass/warn/fail/error artifacts;
   - next required action.
2. **Health snapshot**
   - overall Memory Drive status and score;
   - critical metric list by metric key, status, evidence refs;
   - link to Memory Drive health.
3. **Proof artifact inventory**
   - anchor batch count;
   - active grant count;
   - revoked grant count;
   - benchmark attestation count;
   - connector receipt count;
   - enterprise evidence count.
4. **Privacy boundary**
   - latest privacy scan status;
   - rejected field count;
   - private payload status;
   - link to Privacy scan.
5. **Claim boundary reminders**
   - local artifacts do not submit Solana transactions;
   - valid receipts prove Enigma-mediated events only;
   - dashboard review does not prove external-provider behavior, legal assurance, deployment availability, or benchmark leadership.

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `packet_ref` | ref | Opaque packet reference. |
| `packet_hash` | hash | Canonical packet hash. |
| `schema_ids` | string list | Unique schema IDs detected. |
| `verifier_version_ref` | ref | Local or hosted verifier build ref. |
| `signature_valid_count` | integer | Count only. |
| `signature_failed_count` | integer | Count only. |
| `privacy_failed_count` | integer | Count only. |
| `latest_health_report_ref` | ref | Optional. |
| `latest_anchor_batch_ref` | ref | Optional. |
| `latest_benchmark_attestation_ref` | ref | Optional. |

Empty state:

Title: `No proof packet loaded`

Body: `Import a public-safe packet, local verifier report, or hosted evidence export to inspect roots, refs, counts, signatures, and verifier status.`

Actions: `Import packet`, `Open local verifier guide`, `View sample public-safe schema`.

## 7. Memory Drive health screen

Goal: inspect a SMART-style health report for an AI memory drive without exposing memory content.

Summary strip:

| Field | Type | Notes |
| --- | --- | --- |
| `drive_ref` | ref | Never show a drive name. |
| `namespace_ref` | ref | Optional filter. |
| `source_root` | root | Current root used for report. |
| `overall_status` | enum | `healthy`, `watch`, `degraded`, `critical`. |
| `overall_score` | integer | 0-100. |
| `policy_ref` | ref | Threshold policy reference. |
| `report_hash` | hash | Canonical health report hash. |
| `generated_at` | timestamp | Report generation time. |
| `verifier_status` | enum | Status after dashboard verification. |

Metric table:

| Metric | Required fields | Row affordance |
| --- | --- | --- |
| Freshness | `status`, `score`, `oldest_unrefreshed_age_hours`, `p95_active_age_hours`, `fresh_records_ratio`, `evidence_refs` | Expand for recommended actions. |
| Duplicate rate | `status`, `score`, `duplicate_candidate_count`, `duplicate_rate`, `dedupe_savings_estimated_tokens`, `evidence_refs` | Show trend sparkline from counts only. |
| Tombstone risk | `status`, `score`, `tombstone_count`, `unsettled_tombstone_count`, `derived_artifacts_referencing_tombstones`, `tombstone_replay_window_hours` | Link revocation/nullifier refs. |
| Stale derived artifacts | `status`, `score`, `stale_artifact_count`, `artifact_types_stale`, `max_artifact_lag_versions`, `max_artifact_lag_hours` | Link affected artifact refs. |
| Retrieval hit rate | `status`, `score`, `expected_ref_count`, `found_ref_count`, `missed_ref_count`, `hit_rate` | Do not reveal queries. |
| Token reduction | `status`, `score`, `estimated_input_tokens_before`, `estimated_input_tokens_after`, `estimated_token_reduction_ratio` | Display as estimate only. |
| Leakage scan | `status`, `score`, `scan_ref`, `rejected_field_count`, `secret_like_value_count`, `private_payload_status` | Link Privacy scan. |
| Receipt coverage | `status`, `score`, `active_ref_count`, `covered_ref_count`, `uncovered_ref_count`, `receipt_chain_gap_count` | Link connector receipts. |
| Connector health | `status`, `score`, `connector_count`, `lagging_connector_count`, `cursor_gap_count`, `max_cursor_lag_hours` | Link connector screen. |
| Sync fork risk | `status`, `score`, `replica_root_count`, `unresolved_fork_count`, `latest_consensus_root_ref` | Show root refs only. |

Empty state:

Title: `No health report loaded`

Body: `Run or import a memory-drive health report to inspect public-safe status, counts, roots, refs, thresholds, and recommended actions.`

Actions: `Import health report`, `Run local health check`, `View health model`.

Error state:

- If private-looking fields are found, replace row content with `Blocked by privacy scan` and show `scan_ref`, `field_count`, and `reason_ref` only.
- If the report root does not match loaded artifacts, show `Report root mismatch` and offer `Open artifact inspector`.

## 8. Anchor batches screen

Goal: review anchor batches as local, Solana-ready commitment plans without implying a transaction was submitted.

List columns:

| Column | Field | Notes |
| --- | --- | --- |
| Batch ref | `batch_ref` | Primary link. |
| Root | `batch_root` | Monospace shortened root. |
| Item count | `commitment_count` | Count only. |
| Scope | `scope_ref` | Optional opaque scope. |
| Policy | `policy_ref` | Optional. |
| Transaction submitted | `transaction_submitted` | Must render `false`, `unknown`, or evidenced submitted state; default false. |
| Raw memory on chain | `raw_memory_on_chain` | Must render `false` for acceptable artifacts. |
| Signer | `signer_ref` | Public key ref or signer ref. |
| Status | `verifier_status` | Pass/warn/fail/error. |

Detail panel fields:

- `schema_id`
- `batch_ref`
- `batch_root`
- `commitment_refs`
- `commitment_count`
- `created_at`
- `network_hint_ref` when present
- `transaction_submitted`
- `transaction_ref` only when separately supplied as public-safe evidence
- `raw_memory_on_chain`
- `signature_refs`
- `canonical_hash`
- `supersedes_ref`
- `superseded_by_ref`
- `verifier_run_ref`

Required warning copy:

`This batch is a commitment plan unless a separate transaction reference and verifier result are loaded. It must not contain raw memory, prompts, transcripts, embeddings, provider responses, or private account data.`

Empty state:

Title: `No anchor batches`

Body: `Anchor batches appear after a packet includes public-safe roots, refs, counts, non-submission flags, and signature refs.`

Actions: `Import anchor batch`, `Inspect packet`, `Open claim boundaries`.

Invalid state:

- `raw_memory_on_chain !== false`: fail the row and block export.
- `transaction_submitted === true` without `transaction_ref` and verifier support: warn that transaction evidence is incomplete.
- private-looking value in any field: fail with privacy scan link.

## 9. Grants and revocations screen

Goal: show who or what has scoped capability evidence without exposing ACL bodies, identities, or private policy text.

Tabs:

1. **Active grants**
2. **Expired grants**
3. **Revoked grants**
4. **Revocation/nullifier ledger**
5. **Grant verifier errors**

Grant fields:

| Field | Type | Notes |
| --- | --- | --- |
| `grant_ref` | ref | Primary artifact ref. |
| `grant_hash` | hash | Canonical hash. |
| `subject_ref` | ref | Opaque subject only. |
| `resource_ref` | ref | Opaque resource or scope root. |
| `capability_ref` | ref | Capability identifier or hash. |
| `scope_ref` | ref | Opaque scope. |
| `policy_ref` | ref | Issuing policy. |
| `issuer_ref` | ref | Public issuer reference. |
| `issued_at` | timestamp | Public-safe time. |
| `expires_at` | timestamp | Required for active grant rendering. |
| `not_before` | timestamp | Optional. |
| `audience_ref` | ref | Optional. |
| `constraints_hash` | hash | Hash of private constraints; never show private body. |
| `signature_ref` | ref | Signature reference. |
| `state` | enum | `active`, `expired`, `revoked`, `superseded`, `invalid`, `unsupported`. |
| `revocation_ref` | ref | Present when revoked. |

Revocation fields:

| Field | Type | Notes |
| --- | --- | --- |
| `revocation_ref` | ref | Primary artifact ref. |
| `revocation_hash` | hash | Canonical hash. |
| `grant_ref` | ref | Referenced grant or grant hash. |
| `nullifier_ref` | ref | Public nullifier or nullifier hash. |
| `reason_code_ref` | ref | No private explanation. |
| `effective_at` | timestamp | When revocation applies. |
| `issuer_ref` | ref | Public issuer reference. |
| `signature_ref` | ref | Signature reference. |
| `verifier_status` | enum | Pass/warn/fail/error. |

Interactions:

- Expiring grants sort by soonest expiry.
- Revoked grants collapse under their revocation ref.
- Selecting a grant highlights any matching revocation/nullifier and related anchor batches.
- Grant detail includes a `Can authorize future use?` boolean derived only from expiry, verifier status, and revocation state.

Empty states:

- Active tab title: `No active grants`
- Revoked tab title: `No revocations loaded`
- Ledger title: `No nullifier evidence`

Body: `Grant and revocation artifacts should use public-safe refs, scope hashes, expiry, nullifiers, reason-code refs, issuer refs, and signatures. They must not expose private ACLs or identity labels.`

## 10. Benchmark attestations screen

Goal: bind benchmark evidence to reproducible refs without claiming market leadership or exposing private benchmark inputs.

List columns:

| Column | Field | Notes |
| --- | --- | --- |
| Attestation ref | `attestation_ref` | Primary link. |
| Report hash | `report_hash` | Required. |
| Dataset | `dataset_ref` | Required. |
| Runner | `runner_ref` | Required. |
| Package | `package_ref` | Required. |
| Metric family | `metric_family_ref` | Ref, not claim text. |
| Sample count | `sample_count` | Count only. |
| Status | `verifier_status` | Pass/warn/fail/error. |
| Review | `review_status` | `planned`, `ran`, `scored`, `reviewed`, `published`, `superseded`. |

Detail fields:

- `schema_id`
- `attestation_ref`
- `report_hash`
- `dataset_ref`
- `dataset_manifest_hash`
- `runner_ref`
- `runner_version_ref`
- `package_ref`
- `environment_ref`
- `metric_family_ref`
- `metric_summary_refs`
- `sample_count`
- `leakage_scan_ref`
- `privacy_scan_status`
- `verifier_run_ref`
- `signature_refs`
- `published_at`
- `superseded_by_ref`

Allowed metric display:

- aggregate numbers already present in the attestation;
- confidence or error intervals only if present as public-safe numeric fields;
- no row-level benchmark inputs, prompts, completions, provider responses, or dataset examples.

Empty state:

Title: `No benchmark attestations`

Body: `Attestations appear when a report hash is bound to dataset, runner, package, environment, metric, verifier, timestamp, and signer refs.`

Claim guard:

Display this fixed footnote on every benchmark detail panel: `An attestation proves the declared report binding and verifier result. It is not a benchmark leadership, provider-behavior, or financial-outcome claim.`

## 11. Connector receipts screen

Goal: show connector setup, sync, import/export, and verification receipts while preserving client privacy.

Connector summary fields:

| Field | Type | Notes |
| --- | --- | --- |
| `connector_ref` | ref | Opaque connector reference. |
| `client_kind` | enum | Allowed values: `claude-desktop`, `cursor`, `kimi-code`, `vscode-cline`, `roo`, `opencode`, `generic-mcp`, `unknown`. |
| `config_state` | enum | `not_detected`, `dry_run`, `configured`, `disconnected`, `error`. |
| `receipt_count` | integer | Count only. |
| `latest_receipt_ref` | ref | Link to inspector. |
| `latest_cursor_ref` | ref | Cursor ref only. |
| `cursor_gap_count` | integer | Health signal. |
| `max_cursor_lag_hours` | number | Health signal. |
| `last_verified_at` | timestamp | Verifier time. |
| `verifier_status` | enum | Pass/warn/fail/error. |

Receipt timeline event fields:

- `event_ref`
- `operation_ref`
- `connector_ref`
- `bundle_ref`
- `source_root`
- `result_root`
- `receipt_hash`
- `sequence`
- `cursor_ref`
- `changed`
- `backup_ref` when a public-safe backup reference exists
- `error_ref` when failed
- `signature_ref`
- `created_at`

Do not show absolute local paths, client profile names, config file bodies, MCP environment values, memory text, prompts, transcripts, provider payloads, or private connector bodies.

Empty state:

Title: `No connector receipts`

Body: `Connector receipts appear after local connector preview, connect, disconnect, import, export, or MCP operations emit public-safe receipt refs and cursor summaries.`

Actions: `Import receipt bundle`, `Open connector guide`, `Run verifier`.

## 12. Privacy scan screen

Goal: make privacy failures visible before artifacts are exported, uploaded, anchored, or shared.

Summary fields:

| Field | Type | Notes |
| --- | --- | --- |
| `scan_ref` | ref | Primary scan artifact. |
| `scanner_version_ref` | ref | Tool/build ref. |
| `artifact_count` | integer | Scanned artifacts. |
| `field_count` | integer | Scanned fields. |
| `rejected_field_count` | integer | Count only. |
| `secret_like_value_count` | integer | Count only. |
| `private_payload_status` | enum | `pass`, `warn`, `fail`, `not_scanned`. |
| `denylist_ref` | ref | Policy or denylist hash/ref. |
| `generated_at` | timestamp | Scan time. |

Findings table fields:

| Field | Type | Notes |
| --- | --- | --- |
| `finding_ref` | ref | No private value. |
| `artifact_ref` | ref | Affected artifact. |
| `field_path_hash` | hash | Hash of field path; do not show path if path leaks private details. |
| `category_ref` | ref | `raw_memory`, `prompt`, `transcript`, `completion`, `embedding`, `secret`, `provider_response`, `identity_label`, `private_acl`, `local_path`, `unknown`. |
| `severity` | enum | `info`, `warn`, `fail`. |
| `reason_ref` | ref | Safe reason code. |
| `action` | enum | `block_export`, `redact_local_view`, `review`, `ignore_with_policy_ref`. |

Interactions:

- `Block export` banner appears when severity `fail` exists.
- `Show affected artifacts` filters all other screens by `artifact_ref`.
- `Copy safe finding refs` copies refs and reason codes only.

Empty state:

Title: `No privacy scan yet`

Body: `Run a privacy scan before sharing or exporting proof artifacts. The scan should reject raw memory, prompts, transcripts, completions, embeddings, private ACLs, identity labels, local paths, secrets, provider responses, and private connector bodies.`

## 13. Enterprise evidence screen

Goal: help security, records, and platform reviewers inspect minimized evidence for Enigma-mediated policy decisions.

Sections:

1. **Control-plane summary**
   - deployment mode: `local`, `hosted`, `byoc`, `on_prem`, `unknown`;
   - responsibility refs for control owner, data-plane owner, key/log owner;
   - evidence package ref;
   - unresolved blocker count.
2. **Policy replay**
   - policy hash/ref;
   - input ref;
   - allow/deny/error result;
   - replay verifier status;
   - generated_at.
3. **Gateway decisions**
   - decision ref;
   - provider/tool/model/region/purpose/sensitivity refs;
   - decision enum;
   - policy ref;
   - signature ref.
4. **Access and key evidence**
   - API key refs, public-key refs, rotation refs, revocation refs;
   - never key material, session tokens, assertions, or account names.
5. **Records exports**
   - SIEM event hash;
   - eDiscovery manifest hash;
   - export approval ref;
   - delivery status ref.
6. **Claim boundary status**
   - assurance claim status;
   - external-provider behavior claim status;
   - deployment availability claim status;
   - benchmark claim status;
   - each defaults to `not_claimed` unless separate approved evidence ref is loaded.

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `evidence_ref` | ref | Primary evidence item. |
| `evidence_type` | enum | `policy_replay`, `gateway_decision`, `siem_event`, `records_export`, `key_rotation`, `access_review`, `legal_hold`, `incident_drill`, `blocker`. |
| `policy_ref` | ref | Optional. |
| `decision_ref` | ref | Optional. |
| `artifact_hash` | hash | Optional. |
| `verifier_status` | enum | Pass/warn/fail/error. |
| `review_status` | enum | `unreviewed`, `in_review`, `accepted`, `rejected`, `superseded`. |
| `owner_ref` | ref | Opaque owner ref, not a name. |
| `due_at` | timestamp | Optional blocker or review date. |

Empty state:

Title: `No enterprise evidence`

Body: `Import minimized policy, gateway, key, SIEM, records, or review artifacts to assemble an evidence package. The dashboard should show refs and hashes, not customer names, credentials, policy bodies, or private records.`

## 14. Artifact inspector

Goal: let a frontend engineer and reviewer inspect one artifact deeply while preserving privacy and verification semantics.

Tabs:

1. **Summary**: schema, hash, refs, status, timestamps.
2. **Fields**: public-safe key/value view with private-value redaction.
3. **Verification**: validation steps, pass/warn/fail/error rows, signature refs.
4. **Graph**: related roots, refs, grants, revocations, attestations, receipts.
5. **Raw JSON**: available only after privacy scan passes; still hides values marked unsafe by the scanner.
6. **History**: superseded/supersedes refs, previous verifier runs.

Summary fields:

| Field | Type | Notes |
| --- | --- | --- |
| `artifact_ref` | ref | URL param and page title. |
| `schema_id` | string | Must be visible. |
| `schema_version` | string | If available. |
| `canonical_hash` | hash | Required for copy action. |
| `artifact_type` | enum | `health_report`, `anchor_batch`, `capability_grant`, `capability_revocation`, `benchmark_attestation`, `connector_receipt`, `privacy_scan`, `enterprise_evidence`, `proof_packet`, `unknown`. |
| `source_packet_ref` | ref | Optional. |
| `created_at` | timestamp | Optional. |
| `signer_refs` | ref list | Optional. |
| `signature_status` | enum | `valid`, `invalid`, `missing`, `unsupported`, `not_checked`. |
| `privacy_status` | enum | `pass`, `warn`, `fail`, `not_scanned`. |
| `verifier_status` | enum | Pass/warn/fail/error/unsupported/not_run. |

Field viewer rules:

- Render hashes and refs in monospace with copy buttons.
- Collapse arrays longer than 20 items and show count first.
- Never auto-link external network URLs; display URL hashes or refs instead.
- Never syntax-highlight secret-looking values; replace with `blocked_by_privacy_scan` plus `finding_ref`.
- If a field is unknown but public-safe, render under `Other public-safe fields`.

Empty state:

Title: `Select an artifact`

Body: `Choose an artifact ref from another screen or import a public-safe JSON artifact to inspect schema, hash, signature, privacy, and verifier status.`

## 15. Evidence package screen

Goal: collect selected public-safe artifacts into a review/export bundle.

Package builder fields:

| Field | Type | Notes |
| --- | --- | --- |
| `package_ref` | ref | Generated bundle ref. |
| `selected_artifact_refs` | ref list | Selected artifacts. |
| `artifact_count` | integer | Count only. |
| `verifier_run_refs` | ref list | Included verifier outputs. |
| `privacy_scan_ref` | ref | Required before export. |
| `manifest_hash` | hash | Generated export manifest hash. |
| `created_at` | timestamp | Build time. |
| `export_status` | enum | `draft`, `blocked`, `ready`, `exported`. |

Checklist:

- health report included when a health claim is made;
- anchor batches include `transaction_submitted:false` unless separate transaction evidence is selected;
- grant list includes matching revocations/nullifiers;
- benchmark attestations include privacy scan and report hash;
- connector receipts include cursor summary;
- enterprise evidence includes claim-boundary status;
- privacy scan has no `fail` findings;
- unsupported schemas are either removed or marked unsupported.

Empty state:

Title: `No artifacts selected`

Body: `Select public-safe artifacts from the dashboard to build an evidence package. Export is blocked until verifier and privacy scan status are available.`

## 16. Shared empty, loading, and error states

Loading states:

- Use skeleton rows matching the target table shape.
- For inspector loading, reserve summary, tab bar, and field list heights to avoid layout shift.
- Do not use generic spinners as the only progress indicator.

Empty-state content rules:

- State what artifact is missing.
- State which safe fields will appear after import or verification.
- Offer one primary action and at most two secondary links.
- Do not imply the missing state is a failure.

Error-state content rules:

- Use `error_ref`, `artifact_ref`, `schema_id`, and safe reason code.
- Never display parser excerpts that might contain private payloads.
- Include `Retry verifier`, `Open artifact inspector`, or `Remove artifact` when useful.

Global blocked-export banner:

`Export blocked: one or more artifacts failed verification or privacy scan. Resolve failed refs or remove them from the package before sharing.`

## 17. Frontend data contracts

Recommended top-level view model:

| Field | Type | Notes |
| --- | --- | --- |
| `mode` | enum | `local`, `hosted`, `packet`. |
| `packet` | object | `packet_ref`, `packet_hash`, `schema_ids`, `generated_at`. |
| `verifier` | object | `status`, `run_ref`, `version_ref`, `checked_at`, `summary_counts`. |
| `privacy` | object | `status`, `scan_ref`, `finding_counts`, `denylist_ref`. |
| `health` | object or null | Memory Drive summary and metric refs. |
| `anchors` | array | Anchor batch row models. |
| `grants` | array | Grant row models. |
| `revocations` | array | Revocation row models. |
| `benchmarks` | array | Benchmark attestation row models. |
| `connectors` | array | Connector receipt summary models. |
| `enterprise` | array | Enterprise evidence row models. |
| `artifacts` | map | Keyed by `artifact_ref`. |
| `relations` | array | Ref-to-ref edges for inspector graph. |
| `export_package` | object or null | Evidence package draft. |

All view-model fields must be pre-minimized before they reach analytics, logs, or support capture. The frontend should not receive raw private values and then hide them with CSS.

## 18. Filters and search

Global filters:

- artifact type;
- verifier status;
- privacy status;
- schema ID;
- date range;
- signer ref;
- policy ref;
- root/ref/hash text search.

Search rules:

- Search refs, hashes, schema IDs, reason codes, and counts only.
- Do not index raw JSON values before privacy scan passes.
- Hosted mode search results must not reveal artifacts outside the user's approved access scope.
- Local mode search must work offline.

## 19. Accessibility and interaction requirements

- Every status badge must have text, not color alone.
- Hash/ref copy buttons must announce copied value type, not the full value.
- Tables require keyboard row expansion, sortable headers, and focus-visible controls.
- Inspector tabs must be reachable through keyboard navigation.
- Error and blocked-export banners use `role="alert"` in implementation.
- Time values show relative text plus exact timestamp on focus/hover.
- Long refs wrap safely and never force horizontal page scroll on mobile.

## 20. Analytics and logging boundaries

Allowed analytics/log fields:

- screen name;
- mode;
- artifact type;
- verifier status;
- privacy status;
- counts;
- schema ID;
- safe reason code;
- UI action name.

Forbidden analytics/log fields:

- raw memory;
- prompts;
- transcripts;
- completions;
- embeddings;
- provider responses;
- secret values;
- private ACL bodies;
- local absolute paths;
- private connector config bodies;
- account, user, organization, or workspace names;
- raw artifact JSON before privacy scan passes.

## 21. Screen-specific local and hosted deltas

The same screens must exist in all modes. Mode changes should affect source, permissions, retention, and collaboration only; they must not change what an artifact means.

| Screen | Local verifier behavior | Hosted verifier behavior | Packet view behavior |
| --- | --- | --- | --- |
| Overview | Reads imported local packet and current verifier run. Does not assume prior history. | Reads hosted evidence index, retained verifier runs, and assignment state. | Shows summary for the single packet only. |
| Memory Drive health | Imports one health report or local bundle-derived summary. | Shows latest retained health report per approved workspace scope plus previous report refs. | Shows only health report artifacts present in the packet. |
| Anchor batches | Shows chain-planning artifacts and defaults `transaction_submitted:false`. | May show separately uploaded transaction evidence refs, but only as attached public-safe artifacts. | Shows batch refs and non-submission flags from the packet. |
| Grants and revocations | Resolves grant state from loaded grant, expiry, and revocation artifacts. | Adds assignment/review state and retained revocation index refs. | Resolves state only from artifacts included in the packet. |
| Benchmark attestations | Displays attestation rows and verifier output from local files. | Adds review workflow and package-level evidence selection. | Displays report bindings included in the packet. |
| Connector receipts | Reads local connector receipt bundles and cursor summaries. | Shows uploaded connector receipts and review state, not private client config bodies. | Shows connector receipt refs only when included. |
| Privacy scan | Runs or imports a local scan and blocks export on `fail`. | Shows latest hosted scan plus retained finding refs; still blocks export on `fail`. | Shows scan result if present; otherwise marks package `not_scanned`. |
| Enterprise evidence | Imports minimized enterprise evidence artifacts. | Supports reviewer assignment, package building, and retained evidence refs. | Shows enterprise evidence only if bundled. |
| Artifact inspector | Opens artifacts from local memory only after import. | Opens artifacts the signed-in reviewer is allowed to read. | Opens only artifacts linked from the packet manifest. |

Configured hosted UI must not introduce production, availability, settlement, assurance, or legal-status claims. It can show who reviewed a ref only through `reviewer_ref`, `owner_ref`, or `approval_ref`; never through names or account details.

## 22. Component contracts

These component contracts are intentionally data-shaped so frontend engineers can implement them in any framework.

| Component | Props | Required states | Notes |
| --- | --- | --- | --- |
| `ModeBadge` | `mode`, `packet_ref`, `offline_available` | local, hosted, packet | Copy differs by mode but artifact semantics do not. |
| `VerifierStatusPill` | `status`, `run_ref`, `checked_at`, `reason_ref` | pass, warn, fail, error, unsupported, not_run | Must include text label and safe reason code. |
| `ArtifactRefCell` | `artifact_ref`, `artifact_type`, `copy_allowed` | normal, copied, disabled | Copy only the ref, never surrounding raw JSON. |
| `HashRootCell` | `value`, `kind`, `truncate` | normal, expanded, copied | Use monospace and preserve full value for accessible copy. |
| `EvidenceTable` | `rows`, `columns`, `filters`, `sort` | loading, empty, filtered_empty, error, ready | Each screen supplies its own empty-state copy. |
| `InspectorDrawer` | `artifact_ref`, `artifact`, `verification`, `privacy` | loading, unavailable, blocked, ready | Raw JSON tab is disabled until privacy status is not `fail`. |
| `PrivacyGateBanner` | `privacy_status`, `scan_ref`, `finding_counts` | not_scanned, pass, warn, fail | Export controls subscribe to this state. |
| `ExportPackageButton` | `selected_refs`, `verifier_status`, `privacy_status`, `unsupported_required_count` | disabled, blocked, ready, exporting | Disabled reason must be specific and public-safe. |
| `RelationGraph` | `nodes`, `edges`, `selected_ref` | empty, loading, ready | Graph labels use artifact type and shortened refs only. |
| `EmptyStatePanel` | `title`, `body`, `primary_action`, `secondary_actions` | default | No generic empty copy; each screen defines precise content. |

## 23. Required row actions

Every artifact row should support the same predictable action set unless the action is unsafe for that artifact state.

| Action | Applies to | Disabled when | Result |
| --- | --- | --- | --- |
| Open inspector | All artifact rows | `artifact_ref` missing | Opens `/proof/artifacts/:artifact_ref`. |
| Copy ref | All artifact rows | Privacy scan marks ref unsafe | Copies ref only. |
| Copy canonical hash | Artifacts with `canonical_hash` | Hash missing | Copies hash only. |
| Filter related | Rows with relation edges | No relation edges | Applies ref graph filter. |
| Add to evidence package | Verifier-ready artifacts | `verifier_status` is `fail` or privacy status is `fail` | Adds artifact ref to package draft. |
| Remove from package | Selected package artifacts | Not selected | Removes artifact ref only. |
| Open verifier details | Rows with `verifier_run_ref` | No verifier run | Opens inspector verification tab. |

## 24. Acceptance checklist

A frontend implementation is ready when:

- local and hosted modes render the same artifact semantics;
- all nine primary screens exist: Overview, Memory Drive health, Anchor batches, Grants and revocations, Benchmark attestations, Connector receipts, Privacy scan, Enterprise evidence, Artifact inspector;
- every screen has loading, empty, error, and blocked/privacy states;
- field tables above are represented in the view model or intentionally hidden by a documented privacy rule;
- export is blocked by verifier `fail`, privacy `fail`, unsupported required schema, or raw-memory-on-chain violation;
- Solana-related copy says local artifacts are plans unless separate transaction evidence is loaded;
- benchmark copy avoids leadership, financial-outcome, and provider-behavior claims;
- enterprise copy avoids assurance or legal-status guarantees;
- URLs, analytics, logs, and support captures contain refs/hashes/counts/status only;
- the dashboard can export a verifier report that is useful without trusting the dashboard UI.
