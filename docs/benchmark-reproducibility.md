# Benchmark reproducibility

This guide explains how to reproduce the current local Enigma memory benchmark, run official-dataset retrieval/evidence proxy benchmarks against LoCoMo and LongMemEval inputs, save public-safe JSON reports, cite source datasets honestly, and understand what is still required before publishing live LLM answer-accuracy or competitor comparisons.

## What is reproducible today

The current planned package is `enigma-memory@0.1.17`. Two benchmark paths are reproducible without provider credentials:

1. The local deterministic memory suite, available through the package script and the script file it wraps:

   ```sh
   cd enigma
   npm run benchmark:memory-suite
   npm run benchmark:memory-suite -- --out benchmark-report.json
   node scripts/run-memory-benchmarks.mjs --out benchmark-report.json
   ```

   The `--out` form writes the report to the requested path and prints only a small status object. Without `--out`, the command writes the full JSON report to stdout. The report schema is `enigma.memory_benchmark_suite.v1`.

2. The official-dataset standard runner, which consumes locally downloaded LoCoMo and/or LongMemEval JSON files:

   ```sh
   node scripts/run-standard-memory-benchmarks.mjs --locomo .enigma/benchmarks/datasets/locomo10.json --longmemeval .enigma/benchmarks/datasets/longmemeval_s_cleaned.json --max-locomo-qa 25 --max-longmemeval-items 25 --top-k 5 --dry-run
   node scripts/run-standard-memory-benchmarks.mjs --locomo .enigma/benchmarks/datasets/locomo10.json --longmemeval .enigma/benchmarks/datasets/longmemeval_s_cleaned.json --max-locomo-qa 25 --max-longmemeval-items 25 --top-k 5 --out .enigma/standard-memory-benchmark-sample.json
   ```

   The `--dry-run` command emits `enigma.standard_memory_benchmark_plan.v1`: a public-safe offline plan with file names, sample caps, top-k, local method rows, a requirements-only Mem0 adapter row, and explicit boundaries. It does not read dataset files, hash data, produce scores, call APIs, run Mem0 or competitor adapters, generate answers, or spend provider budget.

   The scored standard report schema is `enigma.standard_memory_benchmark_suite.v1`. It scores retrieval/evidence coverage over official dataset records with local deterministic methods only and includes a requirements-only Mem0 row with `scores_included:false`. It does not call LLM providers, generate final answers, grade natural-language answer correctness, call Mem0 or other competitor SDKs, or create provider/competitor scores.

   In that standard report, `keyword_filter` is intentionally the simpler lexical baseline. `enigma_relevance` is the deterministic Enigma retrieval approximation: it uses deterministic query expansion, term normalization and stemming, task/category and temporal/date hints, role/session metadata, phrase/proximity scoring, and final reranking for evidence diversity. It does not use raw answer text, evidence labels, or `has_answer` flags to choose records. It must be interpreted only as retrieval/evidence proxy scoring over the local dataset file named in the report, not as LLM answer accuracy, provider performance, Mem0/competitor performance, or leaderboard standing.

   | Standard-runner row | Retrieval boundary |
   | --- | --- |
   | `full_context` | Scores every parsed local memory record for the dataset item without retrieval filtering. |
   | `recency_last_n` | Scores the most recent parsed records as a deterministic recency baseline. |
   | `keyword_filter` | Scores direct normalized query/content term overlap only. |
   | `enigma_relevance` | Scores deterministic Enigma-style retrieval signals before `--top-k`: query expansion, stemming, role/session metadata, temporal hints, phrase/proximity matches, and evidence-diversity reranking. |

Both report families are designed to be public-safe: they contain aggregate metrics, commitments, citations, profile labels, source metadata, and claim boundaries. They do not include raw fixture memory, raw dataset conversation text, private question text, private answer text, provider transcripts, credentials, account ids, or local absolute paths.

## Official dataset download runbook

Use `scripts/download-standard-benchmarks.mjs` to stage official LoCoMo and LongMemEval files for future standard benchmark runs without adding raw data to the repository. The default mode is a public-safe dry run:

```sh
cd enigma
node scripts/download-standard-benchmarks.mjs --dry-run
```

The dry-run output lists planned fetches only: dataset ids, source URLs, licenses or upstream license-review notes, usage boundaries, expected output files under `.enigma/benchmarks/datasets`, and the manifest path. It does not fetch data, print raw dataset snippets, include credentials, or emit local absolute paths when the default relative paths are used.

To download all supported datasets and capture hashes/sizes, opt in explicitly:

```sh
node scripts/download-standard-benchmarks.mjs --execute --dataset all --out-dir .enigma/benchmarks/datasets --manifest .enigma/benchmarks/dataset-manifest.json
```

For a single dataset, use `--dataset locomo`, `--dataset longmemeval-oracle`, `--dataset longmemeval-s`, or `--dataset longmemeval-m`. The manifest schema is `enigma.standard_benchmark_dataset_manifest.v1`; it records source URLs, output file names, byte sizes, SHA-256 hashes, licenses/usage boundaries, and `raw_dataset_content_included: false`.

Expected official source facts:

- LoCoMo data source: `https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json`; license: CC BY-NC 4.0.
- LongMemEval cleaned source files: `https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json`, `https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json`, and `https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_m_cleaned.json`. LongMemEval covers information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention.

Do not commit downloaded files or raw benchmark conversations. The package `.gitignore` excludes `.enigma/`; keep `.enigma/benchmarks/datasets` and the manifest as local/review artifacts unless a separate publication review approves what can be shared. LoCoMo is licensed CC BY-NC 4.0. LongMemEval cleaned files are hosted by the upstream Hugging Face dataset/repository; review the upstream terms before use or redistribution. Downloading these files enables retrieval/evidence-coverage or other reviewed benchmark scoring, not provider deletion proof, model forgetting proof, ROI/savings claims, compliance certification, live competitor scores, or benchmark-leadership claims.

## Reproduce and save local fixture JSON

1. Use a clean checkout containing `enigma-memory@0.1.17`.
2. From a repository root that contains `enigma/package.json`, enter the package directory:

   ```sh
   cd enigma
   ```

   If your checkout already has `package.json` for `enigma-memory` at the current directory, skip this `cd`.

3. Install the package dependencies with the reviewed package command:

   ```sh
   npm install
   ```

4. Run the benchmark and save the public-safe JSON report:

   ```sh
   npm run benchmark:memory-suite -- --out benchmark-report.json
   ```

5. Preserve the JSON file with the command, package version, operating system/runtime, hardware class when relevant, and review context that produced it.
6. When sharing the result publicly, share the generated JSON report only after confirming it still has `public_safe: true` and `schema: "enigma.memory_benchmark_suite.v1"`.

The local fixture measures Enigma-controlled operations only: vault remember/update, vault export/import, passport context-pack retrieval, deterministic local relevance filtering before optimizer tiering, optimizer token estimates and duplicate removal, bundle/context-pack verification, abstention behavior, exact-answer recall over the deterministic fixture, and p50/p95 operation latency from `performance.now`.

Interpret improvements as local fixture behavior. Enigma reduces context-pack estimated prompt tokens by selecting the deterministic query/purpose/address-relevant local memories before optimizer tiering and deduplication; it does not measure provider invoice savings, token ROI, live model quality, or third-party memory superiority. Token estimates and p50/p95 timings can change across hardware, Node/runtime versions, script revisions, and fixture updates.

## Run the official-dataset standard benchmark

The standard runner reads local dataset files produced by the downloader and writes a public-safe proxy report to the path supplied with `--out`. Preview the exact offline boundary first:

```sh
node scripts/run-standard-memory-benchmarks.mjs --locomo .enigma/benchmarks/datasets/locomo10.json --longmemeval .enigma/benchmarks/datasets/longmemeval_s_cleaned.json --max-locomo-qa 25 --max-longmemeval-items 25 --top-k 5 --dry-run
```

