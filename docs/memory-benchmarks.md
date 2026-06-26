# Memory benchmarks

Enigma includes a local, dependency-free memory benchmark harness for package-readiness evidence:

```sh
cd enigma
node scripts/run-memory-benchmarks.mjs
node scripts/run-memory-benchmarks.mjs --out ./.enigma/memory-benchmark.json
```

For official-dataset retrieval/evidence proxy scoring over operator-downloaded files:

```sh
cd enigma
node scripts/run-standard-memory-benchmarks.mjs --locomo ./data/locomo10.json --longmemeval ./data/longmemeval_s_cleaned.json --max-locomo-qa 100 --max-longmemeval-items 100 --top-k 5 --dry-run
node scripts/run-standard-memory-benchmarks.mjs --locomo ./data/locomo10.json --out ./.enigma/locomo-standard-memory-benchmark.json
node scripts/run-standard-memory-benchmarks.mjs --longmemeval ./data/longmemeval_s_cleaned.json --top-k 5 --out ./.enigma/longmemeval-standard-memory-benchmark.json
node scripts/run-standard-memory-benchmarks.mjs --locomo ./data/locomo10.json --longmemeval ./data/longmemeval_s_cleaned.json --max-locomo-qa 100 --max-longmemeval-items 100 --out ./.enigma/standard-memory-benchmark.json
```

The standard dry-run schema is `enigma.standard_memory_benchmark_plan.v1`. It prints planned local file names, sample bounds, local deterministic method rows, a requirements-only Mem0 adapter row, apples-to-apples controls, and explicit no-network/no-provider/no-Mem0/no-score boundaries without reading dataset files. The scored standard report schema is `enigma.standard_memory_benchmark_suite.v1`. It reads local official dataset JSON files only, scores deterministic retrieval/evidence coverage proxies, includes Mem0 as requirements-only with `scores_included:false`, and still excludes raw question, answer, and conversation text from reports.

The report schema is `enigma.memory_benchmark_suite.v1`. It is public-safe by design: aggregate metrics, commitments, citations, boundaries, and cross-provider profile labels are emitted, but raw fixture memory, question text, and answer text are not included.

## External standards and boundaries

- LoCoMo is the relevant long-term conversational-memory standard for multi-session QA, event summarization, and multimodal generation over long conversations. See https://snap-research.github.io/locomo/.
- LongMemEval is the relevant standard for information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention. See https://arxiv.org/abs/2410.10813.
- Official local inputs for the standard runner are LoCoMo `locomo10.json` from `https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json` and LongMemEval cleaned files `longmemeval_oracle.json`, `longmemeval_s_cleaned.json`, or `longmemeval_m_cleaned.json` from the upstream Hugging Face dataset repository.
- Letta's benchmark discussion is a useful boundary reminder: measured memory quality depends on the agent/framework/tool loop as well as memory-store mechanics. See https://www.letta.com/blog/benchmarking-ai-agent-memory/.

The fixture harness does not download or run LoCoMo, LongMemEval, provider APIs, or third-party agents. The standard harness (`run-standard-memory-benchmarks.mjs`) can score operator-supplied local LoCoMo and LongMemEval JSON files without credentials, provider APIs, or third-party SDKs.

## What the harness measures

The fixture creates multiple sessions with facts, a knowledge update, temporal questions, an abstention question, duplicate memory candidates, and provider profile labels for `chatgpt`, `claude`, `kimi`, `cursor`, and `local-llm`.

The harness measures local Enigma operations only:

- vault remember/update operations;
- vault export and import;
- context-pack retrieval through the passport package, including deterministic local relevance filtering before optimizer tiering;
- optimizer plan token estimates, tiering, and duplicate removal;
- bundle and context-pack verification;
- local baseline comparisons over the same deterministic fixture questions;
- p50/p95 latency with `performance.now`.

Reported metrics include exact-answer recall, abstention correctness, estimated prompt tokens, duplicate candidates removed where applicable, operation latency summaries, verification status, and same-boundary cross-provider profile rows.

