# Memory benchmarks

Enigma includes a local, dependency-free memory benchmark harness for package-readiness evidence:

```sh
cd enigma
node scripts/run-memory-benchmarks.mjs
node scripts/run-memory-benchmarks.mjs --out ./.enigma/memory-benchmark.json
```

The report schema is `enigma.memory_benchmark_suite.v1`. It is public-safe by design: aggregate metrics, commitments, citations, boundaries, and cross-provider profile labels are emitted, but raw fixture memory, question text, and answer text are not included.

## External standards and boundaries

- LoCoMo is the relevant long-term conversational-memory standard for multi-session QA, event summarization, and multimodal generation over long conversations. See https://snap-research.github.io/locomo/.
- LongMemEval is the relevant standard for information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention. See https://arxiv.org/abs/2410.10813.
- Letta's benchmark discussion is a useful boundary reminder: measured memory quality depends on the agent/framework/tool loop as well as memory-store mechanics. See https://www.letta.com/blog/benchmarking-ai-agent-memory/.

This repository harness does not download or run LoCoMo, LongMemEval, provider APIs, or third-party agents. It mirrors their task categories with a deterministic local fixture so Enigma can make narrow package claims about local vault operations, context-pack generation, optimizer token estimates, export/import, verification, deduplication, abstention behavior, and latency.

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

The benchmark report is evidence for this local deterministic fixture only. Reported score improvements mean Enigma selected fewer locally irrelevant context-pack candidates under the same fixture questions; they are not provider deletion proof, model forgetting proof, compliance certification, ROI evidence, provider invoice savings evidence, benchmark leadership proof, hosted cloud readiness, or a substitute for external LoCoMo/LongMemEval evaluation.

Cross-provider rows are profile labels using the same Enigma context-pack boundary. External competitor rows are adapter requirements only; they do not call, score, or rank live provider models.

`public_claims_allowed` is intentionally narrow: deterministic local fixture execution, local recall/abstention metrics, local baseline comparison, local token estimates, duplicate removal where applicable, p50/p95 local latency, Enigma bundle/context-pack verification, and explicit withholding of third-party scores until the required external artifacts exist.

## Extending with external datasets later

To extend this harness with real external benchmark datasets without weakening claim boundaries:

1. Add an explicit dataset loader that reads a local file supplied by the operator; do not add network downloads to the benchmark command.
2. Preserve source license, version, split, and checksum metadata in the report.
3. Keep raw conversations, private memory, questions, and answers out of public reports unless the dataset license and review process explicitly allow publication.
4. Route every candidate through the same Enigma vault, context-pack, optimizer, export, and verify operations measured here.
5. Add separate agent/model evaluation only when the evaluated agent loop is fixed and documented; do not attribute agent/tool behavior solely to the memory store.
6. Keep release notes bounded to the observed command, dataset, timestamp, and review approval.
