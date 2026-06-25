# Public API reference

This reference lists the public surfaces currently exposed by the `enigma-memory` package and source checkout. It is intentionally boundary-aware:

- **Stable local/package** surfaces are declared in `package.json` `bin` or `exports`, run locally, and do not require hosted Enigma cloud.
- **Demo/source-only** surfaces are useful for review, local demos, or source checkout operation, but are not evidence of a hosted production service.
- **Hosted/BYOC** surfaces are the same relay/gateway service APIs deployed with operator or customer infrastructure. They require deployment credentials, domain/TLS, production durable storage, KMS/secrets, monitoring, backups, incident response, and SIEM/log routing before they can be described as live. Local file-backed demo state does not satisfy hosted/BYOC durability.

Enigma proofs cover Enigma-controlled or Enigma-mediated vault state, receipts, checkpoints, relay records, gateway decisions, and documented boundary operations. They do not prove provider-side deletion, provider model forgetting, token ROI, compliance status, tamper-proof hardware, or raw compute superiority.

## Package entry points

Import from the package root or explicit subpath after installing the source checkout or the published package:

```js
import { createVault, remember, exportBundle } from 'enigma-memory/vault';
import { verifyReceiptChain } from 'enigma-memory/core';
import { createMemoryOptimizationPlan } from 'enigma-memory/optimizer';
import { createUsageEvent, aggregateUsageEvents } from 'enigma-memory/metering';
import { createPermissionlessMemoryJob, createConsumerGpuCapacityProfile, createServiceSettlementReceipt } from 'enigma-memory/settlement';
import { createProofNetworkAnchorBatch, createCapabilityGrant, createProofNetworkPacket } from 'enigma-memory/proof-network';
```

The verifier's `verifyBundle(bundle)` helper is implemented in the `enigma-verify` bin source; package consumers should prefer the `enigma-verify` bin, `enigma verify`, or the MCP `enigma_verify_receipts` tool unless working from a source checkout.

Use package subpath exports for public module imports:

| Package subpath | `package.json` export key | Target | Status | Public exports |
| --- | --- | --- | --- | --- |
| `enigma-memory` | `.` | `packages/core/src/index.js` | stable local/package | Same as `./core`. |
| `enigma-memory/core` | `./core` | `packages/core/src/index.js` | stable local/package | `SHA256_PREFIX`, `EMPTY_MERKLE_ROOT`, `canonicalize`, `sha256Hex`, `hmacSha256Hex`, `generateSigningKeyPair`, `signPayload`, `verifySignature`, `receiptHash`, `createReceipt`, `verifyReceipt`, `verifyReceiptChain`, `MerkleSet`, `createCheckpoint`, `verifyCheckpoint`, `createMemoryAddress`. |
| `enigma-memory/vault` | `./vault` | `packages/vault/src/index.js` | stable local/package | `createVault`, `remember`, `recall`, `updateMemory`, `deleteMemory`, `exportBundle`, `importBundle`. |
| `enigma-memory/passport` | `./passport` | `packages/passport/src/index.js` | stable local/package | `createPassport`, `compileContextPack`, `verifyContextPack`. |
| `enigma-memory/boundary` | `./boundary` | `packages/boundary/src/index.js` | stable local/package | `createBoundaryManifest`, `verifyBoundaryManifest`, `classifyBoundaryPath`, `runBoundarySimulation`, `boundarySurfaces`, `boundaryClassifications`. |
| `enigma-memory/mcp-server` | `./mcp-server` | `packages/mcp-server/src/index.js` | stable local/package | `toolDescriptors`, `resourceDescriptors`, `promptDescriptors`, `handlers`, memory tools, `enigma_meter_usage`, settlement tools, `enigma_passport_summary_resource`, `enigma_standard_memory_prompt`, `handleJsonRpcRequest`, `startStdioServer`, `default`. |
| `enigma-memory/connectors` | `./connectors` | `packages/connectors/src/index.js` | stable local/package | `supportedClients`, `platformDefaultConfigPath`, `getClientProfile`, `renderMcpConfig`, `connectClient`, `disconnectClient`, `detectClientConnector`, `detectConnectors`, `doctorConnectors`, `planConnectWizard`, `runConnectorDemo`. |
| `enigma-memory/importers` | `./importers` | `packages/importers/src/index.js` | stable local/package | `importChatGptExport`, `importClaudeMemory`, `importMem0Export`, `importLettaAgentFile`, `importLangGraphStore`, `importZepGraphitiExport`, `exportEnigmaCapsule`, `importEnigmaCapsule`, `runImporterDemo`, `default`. |
| `enigma-memory/mesh` | `./mesh` | `packages/mesh/src/index.js` | stable local/package | `createMeshNode`, `createCapsuleManifest`, `verifyCapsuleManifest`, `createWitnessCheckpoint`, `verifyWitnessCheckpoint`, `createRelayStore`, `pushRelayRecord`, `pullRelayRecord`, `createFederationGrant`, `verifyFederationGrant`, `runMeshDemo`, `default`. |
| `enigma-memory/enterprise` | `./enterprise` | `packages/enterprise/src/index.js` | stable local/package | `createEnterprisePolicy`, `evaluateEnterprisePolicy`, `minimizeEnterpriseEvaluation`, `minimizeEnterprisePolicy`, `createGatewayDecision`, `verifyGatewayDecision`, `exportSiemEvent`, `runEnterpriseDemo`, `default`. |
| `enigma-memory/optimizer` | `./optimizer` | `packages/optimizer/src/index.js` | stable local/package | `MEMORY_OPTIMIZATION_PRODUCT_THESIS`, `MEMORY_OPTIMIZATION_PLAN_SCHEMA`, `MEMORY_ACCESS_RECEIPT_SCHEMA`, `estimateTextTokens`, `estimateTokenCost`, `createMemoryOptimizationPlan`, `createMemoryAccessReceipt`, `assertNoRawMemoryOutput`. |
| `enigma-memory/metering` | `./metering` | `packages/metering/src/index.js` | stable local/package | `USAGE_EVENT_SCHEMA`, `USAGE_AGGREGATE_SCHEMA`, `USAGE_METERING_PRODUCT_THESIS`, `createUsageEvent`, `aggregateUsageEvents`. |
| `enigma-memory/settlement` | `./settlement` | `packages/settlement/src/index.js` | stable local/package | `PERMISSIONLESS_MEMORY_JOB_SCHEMA`, `CONSUMER_GPU_CAPACITY_PROFILE_SCHEMA`, `OPERATOR_SERVICE_QUOTE_SCHEMA`, `SERVICE_SETTLEMENT_RECEIPT_SCHEMA`, `SETTLEMENT_BATCH_SCHEMA`, `SETTLEMENT_PRODUCT_THESIS`, `CONSUMER_GPU_MEMORY_MARKET_THESIS`, `createPermissionlessMemoryJob`, `createConsumerGpuCapacityProfile`, `createOperatorServiceQuote`, `createServiceSettlementReceipt`, `verifyServiceSettlementReceipt`, `createSettlementBatch`. |
| `enigma-memory/proof-network` | `./proof-network` | `packages/proof-network/src/index.js` | stable local/package proof module | `PROOF_NETWORK_ANCHOR_BATCH_SCHEMA`, `PROOF_NETWORK_CAPABILITY_GRANT_SCHEMA`, `PROOF_NETWORK_CAPABILITY_REVOCATION_SCHEMA`, `PROOF_NETWORK_BENCHMARK_ATTESTATION_SCHEMA`, `PROOF_NETWORK_PACKET_SCHEMA`, `PROOF_NETWORK_SCHEMAS`, `assertNoPrivateProofPayload`, `sha256Json`, `createProofNetworkAnchorBatch`, `validateProofNetworkAnchorBatch`, `createCapabilityGrant`, `validateCapabilityGrant`, `createCapabilityRevocation`, `validateCapabilityRevocation`, `createBenchmarkAttestation`, `validateBenchmarkAttestation`, `createProofNetworkPacket`, `validateProofNetworkPacket`. |
| `enigma-memory/storage` | `./storage` | `packages/storage/src/index.js` | stable local/package contract module | `PRODUCTION_STORAGE_SCHEMA`, `POSTGRES_MIGRATION_SCHEMA`, `PRODUCTION_STORAGE_OPERATION_SCHEMA`, `PRODUCTION_STORAGE_TABLES`, `postgresProductionSchemaSql`, `buildPostgresMigration`, `assertProductionStorageSqlSafe`, `productionStorageContract`, parameterized operation builders for relay records, witness checkpoints, pairings, gateway policy versions, decisions, SIEM events, and readiness evidence refs. |
| `enigma-memory/hosted-cloud` | `./hosted-cloud` | `packages/hosted-cloud/src/index.js` | stable local/package contract module | Hosted-cloud contract schemas, blockers, lifecycle phases, builders, and validators: `HOSTED_CLOUD_USER_ACCOUNT_SCHEMA`, `HOSTED_CLOUD_TENANT_SCHEMA`, `HOSTED_CLOUD_VAULT_SCHEMA`, `HOSTED_CLOUD_API_KEY_SCHEMA`, `HOSTED_CLOUD_API_KEY_LIFECYCLE_PACKET_SCHEMA`, `HOSTED_CLOUD_USAGE_BILLING_SCHEMA`, `HOSTED_CLOUD_DASHBOARD_SCHEMA`, `HOSTED_CLOUD_BACKUP_DRILL_SCHEMA`, `HOSTED_CLOUD_INCIDENT_SLA_SCHEMA`, `HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PACKET_SCHEMA`, `HOSTED_CLOUD_EXTERNAL_BLOCKERS`, `HOSTED_CLOUD_CUSTOMER_LIFECYCLE_PHASES`, `HOSTED_CLOUD_API_KEY_LIFECYCLE_OPERATIONS`, `HOSTED_CLOUD_API_KEY_LIFECYCLE_PHASES`, `buildUserAccountContract`, `buildTenantContract`, `buildHostedVaultContract`, `buildApiKeyContract`, `buildApiKeyLifecyclePacket`, `buildCustomerLifecyclePacket`, and matching validators. These are readiness evidence validators only; they do not create hosted SaaS accounts, issue customer API keys, call providers, store raw memory/key material, or make hosted cloud sellable/live without complete evidence plus operator approval. |
| `enigma-memory/relay` | `./relay` | `apps/relay/src/server.mjs` | stable local/package service module | `createRelayState`, `createRelayServer`, `handleRelayRequest`, `serializeRelayState`, `hydrateRelayState`, `loadRelayStateFromFile`, `saveRelayStateToFile`, `runRelayDemo`. |
| `enigma-memory/gateway` | `./gateway` | `apps/gateway/src/server.mjs` | stable local/package service module | `createGatewayState`, `createGatewayServer`, `handleGatewayRequest`, `serializeGatewayState`, `hydrateGatewayState`, `loadGatewayStateFromFile`, `saveGatewayStateToFile`, `runGatewayDemo`, `default`. |
| `enigma-memory/desktop` | `./desktop` | `apps/desktop/src/app.js` | package-included desktop scaffold API | `DESKTOP_SCREENS`, `createDesktopState`, `desktopReducer`, `renderDesktopModel`, `startMcp`, `stopMcp`, `createVault`, `rememberMemory`, `deleteMemory`, `searchMemories`, `verifyReceipts`, `connectClient`, `disconnectClient`, `importBundle`, `exportBundle`, `updateMeshStatus`, `updateEnterpriseStatus`, `selectDesktopScreen`, `setDesktopDraft`, `desktopActions`, `actions`, `startMCP`, `stopMCP`, `remember`, `removeMemory`, `searchMemory`, `verifyReceiptOutput`, `connectDesktopClient`, `importDesktopBundle`, `exportDesktopBundle`, `desktopApi`. Desktop state is operational evidence only; cryptographic proof still comes from receipts and verifier output. |
| `enigma-memory/package.json` | `./package.json` | `package.json` | stable package metadata | Package metadata for tooling. |

`./relay`, `./gateway`, and `./desktop` expose local modules and demos. Running them locally does not make hosted Enigma cloud or a customer BYOC deployment live.

Hosted-cloud package exports and `production:hosted-customer` / `production:hosted-api-key` command output are readiness evidence validation only, not live hosted SaaS or live API key issuance. They do not wire auth, billing, storage, support, monitoring, KMS, secret issuance, key rotation, provider revocation, or provider systems.