That command proves only the planned local files, sample bounds, `--top-k`, deterministic local rows, and no-API/no-Mem0/no-competitor/no-score boundary. It does not prove the files exist, hash the datasets, or report accuracy.

A bounded scored sample is the safest first run:

```sh
node scripts/run-standard-memory-benchmarks.mjs --locomo .enigma/benchmarks/datasets/locomo10.json --longmemeval .enigma/benchmarks/datasets/longmemeval_s_cleaned.json --max-locomo-qa 25 --max-longmemeval-items 25 --top-k 5 --out .enigma/standard-memory-benchmark-sample.json
```

Useful runner options:

- `--locomo <path>` supplies a local LoCoMo JSON file.
- `--longmemeval <path>` supplies a local LongMemEval JSON file. Use one cleaned split per run when you want split-specific evidence.
- `--max-locomo-qa <n>` and `--max-longmemeval-items <n>` bound the sample size.
- `--top-k <n>` controls retrieval depth; the default is `5`.
- `--dry-run` prints the public-safe offline plan and does not read dataset files or produce scores.
- `--out <path>` writes public-safe JSON to that path. Without `--out`, the report is printed to stdout.

If only `--locomo` or only `--longmemeval` is supplied, the runner scores only that dataset.

For a full local proxy run, remove the sample caps:

```sh
node scripts/run-standard-memory-benchmarks.mjs --locomo .enigma/benchmarks/datasets/locomo10.json --longmemeval .enigma/benchmarks/datasets/longmemeval_s_cleaned.json --top-k 5 --out .enigma/standard-memory-benchmark.json
```

Full runs may take materially longer, may produce larger JSON reports, and may change with Node/runtime, hardware, script revision, dataset split, retrieval depth, and any future parsing fixes. They still remain retrieval/evidence proxy runs: no LLM answer generation, no provider APIs, no hosted memory services, and no competitor adapters are exercised. If the generated report shows `enigma_relevance` ahead of `keyword_filter`, describe the improvement as a local deterministic retrieval/evidence proxy result produced by that report, not as a hard-coded final score or any provider/model/competitor claim.

When preserving or publishing official-dataset benchmark artifacts, keep the benchmark report and dataset manifest together. The report path is chosen with `--out`; the dataset hash/size capture is the manifest path passed to `--manifest`, usually `.enigma/benchmarks/dataset-manifest.json`.

Public sharing should include the generated benchmark report JSON and generated dataset manifest JSON, not raw dataset files or raw conversations. Before publishing generated JSON, verify:

1. The report schema is `enigma.standard_memory_benchmark_suite.v1`.
2. The report does not contain raw conversation text, raw questions, raw answers, secrets, provider transcripts, account ids, or local absolute paths.
3. The companion manifest schema is `enigma.standard_benchmark_dataset_manifest.v1`.
4. The manifest includes source URLs, byte sizes, SHA-256 hashes, license/usage boundaries, and local file names for the exact dataset files used.
5. Any public claim says "retrieval/evidence coverage proxy", quotes scores only from the generated report for the exact dataset hash/top-k/sample bounds, and avoids provider/model/competitor implications unless a separate reviewed provider answer-accuracy run exists.

## Proof-network benchmark attestations

For the planned 0.1.17 proof-network layer, benchmark results should be represented as a public-safe local attestation rather than by publishing raw benchmark inputs. The attestation JSON uses `schema: "enigma.proof_network.benchmark_attestation.v1"` and may be bundled in `enigma.proof_network.packet.v1` for review. The benchmark proof-release flow is local planning only: it does not call APIs, submit transactions, or claim hosted SaaS behavior, and generated artifacts must keep `transaction_submitted: false` and `raw_memory_on_chain: false`.

Hash the generated benchmark report and companion dataset manifest, then attest only the report hash, schema name, dataset refs, runner refs, package refs, score commitments, record counts, top-k/sample bounds, and timestamps needed for review. The public artifacts must not contain raw dataset rows, raw conversations, prompts, private questions, private answers, provider responses, embeddings, credentials, tenant names, account ids, local absolute paths, unpublished benchmark scores, or the raw benchmark report body.

