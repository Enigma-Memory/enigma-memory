# SDK and API guide

This guide covers the public package imports for `enigma-memory`. The SDK runs locally by default: vaults, passports, context packs, receipts, relay/gateway demo state, storage contracts, metering artifacts, settlement artifacts, proof-network artifacts, and hosted-cloud contract packets are package-level developer surfaces. They are not evidence of hosted Enigma cloud, live customer API key issuance, provider-side deletion, provider model forgetting, token ROI, invoice savings, compliance certification, benchmark leadership, Solana transaction submission, or on-chain raw memory.

## Install and import style

```sh
npm install enigma-memory
```

Requires Node.js `>=24`, matching the package `engines` field.

Use ESM imports and explicit subpaths when you know the surface you need:

```js
import { createVault, remember } from 'enigma-memory/vault';
import { createPassport, compileContextPack } from 'enigma-memory/passport';
```

## Package exports

### `enigma-memory`

The package root exports the core proof helpers. Use it for canonical JSON, hashes, signatures, receipt creation, receipt-chain verification, checkpoints, Merkle sets, and deterministic memory addresses.

```js
import { verifyReceiptChain, receiptHash, MerkleSet } from 'enigma-memory';
```

### `enigma-memory/vault`

The vault module creates local encrypted vault state and proof-carrying exports. Memory text is local input. Full `exportBundle` output can include a local import keyring, so publish only reviewed public summaries, receipt reports, roots, commitments, or keyring-stripped artifacts; do not use vault exports to claim provider-side deletion or model forgetting.

```js
import { createVault, remember, exportBundle, importBundle } from 'enigma-memory/vault';

const vault = createVault({ subject_id: 'subject-ref-local-001' });
const localOnlyMemoryText = String(process.env.ENIGMA_LOCAL_MEMORY_TEXT ?? '');
const remembered = remember({ vault, text: localOnlyMemoryText });
const bundle = exportBundle({ vault });
```

### `enigma-memory/passport`

The passport module describes vault ownership/scope and compiles receipt-backed context packs for authorized local retrieval.

```js
import { createPassport, compileContextPack, verifyContextPack } from 'enigma-memory/passport';

const localOnlyQueryText = String(process.env.ENIGMA_LOCAL_QUERY_TEXT ?? '');
const passport = createPassport({ vault, display_name: 'Public Demo Subject' });
const pack = compileContextPack({ vault, passport, query: localOnlyQueryText, limit: 1 });
const checked = verifyContextPack({ contextPack: pack, passport, vault, publicKey: bundle.keyring.publicKey });
```

### `enigma-memory/optimizer`

The optimizer module builds deterministic, local memory-selection plans and plaintext-minimized access receipts. Token and cost helpers estimate from explicit inputs only; they do not prove ROI or provider invoice savings.

```js
import { createMemoryOptimizationPlan, createMemoryAccessReceipt, estimateTextTokens } from 'enigma-memory/optimizer';

const localOnlyCandidateText = String(process.env.ENIGMA_LOCAL_MEMORY_TEXT ?? '');
const localOnlyQueryText = String(process.env.ENIGMA_LOCAL_QUERY_TEXT ?? '');
const plan = createMemoryOptimizationPlan({
  candidates: [{ address: 'memory-ref-public-001', content: localOnlyCandidateText }],
  prompt_tokens: estimateTextTokens(localOnlyQueryText),
});
const receipt = createMemoryAccessReceipt({ item: plan.items[0], plan });
```

### `enigma-memory/connectors`

The connectors module renders and manages local MCP client config for supported clients. It uses the `enigma-mcp` command and an `ENIGMA_BUNDLE` environment variable.

```js
import { supportedClients, renderMcpConfig, doctorConnectors } from 'enigma-memory/connectors';

const config = renderMcpConfig({ env: { ENIGMA_BUNDLE: './enigma-bundle.json' } });
const report = await doctorConnectors({ clientId: 'generic-mcp' });
```

### `enigma-memory/mcp-server`

The MCP server module exposes descriptors, handlers, JSON-RPC handling, and a stdio server for local MCP clients.

```js
import { toolDescriptors, handlers, handleJsonRpcRequest, startStdioServer } from 'enigma-memory/mcp-server';

const initTool = toolDescriptors.find((tool) => tool.name === 'enigma_init');
const reply = await handleJsonRpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
```

### `enigma-memory/relay`