The hosted-cloud lifecycle entry points are `buildCustomerLifecyclePacket(input)` / `validateCustomerLifecyclePacket(packet)` for `enigma.hosted_cloud.customer_lifecycle_packet.v1` and `buildApiKeyLifecyclePacket(input)` / `validateApiKeyLifecyclePacket(packet)` for `enigma.hosted_cloud.api_key_lifecycle_packet.v1`. API key lifecycle packets cover issue, rotate, revoke, and audit readiness using evidence refs, fingerprints, opaque subject refs, missing-evidence refs, readiness status, and operator approval refs only.

The proof-network entry points build and validate public-safe `enigma.proof_network.*.v1` artifacts for root anchoring, capability grants/revocations, benchmark attestations, and packet envelopes. They are pure local helpers: no network, filesystem, provider, or Solana calls occur in the module API, and artifacts must carry hashes, roots, refs, counts, signatures, and claim boundaries instead of raw memory, prompts, transcripts, completions, embeddings, tenant names, provider responses, private keys, API keys, or seed phrases.

## Module API quick reference

Use object-style arguments for forward compatibility where supported by the implementation. Functions that accept private memory text (`remember`, `updateMemory`, `enigma_remember`, and matching CLI commands) should receive it only from local/private inputs; public proof artifacts should contain addresses, hashes, roots, receipt ids, counts, encrypted envelopes, or commitments instead.

### Memory optimization thesis and API boundary

`enigma-memory/optimizer` is the memory analogue to inference optimization: a centralized optimized memory fabric for high-performance memory optimization through dedupe, tiering, scoped context selection, token estimation, cost estimation from explicit inputs, and plaintext-minimized receipts. In optimized context-pack flows, the passport compiler can first apply deterministic local relevance filtering over authorized vault memories, then pass the reduced candidate set into optimizer tiering and deduplication. Use `createMemoryOptimizationPlan` for local/offline candidate planning and `createMemoryAccessReceipt` for the access, settlement, and proof/receipt-anchoring boundary around a selected plan. `estimateTextTokens` and `estimateTokenCost` are estimates only; they do not prove measured discounts, provider billing outcomes, token ROI, or third-party superiority.

Users buy lower repeated-context footprint, proof, portability, and no lock-in; they do not need ideological decentralization to use the optimizer API. Treat cost language as Enigma-side estimates from explicit inputs unless separately reviewed provider billing evidence exists.

`enigma-memory/metering` turns memory baseline/optimized token counts into deterministic, content-minimized `enigma.usage_event.v1` and `enigma.usage_aggregate.v1` evidence. It computes Enigma-side estimated memory credit from explicit counts and pricing only; it does not claim provider invoice savings, token ROI, decentralized inference, provider-side deletion, model forgetting, or compliance certification.

`enigma-memory/settlement` is the permissionless-access layer: it creates hash-only memory jobs, consumer/workstation GPU capacity profiles, operator quotes, service settlement receipts, and settlement batches. Jobs carry memory commitment roots, policy hashes, and usage-event hashes only. Capacity profiles carry public pricing/capacity metadata and claim boundaries only. Receipts prove job/quote/settlement linkage; they do not claim decentralized raw-memory inference, token ROI/profit/equity, provider invoice savings, provider deletion, model forgetting, or compliance status.

The optimizer may accept private plaintext candidate content as local input, but exported plans, receipts, output artifacts, public examples, SIEM, and chain/witness artifacts must not include raw memory plaintext. Public optimizer output should contain commitments, hashes, counts, tiers, and token/cost estimates. Use `assertNoRawMemoryOutput` before exposing optimizer artifacts. Blockchain/permissionless access is for access/settlement/anchoring boundaries only: access control, settlement, and proof/receipt anchoring. Enigma does not claim raw memory on-chain storage, token ROI, provider deletion proof, model forgetting, compliance status, benchmark leadership, provider invoice savings, or measured discount claims without measured repository evidence.

| Export | Use | Notes |
| --- | --- | --- |
| `MEMORY_OPTIMIZATION_PRODUCT_THESIS` | Claim-bounded product thesis constant. | States centralized memory optimization with permissionless access only at the access/settlement/proof boundary. |
| `MEMORY_OPTIMIZATION_PLAN_SCHEMA` | Stable schema name for optimization plans. | Plans should contain commitments, hashes, tiers, token estimates, and optional cost estimates, not raw memory plaintext. |
| `MEMORY_ACCESS_RECEIPT_SCHEMA` | Stable schema name for access receipts. | Receipts prove Enigma-mediated optimizer/access events only. |
| `estimateTextTokens(input)` | Estimates tokens from explicit local input. | Estimation helper, not a benchmark or provider invoice. |
| `estimateTokenCost(input)` | Estimates cost from explicit token counts and rates. | No measured discount claim unless supplied by benchmark evidence outside this helper. |
| `createMemoryOptimizationPlan(input)` | Builds a deterministic local/offline dedupe and tiering plan. | May inspect private local candidates; exported plan must be plaintext-minimized. |
| `createMemoryAccessReceipt(input)` | Emits a receipt for optimizer access/settlement/proof anchoring. | Anchor commitments and metadata only; do not include raw memory content. |
| `assertNoRawMemoryOutput(artifact)` | Fails closed if optimizer output exposes raw memory-like fields. | Use before public docs examples, receipts, SIEM exports, or chain/witness artifacts. |

### Proof network (`enigma-memory/proof-network`)

`enigma-memory/proof-network` is the privacy-preserving proof layer for AI memory. It emits Solana-ready opaque anchor batches and related proof artifacts, but the package API does not submit transactions, contact RPC endpoints, read files, or write files. Public artifacts should be safe to publish: roots/refs/hashes/counts/signatures only, with `transaction_submitted:false` and `raw_memory_on_chain:false` where chain-shaped output is produced.

| Export | Use | Notes |
| --- | --- | --- |
| `PROOF_NETWORK_ANCHOR_BATCH_SCHEMA` | Stable schema name for `enigma.proof_network.anchor_batch.v1`. | Anchor batches collect public roots/refs for later settlement or chain anchoring. |
| `PROOF_NETWORK_CAPABILITY_GRANT_SCHEMA` | Stable schema name for `enigma.proof_network.capability_grant.v1`. | Grants are scoped capability artifacts, not secret ACL bodies. |
| `PROOF_NETWORK_CAPABILITY_REVOCATION_SCHEMA` | Stable schema name for `enigma.proof_network.capability_revocation.v1`. | Revocations/nullifiers refer to prior grants by public-safe ids/hashes. |
| `PROOF_NETWORK_BENCHMARK_ATTESTATION_SCHEMA` | Stable schema name for `enigma.proof_network.benchmark_attestation.v1`. | Benchmark attestations bind report hashes plus dataset/runner/package refs without raw datasets or provider responses. |
| `PROOF_NETWORK_PACKET_SCHEMA` | Stable schema name for `enigma.proof_network.packet.v1`. | Packets bundle supported proof-network artifacts under one verifier envelope. |
| `PROOF_NETWORK_SCHEMAS` | Frozen map of supported proof-network schema constants. | Keys are `anchor_batch`, `capability_grant`, `capability_revocation`, `benchmark_attestation`, and `packet`. |
| `assertNoPrivateProofPayload(value)` | Fails closed on private/secret proof payload keys or values. | Use before publishing proof-network artifacts, docs examples, test fixtures, or chain payloads. |
| `sha256Json(value)` | Returns a deterministic SHA-256 digest for JSON-like input. | Hashes canonical public-safe values; do not hash-and-publish private raw content as a substitute for minimization. |
| `createProofNetworkAnchorBatch(input)` / `validateProofNetworkAnchorBatch(batch)` | Builds or validates an anchor batch. | Inputs are roots/refs and public metadata only; output is Solana-ready but unsubmitted. |
| `createCapabilityGrant(input)` / `validateCapabilityGrant(grant)` | Builds or validates a scoped capability grant. | Use opaque subject/resource refs and scopes; do not include tenant names, secret policy bodies, or raw ACL text. |
| `createCapabilityRevocation(input)` / `validateCapabilityRevocation(revocation)` | Builds or validates a revocation/nullifier artifact. | Revocation artifacts prove intent/scope linkage without exposing private authorization state. |
| `createBenchmarkAttestation(input)` / `validateBenchmarkAttestation(attestation)` | Builds or validates benchmark evidence. | Carries report hashes and dataset/runner/package refs; it is not a benchmark-leadership claim by itself. |
| `createProofNetworkPacket(input)` / `validateProofNetworkPacket(packet)` | Builds or validates a packet containing supported proof-network artifacts. | Packets are local verification envelopes, not deployment, provider, or Solana transaction evidence. |

### Core (`enigma-memory/core`)

| Export | Use | Notes |
| --- | --- | --- |
| `SHA256_PREFIX` | Constant string `sha256:`. | Used for root/address formatting. |
| `EMPTY_MERKLE_ROOT` | Constant empty Merkle root. | Stable empty-set root. |
| `canonicalize(value)` | Stable JSON canonicalization. | Throws on cyclic/unsupported values. |
| `sha256Hex(value)` | SHA-256 hex digest for strings, buffers, or canonicalized values. | Unprefixed hex. |
| `hmacSha256Hex({ key, value })` or `hmacSha256Hex(key, value)` | HMAC-SHA-256 hex digest. | Unprefixed hex. |
| `generateSigningKeyPair(options)` | Creates an Ed25519 key pair. | Returns PEM keys and key id metadata. |
| `signPayload({ payload, privateKey })` or `signPayload(payload, privateKey)` | Signs canonical payload bytes. | Returns base64url signature. |
| `verifySignature({ payload, signature, publicKey })` or positional form | Verifies an Ed25519 signature. | Returns boolean. |
| `receiptHash(receipt)` | Canonical receipt hash. | Returns `sha256:<hex>`. |
| `createReceipt(args)` | Creates `enigma.receipt.v1`. | Requires operation/tenant/subject/sequence/root/signer fields. |
| `verifyReceipt({ receipt, publicKey })` | Verifies receipt shape/signature. | Returns `{ ok, valid, errors }`. |
| `verifyReceiptChain({ receipts, publicKey, ...expectedRoots })` | Verifies sequence, hashes, and roots across receipts. | Returns verifier-style result plus chain metadata. |
| `MerkleSet` | Insert/delete/proof/root helper for deterministic sets. | Used for active/deleted sets and roots. |
| `createCheckpoint(args)` | Creates `enigma.state_checkpoint.v1`. | Signs root metadata; no raw memory required. |
| `verifyCheckpoint(args)` | Verifies checkpoint signature/root fields. | Returns `{ ok, valid, errors }`. |
| `createMemoryAddress(args)` | Creates deterministic memory addresses from secret/value/scope inputs. | Address is commitment-like metadata, not plaintext. |

### Vault and passport (`enigma-memory/vault`, `enigma-memory/passport`)

| Export | Use | Notes |
| --- | --- | --- |
| `createVault(args)` | Creates local `enigma.vault.local.v1` state with signing/encryption metadata. | Local canonical state only. |
| `remember({ vault, passport, text/content/plaintext, purpose, purpose_tags, metadata })` | Stores private local memory and appends create receipt. | Returns `memory_addr`, public record, and receipt metadata. |
| `recall({ vault, passport, memory_addr, purpose })` | Reads active local memory and records retrieval evidence. | Provider-native memory remains cache only. |
| `updateMemory({ vault, passport, memory_addr, text/content/plaintext, metadata })` | Supersedes one local memory address with another. | Emits update/supersede receipt evidence. |
| `deleteMemory({ vault, passport, memory_addr, reason })` | Tombstones a local memory address. | Proves Enigma state no longer serves it; not provider deletion proof. |
| `exportBundle({ vault, includePlaintext: false })` | Exports `enigma.vault_bundle.v1` with receipts/checkpoints and encrypted/committed vault state. | Keep `includePlaintext` false for public proof artifacts. |
| `importBundle(args)` | Imports an `enigma.vault_bundle.v1` bundle. | Restores Enigma state from a bundle. |
| `createPassport({ vault, ...owner })` | Builds `enigma.passport.v1` metadata for vault roots and owner scope. | Passport metadata is not raw memory content. |
| `compileContextPack({ vault, passport, query, purpose, limit, memory_addresses, optimize, max_estimated_tokens, price_per_million_tokens })` | Builds `enigma.context_pack.v1` from active local memories and receipts; optimized flows use deterministic local relevance filtering before optimizer tiering and attach plaintext-minimized `optimization_plan` and `optimization_receipts`. | Use only for authorized local retrieval. Optimizer artifacts expose hashes, commitments, tiers, and explicit token/cost estimates, not raw memory or provider savings claims. |
| `verifyContextPack({ contextPack, passport, publicKey })` | Verifies context-pack receipts/public shape. | Public-key verification is required for full receipt validation. |

