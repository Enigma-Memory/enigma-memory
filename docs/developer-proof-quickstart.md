# Developer proof quickstart

This quickstart shows how to create, inspect, and verify Enigma Proof Network artifacts from a developer workstation. The product boundary is intentionally narrow: Enigma is the private memory controller for AI, and Solana is an optional proof, permission, and settlement rail that should carry hashes, roots, and opaque refs only.

Use the commands as local proof-artifact exercises. They do not submit Solana transactions, call Solana RPC, call model providers, create hosted Enigma resources, or put raw memory on-chain.

## 0. Public-safety rule

Before running any command, decide what is safe to publish.

Allowed in proof artifacts:

- SHA-256 hashes and Merkle roots;
- opaque refs such as `memory-batch:demo:v1`, `agent:demo-reviewer`, or `dataset:public-fixture:v1`;
- counts, timestamps, local artifact ids, and public authority refs;
- booleans such as `transaction_submitted:false` and `raw_memory_on_chain:false`.

Never place these in a proof artifact, command flag, JSON example, issue comment, gist, explorer memo, or packet:

- raw memory, prompts, transcripts, completions, embeddings, dataset rows, or provider responses;
- tenant names, customer names, private file paths, ACL bodies, policy documents, or internal ticket text;
- API keys, bearer tokens, private keys, seed phrases, mnemonics, passwords, or signed provider payloads.

## 1. Install and run the local test-drive

Start in an empty working directory or a scratch directory inside your project. For a one-off test-drive, `npx --package` downloads and runs the CLI without editing your project dependencies:

```sh
mkdir -p .enigma/proof-quickstart

npx --yes --package enigma-memory enigma test-drive \
  --out-dir .enigma/proof-quickstart/test-drive \
  --overwrite
```

For a project-local install, add the package first and then run the same CLI:

```sh
npm install enigma-memory
npx enigma test-drive \
  --out-dir .enigma/proof-quickstart/test-drive \
  --overwrite
```

The test drive creates local Enigma demo artifacts. Treat full local bundles as private until reviewed. For a proof-network flow, publish only reviewed hashes, roots, refs, and verifier output.

If you are working from a source checkout instead of npm, run the CLI directly from the package checkout:

```sh
cd enigma
node apps/cli/bin/enigma.mjs test-drive \
  --out-dir ../.enigma/proof-quickstart/test-drive \
  --overwrite
```

## 2. Create a Solana-ready anchor batch

An anchor batch commits to memory-related roots without publishing memory. It is a local transaction plan, not a submitted transaction.

```sh
npx --yes --package enigma-memory enigma chain anchor \
  --root sha256:1111111111111111111111111111111111111111111111111111111111111111 \
  --root sha256:2222222222222222222222222222222222222222222222222222222222222222 \
  --root sha256:3333333333333333333333333333333333333333333333333333333333333333 \
  --ref memory-batch:quickstart:v1 \
  --ref receipt-root:quickstart:v1 \
  --ref policy-root:quickstart:v1 \
  --batch-ref anchor:quickstart:001 \
  --out .enigma/proof-quickstart/anchor-batch.json
```

The chain should eventually see only the opaque root or payload reference an operator chooses to submit. The JSON file remains the local artifact of record for developer verification.

Verify it:

```sh
npx --yes --package enigma-memory enigma chain verify \
  --file .enigma/proof-quickstart/anchor-batch.json
```

## 3. Create a scoped capability grant

A grant records that a public subject ref is allowed to use a specific memory capability for a public-safe scope until an expiry time. It is not a live auth mutation by itself.

```sh
npx --yes --package enigma-memory enigma chain grant \
  --subject agent:demo-reviewer \
  --capability memory.receipt_summary.read \
  --scope proof.summary \
  --resource-ref sha256:1111111111111111111111111111111111111111111111111111111111111111 \
  --policy-hash sha256:4444444444444444444444444444444444444444444444444444444444444444 \
  --expires-at 2026-12-31T00:00:00.000Z \
  --grant-ref grant:quickstart:001 \
  --out .enigma/proof-quickstart/capability-grant.json
```

Verify it:

```sh
npx --yes --package enigma-memory enigma chain verify \
  --file .enigma/proof-quickstart/capability-grant.json
```

Good grant inputs are intentionally boring:

- `--subject` is an opaque agent, app, wallet, or reviewer ref;
- `--capability` is a small action name, not a paragraph of policy;
- `--scope` is a public scope token, not raw ACL JSON;
- `--resource-ref` and `--policy-hash` are hashes or public refs, not the underlying resource or policy body;
- `--expires-at` is explicit so grants are not permanent by default.

## 4. Revoke the grant

A revocation records that a prior grant hash is no longer accepted for the relevant scope. It does not prove that a model, provider, cache, export, or third-party system forgot data.

```sh
npx --yes --package enigma-memory enigma chain revoke \
  --grant-hash sha256:5555555555555555555555555555555555555555555555555555555555555555 \
  --reason scope-ended \
  --revocation-ref revocation:quickstart:001 \
  --out .enigma/proof-quickstart/capability-revocation.json
```

Verify it:

```sh
npx --yes --package enigma-memory enigma chain verify \
  --file .enigma/proof-quickstart/capability-revocation.json
```

Use the real `capability_grant_hash` or `grant_hash` from your reviewed grant artifact when leaving demo mode. Do not paste the original private policy, subject name, customer name, or private grant context into the revocation.

## 5. Create a benchmark attestation

A benchmark attestation binds a public report hash to dataset, runner, package, and metric refs. It should not contain raw benchmark rows, questions, answers, prompts, completions, provider responses, or private dataset paths.

With a precomputed report hash:

```sh
npx --yes --package enigma-memory enigma chain attest \
  --report-hash sha256:6666666666666666666666666666666666666666666666666666666666666666 \
  --dataset-ref dataset:quickstart-public-fixture:v1 \
  --runner-ref runner:enigma-local:v1 \
  --package-ref npm:enigma-memory@0.1.13 \
  --score recall_at_5=1 \
  --score p95_latency_ms=14 \
  --out .enigma/proof-quickstart/benchmark-attestation.json
```

With a reviewed local report file:

```sh
npx --yes --package enigma-memory enigma chain attest \
  --report-file .enigma/proof-quickstart/reviewed-benchmark-report.json \
  --dataset-ref dataset:quickstart-public-fixture:v1 \
  --runner-ref runner:enigma-local:v1 \
  --package-ref npm:enigma-memory@0.1.13 \
  --score recall_at_5=1 \
  --score p95_latency_ms=14 \
  --out .enigma/proof-quickstart/benchmark-attestation.json
```

Verify it:

```sh
npx --yes --package enigma-memory enigma chain verify \
  --file .enigma/proof-quickstart/benchmark-attestation.json
```

The safe claim is that the attestation binds a report hash and public refs to a local proof artifact. It is not evidence of comparative benchmark rank, legal/compliance status, provider behavior, model state, or customer production deployment.

## 6. Inspect the JSON before sharing

First, verify every artifact locally:

```sh
for file in .enigma/proof-quickstart/*.json; do
  npx --yes --package enigma-memory enigma chain verify --file "$file"
done
```

Then inspect only public-safe fields. With `jq`:

```sh
jq '{schema, transaction_submitted, raw_memory_on_chain, anchor_batch_hash, capability_grant_hash, capability_revocation_hash, benchmark_attestation_hash}' \
  .enigma/proof-quickstart/anchor-batch.json
```

Without `jq`, use Node:

```sh
node -e "const fs=require('node:fs'); const p=process.argv[1]; const x=JSON.parse(fs.readFileSync(p,'utf8')); const keys=['schema','transaction_submitted','raw_memory_on_chain','anchor_batch_hash','capability_grant_hash','capability_revocation_hash','benchmark_attestation_hash']; console.log(JSON.stringify(Object.fromEntries(keys.filter(k=>k in x).map(k=>[k,x[k]])), null, 2));" \
  .enigma/proof-quickstart/anchor-batch.json
```

Checklist before publishing or sending an artifact:

- `schema` starts with `enigma.proof_network.`;
- `transaction_submitted` is `false` unless a separate operator-controlled submission artifact exists;
- `raw_memory_on_chain` is `false`;
- roots and hashes use `sha256:<64 lowercase hex characters>`;
- refs are opaque and public-safe;
- no field names include private payload concepts such as `prompt`, `text`, `content`, `transcript`, `embedding`, `acl`, `secret`, `api_key`, `private_key`, `tenant_name`, or `customer_name`;
- verifier output returns `ok:true` for the artifact type you intend to share.

A quick secret-name scan can catch obvious mistakes before review:

```sh
node -e "const fs=require('node:fs'); const bad=/(raw|plaintext|prompt|message|text|content|transcript|completion|embedding|acl|provider_response|credential|api_key|secret|password|private_key|seed|mnemonic|tenant_name|customer_name)/i; const allowed=new Set(['raw_memory_on_chain','transaction_submitted']); for (const p of process.argv.slice(1)) { const x=JSON.parse(fs.readFileSync(p,'utf8')); const hits=[]; (function walk(v,path){ if (v && typeof v==='object') for (const [k,c] of Object.entries(v)) { if (!allowed.has(k) && bad.test(k)) hits.push(path?path+'.'+k:k); walk(c,path?path+'.'+k:k); } })(x,''); console.log(JSON.stringify({file:p, suspicious_keys:hits}, null, 2)); }" \
  .enigma/proof-quickstart/*.json
```

This scan is only a convenience. Human review still matters because a safe-looking key can hold unsafe content.

## 7. SDK examples

Use the SDK when your app wants to create proof artifacts in process and then decide separately where to write, review, or publish them. Builders and validators are local functions; they do not submit transactions or call providers.

### Anchor batch

```js
import {
  createProofNetworkAnchorBatch,
  validateProofNetworkAnchorBatch,
} from 'enigma-memory/proof-network';

const anchorBatch = createProofNetworkAnchorBatch({
  anchor_ref: 'anchor:quickstart:001',
  roots: [
    'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    'sha256:2222222222222222222222222222222222222222222222222222222222222222',
  ],
});

const anchorCheck = validateProofNetworkAnchorBatch(anchorBatch);
if (!anchorCheck.ok) throw new Error(anchorCheck.errors.join('; '));
```

### Capability grant and revocation

```js
import {
  createCapabilityGrant,
  validateCapabilityGrant,
  createCapabilityRevocation,
  validateCapabilityRevocation,
} from 'enigma-memory/proof-network';

const grant = createCapabilityGrant({
  grant_ref: 'grant:quickstart:001',
  issuer_ref: 'issuer:quickstart-controller',
  subject_ref: 'agent:demo-reviewer',
  scope: 'proof.summary',
  resource_roots: [
    'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  ],
  expires_at: '2026-12-31T00:00:00.000Z',
});

const grantCheck = validateCapabilityGrant(grant);
if (!grantCheck.ok) throw new Error(grantCheck.errors.join('; '));

const revocation = createCapabilityRevocation({
  grant_hash: grant.capability_grant_hash,
  reason_ref: 'reason:scope-ended',
  revocation_ref: 'revocation:quickstart:001',
});

const revocationCheck = validateCapabilityRevocation(revocation);
if (!revocationCheck.ok) throw new Error(revocationCheck.errors.join('; '));
```

### Benchmark attestation

```js
import {
  createBenchmarkAttestation,
  validateBenchmarkAttestation,
} from 'enigma-memory/proof-network';

const attestation = createBenchmarkAttestation({
  report_hash: 'sha256:6666666666666666666666666666666666666666666666666666666666666666',
  dataset_ref: 'dataset:quickstart-public-fixture:v1',
  runner_ref: 'runner:enigma-local:v1',
  package_ref: 'npm:enigma-memory@0.1.13',
  sample_count: 12,
  run_count: 1,
});

const attestationCheck = validateBenchmarkAttestation(attestation);
if (!attestationCheck.ok) throw new Error(attestationCheck.errors.join('; '));
```

### Proof packet

```js
import {
  createProofNetworkPacket,
  validateProofNetworkPacket,
} from 'enigma-memory/proof-network';

const packet = createProofNetworkPacket({
  packet_ref: 'packet:quickstart:001',
  artifacts: [anchorBatch, grant, revocation, attestation],
});

const packetCheck = validateProofNetworkPacket(packet);
if (!packetCheck.ok) throw new Error(packetCheck.errors.join('; '));
```

Share the packet only after reviewing every nested artifact with the same public-safety checklist.

## 8. What to say about the artifact

Safe wording:

> This proof artifact locally verifies as an Enigma Proof Network artifact. It contains hashes, roots, refs, counts, and boundary booleans only. It is suitable for review or optional operator-controlled anchoring without exposing raw memory.

Do not say the artifact proves any of the following without separate reviewed evidence:

- a Solana transaction was submitted;
- raw memory was deleted from every provider or downstream system;
- a model forgot data;
- hosted customer operation exists;
- legal/compliance status, audit certification, comparative benchmark leadership, financial return, or production deployment.
