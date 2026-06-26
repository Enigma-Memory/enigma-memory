# Memory drive health model

This spec defines a SMART-style health model for an AI memory drive. It turns local memory operations into public-safe health signals an operator can inspect, alert on, and optionally commit into proof-network receipts without exposing private payloads, connector bodies, identity labels, secret material, or provider bodies.

## Product goal

Give every memory drive a compact health panel with the same operational feel as SSD SMART:

- identify silent decay before retrieval quality drops;
- separate correct forgetting from accidental loss;
- show when derived indexes, summaries, receipts, or connector sync state are stale;
- quantify token savings without storing private text;
- provide enough public-safe evidence to anchor health snapshots later.

## SMART analogy

The model borrows SSD SMART's product pattern, not its hardware fields. Each attribute is a bounded, locally measured warning signal with a status, observed value, threshold, evidence ref, and repair action.

| SSD SMART idea | Memory-drive analogue | Failure mode it catches |
| --- | --- | --- |
| Wear and age indicators | Freshness | Active memories have not been revalidated or touched inside policy. |
| Reallocated or duplicate sectors | Duplicate rate | Repeated facts inflate context and create retrieval ambiguity. |
| Pending sector errors | Tombstone risk | Deleted refs can still be replayed, derived, exported, or retrieved. |
| Offline uncorrectable sectors | Stale derived artifacts | Indexes, summaries, exports, or proof packets are built from old roots. |
| Read error rate | Retrieval hit rate | Expected public-safe evidence refs are not found at serving top-k. |
| Throughput efficiency | Token reduction | Context compression is weak or harms retrieval quality. |
| Media integrity scan | Leakage scan | Forbidden payload fields or secret-like values enter artifacts. |
| Power-on audit trail | Receipt coverage | Active refs lack receipt lineage or inclusion evidence. |
| Interface CRC errors | Connector health | Sync cursors, imports, or exports are lagging or discontinuous. |
| Unsafe shutdown / split brain | Sync fork risk | Replicas disagree on the current root or capability state.

## Non-goals and privacy boundaries

- Do not store private payloads, connector bodies, identity labels, secret material, provider bodies, or other denylisted values in a health report.
- Do not require network calls. Health reports are computed from local metadata, receipts, hashes, counters, timestamps, connector cursors, and benchmark summaries already available on disk.
- Do not claim provider deletion, model forgetting, compliance certification, or live-chain settlement from this report alone.
- Do not put customer-specific names in examples. Use stable public-safe refs such as `drive_ref`, `namespace_ref`, `connector_ref`, and SHA-256 roots.

## Health score shape

A memory drive reports one top-level score plus individual SMART-like attributes. The top-level score is intentionally conservative: a critical metric caps the whole drive score even if other metrics are healthy.

| Status | Score range | Meaning | Operator action |
| --- | ---: | --- | --- |
| `healthy` | 90-100 | No active corrective work required. | Keep normal monitoring cadence. |
| `watch` | 75-89 | Degradation is visible but not urgent. | Schedule compaction, sync, or benchmark review. |
| `degraded` | 50-74 | User-visible retrieval or governance risk is likely. | Run targeted repair within the current maintenance window. |
| `critical` | 0-49 | Trust boundary may be broken or retrieval quality may be materially wrong. | Stop publishing proof artifacts for the affected scope until remediated. |

Recommended aggregate formula:

1. Compute every metric as a normalized `score` from 0 to 100.
2. Set `overall_score` to the minimum of:
   - weighted average across metrics;
   - `70` if any metric is `degraded`;
   - `49` if any metric is `critical`.
3. Report `overall_status` from the final `overall_score`.

Default weights should favor trust and retrieval quality:

| Metric | Default weight |
| --- | ---: |
| Freshness | 10 |
| Duplicate rate | 8 |
| Tombstone risk | 12 |
| Stale derived artifacts | 10 |
| Retrieval hit rate | 14 |
| Token reduction | 8 |
| Leakage scan | 14 |
| Receipt coverage | 10 |
| Connector health | 8 |
| Sync fork risk | 6 |

## Metric definitions

Each metric emits:

- `status`: `healthy`, `watch`, `degraded`, or `critical`;
- `score`: normalized 0-100 value;
- `observed`: public-safe measurement fields;
- `thresholds`: the policy used to classify the metric;
- `evidence_refs`: hashes, roots, report refs, or cursor refs supporting the measurement;
- `recommended_actions`: concrete next steps.