The relay module exposes a local relay witness service API and demo state helpers. Local relay state is useful for development and review, but it is not hosted-cloud durability evidence.

```js
import { createRelayState, createRelayServer, runRelayDemo } from 'enigma-memory/relay';

const state = createRelayState({ role: 'relay_witness' });
const server = createRelayServer({ state });
```

### `enigma-memory/gateway`

The gateway module exposes a local policy gateway service API and demo state helpers. Local gateway decisions are package/source evidence unless deployed and operated with production storage, monitoring, secrets, and incident-response controls.

```js
import { createGatewayState, handleGatewayRequest, runGatewayDemo } from 'enigma-memory/gateway';

const state = createGatewayState({ gateway_id: 'local-gateway' });
const demo = runGatewayDemo();
```

### `enigma-memory/storage`

The storage module emits PostgreSQL migration and operation contracts for production storage. It is a contract/builder surface; applying migrations requires your own reviewed database environment.

```js
import { productionStorageContract, buildPostgresMigration, buildRelayRecordUpsert } from 'enigma-memory/storage';

const contract = productionStorageContract({ schema: 'enigma' });
const migration = buildPostgresMigration({ schema: 'enigma' });
```

### `enigma-memory/metering`

The metering module creates content-minimized usage events and deterministic aggregates. Inputs are explicit counts and metadata; outputs do not prove provider discounts or ROI.

```js
import { createUsageEvent, aggregateUsageEvents } from 'enigma-memory/metering';

const event = createUsageEvent({
  tenant_id: 'subject-ref-public-001',
  provider: 'local',
  model: 'demo-model',
  prompt_tokens: 800,
  completion_tokens: 120,
  memory_baseline_tokens: 1200,
  memory_optimized_tokens: 800,
});
const aggregate = aggregateUsageEvents({ events: [event] });
```

### `enigma-memory/settlement`

The settlement module creates hash-only memory jobs, capacity profiles, quotes, service receipts, receipt verification, and batches for permissionless access/accountability boundaries. It does not decentralize raw memory storage or inference.

```js
import { createPermissionlessMemoryJob, createOperatorServiceQuote, createServiceSettlementReceipt, verifyServiceSettlementReceipt } from 'enigma-memory/settlement';

const job = createPermissionlessMemoryJob({
  tenant_id: 'subject-ref-public-001',
  job_type: 'context.pack',
  memory_commitment_root: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  policy_hash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  usage_event_hash: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
  requested_at: '2026-01-01T00:00:00.000Z',
  expires_at: '2026-01-02T00:00:00.000Z',
  max_price_amount: 10,
  payment_asset: 'CREDITS',
});
```

### `enigma-memory/proof-network`

The proof-network module creates public-safe proof artifacts for AI-memory uniqueness: Solana-ready anchor batches, scoped capability grants/revocations, benchmark attestations, and proof packets. These functions are pure local builders and validators. They never submit transactions, write files, call Solana RPC, call external providers, or make raw memory public.

Proof-network artifacts must contain only hashes, roots, opaque refs, counts, timestamps, and signatures. Do not include raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, private keys, API keys, seed phrases, provider responses, or dataset rows. Anchor batches should explicitly preserve the boundary that no transaction was submitted and no raw memory goes on-chain:

Claim boundaries:

- `transaction_submitted:false` means the artifact is a local Solana-ready plan, not a submitted or finalized transaction.
- `raw_memory_on_chain:false` means chain payloads carry only opaque hashes/roots/refs, never raw memory or private context.
- `provider_deletion_claim:false`, `model_forgetting_claim:false`, and `hosted_saas_claim:false` mean proof-network packets are SDK artifacts, not provider deletion evidence, model-forgetting evidence, hosted-service evidence, compliance certification, or benchmark leadership claims.

```js
import {
  createProofNetworkAnchorBatch,
  validateProofNetworkAnchorBatch,
} from 'enigma-memory/proof-network';

const anchorBatch = createProofNetworkAnchorBatch({
  anchor_ref: 'anchor:local-plan-001',
  commitments: [
    {
      kind: 'memory.root',
      root: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ref: 'memory-root-ref-001',
      count: 1,
    },
    {
      kind: 'receipt.root',
      root: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ref: 'receipt-root-ref-001',
      count: 1,
    },
    {
      kind: 'policy.root',
      root: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      ref: 'policy-root-ref-001',
      count: 1,
    },
  ],
  transaction_submitted: false,
  raw_memory_on_chain: false,
});
const anchorBatchValid = validateProofNetworkAnchorBatch(anchorBatch);
```