Enigma context-pack token improvements are achieved by local selection, not external-provider behavior: the passport compiler narrows active local memories to the deterministic query/purpose/address-relevant set before optimizer tiering and deduplication. This lowers estimated prompt tokens by excluding locally irrelevant fixture memories while preserving the same recall and abstention scoring boundary.

Numeric token and latency values in generated reports are local fixture measurements. They can change with hardware, Node/runtime version, script version, and fixture contents, so copy should cite the command and report artifact rather than treating one run as a universal score.

## Official dataset retrieval/proxy runner

`scripts/run-standard-memory-benchmarks.mjs` is the dependency-free runner for official dataset files already present on disk. It supports `--locomo <path>`, `--longmemeval <path>`, `--max-locomo-qa <n>`, `--max-longmemeval-items <n>`, `--top-k <n>` (default `5`), `--dry-run`, and optional `--out <path>`. Supplying only one dataset path scores only that dataset.

Use `--dry-run` before a scored run when publishing benchmark evidence. The plan proves only command shape and offline boundaries: it does not read or hash the files, prove they exist, produce scores, call provider APIs, run Mem0, run competitor SDKs, generate answers, grade answer accuracy, or spend API budget.

Reports include only the input file name plus the input SHA-256, not the full local path, so operator usernames or workstation directories are not persisted. Scored reports also include `command_boundaries` and `apples_to_apples_controls` so reviewers can see that all local rows used the same parsed records, same `--top-k`, same scoring labels, and no gold labels for retrieval selection.

The runner parses LoCoMo `conversation` session turns as memory records and maps evidence labels such as `D1:3` or `D8:6; D9:17` to dialog IDs. It parses LongMemEval `haystack_sessions` turns as memory records, uses `has_answer: true` turns plus `answer_session_ids` as gold evidence, and treats `_abs` question IDs as abstention cases.

Rows are local methods only: `full_context`, `recency_last_n`, `keyword_filter`, and `enigma_relevance`. `keyword_filter` remains a simple deterministic lexical baseline: it selects records whose public-safe normalized terms overlap the query. `enigma_relevance` is the more production-like local Enigma approximation: it uses deterministic query expansion, term normalization and stemming, task/category and temporal/date hints, role/session metadata, phrase/proximity scoring, and final reranking for evidence diversity. It does not use LLMs, provider APIs, competitor SDKs, hosted services, raw answers, or `has_answer` evidence flags to select records.

| Standard-runner row | Retrieval boundary |
| --- | --- |
| `full_context` | Scores every parsed local memory record for the dataset item without retrieval filtering. |
| `recency_last_n` | Scores the most recent parsed records as a deterministic recency baseline. |
| `keyword_filter` | Scores direct normalized query/content term overlap only, so it remains intentionally easy to audit. |
| `enigma_relevance` | Scores deterministic Enigma-style retrieval signals before `--top-k`: query expansion, stemming, role/session metadata, temporal hints, phrase/proximity matches, and evidence-diversity reranking. |

Because `enigma_relevance` can match normalized variants, session/role cues, temporal wording, nearby phrases, and diverse evidence-bearing turns that a direct keyword overlap can miss, the benchmark report may show it improving over `keyword_filter` on retrieval/evidence proxy metrics. Those results are whatever the generated report records for the operator-supplied files; do not hard-code unreviewed scores or restate them as LLM answer accuracy, provider quality, competitor ranking, or benchmark-leadership evidence.

The standard runner reports retrieval/evidence proxy metrics: LoCoMo evidence-hit@k and exact evidence coverage; LongMemEval turn evidence-hit@k, session evidence-hit@k, exact coverage, and abstention correctness; plus estimated prompt tokens, selected memory counts, and local latency. These are not LLM-generated answer-accuracy scores and must not be described as provider, competitor, or benchmark-leadership results.

## Full-answer benchmark protocol plan