### 1. Freshness

**Question:** Are active memories and indexes current enough for the drive's stated retention and retrieval policy?

Suggested measurements:

- `oldest_unrefreshed_age_hours`: age of the oldest active memory that has not been revalidated, summarized, retrieved, or policy-checked within the freshness window;
- `p95_active_age_hours`: p95 age of active memory records since last validation touch;
- `fresh_records_ratio`: active records touched within the policy window divided by active records.

Suggested status policy:

| Status | Rule |
| --- | --- |
| `healthy` | `fresh_records_ratio >= 0.95` and p95 age is inside policy. |
| `watch` | `fresh_records_ratio >= 0.85`. |
| `degraded` | `fresh_records_ratio >= 0.70` or oldest stale record exceeds 2x policy. |
| `critical` | `fresh_records_ratio < 0.70` or freshness metadata is missing for active records. |

Recommended actions:

- run local revalidation for stale namespaces;
- rebuild retrieval index for stale partitions;
- lower TTL or change compaction cadence if stale records recur.

### 2. Duplicate rate

**Question:** Is the memory drive wasting storage and context budget on repeated facts?

Suggested measurements:

- `duplicate_candidate_count`: count of active records grouped by semantic or canonical hash collision;
- `duplicate_rate`: duplicate candidates divided by active records;
- `dedupe_savings_estimated_tokens`: estimated context tokens avoided if duplicates are consolidated.

Status policy:

| Status | Rule |
| --- | --- |
| `healthy` | duplicate rate `< 2%`. |
| `watch` | `2%-5%`. |
| `degraded` | `5%-12%`. |
| `critical` | `> 12%` or duplicate bursts create retrieval ambiguity. |

Recommended actions:

- merge duplicate candidates using local canonical refs;
- preserve receipt lineage for merged records;
- tune connector import idempotency when duplicates cluster by connector.

### 3. Tombstone risk

**Question:** Could deleted or revoked memories accidentally reappear through replicas, derived artifacts, or connector replay?

Suggested measurements:

- `tombstone_count`: count of public-safe deletion markers;
- `unsettled_tombstone_count`: tombstones without receipt or replication acknowledgement;
- `derived_artifacts_referencing_tombstones`: count of summaries, indexes, packs, or exports whose dependency roots include tombstoned refs;
- `tombstone_replay_window_hours`: maximum age of connector cursor lag for deleted refs.

Status policy:

| Status | Rule |
| --- | --- |
| `healthy` | all tombstones are acknowledged and no live derived artifact references tombstoned refs. |
| `watch` | acknowledgement lag is inside policy but non-zero. |
| `degraded` | derived artifacts reference tombstones or acknowledgement lag exceeds policy. |
| `critical` | tombstoned refs are eligible for retrieval/export or connector replay can resurrect them. |

Recommended actions:

- invalidate derived artifacts that depend on tombstoned refs;
- rebuild context packs and exports from active refs only;
- pause connector replay for affected cursor ranges until nullifiers are applied.

### 4. Stale derived artifacts

**Question:** Are indexes, summaries, context packs, receipts, benchmarks, or exports built from older roots than the current memory state?

Suggested measurements:

- `stale_artifact_count`: derived artifacts whose `source_root` differs from the current namespace root;
- `artifact_types_stale`: unique stale artifact types, for example `retrieval_index`, `summary`, `context_pack`, `benchmark_report`, `proof_packet`;
- `max_artifact_lag_versions`: largest version distance from current root;
- `max_artifact_lag_hours`: wall-clock lag since source root changed.

Status policy:

| Status | Rule |
| --- | --- |
| `healthy` | no stale artifacts in active serving paths. |
| `watch` | stale artifacts exist only outside serving paths. |
| `degraded` | active retrieval or benchmark artifacts lag by one or more versions. |
| `critical` | stale artifacts can publish, anchor, export, or serve recalled/tombstoned content. |

Recommended actions:

- rebuild active derived artifacts from the current root;
- quarantine proof packets made from stale roots;
- require artifact builders to declare `source_root` and `artifact_root`.

### 5. Retrieval hit rate

**Question:** Does retrieval find the expected public-safe evidence refs for benchmark or probe queries?