Capability grants are scoped permission artifacts. They are not live auth changes, account creation, delegated custody, provider access, or proof that a downstream system enforced the grant:

```js
import {
  createCapabilityGrant,
  validateCapabilityGrant,
} from 'enigma-memory/proof-network';

const grant = createCapabilityGrant({
  issuer_ref: 'issuer-ref-public',
  subject_ref: 'subject-ref-public',
  capability: 'memory.read.receipt-summary',
  resource_roots: ['sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'],
  max_uses: 1,
  issued_at: '2026-01-01T00:00:00.000Z',
  expires_at: '2026-01-02T00:00:00.000Z',
});
const grantValid = validateCapabilityGrant(grant);
```

Benchmark attestations bind public report hashes and reproducibility refs. They do not prove benchmark leadership, third-party certification, provider-side behavior, model forgetting, or private dataset contents:

```js
import {
  createBenchmarkAttestation,
  validateBenchmarkAttestation,
} from 'enigma-memory/proof-network';

const attestation = createBenchmarkAttestation({
  report_hash: 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  dataset_ref: 'dataset-ref-public',
  runner_ref: 'runner-ref-public',
  package_ref: 'npm:enigma-memory@0.1.17',
  metric_roots: ['sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'],
  sample_count: 120,
  run_count: 1,
  attested_at: '2026-01-01T00:00:00.000Z',
});
const attestationValid = validateBenchmarkAttestation(attestation);
```

Proof packets wrap one or more supported proof-network artifacts for local verification. Packet verification checks supported artifact structure and privacy boundaries; it is not chain finality, settlement, provider deletion evidence, customer deployment evidence, or a compliance certificate:

```js
import {
  createProofNetworkAnchorBatch as createPacketAnchorBatch,
  createProofNetworkPacket,
  validateProofNetworkPacket,
} from 'enigma-memory/proof-network';

const anchorBatchForPacket = createPacketAnchorBatch({
  anchor_ref: 'anchor:packet-demo',
  commitments: [
    {
      kind: 'memory.root',
      root: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ref: 'memory-root-ref-001',
      count: 1,
    },
  ],
  transaction_submitted: false,
  raw_memory_on_chain: false,
});
const packet = createProofNetworkPacket({
  packet_ref: 'packet-ref-public',
  artifacts: [anchorBatchForPacket],
});
const packetValid = validateProofNetworkPacket(packet);
```

### `enigma-memory/hosted-cloud`

The hosted-cloud module emits public-safe contract/readiness evidence only. Customer API key lifecycle packets model issue, rotate, revoke, and audit readiness with evidence refs, opaque subject refs, fingerprints, missing-evidence refs, readiness status, and operator approval refs. They never contain raw key material, provider payloads, plaintext prompts, raw memory, credentials, ROI claims, provider deletion claims, or model forgetting claims.

```js
import {
  buildApiKeyLifecyclePacket,
  validateApiKeyLifecyclePacket,
} from 'enigma-memory/hosted-cloud';

const packet = buildApiKeyLifecyclePacket({
  tenant_id: 'subject-ref-public-001',
  subject_ref: 'subject-ref-alpha',
  environment: 'production',
  operation: 'audit',
});
const valid = validateApiKeyLifecyclePacket(packet);
```

`customer_api_keys_live` stays `false` unless the issue/rotate/revoke/audit evidence refs are complete and an operator approval ref is supplied. Even then, the packet is readiness evidence validation only; it does not issue a key, create a secret, call KMS or auth providers, rotate or revoke a provider credential, or prove provider-side deletion.

## Verifying exported proof

Package consumers should verify exported bundles through the CLI or MCP verifier rather than importing source-only verifier internals. Treat full bundles as private unless you have reviewed and removed local import key material before sharing:

```sh
enigma verify --bundle enigma-export.json
enigma-verify enigma-export.json
```

For in-process SDK checks, use exported public keys with core receipt verification:

```js
import { verifyReceiptChain } from 'enigma-memory';

const report = verifyReceiptChain({
  receipts: bundle.receipts,
  publicKey: bundle.keyring.publicKey,
  expectedReceiptLogRoot: bundle.vault.receipt_log_root,
  expectedActiveSetRoot: bundle.vault.active_set_root,
  verifyEmbeddedReceiptLogRoot: true,
});
```