Use a `sha256:<hex>` commitment for the report and manifest. The proof-release script derives the report commitment from `--report` and writes that hash to the attestation, proof packet, and release manifest; it does not copy the report JSON body or report path into proof artifacts. Hash the final public-safe benchmark report that will be shared, not any raw source dataset or private run directory.

After running one of the benchmark commands above and confirming the report is public-safe, create a local proof release:

```sh
npm run benchmark:proof-release -- --report .enigma/standard-memory-benchmark-sample.json --dataset-ref "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" --runner-ref "runner:run-standard-memory-benchmarks.mjs@reviewed-revision" --package-ref "enigma-memory@0.1.17" --score "retrieval_evidence_proxy=<value-copied-from-report>" --out-dir .enigma/benchmark-proof-release
```

The command writes `benchmark-attestation.json`, `benchmark-proof-packet.json`, and `benchmark-proof-release.json` in the output directory. The release manifest uses `schema: "enigma.benchmark_proof_release.v1"` and records explicit boundaries: local benchmark attestation only, local report file hashing only, no network calls, no provider APIs, no API spend, no provider answer-accuracy claim, no competitor performance claim, no Solana submission claim, no hosted SaaS claim, and no ROI/profit/provider-savings claim.

When a report file is supplied, the generated attestation is a reproducibility receipt for a specific local report hash and explicitly supplied aggregate score commitments. The proof builder now requires a compatible benchmark schema plus explicit offline `benchmark_boundaries`, and rejects scored external adapter rows. It is not evidence of provider answer accuracy, Mem0 or competitor performance, Solana settlement, ROI, hosted-cloud readiness, provider deletion, model forgetting, or live model behavior.

## Local baseline rows in the report

The report now includes `metrics.local_baseline_comparisons`, which compares deterministic local baselines over the same private fixture questions. These rows are local package evidence only: they do not call hosted providers, use provider APIs, or support invoice savings, ROI, compliance, model-forgetting, or benchmark-leadership claims.

| Row | Local boundary |
| --- | --- |
| `full_context` | Supplies every active fixture memory without optimization or deduplication. |
| `recency_last_n` | Supplies the three most recently updated active fixture memories. |
| `keyword_filter` | Supplies active fixture memories whose content or tags match deterministic query terms. |
| `enigma_context_pack` | Uses the Enigma passport context-pack compiler with deterministic local relevance filtering before optimizer tiering and deduplication. |

The report also includes `public_claims_allowed`; keep public copy within those local-fixture boundaries unless separate reviewed external evidence exists.

## How to cite external benchmark standards

Use these standards as dataset sources, citations, and task-category references, not as claimed Enigma leaderboard-equivalent results unless the exact external benchmark, scoring setup, and source-data hashes have been run and reviewed:

- LoCoMo: https://snap-research.github.io/locomo/ and `https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json` — cite for long-term conversational-memory QA, event summarization, and multimodal generation over long conversations. The LoCoMo dataset license is CC BY-NC 4.0.
- LongMemEval: https://arxiv.org/abs/2410.10813 and cleaned HuggingFace JSON files `https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json`, `https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json`, and `https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_m_cleaned.json` — cite for information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention.

The local report mirrors some task categories from those benchmarks but does not download or score official records. The standard runner consumes official local dataset files and scores retrieval/evidence coverage; it does not run the original papers' full LLM evaluation pipelines or claim leaderboard-equivalent answer accuracy.

## Full-answer benchmark protocol plan (--protocol-plan)

The scored standard runner is retrieval/evidence proxy only. A true apples-to-apples full-answer run (same category set, same top-k, same frozen answerer and judge, same prompts, same competitor adapters) is a separate, credentialed benchmark that this package does not execute. `--protocol-plan` is the readiness layer between the two: it emits a public-safe plan of that future protocol without reading datasets, calling providers, generating answers, judging answers, or running competitor adapters.