Suggested measurements:

- `probe_count`: number of local probes or benchmark items;
- `hit_at_k`: fraction with at least one expected evidence ref in top-k;
- `exact_coverage`: fraction where all expected public-safe evidence refs are retrieved;
- `abstention_correctness`: fraction of no-answer probes where retrieval returns no evidence above threshold.

Privacy rule: probes may be counted and hashed, but private text, answers, and raw evidence bodies must not appear in the report.

Status policy:

| Status | Rule |
| --- | --- |
| `healthy` | hit@k and abstention are at or above drive policy. |
| `watch` | one retrieval metric is within 5 percentage points of policy floor. |
| `degraded` | any retrieval metric is below policy floor. |
| `critical` | retrieval returns tombstoned refs, private refs outside scope, or cannot run. |

Recommended actions:

- rebuild retrieval indexes;
- inspect namespace filters and capability scopes;
- compare against last healthy benchmark report hash.

### 6. Token reduction

**Question:** Is the memory drive reducing context size without dropping required evidence refs?

Suggested measurements:

- `baseline_estimated_tokens`: estimated tokens for full active context count, not raw text;
- `selected_estimated_tokens`: estimated tokens for retrieval-selected refs;
- `token_reduction_ratio`: `1 - selected_estimated_tokens / baseline_estimated_tokens`;
- `quality_guard_passed`: whether retrieval hit policy passed for the same report.

Status policy:

| Status | Rule |
| --- | --- |
| `healthy` | token reduction meets policy and retrieval guard passes. |
| `watch` | token reduction is low but retrieval guard passes. |
| `degraded` | token reduction meets policy only by failing retrieval guard. |
| `critical` | token reporting uses private text or estimated token fields are missing. |

Recommended actions:

- tune ranking thresholds only if retrieval guard remains satisfied;
- dedupe before reducing top-k;
- never optimize tokens by suppressing required evidence refs.

### 7. Leakage scan

**Question:** Are reports, receipts, exports, proof packets, and derived artifacts free of private payload fields and secret-like values?

Suggested measurements:

- `scanned_artifact_count`: count of artifacts scanned;
- `forbidden_payload_key_hits`: number of denylisted payload key names detected;
- `secret_value_hits`: number of secret-like values detected by local heuristics;
- `unsafe_artifact_refs`: hashes or refs of artifacts requiring quarantine.

Status policy:

| Status | Rule |
| --- | --- |
| `healthy` | zero forbidden payload key hits and zero secret value hits. |
| `watch` | scanner could not inspect a non-published optional artifact. |
| `degraded` | forbidden payload keys or secret-like values appear in unpublished local artifacts. |
| `critical` | unsafe artifacts are published, exported, or eligible for anchoring. |

Recommended actions:

- quarantine unsafe artifacts;
- regenerate reports from public-safe fields only;
- block proof-network packet creation until leakage scan is clean.

### 8. Receipt coverage

**Question:** Can active memory state be traced to public-safe receipts without gaps?

Suggested measurements:

- `active_ref_count`: count of active memory refs;
- `covered_ref_count`: count with valid receipt refs or inclusion roots;
- `receipt_coverage_ratio`: covered active refs divided by active refs;
- `invalid_receipt_count`: malformed, stale, or mismatched receipt refs;
- `latest_anchor_batch_ref`: public-safe proof-network anchor batch ref, if one exists.

Status policy:

| Status | Rule |
| --- | --- |
| `healthy` | coverage `>= 0.99` and invalid receipt count is zero. |
| `watch` | coverage `>= 0.95`. |
| `degraded` | coverage `>= 0.85` or invalid receipts exist. |
| `critical` | coverage `< 0.85`, receipt roots mismatch memory roots, or unsafe receipt payload keys exist. |

Recommended actions:

- issue local receipts for uncovered active refs;
- regenerate inclusion roots after compaction;
- verify anchor batches before external publication.

### 9. Connector health

**Question:** Are connectors importing, exporting, and syncing without private-data leaks or cursor gaps?

Suggested measurements:

- `connector_count`: configured connector refs;
- `healthy_connector_count`: connectors with current cursor, no error burst, and clean leakage scan;
- `lagging_connector_count`: connectors behind policy lag;
- `error_rate_24h`: connector errors divided by operations over 24 hours;
- `cursor_gap_count`: count of discontinuities in public-safe cursor sequence.

