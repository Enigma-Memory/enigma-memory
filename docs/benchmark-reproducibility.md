# Benchmark reproducibility

This guide explains how to reproduce the current local Enigma memory benchmark, save the public-safe JSON report, cite the external benchmark standards it is modeled after, and understand what is still required before publishing live third-party comparisons.

## What is reproducible today

The current package is `enigma-memory@0.1.4`. The local benchmark is available through the package script and the script file it wraps:

```sh
cd enigma
npm run benchmark:memory-suite
npm run benchmark:memory-suite -- --out benchmark-report.json
node scripts/run-memory-benchmarks.mjs --out benchmark-report.json
```

The `--out` form writes the report to the requested path and prints only a small status object. Without `--out`, the command writes the full JSON report to stdout.

The report schema is `enigma.memory_benchmark_suite.v1`. It is designed to be public-safe: it contains aggregate metrics, commitments, citations, cross-provider profile labels, and claim boundaries. It does not include raw fixture memory, private question text, private answer text, provider transcripts, credentials, account ids, or local absolute paths.

## Reproduce and save JSON

1. Use a clean checkout containing `enigma-memory@0.1.4`.
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

Use these standards as citations and task-category references, not as claimed Enigma results unless the exact external benchmark has been run and reviewed:

- LoCoMo: https://snap-research.github.io/locomo/ — cite for long-term conversational-memory QA, event summarization, and multimodal generation over long conversations.
- LongMemEval: https://arxiv.org/abs/2410.10813 — cite for information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention.

The current local report mirrors some task categories from those benchmarks, but it does not download LoCoMo or LongMemEval data, run their official evaluation pipelines, or claim leaderboard-equivalent results.

## Why live third-party comparisons are not claimed yet

The current benchmark does not call external provider APIs, external SDKs, hosted memory services, ChatGPT native memory, Claude memory tooling, or third-party agent loops. Cross-provider rows in the report are profile labels that reuse the same Enigma context-pack boundary; they do not call or compare live provider models and are not live provider rankings.

Real comparisons require fixed adapters, fixed datasets, fixed agent/tool loops, explicit provider terms review, and reviewed handling of secrets and raw benchmark data. Memory quality can change with the surrounding agent framework and tool loop, so a fair comparison must document more than the memory store. Until those inputs exist, external competitor rows stay requirements-only and must not carry recall, abstention, token, latency, or ranking scores.

The current report must not be used as evidence of provider-side deletion, model forgetting, compliance certification, token ROI, provider invoice savings, benchmark leadership, hosted-cloud readiness, or “best in world” superiority.

## External comparison requirements

Use placeholder environment names only. Do not commit real tokens, API keys, account ids, provider transcripts, raw benchmark conversations, or private memory.

The report field `external_competitor_adapters` is a requirements matrix, not a score table. External rows are expected to remain requirements-only until credentials, runtimes, and datasets are supplied and reviewed: `can_run_in_this_harness: false`, `scores_included: false`, and no recall, abstention, token, latency, or ranking scores.

| Target | Runtime or SDK needed | Placeholder secrets and local inputs | Dataset requirement | Adapter boundary before results can be claimed |
| --- | --- | --- | --- | --- |
| Letta | Letta SDK/runtime; documented SDK packages include `@letta-ai/letta-client` and `letta-client`; API-key-backed service access may be required. | `LETTA_API_KEY`, `LETTA_BASE_URL`, `LETTA_PROJECT_ID`, `BENCHMARK_DATASET_PATH` | Local reviewed LoCoMo/LongMemEval split or another reviewed local dataset file with license, version, split, and checksum metadata. | Build a Letta adapter that fixes the agent loop, memory write/read policy, model settings, and scoring path. Results may describe that configured Letta run only, not generic provider deletion or model forgetting. |
| LangGraph memory | LangGraph runtime with short-term checkpointer memory and long-term namespaced store. | `LANGGRAPH_CHECKPOINTER_URI`, `LANGGRAPH_STORE_URI`, `BENCHMARK_DATASET_PATH` | Same local dataset file and split used for Enigma and every competitor. | Fix graph topology, checkpoint scope, namespace policy, retrieval policy, model/tool loop, and scorer. Do not attribute graph/tool behavior solely to the memory store. |
| Zep | Zep service/runtime positioned around temporal Context Graph and Context Lake retrieval. | `ZEP_API_KEY`, `ZEP_PROJECT_ID`, `ZEP_BASE_URL`, `BENCHMARK_DATASET_PATH` | Same local dataset file and split; include source checksum and whether any provider-side graph state is reused or reset. | Build a Zep adapter that records ingest, session, retrieval, reset, and scoring policy. Zep’s sub-200ms retrieval positioning is a vendor/source fact, not an Enigma-measured claim until measured in the same harness. |
| Mem0 | Mem0 platform or open-source stack; positioned as a universal self-improving memory layer. | `MEM0_API_KEY`, `MEM0_BASE_URL`, `MEM0_PROJECT_ID`, `BENCHMARK_DATASET_PATH` | Same local dataset file and split; record Mem0 deployment flavor/version. | Build a Mem0 adapter with fixed extraction, update, retrieval, reset, and scorer behavior. Self-improving or platform behavior must be bounded to the configured run. |
| OpenAI native ChatGPT memory | ChatGPT consumer-app/native memory environment. It is not directly available through a public API in this harness. | No usable harness secret; `OPENAI_API_KEY` alone is not sufficient to exercise ChatGPT native memory. | No fair automated dataset run until an approved interface can load/reset/query native memory reproducibly. | Do not claim live native ChatGPT memory comparison from this repository. A future adapter would need an approved public interface, reproducible memory reset/load semantics, and provider-policy review. |
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
2. Dataset name, source URL, license review status, local file checksum, split, and record count.
3. Secret names used as placeholders, with confirmation that no secret values are printed or persisted.
4. Adapter configuration: SDK/runtime version, model where applicable, memory write/read policy, reset policy, context limits, retry policy, and scoring code.
5. Per-target raw scoring inputs retained privately when license permits, with public reports limited to safe aggregates.
6. Explicit boundaries separating memory-store behavior, agent-loop behavior, model behavior, provider-hosted state, and Enigma receipt verification.

Until that evidence exists, use only the local benchmark claim: Enigma can reproduce deterministic local memory-fixture operations and emit a public-safe `enigma.memory_benchmark_suite.v1` JSON report.