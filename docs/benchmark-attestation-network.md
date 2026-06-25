# Benchmark Attestation Network

The Benchmark Attestation Network is the program layer for turning AI-memory benchmark runs into public-safe proof artifacts. It is designed for Enigma's Proof Network: benchmark reports become attestations, attestations become proof packets, and packets can be summarized by Solana-ready opaque roots without putting raw memory or benchmark content on chain.

The program has three tracks:

1. **Public practice track** — reproducible local and public-dataset runs for developers and reviewers.
2. **Hidden rotating challenge track** — private challenge windows that reduce overfitting and leaderboard gaming.
3. **Enterprise private attestation track** — customer or auditor runs over private data where only hashes, refs, counts, signatures, and approved aggregates leave the private environment.

The central rule is **no score without a run**. A row may describe requirements for LoCoMo, LongMemEval, Mem0, or any other comparison target, but it cannot contain scores unless that exact runner or adapter executed against the stated dataset manifest with the stated scorer and validation passed.

## Public-safe boundary

Public benchmark artifacts may contain:

- schema ids;
- report hashes and dataset roots;
- source refs, license refs, split refs, package refs, runner refs, adapter refs, and scorer refs;
- aggregate metric names and aggregate metric values;
- item counts, sampled counts, top-k values, timestamps, nonces, signatures, nullifiers, and anchor roots;
- leakage-scan counts and status;
- claim boundaries.

Public benchmark artifacts must not contain:

- raw memory, raw dataset rows, raw benchmark questions, raw answers, prompts, system prompts, tool traces, transcripts, completions, embeddings, provider responses, private ACL bodies, tenant names, private customer names, API keys, private keys, seed phrases, bearer tokens, passwords, local absolute paths, provider account ids, or hidden challenge examples.

Every chain-facing or publication-facing artifact must make these facts explicit or implied by schema validation:

```json
{
  "transaction_submitted": false,
  "raw_memory_on_chain": false
}
```

Local CLI commands can create Solana-ready anchor batches, but they do not submit transactions or create accounts.

## Program roles and lifecycle

The network has four roles. One organization may hold more than one role, but public artifacts should keep the roles distinct:

| Role | Responsibility | Public-safe proof |
| --- | --- | --- |
| Runner | Executes the benchmark harness or adapter. | Run id, nonce, runner ref, package ref, environment ref, report hash. |
| Scorer | Computes retrieval proxy or answer-accuracy metrics. | Scorer ref, scorer version/hash, metric-family names, aggregate outputs. |
| Reviewer or challenge authority | Checks policy, leakage, challenge eligibility, and no-score-without-run rules. | Signature ref, policy ref, leakage summary, acceptance/rejection status. |
| Anchor operator | Batches public-safe roots for later settlement. | Anchor batch id, roots, refs, counts, signer refs, `transaction_submitted:false`. |

Lifecycle states:

1. `planned` — refs and capability grants are prepared; no score exists.
2. `ran` — the runner produced a report hash for a specific dataset manifest and nonce.
3. `scored` — the scorer produced metrics under a named metric family.
4. `reviewed` — leakage scans and no-score-without-run checks passed or failed.
5. `attested` — signatures bind the reviewed public-safe fields.
6. `packetized` — one or more attestations are wrapped into a proof packet.
7. `anchor_planned` — an anchor batch root is created locally without transaction submission.

A public benchmark claim starts no earlier than `attested`. A root-only anchor proves inclusion of a packet hash, not the truth of raw benchmark content or any private dataset claim outside the signed attestation.


## Track 1: public practice

The public practice track is the reproducible learning and review lane. It can use public-safe fixtures and reviewed public datasets when the raw files are kept local and reports expose only safe summaries.

Typical inputs:

- `enigma.memory_benchmark_suite.v1` deterministic local fixture reports;
- `enigma.standard_memory_benchmark_suite.v1` retrieval/evidence proxy reports over operator-supplied LoCoMo or LongMemEval files;
- public adapter dry runs that do not require provider secrets or provider transcripts.

Practice-track claims may say:

- the run happened for the stated package, runner, dataset hash, scorer, sample bounds, and top-k;
- the reported retrieval/evidence proxy metrics were observed in that run;
- the public artifact excludes raw memory, questions, answers, prompts, provider outputs, credentials, and local paths.

Practice-track claims must not say:

- the system achieved hidden challenge performance;
- a provider or competitor was beaten when that provider or competitor did not run;
- retrieval/evidence proxy metrics are natural-language answer accuracy;
- benchmark evidence proves provider deletion, model forgetting, compliance, ROI, or invoice savings.