Status policy:

| Status | Rule |
| --- | --- |
| `healthy` | all enabled connectors are current and cursor-contiguous. |
| `watch` | lag exists but is inside replay policy. |
| `degraded` | error bursts or lag exceed policy. |
| `critical` | cursor gaps, unscanned payload export, or tombstone replay risk exists. |

Recommended actions:

- pause unhealthy connector scopes before replay;
- repair cursor gaps from receipt refs, not raw provider payloads;
- require connector imports to emit idempotency refs.

### 10. Sync fork risk

**Question:** Could two replicas, devices, or connector lanes believe different roots are current for the same namespace?

Suggested measurements:

- `replica_count`: count of known replica refs;
- `root_disagreement_count`: replicas reporting a non-current namespace root;
- `max_root_lag_versions`: maximum version lag across replicas;
- `unmerged_branch_count`: unresolved branch/nullifier roots;
- `conflicting_capability_count`: grants or revocations with incompatible active scopes.

Status policy:

| Status | Rule |
| --- | --- |
| `healthy` | all replicas agree on current root or have an accepted merge root. |
| `watch` | lagging replicas are read-only and inside sync policy. |
| `degraded` | active replicas disagree but no conflicting writes are observed. |
| `critical` | conflicting writes, grants, revocations, or tombstones are active across forks. |

Recommended actions:

- freeze write grants for forked namespaces;
- merge by public-safe root/ref lineage and tombstone nullifiers;
- publish only the post-merge root after validation.

## Suggested JSON model

The health report schema name should be `enigma.memory_drive_health_report.v1`. It should be deterministic JSON: sorted keys before hashing, ISO-8601 timestamps, integer counts, numeric ratios from `0` to `1`, and no raw private payload fields.

