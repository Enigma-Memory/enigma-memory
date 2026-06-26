# Proof Network demo scripts

Use these scripts to show Enigma's Proof Network with a local package install. They create and verify public-safe JSON proof artifacts only. They do not submit Solana transactions, call hosted Enigma, call model providers, write client configs, or place raw memory on chain.

Requirements:

- Node.js `>=24`
- `enigma-memory` available through npm or a local package install
- No provider credentials for the three default demos

Run the commands from a writable demo directory after installing the package, for example `npm install -g enigma-memory`. For a one-off public npm run, prefix each `enigma` command with `npx --yes --package enigma-memory`. From a source checkout, replace `enigma` with `node apps/cli/bin/enigma.mjs`.

Public-safety rule: proof artifacts may contain hashes, roots, refs, counts, timestamps, public authority refs, signatures, and boolean claim boundaries. They must not contain raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, private keys, API keys, seed phrases, or provider responses.

## Demo 1 — public npm test-drive + proof anchor plan

Goal: run the public local test drive, then produce a Solana-ready anchor batch that commits only opaque roots and refs. The batch is a transaction plan, not a submitted transaction.

```sh
node -e "require('node:fs').mkdirSync('.enigma/proof-network',{recursive:true})"

enigma test-drive \
  --out-dir .enigma/proof-network/test-drive \
  --overwrite

enigma chain anchor \
  --root sha256:1111111111111111111111111111111111111111111111111111111111111111 \
  --root sha256:2222222222222222222222222222222222222222222222222222222222222222 \
  --root sha256:3333333333333333333333333333333333333333333333333333333333333333 \
  --ref npm-test-drive:bundle-root:v1 \
  --ref npm-test-drive:receipt-root:v1 \
  --ref npm-test-drive:context-root:v1 \
  --authority did:web:enigma.example#local-demo \
  --batch-ref proof-network-demo-anchor-001 \
  --out .enigma/proof-network/anchor-batch.json

enigma chain verify \
  --file .enigma/proof-network/anchor-batch.json
```

Expected public-safe output shape from `chain anchor`:

```json
{
  "ok": true,
  "artifact_type": "enigma.proof_network.anchor_batch.v1",
  "transaction_submitted": false,
  "raw_memory_on_chain": false,
  "batch_ref": "proof-network-demo-anchor-001",
  "roots": [
    "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    "sha256:3333333333333333333333333333333333333333333333333333333333333333"
  ],
  "refs": [
    "npm-test-drive:bundle-root:v1",
    "npm-test-drive:receipt-root:v1",
    "npm-test-drive:context-root:v1"
  ],
  "solana_ready": true,
  "claim_boundaries": {
    "provider_calls": false,
    "hosted_enigma_calls": false,
    "transaction_submitted": false,
    "raw_memory_on_chain": false
  }
}
```

Expected public-safe output shape from `chain verify`:

```json
{
  "ok": true,
  "artifact_type": "enigma.proof_network.anchor_batch.v1",
  "valid": true,
  "transaction_submitted": false,
  "raw_memory_on_chain": false,
  "private_payload_detected": false
}
```

Presenter notes:

1. The test drive proves local Enigma-controlled state only.
2. The anchor batch is Solana-ready because it is an opaque commitment payload, but it is not a transaction and it is not submitted.
3. Replace the demo roots with roots emitted by your own local Enigma run when presenting a real local artifact. Do not paste memory text, prompts, embeddings, provider responses, or tenant/customer names into `--root`, `--ref`, or `--authority`.

## Demo 2 — cross-model memory receipt demo

Goal: show one local Enigma bundle producing public receipt summaries for multiple model/client profiles, then issue a scoped capability grant and revocation for one public subject ref. No model provider is contacted.

```sh
node -e "require('node:fs').mkdirSync('.enigma/proof-network',{recursive:true})"

enigma test-drive \
  --out-dir .enigma/proof-network/cross-model \
  --overwrite

enigma demo cross-model \
  --bundle .enigma/proof-network/cross-model/bundle.json \
  --out .enigma/proof-network/cross-model-report.json

enigma chain grant \
  --subject agent:claude-desktop:local-demo \
  --capability memory.context.read \
  --scope context-pack:cross-model-demo:v1 \
  --expires-at 2026-12-31T00:00:00.000Z \
  --grant-ref proof-network-demo-grant-001 \
  --out .enigma/proof-network/capability-grant.json

enigma chain revoke \
  --grant-hash sha256:4444444444444444444444444444444444444444444444444444444444444444 \
  --reason demo-complete \
  --revocation-ref proof-network-demo-revocation-001 \
  --out .enigma/proof-network/capability-revocation.json

enigma chain verify \
  --file .enigma/proof-network/capability-grant.json

enigma chain verify \
  --file .enigma/proof-network/capability-revocation.json
```

Expected public-safe output shape from `demo cross-model`:

```json
{
  "ok": true,
  "demo": "cross-model-memory",
  "provider_calls": false,
  "raw_memory_included": false,
  "profiles": [
    {
      "client": "claude-desktop",
      "context_pack_hash": "sha256:...",
      "receipt_refs": ["receipt:..."]
    },
    {
      "client": "cursor",
      "context_pack_hash": "sha256:...",
      "receipt_refs": ["receipt:..."]
    },
    {
      "client": "kimi-code",
      "context_pack_hash": "sha256:...",
      "receipt_refs": ["receipt:..."]
    }
  ]
}
```