A true apples-to-apples full-answer benchmark (same category set, same `--top-k`, same frozen answerer and judge, same prompts, same competitor adapters) is a separate credentialed run that this package does not execute. `--protocol-plan` is the readiness layer: it emits a public-safe plan of that future protocol with no provider calls, no answer generation, no judging, and no competitor adapters.

```sh
cd enigma
node scripts/run-standard-memory-benchmarks.mjs --locomo .enigma/benchmarks/datasets/locomo10.json --longmemeval .enigma/benchmarks/datasets/longmemeval_s_cleaned.json --top-k 5 --protocol-plan --out .enigma/standard-memory-benchmark-protocol-plan.json
```

The emitted schema is `enigma.standard_memory_benchmark_protocol_plan.v1`. It records the planned category set, `--top-k`, the answerer model ref, the judge model ref, the prompt refs, the protocol ref, requirements-only competitor adapter refs, and cost-estimate inputs. Refs can be pinned with `--answerer-ref`, `--judge-ref`, `--answer-prompt-ref`, `--judge-prompt-ref`, and `--protocol-ref`; unpinned refs read `not-selected`/`not-pinned`.

The plan carries explicit boundaries that must be `false`: `protocol_boundaries.network_required`, `provider_calls_made`, `answers_generated`, `judged`, and `competitor_adapters_run`, plus `benchmark_boundaries.llm_answer_accuracy_scored: false` and `retrieval_evidence_proxy_scored: false`. It contains no raw questions, answers, prompts, provider responses, credentials, or scores.

The protocol plan is accepted by the benchmark proof-release builder alongside a scored retrieval proxy report, producing an `enigma.proof_network.benchmark_attestation.v1` that binds the plan's report hash. A protocol-plan proof release is evidence of protocol readiness only: it is not evidence that answers were generated or judged, that any provider or competitor ran or was outperformed, or that benchmark leadership, ROI, provider deletion, model forgetting, or compliance was achieved. Competitor adapter refs are references, not scores; a reference is never a superiority claim.

## Local baseline comparison

`local_baseline_comparisons` (also mirrored at `metrics.local_baseline_comparisons`) compares Enigma against deterministic local baselines only. Every row scores the same private fixture questions and keeps raw memory, question text, and answer text out of the report.

| Row | Boundary | Reported fields |
| --- | --- | --- |
| `full_context` | Supplies every active fixture memory without optimization or deduplication. | Recall, abstention correctness, estimated prompt tokens, selected memory count, p50/p95 local latency. |
| `recency_last_n` | Supplies the three most recently updated active fixture memories. | Same fields; duplicate removal is marked not applicable. |
| `keyword_filter` | Supplies active fixture memories whose content or tags match deterministic query terms. | Same fields; duplicate removal is marked not applicable. |
| `enigma_context_pack` | Uses the Enigma passport context-pack compiler with deterministic local relevance filtering before optimizer tiering and deduplication. | Same fields plus duplicate-removal counts from the Enigma optimizer plan. |

These rows are local package evidence only. They do not compare hosted providers, do not use provider APIs, and do not support invoice savings, ROI, compliance, model-forgetting, or benchmark-leadership claims.

## External competitor adapter requirements

`external_competitor_adapters` is a requirements matrix, not a score table. Each row has `status: "not_run_requires_credentials_or_runtime"`, `can_run_in_this_harness: false`, `required_artifacts`, `official_doc`, `official_positioning`, an exact `boundary_reason`, and `scores_included: false`.