```json
{
  "schema": "enigma.memory_drive_health_report.v1",
  "report_ref": "health_report_sha256:4b1f...",
  "created_at": "2026-06-25T00:00:00.000Z",
  "drive_ref": "drive_sha256:9c2a...",
  "namespace_ref": "namespace_sha256:1f08...",
  "source_root": "memory_root_sha256:7e44...",
  "policy_ref": "memory_health_policy_sha256:44aa...",
  "overall_status": "watch",
  "overall_score": 84,
  "transaction_submitted": false,
  "raw_memory_on_chain": false,
  "privacy_boundaries": {
    "private_payloads_included": false,
    "connector_bodies_included": false,
    "identity_labels_included": false,
    "secret_material_included": false,
    "provider_bodies_included": false
  },
  "metrics": {
    "freshness": {
      "status": "healthy",
      "score": 94,
      "observed": {
        "active_ref_count": 1200,
        "fresh_records_ratio": 0.97,
        "p95_active_age_hours": 18,
        "oldest_unrefreshed_age_hours": 31
      },
      "thresholds": {
        "fresh_records_ratio_watch_floor": 0.85,
        "fresh_records_ratio_degraded_floor": 0.7,
        "policy_window_hours": 48
      },
      "evidence_refs": ["freshness_scan_sha256:aa01..."],
      "recommended_actions": []
    },
    "duplicate_rate": {
      "status": "watch",
      "score": 86,
      "observed": {
        "active_ref_count": 1200,
        "duplicate_candidate_count": 38,
        "duplicate_rate": 0.0317,
        "dedupe_savings_estimated_tokens": 4200
      },
      "thresholds": {
        "watch_floor": 0.02,
        "degraded_floor": 0.05,
        "critical_floor": 0.12
      },
      "evidence_refs": ["dedupe_scan_sha256:bb02..."],
      "recommended_actions": ["Review duplicate clusters before the next context-pack build."]
    },
    "tombstone_risk": {
      "status": "healthy",
      "score": 100,
      "observed": {
        "tombstone_count": 44,
        "unsettled_tombstone_count": 0,
        "derived_artifacts_referencing_tombstones": 0,
        "tombstone_replay_window_hours": 0
      },
      "thresholds": {
        "max_ack_lag_hours": 24
      },
      "evidence_refs": ["tombstone_scan_sha256:cc03..."],
      "recommended_actions": []
    },
    "stale_derived_artifacts": {
      "status": "degraded",
      "score": 68,
      "observed": {
        "stale_artifact_count": 2,
        "artifact_types_stale": ["retrieval_index", "benchmark_report"],
        "max_artifact_lag_versions": 1,
        "max_artifact_lag_hours": 6
      },
      "thresholds": {
        "serving_path_stale_artifacts_allowed": 0
      },
      "evidence_refs": ["artifact_inventory_sha256:dd04..."],
      "recommended_actions": ["Rebuild retrieval indexes from the current source root."]
    },
    "retrieval_hit_rate": {
      "status": "healthy",
      "score": 92,
      "observed": {
        "probe_count": 200,
        "top_k": 5,
        "hit_at_k": 0.94,
        "exact_coverage": 0.88,
        "abstention_correctness": 0.97
      },
      "thresholds": {
        "hit_at_k_floor": 0.9,
        "exact_coverage_floor": 0.85,
        "abstention_correctness_floor": 0.95
      },
      "evidence_refs": ["benchmark_report_sha256:ee05..."],
      "recommended_actions": []
    },
    "token_reduction": {
      "status": "healthy",
      "score": 91,
      "observed": {
        "baseline_estimated_tokens": 180000,
        "selected_estimated_tokens": 39000,
        "token_reduction_ratio": 0.7833,
        "quality_guard_passed": true
      },
      "thresholds": {
        "token_reduction_floor": 0.5,
        "quality_guard_required": true
      },
      "evidence_refs": ["optimizer_report_sha256:ff06..."],
      "recommended_actions": []
    },
    "leakage_scan": {
      "status": "healthy",
      "score": 100,
      "observed": {
        "scanned_artifact_count": 18,
        "forbidden_payload_key_hits": 0,
        "secret_value_hits": 0,
        "unsafe_artifact_refs": []
      },
      "thresholds": {
        "forbidden_payload_key_hits_allowed": 0,
        "secret_value_hits_allowed": 0
      },
      "evidence_refs": ["leakage_scan_sha256:1107..."],
      "recommended_actions": []
    },
    "receipt_coverage": {
      "status": "watch",
      "score": 88,
      "observed": {
        "active_ref_count": 1200,
        "covered_ref_count": 1164,
        "receipt_coverage_ratio": 0.97,
        "invalid_receipt_count": 0,
        "latest_anchor_batch_ref": "anchor_batch_sha256:2208..."
      },
      "thresholds": {
        "healthy_floor": 0.99,
        "watch_floor": 0.95,
        "degraded_floor": 0.85
      },
      "evidence_refs": ["receipt_inventory_sha256:3309..."],
      "recommended_actions": ["Issue local receipts for uncovered active refs before anchoring the next batch."]
    },
    "connector_health": {
      "status": "healthy",
      "score": 96,
      "observed": {
        "connector_count": 4,
        "healthy_connector_count": 4,
        "lagging_connector_count": 0,
        "error_rate_24h": 0,
        "cursor_gap_count": 0
      },
      "thresholds": {
        "cursor_gap_count_allowed": 0,
        "max_error_rate_24h": 0.01
      },
      "evidence_refs": ["connector_inventory_sha256:440a..."],
      "recommended_actions": []
    },
    "sync_fork_risk": {
      "status": "healthy",
      "score": 98,
      "observed": {
        "replica_count": 3,
        "root_disagreement_count": 0,
        "max_root_lag_versions": 0,
        "unmerged_branch_count": 0,
        "conflicting_capability_count": 0
      },
      "thresholds": {
        "active_root_disagreement_allowed": 0,
        "conflicting_capability_count_allowed": 0
      },
      "evidence_refs": ["replica_roots_sha256:550b..."],
      "recommended_actions": []
    }
  },
  "proof_network_ready": {
    "eligible_for_anchor_batch": false,
    "blocking_reasons": [
      "stale_derived_artifacts.status is degraded",
      "receipt_coverage.status is watch"
    ],
    "public_payload_only": true,
    "suggested_anchor_fields": {
      "artifact_type": "memory_drive_health_report",
      "artifact_schema": "enigma.memory_drive_health_report.v1",
      "artifact_root": "health_report_sha256:4b1f...",
      "source_root": "memory_root_sha256:7e44...",
      "counts": {
        "active_ref_count": 1200,
        "scanned_artifact_count": 18,
        "connector_count": 4
      }
    }
  }
}
```

## Computation pipeline