### Boundary, mesh, and enterprise

| Module | Export | Use |
| --- | --- | --- |
| `enigma-memory/boundary` | `createBoundaryManifest(options)` | Creates `enigma.boundary_manifest.v1` path/classification manifest. |
| `enigma-memory/boundary` | `verifyBoundaryManifest(manifest)` | Validates manifest shape, surfaces, and classifications. |
| `enigma-memory/boundary` | `classifyBoundaryPath(manifest, pathRef)` | Classifies one declared path as committed/blocked/out-of-scope/broken. |
| `enigma-memory/boundary` | `runBoundarySimulation(options)` | Local demo harness for boundary classification evidence. |
| `enigma-memory/boundary` | `boundarySurfaces`, `boundaryClassifications` | Enumerations used by manifests. |
| `enigma-memory/mesh` | `createMeshNode(options)` | Creates signed `enigma.mesh_node.v1` descriptor. |
| `enigma-memory/mesh` | `createCapsuleManifest(options)`, `verifyCapsuleManifest(manifest, options)` | Creates/verifies signed capsule root metadata. |
| `enigma-memory/mesh` | `createWitnessCheckpoint(options)`, `verifyWitnessCheckpoint(checkpoint, options)` | Creates/verifies witness checkpoint roots. |
| `enigma-memory/mesh` | `createRelayStore(options)`, `pushRelayRecord(store, record)`, `pullRelayRecord(store, recordRef)` | Local in-memory relay record store for opaque encrypted records. |
| `enigma-memory/mesh` | `createFederationGrant(options)`, `verifyFederationGrant(grant, options)` | Creates/verifies signed federation grants. |
| `enigma-memory/mesh` | `runMeshDemo(options)` | Local mesh demo; not hosted availability evidence. |
| `enigma-memory/enterprise` | `createEnterprisePolicy(options)` | Creates default-deny `enigma.enterprise_policy.v1` with `provider_native_memory: \"cache_only\"`. |
| `enigma-memory/enterprise` | `evaluateEnterprisePolicy(policy, request)` | Evaluates provider/model/region/purpose/sensitivity/legal-hold request metadata. |
| `enigma-memory/enterprise` | `minimizeEnterpriseEvaluation(evaluation)`, `minimizeEnterprisePolicy(policy)` | Produces public/minimized views. |
| `enigma-memory/enterprise` | `createGatewayDecision(args)`, `verifyGatewayDecision(args)` | Creates/verifies signed gateway decisions. |
| `enigma-memory/enterprise` | `exportSiemEvent(args)` | Emits plaintext-minimized SIEM event metadata. |
| `enigma-memory/enterprise` | `runEnterpriseDemo(options)` | Local enterprise policy demo; not hosted/BYOC evidence. |

### Desktop scaffold (`enigma-memory/desktop`)

The desktop export is a state/model scaffold. `createDesktopState`, `desktopReducer`, and `renderDesktopModel` drive state and view models. Action creators return reducer actions: `startMcp`, `stopMcp`, `createVault`, `rememberMemory`, `deleteMemory`, `searchMemories`, `verifyReceipts`, `connectClient`, `disconnectClient`, `importBundle`, `exportBundle`, `updateMeshStatus`, `updateEnterpriseStatus`, `selectDesktopScreen`, and `setDesktopDraft`. Aliases (`startMCP`, `stopMCP`, `remember`, `removeMemory`, `searchMemory`, `verifyReceiptOutput`, `connectDesktopClient`, `importDesktopBundle`, `exportDesktopBundle`) are also exported. `desktopActions`, `actions`, and `desktopApi` group the same functions. Desktop output is operational UI evidence only, not cryptographic proof.

## CLI bins and commands

Package bins declared in `package.json`:

| Bin | `package.json` target | Status | Purpose |
| --- | --- | --- | --- |
| `enigma` | `./apps/cli/bin/enigma.mjs` | stable local/package | Main CLI for vault, cross-model demos, MCP, connectors, importers, capsule, relay/gateway demos, and local verification. |
| `enigma-verify` | `./apps/verifier/bin/enigma-verify.mjs` | stable local/package | Offline exported-bundle verifier. |
| `enigma-mcp` | `./packages/mcp-server/bin/enigma-mcp.mjs` | stable local/package | MCP stdio server. |
| `enigma-relay` | `./apps/relay/bin/enigma-relay.mjs` | stable local/package local service bin | Local relay demo/server. Hosted use requires deployment infrastructure. |
| `enigma-gateway` | `./apps/gateway/bin/enigma-gateway.mjs` | stable local/package local service bin | Local gateway demo/server. Hosted/BYOC use requires deployment infrastructure. |
| `enigma-native-host` | `./apps/native-host/bin/enigma-native-host.mjs` | stable local/package native messaging bin | Chrome/Edge/Firefox native messaging host over stdio. It reads the local bundle selected by `ENIGMA_BUNDLE` or `--bundle`. |

Published-package quickstart:

```sh
npm install -g enigma-memory
enigma quickstart --bundle ./.enigma/bundle.json --overwrite
enigma demo cross-model
enigma doctor
enigma-relay demo
enigma-gateway demo
```

One-off quickstart without a global install:

```sh
npx --yes --package enigma-memory enigma quickstart --bundle ./.enigma/bundle.json --overwrite
npx --yes --package enigma-memory enigma demo cross-model
```

`enigma quickstart` creates a local vault bundle, context pack, export proof bundle, and verify report. The proof is local Enigma-controlled evidence only; it is not provider deletion proof, model forgetting proof, hosted/BYOC readiness evidence, token ROI evidence, or compliance certification.

`enigma demo cross-model` is a no-provider product demo for the “memory follows me across models” loop. It creates a generic demo memory in a demo-only vault or supplied bundle unless `--memory-file <path>` is explicitly supplied, generates public-safe context-pack references and receipt summaries for `chatgpt`, `claude`, `kimi`, `cursor`, and `local-llm`, and keeps `provider_native_memory_canonical:false`. The JSON report does not echo plaintext memory.

`enigma` command names:

- `enigma init`
- `enigma quickstart`
- `enigma demo cross-model`
- `enigma doctor`
- `enigma install`
- `enigma connect <client>`
- `enigma disconnect <client>`
- `enigma remember`
- `enigma recall`
- `enigma update`
- `enigma delete`
- `enigma context`
- `enigma export`
- `enigma import <source>`
- `enigma capsule export`
- `enigma capsule import`
- `enigma verify`
- `enigma boundary run`
- `enigma mcp serve`
- `enigma native-host manifest`
- `enigma native-host install-plan`
- `enigma relay demo`
- `enigma relay serve`
- `enigma gateway demo`
- `enigma gateway serve`
- `enigma mesh demo`
- `enigma enterprise demo`
- `enigma chain anchor`
- `enigma chain grant`
- `enigma chain revoke`
- `enigma chain attest`
- `enigma chain verify`

`enigma chain ...` commands are local artifact builders/verifiers. They produce or validate public-safe JSON for later operator review, and every generated chain-shaped artifact must make the boundary explicit with `transaction_submitted:false` and `raw_memory_on_chain:false`. They do not submit Solana transactions, contact Solana RPC, create accounts, deploy infrastructure, call providers, or put raw memory on-chain.

Common local options and outputs:

| Command | Inputs | Output boundary |
| --- | --- | --- |
| `enigma quickstart --bundle <path> --overwrite` | `--bundle`, optional `--overwrite` | Creates a local review workspace with a vault bundle, context pack, export proof bundle, and verify report. The result proves only local Enigma-controlled state and receipt verification. |
| `enigma demo cross-model [--bundle <path>] [--memory-file <path>] [--out <path>]` | Optional local bundle, optional explicit local memory file, optional report path | Emits `enigma.cross_model_demo.v1` with profile context-pack refs, receipt counts, memory counts, `provider_native_memory_canonical:false`, and claim boundaries. It calls no providers and does not prove provider deletion, model forgetting, hosted availability, ROI/savings, or compliance status. |
| `enigma init --bundle <path>` | `--subject`/`--subject-id`, `--display-name`/`--name`, `--passphrase` | Creates local `enigma.vault_bundle.v1` state and prints `{ ok, bundle, schema, subject_id }`. |
| `enigma remember --bundle <path> --text <private local text>` | `--purpose`, `--tags`, `--metadata` | Prints `memory_addr` and `receipt_id`. Do not place private memory text in public proof artifacts. |
| `enigma recall --bundle <path> --id <memory_addr>` | `--purpose` | Reads from local vault and emits recall result plus receipt data. |
| `enigma update --bundle <path> --id <memory_addr> --text <private local text>` | `--metadata` | Prints old/new memory address and receipt id. |
| `enigma delete --bundle <path> --id <memory_addr>` | `--reason` | Tombstones the local Enigma memory address and prints receipt id; this is not provider deletion proof. |
| `enigma context --bundle <path>` | `--query`/`--q`, `--purpose`, `--limit`, `--out`, optional `--optimize`, `--max-estimated-tokens`, `--price-per-million-tokens`, `--currency` | Emits `enigma.context_pack.v1` derived from active local memories and retrieval receipts; optimizer options use deterministic local relevance filtering before tiering/deduplication, attach plaintext-minimized plan/receipt evidence, and estimate tokens/cost from explicit inputs only. |
| `npm run production:storage` | optional `-- --out <file>`, `-- --format json|sql`, `-- --schema <identifier>`, `-- --migration-id <id>` | Builds local PostgreSQL production storage migration material for relay/gateway durable state. It does not connect to or mutate a database; operators run it through controlled database change management. |
| `npm run production:backend-env` | required `-- --out-dir <dir>`, optional `-- --domain <host> --tenant <id> --environment <name>` | Writes `enigma.production_backend_env_kit.v1`: public-safe relay/gateway operator-env templates, an operator-secrets placeholder manifest, hosted-ref map, fail-closed production defaults, and next validation commands. It creates no secrets or cloud resources and stays `launch_ready:false` until real hosted refs, live probes, and operator acceptance exist. |
| `npm run production:edge-backend` | required `-- --out-dir <dir>`, optional `-- --domain <host>` | Writes `enigma.edge_backend_worker_bundle.v1`: public-safe Cloudflare Worker source/config for `relay.<domain>` and `gateway.<domain>` custom domains. The Workers expose `/livez`, fail-closed `/readyz`, and closed private-route stubs for urgent edge bootstrap. They do not create storage, KMS, SIEM, backups, approvals, or production hosted-readiness evidence; `/readyz` remains blocked until real refs and operator `go` are configured. |
| `npm run production:edge-deploy` | optional `-- --cloudflare-env-file <file> --source-dir <dir> --execute --provision-secrets --out <file>` | Plans or idempotently deploys the relay/gateway Cloudflare edge bootstrap Workers with D1/KV bindings and optional generated Worker secrets. Dry-run by default; output redacts token/account/resource/secret values, writes `enigma.edge_backend_deployment.v1`, and keeps `launch_ready:false` because deploy proof is separate from full hosted `/readyz` and operator acceptance. |
| `npm run production:edge-live` | optional `-- --domain <host>`, optional `-- --out <file>` | Collects `enigma.edge_backend_bootstrap_live_evidence.v1`: public-safe DNS-over-HTTPS and `/livez`/fail-closed `/readyz` evidence for the relay/gateway edge bootstrap Workers. It sends no credentials, deploys nothing, hides resolved IPs from the artifact, summarizes D1/KV read-probe and custody binding presence from `/readyz` checks, proves no credential value is returned, and keeps `launch_ready:false` / `hosted_backend_live_ready:false`. |
| `npm run production:ref-draft` | required `-- --edge-live <edge-backend-bootstrap-live.json>`, optional `-- --out <file>` | Builds `enigma.hosted_ref_draft.v1`: a public-safe partial hosted-ref draft from live edge bootstrap evidence. It marks edge-derived refs as `partial_edge_bootstrap_only`, keeps `complete:false`, groups all still-incomplete hosted refs by workstream, and explicitly forbids using the draft as production `/readyz` or operator `go` evidence. |
| `npm run production:hosted-customer` | required `-- --tenant <id> --domain <domain> --environment <env>`, optional repeatable `-- --evidence-ref <key=status:ref>`, optional `-- --operator-go-live-ref <ref>`, optional `-- --out <file>` | Builds `enigma.hosted_cloud.customer_lifecycle_packet.v1`: a public-safe customer lifecycle launch packet that aggregates hosted-cloud contract surfaces, lifecycle phases, blockers, missing evidence refs, no-secret/no-plaintext guarantees, and the sellability gate. It validates evidence refs only, creates no external accounts/resources/secrets, and keeps `hosted_cloud_sellable:false` unless every required evidence ref is provided and an explicit operator go-live approval ref is supplied. |
| `npm run production:hosted-api-key` | required `-- --tenant <id> --subject <opaque-subject-ref> --operation <issue\|rotate\|revoke\|audit>`, optional repeatable `-- --evidence-ref <phase=status:ref>`, optional `-- --operator-approval-ref <ref>`, optional `-- --out <file>` | Builds `enigma.hosted_cloud.api_key_lifecycle_packet.v1`: public-safe readiness evidence for one customer API key issue, rotate, revoke, or audit lifecycle operation. It validates evidence refs only, creates no customer API key or secret, calls no provider/KMS/auth system, and keeps `customer_api_keys_live:false` unless every required phase evidence ref for that operation is provided and an explicit operator approval ref is supplied. Even then, the packet is evidence validation only, not live key issuance. |
| `npm run production:storage-bootstrap` | optional `-- --cloudflare-env-file <file> --execute --out <file>` | Inspects or creates public-safe Cloudflare D1/KV storage bootstrap resources. Dry-run by default; with `--execute` it idempotently creates the production ledger D1 database plus relay/gateway audit KV namespaces, redacts database/namespace ids, and keeps `launch_ready:false` because resource existence or edge-bootstrap binding is not full hosted runtime readiness by itself. |
| `npm run production:manifest` | optional `-- --out <file>` plus `-- --*-ref` flags or `ENIGMA_*_REF` env vars | Builds an `enigma.infrastructure_readiness_manifest.v1` from public-safe backend dependency references. Required refs include backend host, DNS/TLS, storage, KMS custody, network policy, tenant policy, usage metering, service settlement, public site security, security threat model, monitoring/alerting, legal/compliance, support SLA, incident drill, backup/restore drill, runtime/admin/data-plane auth, and operator acceptance. Missing refs become explicit `external_blockers`; secret-looking refs are rejected. |
| `npm run production:acceptance` | required `-- --packet <packet.json>`, optional `-- --out <file>` | Validates machine-readable operator acceptance evidence. It returns `go` only when owners, evidence refs, readiness output, infrastructure manifest, production manifest validator output, storage artifact, and release audit are all complete, accepted, and secret-free. |
| `npm run production:acceptance:packet` | optional `-- --out <file>`, `-- --validate`; accepts artifact file flags for readiness/manifest/storage/release audit/production-manifests plus `-- --owners-json <owners.json>` and `-- --evidence-refs <evidence-refs.json>` | Builds a machine-readable operator acceptance packet template or assembles a packet from operator-supplied owner/evidence refs. Generated packets remain blocked unless owners, evidence refs, readiness, static production manifest validation, storage, and release-audit evidence are complete; the builder creates no approvals or cloud resources. |
| `npm run production:backup-drill` | required `-- --drill <drill.json>`, optional `-- --out <file>` | Validates `enigma.backup_restore_drill.v1` backup/restore rehearsal evidence: matching hashes/row counts, RPO/RTO, verifier output, and secret-free refs. |
| `npm run production:incident-drill` | required `-- --drill <drill.json>`, optional `-- --out <file>` | Validates `enigma.incident_drill.v1` incident-response rehearsal evidence: contacts, escalation, evidence preservation, communications, timeline, response targets, and postmortem follow-up. |
| `npm run production:sla` | required `-- --sla <sla.json>`, optional `-- --out <file>` | Validates `enigma.support_sla.v1` support/SLA evidence: support hours, severity definitions, response targets, escalation matrix, channels, maintenance window, and approval status. |
| `npm run production:monitoring` | required `-- --monitoring <monitoring.json>`, optional `-- --out <file>` | Validates `enigma.monitoring_alerting.v1` monitoring evidence: observability stack refs, required health/latency/5xx/signing/policy/storage/plaintext-rejection/certificate/KMS/SIEM alerts, relay/gateway readiness synthetics, escalation routing, and content-minimized log export proof. |
| `npm run production:network` | required `-- --policy <network-policy.json>`, optional `-- --out <file>` | Validates `enigma.network_access_policy.v1` network/access evidence: public `/livez`/`/readyz` probes only, private authenticated admin/data-plane routes, request limits, default-deny egress, break-glass controls, and no bearer/token values in policy artifacts. |
| `npm run production:kms` | required `-- --custody <custody.json>`, optional `-- --out <file>` | Validates `enigma.kms_custody.v1` KMS/credential custody evidence: required signing/bearer-hash/database/SIEM/backup/TLS custody refs, rotation windows, emergency rotation paths, public-key registry, dual-control operator access, and explicit no-value-export prohibitions. |
| `npm run production:tenant-policy` | required `-- --approval <tenant-policy.json>`, optional `-- --out <file>` | Validates `enigma.tenant_policy_approval.v1` tenant policy approval evidence: fail-closed enterprise policy, provider-native memory `cache_only`, retention/delete/legal-hold controls, rollback hash, minimized audit routes, and change-control/rollback refs. |
| `npm run production:usage` | required `-- --metering <usage.json>`, optional `-- --out <file>` | Validates `enigma.usage_event.v1`, `enigma.usage_aggregate.v1`, or event arrays as content-minimized usage metering evidence. It checks memory-savings math, settlement boundaries, hash/id shape, and rejects raw prompts/completions/provider responses, secrets, token ROI, and provider-invoice claims. |
| `npm run production:settlement` | required `-- --settlement <settlement.json>`, optional `-- --out <file>` | Validates service settlement evidence containing hash-only job, quote, receipt, and optional batch artifacts. It checks `settlement.amount <= quote.price <= job.max_price`, receipt linkage, batch totals, claim boundaries, and rejects raw memory/prompts/responses, secrets, token ROI/profit, investment, provider deletion, model forgetting, and provider-invoice claims. |
| `npm run production:site` | optional `-- --site <dir>`, `-- --out <file>` | Validates a static public site artifact for security headers, forbidden private/generated files, source maps, local broken links, external scripts, local development hosts, secrets, raw memory references, personal emails, phone numbers, street-address-looking content, and SSN-looking content. |
| `npm run release:audit` | optional `-- --out <file>` | Runs local package/demo gates and emits `enigma.release_audit.v1`: check, test, pack dry-run, direct-bin smokes, local provenance, review-packet, MCP stdio, optional public-site/static validators, and production fixture validators. `--out` writes the same public-safe JSON so `production:handoff -- --release-audit <file>` or `production:goal-audit -- --release-audit <file>` can consume current release evidence. It does not require Docker, cloud credentials, npm publish credentials, or a live website, and it does not prove hosted/BYOC readiness. |
| `npm run cloudflare:ops` | subcommands: `token verify`, `pages deploy`, `pages verify`, `workers deploy-probe`, `workers inspect-probe`, `workers verify-probe`, `registrar search/check/register`; global `--cloudflare-env-file <path>` | Safe Cloudflare operations helper. Mutating Pages deploy, Worker probe deploy, and Registrar registration stay dry-run unless `--execute` plus explicit guard flags are supplied. `--cloudflare-env-file` loads `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_PROJECT_NAME` from a local `.env`-style file without printing values. `workers inspect-probe --out <file>` is a non-mutating API visibility/permission check with account ids and local paths redacted and a reusable public-safe evidence JSON. Worker probe verification checks `/livez` and fail-closed or ready `/readyz` without Authorization and is edge-probe evidence only. |
| `npm run cloudflare:pages:packet` | required `-- --site <dir> --project-name <name>`, optional `-- --domain <host> --live-url <https-url> --expect-title <text> --cloudflare-env-file <path> --out <file>` | Builds `enigma.cloudflare_pages_release_packet.v1`: local static artifact hashes, public-site security validation summary, dry-run Wrangler Pages deploy plan, credential-present boolean, optional live-page title observation, deploy blockers, and claim boundaries. It can load local Cloudflare credentials from `--cloudflare-env-file` for readiness booleans but never prints token values and does not mutate Pages. |
| `npm run cloudflare:token-policy` | optional `-- --mode <pages-deploy\|pages-observe\|domain-registrar\|hosted-probe\|all> --account-id <id> --project-name <name> --domain <host> --out <file>` | Builds `enigma.cloudflare_token_policy.v1`: least-privilege Cloudflare dashboard permission names, planned API paths, environment handling rules, mutation boundaries, and verification commands. `all` now includes Pages, Registrar, and Workers Scripts Read/Edit for the optional hosted probe Worker. It is not an API token and never prints token values. |
| `npm run cloudflare:token-request` | required `-- --permission-groups <json> --account-id <id>`, optional `-- --mode <pages-deploy\|pages-observe\|domain-registrar\|hosted-probe\|all> --project-name <name> --domain <host> --token-name <name> --out <file>` | Maps Cloudflare `/user/tokens/permission_groups` or dashboard bookmarklet JSON to `enigma.cloudflare_token_request.v1`: resolved permission group IDs, account-scoped token request body, unresolved permission blockers, and create endpoint paths. It can resolve Workers Scripts permissions for the hosted probe Worker. It never creates or prints a token. |
| `npm run production:handoff` | required `-- --site <dir>`, optional `-- --project-name <name> --domain <host> --live-url <https-url> --expect-title <text> --cloudflare-env-file <path> --infrastructure-readiness <file> --operator-acceptance-packet <file> --release-audit <file> --out <file>` | Builds `enigma.production_handoff_packet.v1` for a follow-on operator or AI: static artifact readiness, Cloudflare Pages deployment blockers, current live-page title observation, infrastructure readiness blocker summary, operator acceptance blocker count, release-audit evidence summary, exact next-action commands, and claim boundaries. `--cloudflare-env-file` may load local Cloudflare credential presence without printing values. `go_live_ready:true` requires accepted current release-audit evidence as well as Pages, hosted readiness, and operator acceptance. It never prints tokens, credentials, local paths, raw memory, or personal contact data. |
| `npm run production:goal-audit` | required `-- --site <dir>`, optional `-- --project-name <name> --domain <host> --live-url <https-url> --expect-title <text> --account-id <id> --cloudflare-env-file <path> --infrastructure-readiness <file> --operator-acceptance-packet <file> --release-audit <file> --worker-inspect <file> --objective <text> --out <file>` | Builds `enigma.goal_completion_audit.v1`: maps the active objective to concrete deliverables, evidence, blockers, next actions, and claim boundaries. It can load local Cloudflare credential presence from `--cloudflare-env-file` without printing values, can suppress the optional standalone Worker-probe action when `--worker-inspect` proves Worker permission is already ready, and intentionally reports `complete:false` until live Cloudflare deployment, hosted backend readiness, operator acceptance, and current release-audit evidence are directly verified. |
| `npm run production:dependencies` | required `-- --goal-audit <goal.json> --release-audit <release.json> --worker-inspect <worker-result.json> --whitepaper <whitepaper-result.json>`, optional `-- --cloudflare-credentials <credentials-result.json> --edge-deploy <edge-backend-deployment.json> --edge-live <edge-backend-bootstrap-live.json> --storage-bootstrap <cloudflare-storage-bootstrap.json> --out <file>` | Builds `enigma.production_dependency_report.v1`: public-safe launch dependency groups, current blocker counts, next commands, and claim boundaries from goal audit, release audit, Worker inspection, whitepaper evidence, optional Cloudflare credential-presence evidence, optional edge-backend deployment evidence, optional edge-backend bootstrap evidence, and optional Cloudflare storage bootstrap evidence. Edge deploy/live/storage bootstrap groups can be ready while `hosted_backend_live` remains blocked; the report exits nonzero while blocked and never creates infrastructure, accounts, or tokens. |
| `npm run production:workplan` | required `-- --dependencies <production-dependencies.json>`, optional `-- --operator-acceptance <result.json> --hosted-ref-catalog <catalog.json> --out <file>` | Builds `enigma.production_workplan.v1`: an ordered public-safe execution plan from current dependency evidence, operator acceptance blockers, and hosted-ref catalog guidance. It groups the remaining launch work into Cloudflare credentials, Worker permission, release gates, hosted backend refs, operator acceptance, and final release verification phases. Hosted-backend details split declared missing ref counts, listed `missing refs.*` keys, endpoint refs such as `relay.ref`/`gateway.ref`, and state blockers so operators can fill evidence without guessing. It exits nonzero while blocked and does not create cloud resources or approvals. |
| `npm run production:status` | required `-- --goal-audit <goal.json> --dependencies <production-dependencies.json> --workplan <production-workplan.json>`, optional `-- --out <file>` | Builds `enigma.production_status_board.v1`: a public-safe launch status board with local package readiness, ready/blocked group counts, ready/blocked workplan phase counts, blocked deliverables, external blocker summaries, next phase, next-phase hosted-ref detail summaries, immediate operator queue, execution-order consistency checks, and input freshness/age/skew checks across goal/dependency/workplan plus nested workplan source timestamps. It exits nonzero while blocked and only summarizes existing evidence; it does not create credentials, deploy infrastructure, approve operators, or certify launch readiness. |
| `npm run production:orchestration` | required `-- --status-board <production-status-board.json>`, optional `-- --out <file>` | Builds `enigma.ai_orchestration_plan.v1`: a public-safe role/wave plan that maps the current launch status into human credential custody, GPT-5.5 architecture, Kimi coding, GPT-5.5 review, and final verification lanes. It carries `next_phase_details` so coding/review lanes can see the full hosted-ref groups without treating them as complete. It is an execution plan only; it does not call external AI systems, create credentials, deploy infrastructure, approve operators, or certify launch readiness. |
| `npm run production:cloudflare-credentials` | optional `-- --cloudflare-env-file <file> --out <file>` | Builds `enigma.cloudflare_credentials_result.v1`: checks only whether `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are present in the current environment or local secret env file. It never prints token values, account ids, or local paths and does not verify permissions or deploy resources. |
| `npm run production:evidence-starter` | required `-- --out-dir <dir>`, optional `-- --domain <host> --project-name <name> --environment <name> --tenant <id>` | Writes a public-safe `enigma.operator_evidence_starter.v1` bundle: string-valued 25-hosted-ref template, hosted-ref catalog, hosted-ref workstream checklist, hosted-backend-live evidence template, acceptance fill plan, infrastructure-readiness manifest template, operator-acceptance packet template, command plan, owner roles, and evidence item list. The hosted refs are derived from the hosted-live validator and include `relay_deployment` and `gateway_deployment`; the collect command writes `hosted-backend-live-collection.json` plus `hosted-backend-live.json`, and the validate command consumes that generated evidence file. The summary redacts the output path and the bundle stays `blocked_until_operator_evidence`; it creates no cloud resources and does not prove hosted readiness. |
| `npm run production:worker-inspect` | required `-- --evidence <worker-inspect.json>`, optional `-- --out <file>` | Validates public-safe `cloudflare:ops workers inspect-probe` JSON. It accepts a redacted 403 / Cloudflare code `10000` diagnostic as evidence with `worker_permission_ready:false`, rejects account-id/token/local-path leaks, and clarifies that Worker service visibility is not hosted relay/gateway readiness. |
| `npm run production:backend-smoke` | optional `-- --host 127.0.0.1` | Runs `enigma.backend_readiness_smoke.v1`: starts relay/gateway HTTP servers on loopback ephemeral ports, probes `/livez` and `/readyz`, verifies fail-closed production defaults, and verifies a fully referenced production fixture reaches ready status. This is local runtime evidence only, not hosted cloud/BYOC proof. |
| `npm run production:whitepaper` | optional `-- --file <whitepaper.md> --out <file>` | Validates the technical whitepaper for required math sections, Mermaid diagrams, evaluation framework, hosted-readiness and provider-claim boundaries, and absence of unsupported absolute market/ROI/compliance/live-readiness claims. Passing this validator proves collateral is claim-bounded; it does not prove market leadership or hosted infrastructure. |
| `npm run production:manifests` | optional `-- --compose <compose.yml> --kubernetes <backend.yaml> --out <file>` | Validates `enigma.production_manifest_result.v1`: production-shaped Compose/Kubernetes backend manifests have fail-closed readiness flags, loopback-only Compose ports, non-root/read-only runtime settings, required secret refs, exact public `/livez`/`/readyz` Kubernetes ingress, private admin ingress, default-deny NetworkPolicy, fail-closed backup placeholder, hosted-readiness refs, and no secret-looking literal values. Passing this validator is static manifest evidence only, not hosted readiness. |
| `npm run production:hosted-live` | required `-- --evidence <hosted-backend-live.json>`, optional `-- --out <file>` | Validates `enigma.hosted_backend_live_evidence.v1`: public HTTPS `/livez` and `/readyz` probe evidence for relay/gateway, all required hosted production refs, operator acceptance `go`, and strict claim boundaries. This validates supplied evidence only; it does not deploy infrastructure or create credentials. |
| `npm run production:hosted-collect` | required `-- --relay-url <https-base> --gateway-url <https-base> --refs-json <refs.json> --domain <domain> --environment-id <id> --cloud-provider <provider> --region <region> --owner <owner> --operator-decision go --operator-packet-ref <ref> --operator-approved-at <iso> --operator-approved-by <name>`, optional `-- --out <collection.json> --evidence-out <evidence.json>` | Collects public HTTPS relay/gateway `/livez` and `/readyz` JSON, hashes each response body, assembles `enigma.hosted_backend_live_evidence.v1`, validates it with `production:hosted-live`, and emits `enigma.hosted_backend_live_collection.v1`. It sends no credentials and does not deploy infrastructure. |
| `npm run production:hosted-probe` | optional `-- --out-dir <dir>` | Builds `enigma.hosted_probe_worker_bundle.v1`: a public-safe Cloudflare Worker `/livez` + fail-closed `/readyz` probe artifact for DNS/TLS edge smoke. It marks `hosted_probe_only:true`, requires 17 `ENIGMA_*_REF` environment values plus operator `go` before `/readyz` returns 200, and never deploys or proves the actual relay/gateway data plane. |
| `npm run production:domain` | required `-- --evidence <domain-tls.json>`, optional `-- --out <file>` | Validates `enigma.domain_tls_evidence.v1` public domain/DNS/TLS evidence: HTTPS URL host, DNS records, TLS certificate refs/expiry/renewal alerts, endpoint status/content type, required security headers, public-site-security reference, and claim boundaries stating this is public endpoint evidence only. |
| `npm run production:threat-model` | required `-- --review <threat-model.json>`, optional `-- --out <file>` | Validates `enigma.security_threat_model_review.v1` coverage for assets, trust boundaries, adversaries/abuse cases, controls, tests, residual risk statuses, required non-claims, source refs, and review cadence. |
| `npm run production:legal` | required `-- --approval <approval.json>`, optional `-- --out <file>` | Validates `enigma.legal_compliance_approval.v1` legal/privacy/marketing review evidence, required no-claim categories, publication controls, and blocks unsupported claims for provider deletion, model forgetting, compliance status, token ROI, guaranteed savings, raw compute superiority, hosted-live readiness, and unsupported superlatives. |
| `npm run memory:benchmark` | optional `-- --out <file>`, `-- --price-per-million-tokens <number>`, `-- --currency <code>` | Emits `enigma.memory_optimization_benchmark.v1` fixture evidence with private candidate text omitted, `content_hash` redacted, and claim boundaries stating the result is a repository fixture estimate rather than provider invoice savings. |
| `npm run proof:packet` | required `-- --active-root <sha256> --receipt-root <sha256> --benchmark-report <file> --dataset-hash <sha256> --runner-hash <sha256> --operator-ref <ref>`, optional `--out <file>` | Secondary helper that emits an `enigma.proof_network.packet.v1` combining an anchor batch and benchmark attestation. It hashes the benchmark report file but never copies the report body/path into the packet, sets `transaction_submitted:false` and `raw_memory_on_chain:false`, and does not call a network, deploy contracts, create accounts, sign transactions, or write raw memory/prompts/transcripts/completions/embeddings/provider responses. |
| `enigma export --bundle <path> --out <file>` | none beyond paths | Writes an exported bundle with encrypted/committed vault state and receipt metadata. |
| `enigma verify --bundle <exported-bundle.json>` | `--file` or `--export` aliases | Prints `enigma.verification_report.v1`. |
| `enigma doctor` | `--client`, connector options | Checks Node version, bins, schemas, MCP command name, and connector state. |
| `enigma install` | `--bundle`, `--client`, `--out`, connector options | Creates bundle if needed and prints MCP config snippets. |
| `enigma meter event` | `--tenant <id>`, `--provider <id>`, `--model <id>`, token-count flags, pricing flags, optional `--out <file>` | Emits `enigma.usage_event.v1` with counts, hashes, pricing inputs, settlement boundary, and no raw prompts/completions/provider responses. |
| `enigma meter aggregate` | `--events <events.json>`, optional `--tenant <id>`, `--out <file>` | Emits `enigma.usage_aggregate.v1` over usage events, with deterministic totals and claim boundaries; not provider invoice or token ROI evidence. |
| `enigma settlement job` | `--tenant <id>`, `--job-type <type>`, `--memory-root <sha256:...>`, `--policy-hash <sha256:...>`, `--usage-event-hash <sha256:...>`, `--max-price-amount <n>`, `--payment-asset <asset>`, `--expires-at <iso>`, optional `--out <file>` | Emits `enigma.permissionless_memory_job.v1` with commitment roots, hashes, max price, and no raw memory. |
| `enigma settlement capacity` | `--operator <id>`, `--accelerator-class <consumer_gpu|workstation_gpu|edge_gpu>`, `--hardware-ref <ref>`, `--region <region>`, `--model-family <family>`, `--model-ref <id[,id]>`, capacity/pricing flags, `--capacity-ref <ref>`, `--terms-ref <ref>`, `--expires-at <iso>`, optional `--out <file>` | Emits `enigma.consumer_gpu_capacity_profile.v1` with public capacity/pricing metadata and no raw memory, decentralization, provider-discount, token-ROI, or provider-invoice claim. |
| `enigma settlement quote` | `--job <job.json>`, `--operator <id>`, `--service-kind <kind>`, `--price-amount <n>`, `--asset <asset>`, `--capacity-ref <ref>` or `--capacity-profile <profile.json>`, `--terms-ref <ref>`, `--expires-at <iso>`, optional `--out <file>` | Emits `enigma.operator_service_quote.v1`; quote asset must match the job, price must not exceed `job.max_price`, and consumer GPU capacity profiles may only back `memory_optimizer` quotes. |
| `enigma settlement receipt` | `--job <job.json>`, `--quote <quote.json>`, `--settled-amount <n>`, `--settlement-ref <ref>`, `--service-receipt-ref <ref>`, optional `--out <file>` | Emits `enigma.service_settlement_receipt.v1` linking job hash, quote hash, usage hash, memory root, policy hash, service receipt, and settlement ref. |
| `enigma settlement verify` | `--job <job.json>`, `--quote <quote.json>`, `--receipt <receipt.json>` | Verifies the settlement receipt references and fail-closed claim boundaries. |
| `enigma settlement batch` | `--receipts <receipts.json>`, `--batch-ref <ref>`, optional `--asset <asset>`, `--out <file>` | Emits `enigma.settlement_batch.v1` over service settlement receipts without investment, provider-invoice, or token-ROI claims. |
| `enigma chain anchor` | `--root <sha256:...>` one or more times or comma-separated, optional `--ref <public-ref>`, `--authority <public-authority-ref>`, `--batch-ref <ref>`, `--out <file>` | Emits `enigma.proof_network.anchor_batch.v1`: a Solana-ready opaque anchor batch with public roots/refs only, `transaction_submitted:false`, and `raw_memory_on_chain:false`. It does not submit a transaction, call Solana RPC, create accounts, or write raw memory on-chain. |
| `enigma chain grant` | `--subject <public-subject-ref>`, `--capability <capability-id>`, `--scope <scope-id>`, optional `--resource-ref <sha256:...>`, `--policy-hash <sha256:...>`, required `--expires-at <iso>`, optional `--grant-ref <public-ref>`, `--out <file>` | Emits `enigma.proof_network.capability_grant.v1` for local authorization planning. Grants must not include tenant names, secret ACL bodies, bearer values, private keys, seed phrases, raw memory, prompts, transcripts, completions, embeddings, or provider responses. |
| `enigma chain revoke` | `--grant-hash <sha256:...>`, `--reason <public-reason-code>`, optional `--revocation-ref <public-ref>`, `--out <file>` | Emits `enigma.proof_network.capability_revocation.v1`, a public-safe revocation/nullifier artifact. It records revocation intent/linkage only and does not mutate a chain or provider system. |
| `enigma chain attest` | `--report-hash <sha256:...>` or `--report-file <report.json>`, required `--dataset-ref <sha256:...>`, `--runner-ref <public-runner-ref>`, `--package-ref <public-package-ref>`, optional repeatable `--score <name=value>`, `--out <file>` | Emits `enigma.proof_network.benchmark_attestation.v1` with report/dataset/runner/package hashes or refs. It omits raw datasets, raw reports, prompts, completions, provider responses, and unsupported benchmark-leadership claims. |
| `enigma chain verify --file <proof-artifact.json>` | proof-network artifact or packet JSON file | Validates supported proof-network artifacts locally and prints verifier JSON for `anchor_batch`, `capability_grant`, `capability_revocation`, `benchmark_attestation`, or `packet` schemas. It does not submit transactions, call Solana RPC, call providers, deploy infrastructure, or certify hosted/BYOC readiness. |
| `enigma native-host manifest` | `--browser` one of `chrome`, `edge`, or `firefox`; `--host-path <absolute path>`; `--extension-id <id>`; optional `--out <file>` | Generates native-host manifest JSON for `com.enigma.native_host` to stdout. With `--out`, it writes the file and reports `{ ok, path }`. It does not copy files into browser profile paths and does not write Windows registry keys. |
| `enigma native-host install-plan` | `--browser` one of `chrome`, `edge`, or `firefox`; `--manifest <absolute path>`; optional `--os <windows|macos|linux>`; optional `--home <absolute path>` | Prints a no-write native-host install plan with `target_manifest_paths`, `manual_steps`, `registry_command_preview`, `firefox_manifest_directory`, and `writes_performed: false`. It validates the target shape but does not create directories, copy profile files, or write registry keys; an operator must execute the shown copy/registration steps. |
| `enigma connect <client>` / `enigma disconnect <client>` | `--bundle`, `--config`, `--server-name`, `--mcp-command`/`--command`, `--dry-run` | Merges or removes the Enigma MCP server entry without making provider-native memory canonical. |
| `enigma mcp serve` | `ENIGMA_BUNDLE` env or tool-level `bundlePath` | Starts the same stdio MCP server as `enigma-mcp`. |
| `enigma boundary run` | `--scenario` (default `committed_crossing`), `--manifest`, `--trace` | Runs local boundary simulation and returns declared classification evidence. |
| `enigma relay demo` / `enigma gateway demo` | none | Runs local demo results only; not hosted availability evidence. |
| `enigma relay serve` / `enigma gateway serve` | `--host`, `--port`, `--once`, optional `--state-file <path>` | Starts local HTTP services on the requested bind address. `--state-file` persists local demo relay/gateway state across restarts without making the service hosted/BYOC production-ready. |
| `enigma mesh demo` / `enigma enterprise demo` | none | Runs local source/package demos for mesh artifacts and enterprise policy decisions. |

Infrastructure readiness script:

```sh
npm run infrastructure:readiness -- --manifest <path>
npm run infrastructure:readiness -- --manifest <path> --live
npm run infrastructure:readiness -- --manifest <path> --live --cloudflare-live off|auto|required
```

- Without `--live`, the script is contract-only verification for an `enigma.infrastructure_readiness_manifest.v1` manifest. It emits `enigma.infrastructure_readiness.v1` JSON with `schema`, `ok`, `generated_at`, `mode`, `credentials_required:false`, `credentials_used`, `readiness.contract_ready`, `readiness.public_live_ready`, `readiness.cloudflare_observed`, `readiness.hosted_live_ready`, `checks`, `external_blockers`, and `claim_boundary`.
- `--live` is public endpoint evidence only. It may observe declared static web/GitHub/Cloudflare Pages URLs; relay/gateway public live evidence must use exact `/readyz` or `/livez` probe paths, not `/health`, `/policy`, admin, or data-plane routes. It does not prove that hosted backend storage, KMS, SIEM, backup/restore, private runtime auth, operator acceptance, or token launch readiness is live.
- Relay and gateway `/readyz` responses include public-safe `evidence_refs` and `missing_evidence_refs` when run in production-like mode. These refs are deployment/storage/KMS/SIEM/backup/auth/operator pointers only; they must not include tokens, private keys, DSNs with embedded credentials, raw memory, prompts, transcripts, or decrypted content.
- `--cloudflare-live off|auto|required` controls optional Cloudflare token/account/static-site observation only. If credentials are used, the declared Pages project/domain must be observed through the account/project API; token-only verification is not project/domain evidence. The command must not print token values or mutate Cloudflare, DNS, Pages, Registrar, KMS, storage, SIEM, backup, or deployment state.
- `readiness.hosted_live_ready` is true only when the manifest contract is complete, all hosted dependency refs required by `npm run production:manifest` are present, requested live checks pass, the operator packet records **go**, and external blockers are empty.

The service endpoint tables below document the existing package/source HTTP API, including `/health`. Production deployment manifests map public probes to `/livez` and `/readyz` as described in [`production-backend-architecture.md`](production-backend-architecture.md); `/health`, policy, SIEM, and relay/gateway data-plane paths are local/demo or private service evidence unless an operator places them behind authenticated internal access. A reachable health or readiness URL is never enough by itself to claim a hosted backend is live.

Importer source names accepted by `enigma import <source>`:

- `chatgpt`, `chatgpt-export`, `chatgpt_export`
- `claude`, `claude-memory`, `claude_memory`
- `mem0`, `mem0-export`, `mem0_export`
- `letta`, `letta-agent`, `letta_agent`, `letta_agent_file`
- `langgraph`, `langgraph-store`, `langgraph_store`
- `zep`, `graphiti`, `zep-graphiti`, `zep_graphiti`, `zep_graphiti_export`

`enigma import <source>` requires `--file`/`--source-file`/`--path` or a positional file, accepts `--out` and `--now`, and writes candidates into a local vault only when `--write-vault --bundle <path>` is supplied.

Capsule commands:

- `enigma capsule export --file <import-report.json> --out <capsule.json>` creates an `enigma.import_capsule.v1` object with public verifier metadata, public artifacts, and payload commitments.
- `enigma capsule import --file <capsule.json> --bundle <bundle>` verifies capsule metadata and may write candidates into a local vault only when `--write-vault` is supplied.

Direct service bins:

- `enigma-verify <exported-bundle.json>` prints an `enigma.verification_report.v1` JSON report and exits `0` when `ok` is true, `1` when verification fails, and `2` on CLI errors.
- `enigma-mcp` starts the MCP server over stdio. Set `ENIGMA_BUNDLE` to the local bundle path or pass `bundlePath` in tool calls.
- `enigma-native-host [--bundle <path>]` starts the Chrome/Edge/Firefox native messaging host over stdio. It is launched by the browser manifest and reads the local bundle from `--bundle` or `ENIGMA_BUNDLE`.
- `enigma-relay [demo|serve] [--host <host>] [--port <port>] [--once] [--state-file <path>]`; default direct-bin command is `serve` when no `demo` or `serve` subcommand is supplied. Default port is `8787`.
- `enigma-gateway [demo|serve] [--host <host>] [--port <port>] [--once] [--state-file <path>]`; default direct-bin command is `serve` when no `demo` or `serve` subcommand is supplied. Default port is `8797`.

Native-host manifest generator:

```sh
enigma native-host manifest --browser chrome --host-path "/absolute/path/to/enigma-native-host" --extension-id "REPLACE_WITH_EXTENSION_ID" --out ./com.enigma.native_host.json
```

- `--browser` selects Chrome, Edge, or Firefox manifest shape.
- `--host-path` must be an absolute executable or wrapper path; browsers do not expand shell aliases, environment variables, or command arguments in the manifest `path`.
- `--extension-id` is the unpacked browser extension ID: Chrome uses `chrome://extensions`, Edge uses `edge://extensions`, and Firefox uses `about:debugging#/runtime/this-firefox`, a stable development `browser_specific_settings.gecko.id`, or the signed add-on ID.
- Without `--out`, the command prints manifest JSON to stdout. With `--out`, it writes the manifest file and reports `{ ok, path }`.
- The command does not install/copy manifests into browser profile locations and does not write Windows registry keys. Install the generated `com.enigma.native_host.json` using `apps/native-host/README.md`; keep `ENIGMA_BUNDLE` configured for the browser-launched host or point the manifest at a wrapper that sets it. Manual fallback templates remain under `apps/native-host/manifests/`.

