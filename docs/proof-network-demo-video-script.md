# Proof Network demo video script

90-second product demo script for Enigma's privacy-preserving Proof Network. Use a local checkout or installed package only. Do not show provider dashboards, hosted Enigma dashboards, Solana explorers, API keys, seed phrases, tenant names, raw memory, prompts, transcripts, completions, embeddings, ACL bodies, or private benchmark outputs.

## Claim boundary for the editor

- The demo is local-first and public-safe.
- The chain segment creates a Solana-ready anchor artifact; it does not submit a transaction.
- The verifier checks proof-network JSON artifacts offline; it does not prove provider deletion, model forgetting, hosted availability, compliance certification, customer deployment status, or investment/ROI outcomes.
- Every visible artifact should show hashes, roots, refs, counts, scopes, signatures, and booleans such as `transaction_submitted:false` and `raw_memory_on_chain:false`.

## Approved narration guardrails

Say `Solana-ready anchor artifact`, `local verifier`, `offline verification`, `public-safe roots`, and `provider-native memory is cache only`.

Do not say `on Solana`, `submitted to chain`, `hosted service is live`, `deployed cloud`, `provider memory deleted`, `model forgot`, `certified compliant`, `customer production ready`, or `guaranteed benchmark winner`.

If a take accidentally implies a live transaction or hosted operation, cut it rather than qualifying it later.

## Screen setup

Use a clean terminal with large text and a scratch directory such as `.enigma/demo-video`. Keep JSON output folded or highlighted so only public-safe fields are visible. If a command emits local absolute paths, crop to the command and the relevant schema/boolean/hash fields.

## 90-second timeline

| Time | Shot | Exact on-screen action | Safe narration | Must show |
| --- | --- | --- | --- | --- |
| 0:00-0:06 | Cold open: title card over terminal prompt | Title: `Enigma Proof Network for AI Memory` Subtitle: `Local proofs. Public roots. No raw memory on-chain.` | "Enigma turns AI memory activity into public-safe proof artifacts: roots, refs, scopes, and signatures instead of private content." | `No raw memory on-chain` |
| 0:06-0:16 | Install shot | Type: `npm install -g enigma-memory` then cut to `enigma --help` with command list visible. | "Start with the package. The local CLI is enough for this demo; no provider key, hosted account, cloud credential, or wallet is required." | Avoid npm publish/deploy language. |
| 0:16-0:27 | Test-drive shot | Type: `enigma test-drive --overwrite --out-dir .enigma/demo-video/test-drive` | "The test drive writes an isolated local demo and prints a public-safe summary. It proves Enigma-controlled vault state and receipts, not provider-side deletion or hosted infrastructure." | Summary fields: `schema`, `ok:true`, local report refs, no raw memory text. |
| 0:27-0:39 | Cross-model connector story | Type: `enigma demo cross-model --bundle .enigma/demo-video/test-drive/bundle.json --out .enigma/demo-video/cross-model-report.json` then show report snippets for `chatgpt`, `claude`, `kimi`, `cursor`, `local-llm`. | "The same memory passport can prepare context for different clients. Provider-native memory stays cache-only; Enigma's local vault remains the canonical source." | `provider_native_memory_canonical:false`, context-pack refs, receipt counts. |
| 0:39-0:53 | Chain anchor artifact | Type: `enigma chain anchor --root sha256:8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c --ref demo:test-drive-root --ref demo:cross-model-report --out .enigma/demo-video/anchor-batch.json` | "For settlement, Enigma creates an opaque anchor batch that is Solana-ready but not submitted. A future transaction payload would carry public roots and refs, never memory bodies." | `schema:"enigma.proof_network.anchor_batch.v1"`, `transaction_submitted:false`, `raw_memory_on_chain:false`, `roots`, `refs`. |
| 0:53-1:06 | Benchmark attestation | Type: `enigma chain attest --report-hash sha256:4b194b194b194b194b194b194b194b194b194b194b194b194b194b194b194b194b19 --dataset-ref public:memory-bench-fixture --runner-ref npm:enigma-memory@0.1.12 --package-ref npm:enigma-memory@0.1.12 --out .enigma/demo-video/benchmark-attestation.json` | "Benchmarks become attestations over report hashes and public dataset, runner, and package refs. The attestation does not publish prompts, responses, embeddings, or private reports." | `schema:"enigma.proof_network.benchmark_attestation.v1"`, report hash, dataset/runner/package refs. |
| 1:06-1:19 | Offline proof verifier | Type: `enigma chain verify --file .enigma/demo-video/anchor-batch.json` then `enigma chain verify --file .enigma/demo-video/benchmark-attestation.json` | "Anyone can verify supported Proof Network artifacts locally. Verification checks schema, privacy boundaries, signatures, roots, and declared claim limits." | `valid:true`, supported schema names, no network call indicator if present. |
| 1:19-1:28 | Packet recap | Open `.enigma/demo-video/proof-packet.json`, then type `enigma chain verify --file .enigma/demo-video/proof-packet.json`. | "A proof packet can bundle the anchor, grant or revocation, benchmark attestation, and verifier result into one reviewable handoff." | `schema:"enigma.proof_network.packet.v1"`, counts/refs only. |
| 1:28-1:30 | End card | Title: `Proofs for memory custody, not claims about provider internals.` CTA: `Install. Test-drive. Verify locally.` | "Proofs for memory custody, not claims about provider internals." | No hosted, deployed-cloud, wallet, explorer, or live-chain logos. |