## Track 2: hidden rotating challenge

The hidden rotating challenge track provides stronger anti-overfitting evidence. The challenge authority keeps raw challenge items private during the run window and publishes commitments before accepting submissions.

Minimum flow:

1. Create a hidden challenge set and compute `dataset_commitment` and `seed_commitment`.
2. Publish the challenge id, window, task-family summary, item count, and commitments.
3. Grant approved runners a scoped capability for the challenge window.
4. Run adapters through the approved interface with a per-run nonce.
5. Validate reports, leakage scans, scorer refs, item counts, reset policies, and signatures.
6. Publish public-safe benchmark attestations or rejection/nullifier artifacts.
7. Rotate or retire the hidden set after the window, after any reveal, or after suspected leakage.

Hidden-track public artifacts may disclose aggregate distribution metadata such as task families, item counts, language bands, or difficulty bands only when those fields cannot reconstruct hidden examples.

Hidden-track artifacts must not disclose hidden questions, answers, conversations, expected evidence strings, prompt templates that reveal examples, or near-paraphrases of challenge records.

## Track 3: enterprise private attestation

The enterprise private attestation track covers customer data, internal workloads, regulated corpora, support logs, and private agent histories. The customer or auditor keeps raw records private and publishes only approved commitments and aggregates.

Allowed public evidence:

- dataset commitment, split/ref, item count, and policy class;
- package, runner, adapter, scorer, and environment refs;
- report hash and proof packet hash;
- capability grant/revocation refs for the evaluator;
- aggregate metrics approved for publication;
- private evidence refs as hashes or encrypted-auditor refs, never raw payloads;
- signatures from the runner, reviewer, customer, or auditor.

If aggregate metrics are sensitive, the public artifact can state only that a private run was completed, validated, and retained under a private evidence ref. Do not force enterprise customers to publish scores when proof of completion and private auditability is the approved boundary.

## Benchmark attestation schema

`enigma.proof_network.benchmark_attestation.v1` should be the public-safe evidence envelope for benchmark runs.

| Field | Required content |
| --- | --- |
| `schema` | `enigma.proof_network.benchmark_attestation.v1`. |
| `attestation_id` | Stable id derived from public-safe fields or a random public id plus hash. |
| `created_at` | UTC timestamp. |
| `track` | `public_practice`, `hidden_challenge`, or `enterprise_private`. |
| `program` | Program name, program version, policy version, and claim boundary ref. |
| `run` | Run id, nonce, status, start/end timestamps, command ref, runner ref, package ref, adapter ref, environment ref. |
| `dataset` | Dataset name/ref, source ref, license ref, split ref, item count, sample count, dataset root/hash, disclosure policy. |
| `challenge` | Null outside hidden track; otherwise challenge id, window, dataset commitment, seed commitment, rotation id, authority ref, reveal policy. |
| `enterprise` | Null outside enterprise track; otherwise customer-safe auditor ref, private evidence hash/ref, policy class, publication approval ref. |
| `inputs` | Report hash, manifest hash, scorer hash, config hash, prompt-bundle hash when answer generation is performed. |
| `metrics` | Metric families with retrieval proxy and answer accuracy separated. |
| `comparisons` | Baseline, Enigma, provider, or competitor rows using the no-score-without-run envelope. |
| `privacy` | Public-safety booleans and leakage-scan summary. |
| `signatures` | Runner, reviewer, authority, customer, or auditor signatures over the public-safe attestation hash. |
| `anchor` | Opaque root/ref fields with `transaction_submitted:false` and `raw_memory_on_chain:false`. |
| `claim_boundaries` | Human-readable limits that travel with the artifact. |

Required privacy booleans:

```json
{
  "raw_memory_included": false,
  "raw_prompts_included": false,
  "raw_transcripts_included": false,
  "raw_completions_included": false,
  "raw_embeddings_included": false,
  "raw_acl_bodies_included": false,
  "tenant_names_included": false,
  "credentials_included": false,
  "provider_responses_included": false,
  "raw_memory_on_chain": false,
  "transaction_submitted": false
}
```

Minimum public-safe attestation skeleton:

```json
{
  "schema": "enigma.proof_network.benchmark_attestation.v1",
  "attestation_id": "attest_public_ref_01",
  "created_at": "2026-06-25T00:00:00.000Z",
  "track": "public_practice",
  "program": {
    "name": "enigma_benchmark_attestation_network",
    "version": "0.1.12",
    "policy_ref": "sha256:policy-root"
  },
  "run": {
    "run_id": "run_public_ref_01",
    "nonce": "sha256:run-nonce-commitment",
    "status": "completed",
    "runner_ref": "sha256:runner-root",
    "package_ref": "npm:enigma-memory@0.1.12",
    "adapter_ref": "local:enigma-relevance",
    "environment_ref": "sha256:environment-summary-root"
  },
  "dataset": {
    "dataset_ref": "locomo:locomo10",
    "source_ref": "https://snap-research.github.io/locomo/",
    "license_ref": "CC-BY-NC-4.0",
    "split_ref": "public-file",
    "record_count": 0,
    "sample_count": 0,
    "dataset_root": "sha256:dataset-root",
    "raw_records_included": false
  },
  "inputs": {
    "report_hash": "sha256:report-root",
    "manifest_hash": "sha256:manifest-root",
    "scorer_hash": "sha256:scorer-root",
    "config_hash": "sha256:config-root"
  },
  "metrics": {
    "retrieval_proxy": {
      "reported": true,
      "top_k": 5
    },
    "answer_accuracy": {
      "reported": false,
      "reason_not_reported": "No fixed answer-generation and grading run was executed."
    }
  },
  "privacy": {
    "raw_memory_included": false,
    "raw_prompts_included": false,
    "raw_transcripts_included": false,
    "raw_completions_included": false,
    "raw_embeddings_included": false,
    "raw_acl_bodies_included": false,
    "tenant_names_included": false,
    "credentials_included": false,
    "provider_responses_included": false,
    "raw_memory_on_chain": false,
    "transaction_submitted": false
  },
  "signatures": [],
  "claim_boundaries": [
    "Retrieval proxy metrics are not answer accuracy.",
    "No raw memory or raw dataset records are included."
  ]
}
```


## Metric families

The schema must separate retrieval/evidence proxy metrics from answer-accuracy metrics.

Retrieval/evidence proxy asks whether the memory system surfaced records that contain expected support. It can be measured without generating final answers.

Common retrieval proxy fields:

- evidence hit@k;
- exact evidence coverage;
- turn evidence hit@k;
- session evidence hit@k;
- abstention correctness where no-answer labels exist;
- selected memory count;
- estimated prompt tokens;
- local retrieval/packing latency.

Answer accuracy asks whether a fixed model or agent produced the correct final answer under a fixed prompt, tool loop, evaluator, and budget. It requires separate evidence:

- frozen generator model id, not a floating alias;
- frozen answer prompt and memory-injection policy;
- fixed evaluator method and scorer ref;
- retry, timeout, refusal, and abstention policy;
- prompt bundle hash and evaluator bundle hash;
- private retention policy for provider inputs/outputs where license permits;
- public aggregates and hashes only.

Example metric envelope:

```json
{
  "retrieval_proxy": {
    "reported": true,
    "evidence_hit_at_k": 0.82,
    "exact_evidence_coverage": 0.64,
    "abstention_correctness": 0.91,
    "top_k": 5
  },
  "answer_accuracy": {
    "reported": false,
    "reason_not_reported": "No fixed answer-generation and grading run was executed."
  }
}
```

If `reported:false`, the metric family must not contain a score.

## Comparison row schema

Each baseline or competitor row must be explicit about whether it actually ran.

| Field | Requirement |
| --- | --- |
| `target` | Public label such as `full_context`, `keyword_filter`, `enigma_relevance`, `mem0`, or `letta`. |
| `target_type` | `local_baseline`, `enigma_method`, `external_adapter`, or `provider_native`. |
| `ran` | Boolean. Metrics require `true`. |
| `scores_included` | Boolean. Must be false unless the run executed and validation passed. |
| `run_id` | Required when `ran:true`; null otherwise. |
| `adapter_ref` | Adapter package/config/code hash, or requirements-only ref when not run. |
| `dataset_ref` | Dataset manifest hash/root. |
| `reset_policy_ref` | Required for stateful memory systems. |
| `prompt_policy_ref` | Required for answer-accuracy runs. |
| `scorer_ref` | Required for any score. |
| `boundary_reason` | Required when `ran:false` or scores are withheld. |
| `metrics` | Present only when `scores_included:true`. |

Requirements-only example:

```json
{
  "target": "mem0",
  "target_type": "external_adapter",
  "ran": false,
  "scores_included": false,
  "run_id": null,
  "adapter_ref": "requirements-only:mem0-adapter-v1",
  "dataset_ref": "sha256:public-dataset-manifest-root",
  "reset_policy_ref": null,
  "prompt_policy_ref": null,
  "scorer_ref": null,
  "boundary_reason": "Mem0 runtime, credentials, fixed extraction/update/retrieval policy, reset policy, and scorer were not executed in this harness."
}
```

That row is valid because it reports no score. It becomes a score row only after the exact Mem0 adapter executes against the same dataset manifest under the same scorer.

## Anti-cheat controls

The program should assume attempts to overfit public data, infer hidden examples, replay old reports, manipulate reset state, tune against evaluator behavior, or submit incomplete runs.

Required controls:

1. **Pre-run commitments** — hidden challenges publish dataset and seed commitments before the run window.
2. **Per-run nonces** — every report hash binds to a unique nonce.
3. **Runner binding** — package ref, runner ref, adapter ref, scorer ref, and environment ref are part of the signature payload.
4. **Dataset binding** — every score binds to source ref, license ref, split ref, item count, sample count, top-k, and dataset root.
5. **State reset policy** — stateful memory systems declare reset/import/export semantics before scoring.
6. **No-score-without-run validation** — rows with `ran:false` cannot carry metrics; rows with metrics require run ids and scorer refs.
7. **Replay prevention** — attestation ids include nonce, challenge id where present, dataset commitment, report hash, and created timestamp.
8. **Hidden-set rotation** — challenge sets rotate after each window, reveal, suspected leak, or policy change.
9. **Practice/challenge separation** — public practice artifacts cannot be submitted as hidden challenge evidence unless policy explicitly allows the dataset.
10. **Budget parity** — live provider or external runtime comparisons use fixed retry, timeout, context, and spend caps.
11. **Outlier review** — perfect scores, impossible latencies, duplicate report hashes, inconsistent item counts, or suspicious failure patterns trigger review before signing.
12. **Revocation path** — leakage or policy breach produces a revocation/nullifier artifact rather than a public score.

## Leakage scans

Leakage scans are mandatory before publication. They should inspect benchmark attestations, packets, anchor batches, grants, revocations, examples, docs snippets, and marketing claims.

Scan for:

- raw memory and private fixture text;
- raw LoCoMo/LongMemEval records when not explicitly approved for publication;
- hidden challenge questions, answers, evidence strings, and paraphrases;
- enterprise customer data or customer names;
- prompts, system prompts, tool traces, transcripts, completions, provider responses, and embeddings;
- ACL bodies, tenant names, local usernames, home-directory paths, and private workspace paths;
- API keys, private keys, seed phrases, bearer tokens, passwords, cloud credentials, and high-entropy strings outside allowed hash/signature fields.

Recommended scan layers:

1. Schema allowlist for permitted public fields.
2. Key-name denylist for private payload names unless the field is explicitly a hash/ref.
3. Secret-pattern scan for token and credential shapes.
4. Entropy scan with allowlisted hash/signature fields.
5. Absolute-path scan.
6. Private corpus similarity scan for hidden challenge and enterprise tracks.
7. Human review for aggregate fields that could reconstruct private records.

Public leakage summaries should expose counts, scanner refs, and pass/fail status only:

```json
{
  "leakage_scan": {
    "status": "passed",
    "scanner_ref": "enigma-proof-leakage-scan:v1",
    "scanned_fields": 184,
    "raw_match_count": 0,
    "secret_match_count": 0,
    "high_entropy_non_allowlisted_count": 0
  }
}
```

## Proof packet and anchor flow

A benchmark run should flow through the Proof Network like this:

1. Runner creates a benchmark report.
2. Attestation builder hashes the report, dataset manifest, scorer, config, and prompt bundle where applicable.
3. Attestation builder emits `enigma.proof_network.benchmark_attestation.v1`.
4. Packet builder wraps one or more attestations in `enigma.proof_network.packet.v1`.
5. Anchor builder emits `enigma.proof_network.anchor_batch.v1` with opaque roots, refs, counts, signer refs, `transaction_submitted:false`, and `raw_memory_on_chain:false`.
6. A future external anchoring process may submit a root, but the local CLI planning commands do not.

Capability grants and revocations should protect hidden and enterprise runs:

- grants expose subject refs, scope refs, capability names, validity windows, constraint hashes, issuer refs, and signatures;
- grants do not expose private ACL bodies, tenant names, or private identities;
- revocations expose grant refs, nullifiers, reason codes, effective timestamps, issuer refs, and signatures;
- revoked grants cannot authorize future challenge or enterprise attestations.