Native-host install-plan preflight:

```sh
enigma native-host install-plan --browser chrome --manifest "/absolute/path/to/com.enigma.native_host.json"
```

- `--browser` selects the browser registration target to preview.
- `--manifest` must be an absolute path to the generated `com.enigma.native_host.json` that an operator intends to register.
- `--os` and `--home` are optional planning inputs for a target operating system/user home; they do not switch the local machine or write to the target.
- The output includes `manifest_source`, concrete `target_manifest_paths`, human-readable `manual_steps`, Windows Chrome/Edge `registry_command_preview` values when applicable, Firefox manifest directory information, and `writes_performed: false`.
- The command is a planner only. It does not copy manifests into browser locations, write browser profile files, write Windows registry keys, or complete native registration. The user or enterprise operator must execute the displayed copy/registry/profile steps and verify the browser can launch `com.enigma.native_host`.

The native-host bridge stays local and explicit-approval only. Provider-native memory remains cache only; the manifest and host do not prove provider deletion or model forgetting.

## MCP server surface

Transport: stdio JSON-RPC through `enigma-mcp` or `enigma mcp serve`. Protocol version advertised by the server is `2024-11-05`; server info is `enigma-mcp-server` version `0.1.12`.

Supported JSON-RPC methods are `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/templates/list`, `resources/read`, `prompts/list`, and `prompts/get`. Unknown methods return JSON-RPC method-not-found errors; request ids must be strings/numbers/null matching the server's id validation.