```sh
cd enigma
node scripts/run-standard-memory-benchmarks.mjs --locomo .enigma/benchmarks/datasets/locomo10.json --longmemeval .enigma/benchmarks/datasets/longmemeval_s_cleaned.json --max-locomo-qa 25 --max-longmemeval-items 25 --top-k 5 --protocol-plan --out .enigma/standard-memory-benchmark-protocol-plan.json
```

Optionally pin the public-safe model/prompt/protocol refs so the plan records exactly which artifacts a future live run must freeze (defaults mark every ref `not-selected`/`not-pinned`):

```sh
node scripts/run-standard-memory-benchmarks.mjs --locomo .enigma/benchmarks/datasets/locomo10.json --top-k 5 --protocol-plan \
  --answerer-ref "model:answerer@frozen-revision" \
  --judge-ref "model:judge@frozen-revision" \
  --answer-prompt-ref "prompt:standard-answer@frozen-revision" \
  --judge-prompt-ref "prompt:standard-judge@frozen-revision" \
  --protocol-ref "protocol:apples-to-apples-full-answer@frozen-revision" \
  --out .enigma/standard-memory-benchmark-protocol-plan.json
```

The emitted schema is `enigma.standard_memory_benchmark_protocol_plan.v1`. It records the planned category set (the same LoCoMo/LongMemEval task categories the scored report uses), `--top-k`, the answerer model ref and judge model ref, the prompt refs and protocol ref, the requirements-only competitor adapter refs, and cost-estimate inputs (sample limits, token caps, temperature, retries, timeout, and a `budget_cap_set:false` flag). It does not contain raw questions, raw answers, prompts, provider responses, embeddings, credentials, dataset bytes, or scores.

The plan carries explicit boundaries that must read `false`:

| Boundary | Meaning |
| --- | --- |
| `protocol_boundaries.network_required` | No network is used to produce the plan. |
| `protocol_boundaries.provider_calls_made` | No provider APIs are called. |
| `protocol_boundaries.answers_generated` | No model answers are generated. |
| `protocol_boundaries.judged` | No answers are judged or graded. |
| `protocol_boundaries.competitor_adapters_run` | No Mem0 or other competitor adapters are run. |
| `benchmark_boundaries.llm_answer_accuracy_scored` | The plan is not a score. |
| `benchmark_boundaries.retrieval_evidence_proxy_scored` | The plan does not even score the retrieval proxy. |

The protocol plan can be turned into a local proof release with the same command used for a scored report, because the proof-release builder accepts either a local retrieval proxy report or a protocol-plan report:

```sh
npm run benchmark:proof-release -- --report .enigma/standard-memory-benchmark-protocol-plan.json --dataset-ref "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" --runner-ref "runner:run-standard-memory-benchmarks.mjs@protocol-plan" --package-ref "enigma-memory@0.1.17" --out-dir .enigma/benchmark-protocol-proof-release
```

The resulting attestation uses the existing `enigma.proof_network.benchmark_attestation.v1` schema and binds the protocol-plan report hash plus `report_hash_only` metric roots; it does not copy the report body. A protocol-plan proof release is evidence of protocol readiness only. It is not evidence that answers were generated, that answers were judged, that any provider or competitor was called or outperformed, or that benchmark leadership, ROI, provider deletion, model forgetting, or compliance was achieved. Competitor adapter refs are references, not scores; a reference is never a superiority claim.

### What the protocol plan proves and does not prove

**Proves:** the exact category set, top-k, planned answerer/judge model refs, prompt/protocol refs, competitor adapter refs, and cost-estimate inputs that a future full-answer run would freeze, plus the explicit no-network/no-provider/no-answers/no-judgement boundary.

**Does not prove:** that any model answered correctly, that any model was judged, that any provider or competitor ran, that prompts are final, that a budget cap was set, or that the planned run would favor Enigma. Pinned refs mark which artifacts a future run must freeze; they are not a claim that the run happened or succeeded.

## Future provider answer-accuracy runs

A real answer-accuracy run is a different benchmark from the current standard runner. It would need all of the following before any answer-correctness or model-quality claim is published:

1. Provider API keys supplied at run time through reviewed environment names only, with secret values never printed, persisted, or copied into reports.
2. Frozen model ids for generator and, if used, evaluator models. Model aliases are not enough for reproducibility.
3. Budget caps before execution: maximum records, maximum generated tokens, maximum retries, timeout policy, and maximum provider spend.
4. Frozen prompts for memory ingestion, retrieval, answer generation, abstention, evaluator grading, and any tool-use instructions.
5. A fixed evaluator choice: exact-match/structured checks where the dataset supports them, human review where required, or a separately versioned LLM-as-judge prompt/model with known limitations.
6. Dataset manifest hashes, split names, record counts, source licenses, and any excluded-record policy.
7. Raw provider inputs/outputs retained only in private reviewed storage when license and policy permit; public reports should expose safe aggregates and hashes, not raw conversations.

The current standard runner is intentionally retrieval/evidence proxy only because it can run without provider keys, prompt variance, evaluator-model drift, provider billing risk, or provider transcript handling. It can say whether the local retrieval/evidence path surfaced expected supporting material, including whether deterministic Enigma relevance outperformed the simpler keyword row in the generated report. It cannot say whether an LLM would answer correctly, abstain correctly, forget something, comply with a deletion request, or outperform a provider/native memory product.

## Why live third-party comparisons are not claimed yet

The current benchmarks do not call external provider APIs, external SDKs, hosted memory services, ChatGPT native memory, Claude memory tooling, or third-party agent loops. Cross-provider rows in the local report are profile labels that reuse the same Enigma context-pack boundary; they do not call or compare live provider models and are not live provider rankings. The official-dataset standard report is likewise local retrieval/evidence scoring only.

Real comparisons require fixed adapters, fixed datasets, fixed agent/tool loops, explicit provider terms review, reviewed handling of secrets and raw benchmark data, and a no-score-without-run rule. Memory quality can change with the surrounding agent framework and tool loop, so a fair comparison must document more than the memory store. Until those inputs exist and the adapter is actually run in the same harness, external competitor rows stay requirements-only and must not carry recall, abstention, token, latency, answer-accuracy, cost, or ranking scores.

The current reports must not be used as evidence of provider-side deletion, model forgetting, compliance certification, token ROI, provider invoice savings, benchmark leadership, hosted-cloud readiness, or “best in world” superiority.

## Competitor comparison plan and no-score-without-run rule

Use placeholder environment names only. Do not commit real tokens, API keys, account ids, provider transcripts, raw benchmark conversations, raw provider answers, or private memory.

The report field `external_competitor_adapters` is a requirements matrix, not a score table. External rows are expected to remain requirements-only until credentials, runtimes, datasets, fixed prompts, fixed model ids, budget caps, reset policies, and scoring code are supplied and reviewed. A competitor row must have `can_run_in_this_harness: false`, `scores_included: false`, and no recall, abstention, token, latency, answer-accuracy, cost, or ranking score unless that exact adapter was run over the same dataset manifest in the same harness.