1. Load local public-safe metadata inventories: memory refs, tombstones, receipt refs, connector cursor refs, artifact roots, benchmark report hashes, and optimizer summaries.
2. Reject any candidate field whose key or value matches the private payload denylist.
3. Compute metric observations from counts, timestamps, hashes, roots, and refs only.
4. Classify each metric with the active policy.
5. Compute `overall_score` and `overall_status` with critical caps.
6. Emit deterministic JSON and calculate `report_ref` from canonical JSON.
7. Run leakage scan over the final JSON before allowing export or proof-network packet creation.

## Operator workflow

- **Daily:** inspect `overall_status`, `leakage_scan`, `connector_health`, and `sync_fork_risk`.
- **Before export or anchoring:** require `leakage_scan.status === "healthy"`, `tombstone_risk.status !== "critical"`, `sync_fork_risk.status !== "critical"`, and no stale serving-path artifacts.
- **Before benchmark claims:** require `retrieval_hit_rate.status === "healthy"` or explicitly publish the lower status with the benchmark report hash and policy.
- **After forgetting or revocation:** rerun tombstone, stale artifact, receipt coverage, connector cursor, and sync fork checks.

## Product surface

A CLI or UI should show a concise SMART table first, then drill-down evidence:

| Attribute | Status | Score | Primary action |
| --- | --- | ---: | --- |
| Freshness | Healthy | 94 | None |
| Duplicate rate | Watch | 86 | Review duplicate clusters |
| Tombstone risk | Healthy | 100 | None |
| Stale derived artifacts | Degraded | 68 | Rebuild retrieval index |
| Retrieval hit rate | Healthy | 92 | None |
| Token reduction | Healthy | 91 | None |
| Leakage scan | Healthy | 100 | None |
| Receipt coverage | Watch | 88 | Issue local receipts |
| Connector health | Healthy | 96 | None |
| Sync fork risk | Healthy | 98 | None |

The product should default to safe blocking language: `proof_network_ready.eligible_for_anchor_batch` is false unless every public-safety and source-root condition passes. This makes health reports usable as local operational evidence now and as future proof-network anchor inputs without changing the privacy model.

## CLI surface

The reference implementation ships the health core in the passport package as `createMemoryDriveHealthReport(args)` and exposes it through a two-part CLI command that emits the report as JSON to stdout:

```sh
enigma drive health --bundle <path> \
  [--now <iso>] \
  [--benchmark-summary <path>] \
  [--connector-summary <path>] \
  [--replicas <path>] \
  [--latest-anchor-batch-ref <ref>] \
  [--out <file>]
```

- `--bundle <path>` is the local Enigma vault bundle to inspect (defaults to `.enigma/bundle.json`). A missing or unreadable bundle returns a clean CLI error rather than crashing.
- `--now <iso>` fixes the timestamp used for age calculations so output is deterministic and reproducible; it defaults to a stable timestamp when omitted.
- `--benchmark-summary`, `--connector-summary`, and `--replicas` are optional JSON files carrying public-safe retrieval, connector, and replica metadata. When omitted, the corresponding metrics default gracefully to a measured:false healthy state instead of failing the report.
- `--out <path>` additionally writes the JSON report to a file.

### Output shape

Every emitted object uses schema `enigma.memory_drive_health_report.v1` and contains only public-safe hashes, roots, refs, integer counts, ratios in `0..1`, booleans, statuses, ISO-8601 timestamps, thresholds, and claim text. The top-level fields are:

- `schema`, `report_ref` (`health_report_sha256:<hex>`), `created_at`;
- `drive_ref`, `namespace_ref`, `source_root` (`memory_root_sha256:<hex>`), `policy_ref`;
- `overall_status` (`healthy` | `watch` | `degraded` | `critical`) and `overall_score` (0-100, conservative: any critical metric caps the drive at 49, any degraded metric caps it at 70);
- `transaction_submitted: false` and `raw_memory_on_chain: false` on every report;
- `privacy_boundaries` (all `*_included` flags false), `roots` (`active_set_root`, `receipt_log_root`);
- `metrics`: the ten SMART-style attributes (freshness, duplicate_rate, tombstone_risk, stale_derived_artifacts, retrieval_hit_rate, token_reduction, leakage_scan, receipt_coverage, connector_health, sync_fork_risk), each with `status`, `score`, `observed`, `thresholds`, `evidence_refs`, and `recommended_actions`;
- `recommended_actions` (deduplicated across metrics), `claim_boundaries`;
- `proof_network_ready`: a conservative block with `eligible_for_anchor_batch`, `blocking_reasons`, `public_payload_only`, and `suggested_anchor_fields` (artifact_type `memory_drive_health_report`, artifact_schema `enigma.memory_drive_health_report.v1`, artifact_root echoing `report_ref`, source_root, and counts). This block maps cleanly onto a proof-network registry `health_report` entry: `report_ref` becomes `artifact_hash`, `artifact_schema` becomes `artifact_schema_ref`.