Tools from `toolDescriptors` and `handlers`:

| Tool | Required params | Optional params | Returns |
| --- | --- | --- | --- |
| `enigma_init` | none | `bundlePath`, `tenant_id`, `subject_id`, `actor_id`, `policy_id` | Bundle summary with path, schema, counts, and whether it was created. |
| `enigma_remember` | `text` | `bundlePath`, `purpose`, `tags`, `metadata` | `{ ok: true, memory_addr, receipt_id }`. The local vault stores private memory; public receipts must not contain raw memory plaintext. |
| `enigma_search` | none | `bundlePath`, `query`, `memory_addr`, `purpose`, `limit` (`1..50`) | Search results or recalled memory plus retrieval receipts. |
| `enigma_context_pack` | none | `bundlePath`, `query`, `purpose`, `limit` (`1..50`), `memory_addresses` | Context pack with active local memories and retrieval/injection receipt metadata. |
| `enigma_delete` | `memory_addr` | `bundlePath`, `reason` | `{ ok: true, memory_addr, receipt_id }` for Enigma state tombstone only. |
| `enigma_verify_receipts` | none | `bundlePath`, `bundle` | Same verifier report as `verifyBundle`. |
| `enigma_meter_usage` | event mode: `tenant_id`, `provider`, `model`; aggregate mode: `events` | event mode: token/pricing/timestamp fields; aggregate mode: `tenant_id`, `meter_id`, `generated_at` | `enigma.usage_event.v1` or `enigma.usage_aggregate.v1`; never raw prompts/completions/provider responses. |
| `enigma_settlement_job` | `tenant_id`, `job_type`, `memory_commitment_root`, `policy_hash`, `usage_event_hash`, `expires_at`, `max_price_amount` | `requested_at`, `payment_asset` | `enigma.permissionless_memory_job.v1` hash-only job. |
| `enigma_settlement_capacity` | `operator_id`, `accelerator_class`, `hardware_ref`, `region`, `model_family`, `model_refs`, `expires_at`, capacity/pricing fields, `capacity_ref`, `terms_ref` | `observed_at`, `asset` | `enigma.consumer_gpu_capacity_profile.v1` with public capacity/pricing metadata and explicit no-raw-memory/no-decentralization/no-provider-discount boundary. |
| `enigma_settlement_quote` | `job`, `operator_id`, `service_kind`, `expires_at`, `price_amount`, `terms_ref`; plus `capacity_ref` or `capacity_profile` | `quoted_at`, `asset` | `enigma.operator_service_quote.v1`; price must not exceed job max price; consumer GPU capacity profiles only back `memory_optimizer` quotes. |
| `enigma_settlement_receipt` | `job`, `quote`, `settled_amount`, `settlement_ref`, `service_receipt_ref` | `completed_at` | `enigma.service_settlement_receipt.v1` linking job/quote/usage/memory/policy refs. |
| `enigma_settlement_verify` | `job`, `quote`, `receipt` | none | Verification result; `tools/call` marks it as error when invalid. |
| `enigma_settlement_batch` | `receipts`, `batch_ref` | `asset`, `generated_at` | `enigma.settlement_batch.v1`; no investment, token ROI, or provider-invoice claim. |