| Target | Runtime or SDK needed | Placeholder secrets and local inputs | Dataset requirement | Adapter boundary before results can be claimed |
| --- | --- | --- | --- | --- |
| Letta/MemGPT | Letta SDK/runtime and MemGPT-style memory agent configuration; documented SDK packages include `@letta-ai/letta-client` and `letta-client`; API-key-backed service access may be required. | `LETTA_API_KEY`, `LETTA_BASE_URL`, `LETTA_PROJECT_ID`, `BENCHMARK_DATASET_PATH` | Local reviewed LoCoMo/LongMemEval split or another reviewed local dataset file with license, version, split, and checksum metadata. | Build a Letta adapter that fixes the agent loop, memory write/read policy, model settings, and scoring path. Results may describe that configured Letta/MemGPT run only, not generic provider deletion or model forgetting. |
| LangGraph | LangGraph runtime with short-term checkpointer memory and long-term namespaced store. | `LANGGRAPH_CHECKPOINTER_URI`, `LANGGRAPH_STORE_URI`, `BENCHMARK_DATASET_PATH` | Same local dataset file and split used for Enigma and every competitor. | Fix graph topology, checkpoint scope, namespace policy, retrieval policy, model/tool loop, and scorer. Do not attribute graph/tool behavior solely to the memory store. |
| Zep | Zep service/runtime positioned around temporal Context Graph and Context Lake retrieval. | `ZEP_API_KEY`, `ZEP_PROJECT_ID`, `ZEP_BASE_URL`, `BENCHMARK_DATASET_PATH` | Same local dataset file and split; include source checksum and whether any provider-side graph state is reused or reset. | Build a Zep adapter that records ingest, session, retrieval, reset, and scoring policy. Zep’s sub-200ms retrieval positioning is a vendor/source fact, not an Enigma-measured claim until measured in the same harness. |
| Mem0 | Mem0 platform or open-source stack; positioned as a universal self-improving memory layer. | `MEM0_API_KEY`, `MEM0_BASE_URL`, `MEM0_PROJECT_ID`, `BENCHMARK_DATASET_PATH` | Same local dataset file and split; record Mem0 deployment flavor/version. | Build a Mem0 adapter with fixed extraction, update, retrieval, reset, and scorer behavior. Self-improving or platform behavior must be bounded to the configured run. |
| OpenAI native memory (ChatGPT memory) | ChatGPT consumer-app/native memory environment. It is not directly available through a public API in this harness. | No usable harness secret; `OPENAI_API_KEY` alone is not sufficient to exercise ChatGPT native memory. | No fair automated dataset run until an approved interface can load/reset/query native memory reproducibly. | Do not claim live native ChatGPT memory comparison from this repository. A future adapter would need an approved public interface, reproducible memory reset/load semantics, and provider-policy review. |
| Claude memory tool | Client-side/provider-specific memory tool environment. | `CLAUDE_MEMORY_TOOL_CONFIG`, `ANTHROPIC_API_KEY`, `BENCHMARK_DATASET_PATH` | Same local dataset file and split, plus reviewed tool-state reset/export rules. | Build an adapter around the exact client/tool environment, not generic Claude model behavior. Results can only cover that configured memory-tool setup. |

## Source references for adapter planning

- Letta MemGPT concepts: https://docs.letta.com/concepts/memgpt/
- Zep documentation: https://help.getzep.com/
- Mem0 documentation: https://docs.mem0.ai/
- LangGraph memory documentation: https://docs.langchain.com/oss/python/langgraph/memory
- OpenAI ChatGPT memory FAQ: https://help.openai.com/en/articles/8590148-memory-faq
- Claude memory tool support article: https://support.anthropic.com/en/articles/11145838-using-claude-memory

## Minimum evidence for a future live comparison

Before publishing external comparison language, capture all of the following in the benchmark report or an adjacent reviewed evidence file:

1. Package version, benchmark schema, command, timestamp, OS/runtime, and adapter version.
2. Dataset name, source URL, license review status, local file checksum, split, record count, and manifest schema/hash.
3. Secret names used as placeholders, with confirmation that no secret values are printed or persisted.
4. Adapter configuration: SDK/runtime version, model ids where applicable, memory write/read policy, reset policy, context limits, retry policy, budget caps, frozen prompts, and scoring code.
5. Evaluator choice and version: exact deterministic scorer, human rubric/version, or LLM-as-judge model id and frozen prompt.
6. Per-target raw scoring inputs retained privately when license permits, with public reports limited to safe aggregates and hashes.
7. Explicit boundaries separating memory-store behavior, agent-loop behavior, model behavior, provider-hosted state, and Enigma receipt verification.

Until that evidence exists, use only the supported benchmark claims: Enigma can reproduce deterministic local memory-fixture operations with `enigma.memory_benchmark_suite.v1`, and Enigma can run official-dataset retrieval/evidence proxy scoring with `enigma.standard_memory_benchmark_suite.v1` when the local dataset files and manifest are supplied.