| Adapter | Official source | Required artifacts before scoring | Boundary reason |
| --- | --- | --- | --- |
| Letta / MemGPT | https://docs.letta.com/concepts/memgpt/ | Letta API key or self-hosted runtime; pinned SDK such as `@letta-ai/letta-client` or `letta-client`; fixed agent/tools/model/memory config; operator-supplied dataset mapping. | This harness has no Letta credentials, SDK installation, runtime, fixed agent loop, or approved external dataset. |
| LangGraph memory | https://docs.langchain.com/oss/python/langgraph/memory | Pinned LangGraph runtime; short-term checkpointer config; namespaced long-term store config; fixed graph/model/tools/dataset mapping. | This Node local package harness does not execute a LangGraph runtime, checkpointer, store, graph, model, or adapter. |
| Zep | https://help.getzep.com/ | Zep credentials or endpoint; pinned client; temporal Context Graph or Context Lake config; ingestion and retrieval mapping. | This harness has no Zep credentials, client package, Context Graph/Context Lake runtime, ingestion job, or retrieval dataset. |
| Mem0 | https://docs.mem0.ai/ | Mem0 platform credentials or open-source runtime; pinned SDK/package versions; extraction/update/retrieval/model/tool config; dataset mapping. | This harness has no Mem0 credentials, runtime, configured memory loop, model/tool environment, or external dataset adapter. |
| OpenAI ChatGPT native memory | https://help.openai.com/en/articles/8590148-memory-faq | ChatGPT account/runtime with native memory enabled; account-safe evaluation protocol; dataset prompts; evidence capture that excludes personal data and credentials. | ChatGPT native memory is a consumer-app feature rather than a public API surface available to this local package harness. |
| Claude memory tool | https://support.anthropic.com/en/articles/11145838-using-claude-memory | Claude/provider runtime with the memory tool available; client-side tool configuration; fixed model/tool-use policy/prompts/dataset mapping; safe evidence capture. | The memory tool is provider/client-side and requires a Claude runtime plus tool environment that this benchmark does not control. |

No external adapter row contains recall, abstention, token, latency, or ranking scores. Third-party rows remain requirements-only until the required credentials, runtimes, fixed agent/tool loops, and reviewed datasets are supplied and reviewed.

The `official_positioning` field records only source-attributed context needed to build a future adapter: Letta/MemGPT runtime and SDK/API-key requirements; LangGraph short-term checkpointer and long-term namespaced store memory; Zep temporal Context Graph/Context Lake positioning and retrieval-latency claim; Mem0 platform/open-source memory stack; OpenAI native consumer-app memory; and Claude provider/client-side memory tooling. None of those facts are scored or verified by this local run.

## Claim limits

The fixture benchmark report is evidence for the local deterministic fixture only. The standard benchmark report is evidence for retrieval/evidence proxy scoring over the operator-supplied LoCoMo or LongMemEval file only. Reported `enigma_relevance` improvements mean the local deterministic retrieval method surfaced evidence more effectively than the simpler keyword row for that run's questions, top-k, parser, and dataset file; they are not provider deletion proof, model forgetting proof, compliance certification, ROI evidence, provider invoice savings evidence, benchmark leadership proof, hosted cloud readiness, or LLM answer-accuracy evidence.

Cross-provider rows are profile labels using the same Enigma context-pack boundary. External competitor rows are adapter requirements only; they do not call, score, or rank live provider models.

`public_claims_allowed` is intentionally narrow: deterministic local fixture execution, local recall/abstention metrics, local baseline comparison, local token estimates, duplicate removal where applicable, p50/p95 local latency, Enigma bundle/context-pack verification, and explicit withholding of third-party scores until the required external artifacts exist.

## Running official datasets safely

To run real LoCoMo or LongMemEval retrieval/proxy scores without weakening claim boundaries:

1. Download the official dataset files separately and pass local paths to `run-standard-memory-benchmarks.mjs`; the benchmark command itself does not fetch network resources.
2. Preserve source URL, license, split/file name, and checksum metadata beside private run artifacts when publishing internally.
3. Keep raw conversations, private memory, questions, and answers out of public reports unless the dataset license and review process explicitly allow publication.
4. Treat standard-runner metrics as retrieval/evidence proxy scores only. Add separate LLM answer-accuracy evaluation only when the evaluated agent/model loop is fixed, documented, and credentialed by the operator.
5. Keep release notes bounded to the observed command, dataset file name, input SHA-256, timestamp, top-k, max-item limits, and review approval.