Resources:

| URI | Name | MIME | Boundary |
| --- | --- | --- | --- |
| `enigma://passport/summary` | `Enigma Passport Summary` | `application/json` | MCP-safe passport and vault metadata. Raw memory plaintext is never exposed. |

Prompts:

| Prompt | Arguments | Purpose |
| --- | --- | --- |
| `enigma_standard_memory_prompt` | `question`, `purpose` | Instructs an assistant to use Enigma as canonical memory/proof state and treat provider-native memory as cache only. |

Programmatic MCP helpers are available from `enigma-memory/mcp-server`: `handleJsonRpcRequest(request)` and `startStdioServer(io)`.

## Relay HTTP API

Module: `enigma-memory/relay`. Local bin: `enigma-relay serve --host 127.0.0.1 --port 8787`.

Programmatic relay API: `createRelayState(options)` creates relay state; `createRelayServer(options)` returns a Node HTTP server with `server.relayState`; `handleRelayRequest(state, req, res)` handles one Node HTTP request; `serializeRelayState(state)` and `hydrateRelayState(snapshot)` convert local state-file snapshots; `loadRelayStateFromFile(path)` and `saveRelayStateToFile(state, path)` load/save the optional file-backed demo state; `runRelayDemo(options)` returns a local demo result.

Status boundaries:

- **Stable local/package:** local relay server, demo, and module handlers. Without `--state-file`, service state is in-memory. With `--state-file <path>`, relay state is local file-backed demo state.
- **Hosted/BYOC:** same endpoints when deployed with real TLS, production durable storage, secrets/KMS, monitoring, backups, incident response, and tenant policy. Package install or local `--state-file` alone is not hosted availability.
- Relay accepts opaque encrypted records and root/checkpoint metadata. It rejects plaintext-looking memory fields such as memory bodies, prompts, transcripts, or raw conversation content.

Endpoints:

| Method/path | Auth | Request | Response |
| --- | --- | --- | --- |
| `GET /health` | none | none | `{ ok: true, health }` where `health` includes service schema, node id, store id, record count, witness checkpoint count, and pairing count. |
| `POST /pairing/challenge` | none | JSON with `client_public_key` or `clientPublicKey`/`public_key` | `{ ok: true, challenge }`; challenge schema is `enigma.pairing_challenge.v1`. |
| `POST /pairing/complete` | none | `challenge_id`, client public key, and `client_signature`/`clientSignature`/`signature` over the challenge | `{ ok: true, pairing }`; pairing schema is `enigma.pairing_completion.v1`. |
| `POST /relay/push` | paired client signature unless server state explicitly sets `allowUnauthenticated` for local demos | Relay record object or `{ record }` envelope. Allowed fields include `capsule_id`, `encrypted_payload_hash`, `opaque_encrypted_record`, `received_at`, `expires_at`, and id aliases. | `201 { ok: true, record, authorization }`; record schema is `enigma.relay_record.v1`. |
| `GET /relay/pull?id=<record_id>` | paired client signature unless local demo auth is enabled | Query string `id` | `{ ok: true, record, authorization }`, `404` when missing. |
| `POST /witness/checkpoint` | paired client signature unless local demo auth is enabled | Witness checkpoint roots/metadata object or `{ checkpoint }` envelope; accepted root fields include `checkpoint_root`, `receipt_log_root`, `active_set_root`, `previous_witness_hash`, and camelCase aliases. | `201 { ok: true, checkpoint, verification, authorization }`; checkpoint schema is `enigma.witness_checkpoint.v1`. |
| `GET /witness/log` | none | none | `{ ok: true, checkpoints }`. |

Authenticated relay clients sign this authorization payload with their paired key: `{ schema: 'enigma.relay_client_authorization.v1', relay_node_id, pairing_id, operation, request_hash }`, then send headers `x-enigma-pairing-id` and `x-enigma-client-signature`.


Relay `--state-file` persistence stores only local demo state needed to resume relay operation, such as relay node signing/trust metadata, store metadata, hash-only/opaque relay records, witness checkpoints, completed pairings, authorization mode, and generation metadata. Treat relay signing material as a local demo secret. It does not store raw memory plaintext, prompts, transcripts, decrypted capsules, raw request bodies, or pending pairing challenges. Unknown, malformed, or plaintext-looking snapshots fail closed.

## Gateway HTTP API

Module: `enigma-memory/gateway`. Local bin: `enigma-gateway serve --host 127.0.0.1 --port 8797`.

Programmatic gateway API: `createGatewayState(options)` creates gateway policy/SIEM state; `createGatewayServer(options)` returns a Node HTTP server with `server.gatewayState`; `handleGatewayRequest(state, request, response?)` handles one Node HTTP request or returns a response object; `serializeGatewayState(state)` and `hydrateGatewayState(snapshot, options?)` convert local state-file snapshots; `loadGatewayStateFromFile(path, options?)` and `saveGatewayStateToFile(state, path)` load/save the optional file-backed demo state; `runGatewayDemo()` returns a local demo result.

Status boundaries:

- **Stable local/package:** local gateway server, demo, and module handlers. Without `--state-file`, service state is in-memory. With `--state-file <path>`, gateway policy/SIEM state is local file-backed demo state.
- **Hosted/BYOC:** same endpoints when deployed with production credentials, TLS, production durable policy/storage, KMS/secrets, monitoring, backups, and SIEM/log routing. Local `--state-file` is not production database readiness.
- Gateway evaluates Enigma enterprise policy and emits plaintext-minimized decisions/SIEM events. It does not call model providers and does not prove provider deletion or model forgetting.

Endpoints:

| Method/path | Request | Response |
| --- | --- | --- |
| `GET /health` | none | `{ ok: true, service: 'enigma-gateway', gateway_id, policy_id, policy_hash }`. |
| `GET /policy` | Production-like mode requires `Authorization: Bearer <admin-token>` matching `ENIGMA_GATEWAY_ADMIN_AUTH_BEARER_SHA256`; local/demo mode remains unauthenticated. | `{ ok: true, policy, internal }`; minimized policy by default, internal policy only when state opts into internal exposure. |
| `PUT /policy` | Same admin bearer requirement in production-like mode, plus policy object or `{ policy }`. | `{ ok: true, policy, policy_hash, internal }` or `400 { ok: false, error: { code: 'POLICY_INVALID', reason_codes } }`; unauthenticated production calls return `401`, mismatches return `403`, missing hash config returns `503`. |
| `POST /gateway/evaluate` | Production-like mode requires `Authorization: Bearer <data-plane-token>` matching `ENIGMA_GATEWAY_DATA_PLANE_AUTH_BEARER_SHA256`, plus `enigma.gateway_request.v1` fields: `operation`, `provider`, `model`, `region`, `purpose`, `sensitivity`, optional `memory_addr`, `memory_id`, `subject_id`, `legal_hold_delete`. | `{ ok: true, evaluation, siem_event }`; evaluation is minimized unless internal exposure is enabled. |
| `POST /gateway/decision` | Same data-plane bearer requirement and request body as `/gateway/evaluate`. | `{ ok: true, evaluation, decision, verification, siem_event }`; decision schema is `enigma.gateway_decision.v1`. |
| `GET /siem/export` | Same admin bearer requirement in production-like mode. | `{ ok: true, schema: 'enigma.gateway_siem_export.v1', gateway_id, event_count, events }`. |

Gateway requests must identify memory by committed address/id and metadata, not raw memory plaintext. `enigma.gateway_request.v1` explicitly excludes plaintext-like fields such as `memory`, `memory_text`, `memory_plaintext`, `plaintext`, `raw_memory`, `content`, and `value`.

Production gateway bearer values are never stored in readiness JSON or manifests. Operators configure only SHA-256 digests (`ENIGMA_GATEWAY_ADMIN_AUTH_BEARER_SHA256`, `ENIGMA_GATEWAY_DATA_PLANE_AUTH_BEARER_SHA256`) and keep the bearer tokens in their secret manager or private ingress layer.

Gateway `--state-file` persistence stores only local demo state needed to resume gateway operation, such as `gateway_id`, `active_root`, active enterprise policy, demo Ed25519 public/private signing key material, plaintext-minimized `siem_events`, `expose_internal`, schema/version, and generation metadata. Treat gateway private signing material as a local demo secret. It does not store raw memory plaintext, prompts, completions, transcripts, provider response bodies, decrypted capsules, embeddings, tenant secrets, KMS material, or hidden-provider-state claims. Unknown, malformed, or plaintext-looking snapshots fail closed; `allowDemoReset` is the explicit demo reset option for helper callers.

## Connector profiles

Module: `enigma-memory/connectors`. CLI: `enigma install`, `enigma doctor`, `enigma connect <client>`, `enigma disconnect <client>`.

Connector profiles render JSON under `mcpServers`, use server name `enigma`, command `enigma-mcp`, and require env key `ENIGMA_BUNDLE`.

| Client id | Display name | Default config paths |
| --- | --- | --- |
| `claude-desktop` | Claude Desktop | Windows `%APPDATA%\\Claude\\claude_desktop_config.json`; macOS `$HOME/Library/Application Support/Claude/claude_desktop_config.json`; Linux `$HOME/.config/Claude/claude_desktop_config.json`. |
| `cursor` | Cursor | Windows `%USERPROFILE%\\.cursor\\mcp.json`; macOS/Linux `$HOME/.cursor/mcp.json`. |
| `kimi-code` | Kimi Code | Windows `%APPDATA%\\Kimi Code\\mcp.json`; macOS `$HOME/Library/Application Support/Kimi Code/mcp.json`; Linux `$HOME/.config/kimi-code/mcp.json`. |
| `vscode-cline` | VS Code Cline | Windows `%APPDATA%\\Code\\User\\globalStorage\\saoudrizwan.claude-dev\\settings\\cline_mcp_settings.json`; macOS `$HOME/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`; Linux `$HOME/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`. |
| `roo` | Roo Code | Windows `%APPDATA%\\Code\\User\\globalStorage\\rooveterinaryinc.roo-cline\\settings\\mcp_settings.json`; macOS `$HOME/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`; Linux `$HOME/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`. |
| `opencode` | OpenCode | Windows `%APPDATA%\\opencode\\opencode.json`; macOS `$HOME/Library/Application Support/opencode/opencode.json`; Linux `$HOME/.config/opencode/opencode.json`. |
| `generic-mcp` | Generic MCP Client | Windows `%APPDATA%\\Enigma\\mcp.json`; macOS `$HOME/Library/Application Support/Enigma/mcp.json`; Linux `$HOME/.config/enigma/mcp.json`. |

