# SDK and API guide

This guide covers the public package imports for `enigma-memory@0.1.10`. The SDK runs locally by default: vaults, passports, context packs, receipts, relay/gateway demo state, storage contracts, metering artifacts, settlement artifacts, and hosted-cloud contract packets are package-level developer surfaces. They are not evidence of hosted Enigma cloud, live customer API key issuance, provider-side deletion, provider model forgetting, token ROI, invoice savings, compliance certification, or benchmark leadership.

## Install and import style

```sh
npm install enigma-memory
```

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

const vault = createVault({ subject_id: 'demo-subject' });
const remembered = remember({ vault, text: 'Demo project prefers local proof bundles.' });
const bundle = exportBundle({ vault });
```

### `enigma-memory/passport`

The passport module describes vault ownership/scope and compiles receipt-backed context packs for authorized local retrieval.

```js
import { createPassport, compileContextPack, verifyContextPack } from 'enigma-memory/passport';

const passport = createPassport({ vault, display_name: 'Demo Developer' });
const pack = compileContextPack({ vault, passport, query: 'project preference', limit: 1 });
const checked = verifyContextPack({ contextPack: pack, passport, vault, publicKey: bundle.keyring.publicKey });
```

### `enigma-memory/optimizer`

The optimizer module builds deterministic, local memory-selection plans and plaintext-minimized access receipts. Token and cost helpers estimate from explicit inputs only; they do not prove ROI or provider invoice savings.

```js
import { createMemoryOptimizationPlan, createMemoryAccessReceipt, estimateTextTokens } from 'enigma-memory/optimizer';

const plan = createMemoryOptimizationPlan({
  candidates: [{ address: remembered.memory_addr, content: 'Demo project prefers local proof bundles.' }],
  prompt_tokens: estimateTextTokens('Current local app context'),
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
  tenant_id: 'demo-tenant',
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
  tenant_id: 'demo-tenant',
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

### `enigma-memory/hosted-cloud`

The hosted-cloud module emits public-safe contract/readiness evidence only. Customer API key lifecycle packets model issue, rotate, revoke, and audit readiness with evidence refs, opaque subject refs, fingerprints, missing-evidence refs, readiness status, and operator approval refs. They never contain raw key material, provider payloads, plaintext prompts, raw memory, credentials, ROI claims, provider deletion claims, or model forgetting claims.

```js
import {
  buildApiKeyLifecyclePacket,
  validateApiKeyLifecyclePacket,
} from 'enigma-memory/hosted-cloud';

const packet = buildApiKeyLifecyclePacket({
  tenant_id: 'tenant-alpha',
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