Expected public-safe output shape from `chain grant`:

```json
{
  "ok": true,
  "artifact_type": "enigma.proof_network.capability_grant.v1",
  "transaction_submitted": false,
  "raw_memory_on_chain": false,
  "subject": "agent:claude-desktop:local-demo",
  "capability": "memory.context.read",
  "scope": "context-pack:cross-model-demo:v1",
  "expires_at": "2026-12-31T00:00:00.000Z",
  "grant_ref": "proof-network-demo-grant-001",
  "private_payload_detected": false
}
```

Expected public-safe output shape from `chain revoke`:

```json
{
  "ok": true,
  "artifact_type": "enigma.proof_network.capability_revocation.v1",
  "transaction_submitted": false,
  "raw_memory_on_chain": false,
  "grant_hash": "sha256:4444444444444444444444444444444444444444444444444444444444444444",
  "reason": "demo-complete",
  "revocation_ref": "proof-network-demo-revocation-001",
  "private_payload_detected": false
}
```

Presenter notes:

1. The cross-model report is a receipt demo, not proof that a provider remembered or forgot anything.
2. Capability grants are public authorization receipts. Scopes must be public refs, not ACL JSON, tenant names, or private policy bodies.
3. Revocations should point to grant hashes or nullifiers. Do not include the original private grant context.

## Demo 3 — benchmark attestation demo

Goal: turn a benchmark report hash or local report file into a public benchmark attestation. This demo uses deterministic refs and scores only; the proof artifact does not include dataset rows, questions, answers, prompts, completions, provider responses, or credentials.

Package-only path with a precomputed public report hash:

```sh
node -e "require('node:fs').mkdirSync('.enigma/proof-network',{recursive:true})"

enigma chain attest \
  --report-hash sha256:5555555555555555555555555555555555555555555555555555555555555555 \
  --dataset-ref enigma-fixture:deterministic-local:v1 \
  --runner-ref enigma-memory:local-benchmark-runner:v1 \
  --package-ref npm:enigma-memory@0.1.15 \
  --score recall_at_5=1 \
  --score p95_latency_ms=14 \
  --out .enigma/proof-network/benchmark-attestation.json

enigma chain verify \
  --file .enigma/proof-network/benchmark-attestation.json
```

Source-checkout path when you have a local benchmark report file:

```sh
node scripts/run-memory-benchmarks.mjs

enigma chain attest \
  --report-file .enigma/benchmarks/report.json \
  --dataset-ref enigma-fixture:deterministic-local:v1 \
  --runner-ref enigma-memory:scripts/run-memory-benchmarks.mjs \
  --package-ref npm:enigma-memory@0.1.15 \
  --score recall_at_5=1 \
  --score p95_latency_ms=14 \
  --out .enigma/proof-network/benchmark-attestation.json
```

Expected public-safe output shape from `chain attest`:

```json
{
  "ok": true,
  "artifact_type": "enigma.proof_network.benchmark_attestation.v1",
  "transaction_submitted": false,
  "raw_memory_on_chain": false,
  "report_hash": "sha256:5555555555555555555555555555555555555555555555555555555555555555",
  "dataset_ref": "enigma-fixture:deterministic-local:v1",
  "runner_ref": "enigma-memory:local-benchmark-runner:v1",
  "package_ref": "npm:enigma-memory@0.1.15",
  "scores": {
    "recall_at_5": 1,
    "p95_latency_ms": 14
  },
  "private_payload_detected": false
}
```

Optional full-answer benchmark note: a separate full-answer benchmark runner may require provider credentials for the model being evaluated. Keep those credentials in local environment variables or a secret manager only. The public proof artifact should still contain only `report_hash`, `dataset_ref`, `runner_ref`, `package_ref`, scores, roots, refs, signatures, and claim boundaries. Never include provider requests, provider responses, prompts, answers, dataset rows, account ids, API keys, tenant names, or raw memory in the attestation.

Presenter notes:

1. A benchmark attestation proves that a named report hash, dataset ref, runner ref, package ref, and score set were committed together.
2. It is not a leaderboard claim unless the named benchmark protocol, dataset access, runner, scoring rules, and comparison set are independently published and reproducible.
3. `chain verify` validates the artifact shape and public-safety boundaries; it does not rerun the benchmark.

## Close the demo

Verify every generated artifact before sharing it:

```sh
enigma chain verify --file .enigma/proof-network/anchor-batch.json
enigma chain verify --file .enigma/proof-network/capability-grant.json
enigma chain verify --file .enigma/proof-network/capability-revocation.json
enigma chain verify --file .enigma/proof-network/benchmark-attestation.json
```

Safe closing claim: Enigma can create local, public-safe proof-network artifacts that are ready for chain anchoring without exposing memory contents or submitting a transaction.

Unsafe claims to avoid:

- "A Solana transaction was submitted" unless you separately submitted one outside these local planning commands.
- "Raw memory is on chain"; that should never be true for these demos.
- "Providers deleted or forgot the memory."
- "Provider-native memory is canonical."
- "Benchmark leadership is proven" unless a reproducible comparison protocol and artifacts are published.