`connectClient` and `disconnectClient` preserve unrelated JSON settings and sibling MCP servers. Existing configs are backed up only when a changed write is needed. Connector setup does not delete provider-native memory or make provider-native memory canonical.

## Importer and capsule API

Module: `enigma-memory/importers`. These functions normalize local export files or parsed JSON; they do not call provider services.

| Function | Source type | CLI sources | Output |
| --- | --- | --- | --- |
| `importChatGptExport(input, options)` | `chatgpt_export` | `chatgpt`, `chatgpt-export`, `chatgpt_export` | `enigma.import_report.v1` with source refs, limitations, confidence, completeness flags, candidates, and optional vault writes. |
| `importClaudeMemory(input, options)` | `claude_memory` | `claude`, `claude-memory`, `claude_memory` | Same import report shape. |
| `importMem0Export(input, options)` | `mem0_export` | `mem0`, `mem0-export`, `mem0_export` | Same import report shape. |
| `importLettaAgentFile(input, options)` | `letta_agent_file` | `letta`, `letta-agent`, `letta_agent`, `letta_agent_file` | Same import report shape. |
| `importLangGraphStore(input, options)` | `langgraph_store` | `langgraph`, `langgraph-store`, `langgraph_store` | Same import report shape. |
| `importZepGraphitiExport(input, options)` | `zep_graphiti_export` | `zep`, `graphiti`, `zep-graphiti`, `zep_graphiti`, `zep_graphiti_export` | Same import report shape. |
| `exportEnigmaCapsule(args)` | Enigma import reports/candidates | `enigma capsule export` | `enigma.import_capsule.v1` with public artifacts and verifier metadata. |
| `importEnigmaCapsule(capsule, options)` | Enigma import capsule | `enigma capsule import` | Verification/import result, with vault writes only when a vault is supplied. |
| `runImporterDemo(options)` | local demo | module demo | Demo result for local review only. |

Completeness is claimed only when the source explicitly asserts it and the importer preserves that evidence. A source export becomes canonical Enigma memory only after a candidate is written through a local vault and receives Enigma receipts. Public capsule verifier metadata contains hashes, roots, counts, report hashes, limitation roots, completeness summary, and trust descriptor; it must not expose raw memory plaintext.

## Verifier outputs

Verifier APIs:

- CLI: `enigma verify --bundle <exported-bundle.json>` or `enigma-verify <exported-bundle.json>`.
- Module from verifier bin source: `verifyBundle(bundle)`, `readBundle(path)`, `main(argv, io)`.
- MCP: `enigma_verify_receipts` calls the same verifier.

`verifyBundle(bundle)` returns:

```json
{
  "ok": true,
  "schema": "enigma.verification_report.v1",
  "checked_at": "<ISO timestamp>",
  "receipt_count": 0,
  "checkpoint_count": 0,
  "errors": []
}
```

Error entries use `{ code, message, details? }`. Known verifier error codes include `BUNDLE_INVALID`, `RECEIPTS_MISSING`, `PUBLIC_KEY_MISSING`, `RECEIPT_CHAIN_INVALID`, `RECEIPT_INVALID`, `CHECKPOINT_INVALID`, `STALE_CHECKPOINT`, `COMMITTED_ROOT_MISMATCH`, `COMMITTED_SEQUENCE_MISMATCH`, and `VERIFY_CLI_ERROR`.

Verifier success means the supplied Enigma bundle's receipts/checkpoints and committed roots verify against included or supplied Enigma public keys. It does not prove the truth of a memory statement, provider deletion, or model forgetting.

## Schemas

Schemas are package-included under `specs/` and are reviewable from a source checkout.

| File | `$id` | Primary `schema` const / surface |
| --- | --- | --- |
| `specs/receipt-v1.schema.json` | `https://schemas.enigma.ai/receipt-v1.schema.json` | `enigma.receipt.v1`; receipt lifecycle events. |
| `specs/memory-event-v1.schema.json` | `https://schemas.enigma.ai/memory-event-v1.schema.json` | `enigma.memory_event.v1`; vault event metadata. |
| `specs/passport-v1.schema.json` | `https://schemas.enigma.ai/passport-v1.schema.json` | `enigma.passport.v1`; passport/vault roots. |
| `specs/state-checkpoint-v1.schema.json` | `https://schemas.enigma.ai/state-checkpoint-v1.schema.json` | `enigma.state_checkpoint.v1`; signed state checkpoints. |
| `specs/boundary-manifest-v1.schema.json` | `https://schemas.enigma.ai/boundary-manifest-v1.schema.json` | `enigma.boundary_manifest.v1`; declared boundary paths and classifications. |
| `specs/claim-boundary-manifest-v1.schema.json` | `https://schemas.enigma.ai/claim-boundary-manifest-v1.schema.json` | `enigma.claim_boundary_manifest.v1`; public claim scope and non-claims. |
| `specs/deletion-tombstone-v1.schema.json` | `https://schemas.enigma.ai/deletion-tombstone-v1.schema.json` | `enigma.deletion_tombstone.v1`; Enigma tombstone evidence and explicit non-proofs. |
| `specs/import-report-v1.schema.json` | `https://schemas.enigma.ai/import-report-v1.schema.json` | `enigma.import_report.v1`; importer report with limitations/completeness. |
| `specs/capsule-v1.schema.json` | `https://schemas.enigma.ai/capsule-v1.schema.json` | `enigma.capsule.v1`; generic capsule schema. Importer code currently emits `enigma.import_capsule.v1` capsules with verifier metadata. |
| `specs/trust-bundle-v1.schema.json` | `https://schemas.enigma.ai/trust-bundle-v1.schema.json` | `enigma.trust_bundle.v1`; trusted issuers/witnesses and import capsule policy. |
| `specs/relay-record-v1.schema.json` | `https://schemas.enigma.ai/relay-record-v1.schema.json` | `enigma.relay_record.v1`; opaque encrypted relay record. |
| `specs/connector-profile-v1.schema.json` | `https://schemas.enigma.ai/connector-profile-v1.schema.json` | `enigma.connector_profile.v1`; connector profile metadata. |
| `specs/gateway-request-v1.schema.json` | `https://schemas.enigma.ai/gateway-request-v1.schema.json` | `enigma.gateway_request.v1`; plaintext-free gateway request. |
| `specs/mesh-node-v1.schema.json` | `https://schemas.enigma.ai/mesh-node-v1.schema.json` | `enigma.mesh_node.v1`, `enigma.capsule_manifest.v1`, `enigma.witness_checkpoint.v1`, `enigma.relay_record.v1`, `enigma.federation_grant.v1`; mesh artifacts. |
| `specs/enterprise-policy-v1.schema.json` | `https://schemas.enigma.ai/enterprise-policy-v1.schema.json` | `enigma.enterprise_policy.v1`; default-deny hosted/BYOC/on-prem policy with `provider_native_memory: "cache_only"`. |
| `specs/proof-network-anchor-batch-v1.schema.json` | `https://schemas.enigma.ai/proof-network-anchor-batch-v1.schema.json` | `enigma.proof_network.anchor_batch.v1`; public-safe Solana-ready roots/refs anchor batch with no transaction submission. |
| `specs/proof-network-capability-grant-v1.schema.json` | `https://schemas.enigma.ai/proof-network-capability-grant-v1.schema.json` | `enigma.proof_network.capability_grant.v1`; scoped capability grant with opaque refs only. |
| `specs/proof-network-capability-revocation-v1.schema.json` | `https://schemas.enigma.ai/proof-network-capability-revocation-v1.schema.json` | `enigma.proof_network.capability_revocation.v1`; grant revocation/nullifier artifact. |
| `specs/proof-network-benchmark-attestation-v1.schema.json` | `https://schemas.enigma.ai/proof-network-benchmark-attestation-v1.schema.json` | `enigma.proof_network.benchmark_attestation.v1`; report/dataset/runner/package hash/ref attestation. |
| `specs/proof-network-packet-v1.schema.json` | `https://schemas.enigma.ai/proof-network-packet-v1.schema.json` | `enigma.proof_network.packet.v1`; local proof-network packet/verifier envelope. |

Infrastructure readiness output schemas:

| Schema name | Surface | Boundary |
| --- | --- | --- |
| `enigma.infrastructure_readiness_manifest.v1` | Deployment/readiness manifest supplied to `npm run infrastructure:readiness -- --manifest <path>` | Declares intended endpoints, Cloudflare observation mode, operator-packet status, deployment manifest refs, and external blockers. It is not proof that the backend is live. |
| `enigma.infrastructure_readiness.v1` | Readiness JSON emitted by the script | Contract-only unless `--live` is used; even with `--live`, it is public endpoint observation plus declared operator evidence, not live KMS/storage/SIEM/backup/operator/token readiness by itself. |

## Demo/source-only surfaces

These are public review surfaces in the source checkout, not hosted production interfaces by themselves:

- `docs/`, including this file, install guide, deployment runbook, release checklist, and release evidence.
- `Dockerfile` and `docker-compose.yml` local relay/gateway demos.
- Generated static public-site artifacts can be checked before Cloudflare handoff with `python scripts/preflight_public_site.py --site _public_site` from the public-site package/artifact root. The public-site preflight is credential-free and local-only: it reports checked items/counts, warnings, and blockers without deploying, changing DNS/TLS, mutating cache state, or proving live availability.
- `apps/browser-extension` unpacked Manifest V3 scaffold and native messaging host name `com.enigma.native_host`. Generate a browser-specific native-host manifest with `enigma native-host manifest --browser <chrome|edge|firefox> --host-path <absolute path> --extension-id <id> [--out <file>]`, then preview the no-write registration plan with `enigma native-host install-plan --browser <chrome|edge|firefox> --manifest <absolute path> [--os <windows|macos|linux>] [--home <absolute path>]`. Install/copy the generated `com.enigma.native_host.json` into the browser/OS native-host location documented in `apps/native-host/README.md` only after an operator reviews the plan.
  Source-only bridge module exports in `apps/browser-extension/src/native-bridge.js` are `SUPPORTED_PROVIDERS`, `detectProviderFromUrl(url)`, `requestContextPack(input)`, `recordInsertionReceipt(input)`, and `serializeError(error)`. Supported provider ids are `chatgpt`, `claude`, `kimi`, and `perplexity`. The extension requires explicit user action before requesting or inserting context and must not store raw memory in browser sync storage.
- Module demo helpers: `runConnectorDemo`, `runImporterDemo`, `runMeshDemo`, `runEnterpriseDemo`, `runRelayDemo`, `runGatewayDemo`, and `runBoundarySimulation`.
- `apps/desktop/src/index.html` static desktop scaffold; package export `enigma-memory/desktop` exposes its state/model API, but UI state remains operational evidence only.

## Local file-backed state boundary

`--state-file <path>` is a practical local durability option for relay/gateway source or package demos. Use separate files for relay and gateway, keep them outside the repository, restrict permissions to the local user/service account, and encrypt any backup because snapshots can contain local demo signing key material. A state file can help a reviewer restart a laptop demo without losing relay records, pairings, witness checkpoints, gateway policy, or minimized SIEM evidence.

It is not a production storage API. It has no hosted durability SLA, multi-writer coordination, online migration contract, database isolation, KMS-backed secret custody, cross-region replication, tenant backup policy, legal hold workflow, monitoring, or disaster-recovery proof. Hosted and BYOC deployments still require real durable storage plus KMS/secrets and completed operator acceptance.

## Hosted/BYOC deployment boundary

Hosted and BYOC deployments may expose the relay and gateway HTTP APIs above, but only after infrastructure acceptance is complete:

- Hosted: Enigma operator owns deployment credentials, domain/TLS, durable storage, KMS/secrets, monitoring, backups, incident response, tenant policy lifecycle, and SIEM/log routing.
- BYOC: the customer runs relay/gateway in its own cloud, VPC, cluster, or private network and controls deployment credentials, KMS/secrets, network policy, logs, data residency, backups, and incident response.

Until those prerequisites exist and are reviewed, public docs should describe `enigma-relay`, `enigma-gateway`, Docker, and HTTP routes as local/package/source demos or deployment-ready interfaces, not as live hosted service evidence.