## Optional capability grant insert

If the cut needs to show access control, replace two seconds of the packet recap with this terminal shot:

```sh
enigma chain grant \
  --subject-ref did:key:zDemoReviewer \
  --scope memory.read:proof-summary \
  --expires-at 2026-07-25T00:00:00.000Z \
  --out .enigma/demo-video/capability-grant.json
```

Narration: "Capability grants are scoped references, not ACL bodies. A reviewer can receive permission to inspect proof summaries without exposing private memory."

Must show `schema:"enigma.proof_network.capability_grant.v1"`, `scope`, `subject_ref`, and no tenant names or policy bodies.

## Optional revocation insert

If the cut needs the revoke path, replace the capability grant insert with:

```sh
enigma chain revoke \
  --grant-ref sha256:0d7a0d7a0d7a0d7a0d7a0d7a0d7a0d7a0d7a0d7a0d7a0d7a0d7a0d7a0d7a0d7a \
  --reason-ref public:demo-revocation \
  --out .enigma/demo-video/capability-revocation.json
```

Narration: "Revocation uses a public nullifier-style artifact. It can invalidate a grant without publishing private policy text."

Must show `schema:"enigma.proof_network.capability_revocation.v1"`, a grant hash/ref, and a nullifier/ref field if present.

## Safe JSON snippets for overlays

Use these snippets as overlays when command output is too verbose. They are intentionally synthetic and public-safe:

```json
{
  "schema": "enigma.proof_network.anchor_batch.v1",
  "transaction_submitted": false,
  "raw_memory_on_chain": false,
  "roots": ["sha256:8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c8f2c"],
  "refs": ["demo:test-drive-root", "demo:cross-model-report"]
}
```

```json
{
  "schema": "enigma.proof_network.benchmark_attestation.v1",
  "report_hash": "sha256:4b194b194b194b194b194b194b194b194b194b194b194b194b194b194b194b194b19",
  "dataset_ref": "public:memory-bench-fixture",
  "runner_ref": "npm:enigma-memory@0.1.12",
  "raw_prompts_included": false,
  "provider_responses_included": false
}
```

```json
{
  "schema": "enigma.proof_network.verification_report.v1",
  "valid": true,
  "network_required": false,
  "checked_private_payload": true
}
```

## Editor notes

- Keep the whole video at or under 90 seconds; use jump cuts between terminal commands.
- Prefer tight crops on command, schema, `valid:true`, `transaction_submitted:false`, and `raw_memory_on_chain:false`.
- Use synthetic hashes and refs in overlays if a real local command prints paths or environment-specific values.
- Do not add a Solana explorer shot. This script shows a local Solana-ready artifact only, not a submitted transaction.
- Do not show hosted dashboards, Cloudflare, deployment commands, wallet creation, seed phrases, private keys, API keys, or provider response text.