## LoCoMo in the network

LoCoMo fits the public practice track as a public long-term conversational-memory source. It is useful for multi-session QA and long-context memory retrieval experiments, but public LoCoMo runs must be described precisely.

Allowed from a retrieval/proxy run:

- dataset source/ref, license boundary, local file hash, split or file name, item count, sample bounds, top-k;
- evidence-hit or evidence-coverage style metrics produced by the standard runner;
- claim that the run surfaced expected evidence under the stated parser/scorer.

Not allowed from a retrieval/proxy run:

- answer accuracy;
- provider quality;
- competitor ranking;
- hidden challenge generalization;
- model forgetting, deletion proof, compliance, or ROI claims.

A future LoCoMo answer-accuracy attestation must add the fixed answer-generation and grading evidence described above.

## LongMemEval in the network

LongMemEval fits the public practice track for information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention-oriented memory evaluation.

Allowed from a retrieval/proxy run:

- turn evidence-hit@k;
- session evidence-hit@k;
- exact evidence coverage;
- abstention correctness where supported;
- selected-memory counts, estimated prompt tokens, and local latency;
- source/ref, cleaned file hash, split, item count, sample bounds, and top-k.

Not allowed from a retrieval/proxy run:

- natural-language answer accuracy;
- claims that Enigma won LongMemEval;
- provider/model/competitor superiority;
- deletion, forgetting, compliance, or savings claims.

Hidden challenges may use LongMemEval-like task families, but public LongMemEval records should not be treated as hidden challenge records.

## Mem0 comparisons in the network

Mem0 belongs in the external adapter lane. A Mem0 row is credible only after a configured Mem0 runtime actually runs under the same program rules.

Before publishing a Mem0 score, the attestation must include:

- Mem0 deployment flavor and version, such as hosted platform or open-source runtime;
- SDK/package version and adapter code hash;
- placeholder environment names for credentials, never secret values;
- extraction, update, retrieval, namespace, and reset policy refs;
- model/tool loop refs when answer generation is included;
- dataset manifest hash shared with the Enigma run;
- scorer ref shared with the Enigma run;
- retry, timeout, budget, and context caps;
- leakage-scan summary;
- run id and signatures.

Until those exist, Mem0 can appear only as a requirements-only row with `ran:false`, `scores_included:false`, and no metrics. Vendor positioning may be cited as source context, not as an Enigma-measured result.

## Publication checklist

Publish a benchmark attestation only when:

1. The schema is recognized and validation passes.
2. The artifact contains no raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, credentials, provider responses, hidden records, or private customer data.
3. Chain-facing artifacts state `transaction_submitted:false` and `raw_memory_on_chain:false`.
4. Every score row has `ran:true`, `scores_included:true`, run id, dataset ref, scorer ref, and adapter/runner ref.
5. Every non-run row has `ran:false`, `scores_included:false`, no metrics, and a clear `boundary_reason`.
6. Retrieval/evidence proxy metrics and answer-accuracy metrics are separate.
7. Answer-accuracy scores are absent unless a fixed answer-generation and grading run occurred.
8. Hidden challenge artifacts expose commitments and aggregates only.
9. Enterprise artifacts expose only customer-approved public fields.
10. Leakage scans passed and expose only safe counts.
11. Claim boundaries are embedded in the attestation and copied into public copy.

## Safe claim language

Safe:

- "This attestation proves that a public-safe benchmark report with the stated hash was produced by the stated runner over the stated dataset commitment."
- "The LoCoMo/LongMemEval values are retrieval/evidence proxy metrics for this dataset hash, parser, scorer, top-k, and sample boundary."
- "This Mem0 row is requirements-only because the Mem0 adapter was not run."
- "The anchor batch is Solana-ready local planning output; no transaction was submitted."

Unsafe:

- "This proves Enigma answers LoCoMo questions better than every memory system" when only retrieval proxy ran.
- "This proves Enigma won LongMemEval" when no official answer-accuracy run occurred.
- "This proves Mem0 lost" when the Mem0 adapter was requirements-only.
- "This proves provider deletion, model forgetting, compliance certification, token ROI, or invoice savings."
- "This enterprise result is public" when only a private attestation was approved.

The Benchmark Attestation Network should make strong benchmark claims possible by making unsupported benchmark claims impossible to publish accidentally.