### Claim boundary

A Memory Drive health report is **local operational evidence**, not a proof of outcome. It:

- is computed locally from public-safe counters, roots, receipt metadata, tombstones, and derived/context-pack refs only, with no network or chain calls;
- never contains raw memory, prompts, connector bodies, identity labels, or secret material (a leakage scan runs over the report before it is emitted);
- does **not** prove provider deletion, model forgetting, compliance certification, or live-chain settlement, and never claims a submitted transaction or on-chain memory (`transaction_submitted` and `raw_memory_on_chain` are always false).


## Implementation requirements

The first implementation should treat health reporting as a pure local planner:

- input: public-safe metadata inventories, local benchmark summaries, connector cursor summaries, receipt inventories, artifact inventories, and operator policy thresholds;
- output: one deterministic `enigma.memory_drive_health_report.v1` JSON object;
- side effects: none, except writing the operator-requested report file when exposed through a CLI;
- network behavior: none;
- chain behavior: none; if a later proof-network command consumes the report, it anchors only the report hash/root and counts.

Required validation:

1. Reject unknown top-level schemas unless the caller opts into a future schema version.
2. Reject negative counts, ratios outside `0..1`, timestamps that are not ISO-8601 strings, and missing metric statuses.
3. Reject any artifact whose private-payload denylist scan is not clean.
4. Require every metric to include at least one public-safe evidence ref unless the metric is explicitly `critical` because evidence is missing.
5. Require `transaction_submitted:false` and `raw_memory_on_chain:false` for every exported report.

## Policy knobs

Operators should be able to tune policy without changing report shape:

| Policy field | Default | Why it exists |
| --- | ---: | --- |
| `freshness_window_hours` | 48 | Different teams have different expectations for active memory revalidation. |
| `duplicate_rate_watch_floor` | 0.02 | High-volume connector imports may need earlier duplicate warnings. |
| `tombstone_ack_window_hours` | 24 | Regulated teams may require faster deletion propagation evidence. |
| `retrieval_top_k` | 5 | Retrieval probes should match the product's serving configuration. |
| `hit_at_k_floor` | 0.90 | Keeps retrieval quality policy explicit rather than hidden in copy. |
| `token_reduction_floor` | 0.50 | Prevents token savings claims that do not meet the operator's target. |
| `receipt_coverage_healthy_floor` | 0.99 | Sets how complete receipt evidence must be before publishing. |
| `connector_max_error_rate_24h` | 0.01 | Distinguishes transient connector noise from degraded sync. |
| `sync_max_read_only_lag_versions` | 1 | Allows read-only lag without allowing forked writes. |

Policy refs should be hashed into `policy_ref` so two health reports can be compared only when their thresholds match.

## Alerting rules

Recommended alert behavior:

- page an operator only for `critical` leakage scan, tombstone risk, sync fork risk, or connector cursor gaps;
- open a maintenance ticket for `degraded` stale artifacts, retrieval hit rate, or receipt coverage;
- suppress duplicate alerts while `source_root`, `policy_ref`, and metric status are unchanged;
- include only metric names, statuses, counts, refs, and recommended actions in alert payloads.

## Release acceptance checklist

- The report can be generated from public-safe local metadata without provider credentials or network access.
- Each required SMART-like metric is present and independently classifiable.
- The JSON example remains parseable and contains only public-safe hashes, roots, refs, counts, booleans, statuses, timestamps, thresholds, and signatures.
- Proof-network readiness is conservative: degraded trust or stale-source conditions block anchoring eligibility.
- Product copy describes the report as local operational evidence, not as provider deletion proof, model forgetting proof, compliance certification, or live-chain settlement.
