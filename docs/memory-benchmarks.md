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
- context-pack retrieval through the passport package;
- optimizer plan token estimates and duplicate removal;
- bundle and context-pack verification;
- p50/p95 latency with `performance.now`.

Reported metrics include exact-answer recall, abstention correctness, context-token reduction versus a full-context baseline, duplicate candidates removed, operation latency summaries, verification status, and same-boundary cross-provider profile rows.

## Claim limits

The benchmark report is evidence for this local deterministic fixture only. It is not provider deletion proof, model forgetting proof, compliance certification, ROI evidence, provider invoice savings evidence, benchmark leadership proof, hosted cloud readiness, or a substitute for external LoCoMo/LongMemEval evaluation.

Cross-provider rows are profile labels using the same Enigma context-pack boundary. They do not call or rank live provider models.

## Extending with external datasets later

To extend this harness with real external benchmark datasets without weakening claim boundaries:

1. Add an explicit dataset loader that reads a local file supplied by the operator; do not add network downloads to the benchmark command.
2. Preserve source license, version, split, and checksum metadata in the report.
3. Keep raw conversations, private memory, questions, and answers out of public reports unless the dataset license and review process explicitly allow publication.
4. Route every candidate through the same Enigma vault, context-pack, optimizer, export, and verify operations measured here.
5. Add separate agent/model evaluation only when the evaluated agent loop is fixed and documented; do not attribute agent/tool behavior solely to the memory store.
6. Keep release notes bounded to the observed command, dataset, timestamp, and review approval.
