# `@enigma-ai/enigma/settlement`

Permissionless access and service-settlement protocol for Enigma memory jobs.

## Contract

- Produces content-minimized job, consumer-GPU capacity, quote, settlement receipt, and batch artifacts:
  - `enigma.permissionless_memory_job.v1`
  - `enigma.consumer_gpu_capacity_profile.v1`
  - `enigma.operator_service_quote.v1`
  - `enigma.service_settlement_receipt.v1`
  - `enigma.settlement_batch.v1`
- Accepts opaque memory commitment roots, policy hashes, usage-event hashes, consumer/workstation GPU capacity refs, service refs, prices, and settlement refs.
- Keeps raw memory, prompts, completions, transcripts, provider responses, credentials, private keys, and seed phrases out of artifacts.
- Uses permissionless rails only for access submission, consumer/workstation GPU capacity discovery, service accountability, and settlement. It does not decentralize raw-memory inference or claim token ROI/profit/equity/provider-wide discounts.

## Public API

- `createPermissionlessMemoryJob(options)`
- `createConsumerGpuCapacityProfile(options)`
- `createOperatorServiceQuote(options)`
- `createServiceSettlementReceipt(options)`
- `verifyServiceSettlementReceipt(options)`
- `createSettlementBatch(options)`

## Evidence boundary

Settlement receipts prove Enigma-side job/quote/settlement linkage under supplied hashes and refs. Consumer GPU capacity profiles prove only declared capacity/pricing metadata boundaries, not realized provider discount or decentralization. These artifacts are not investment, profit, yield, equity, provider invoice, provider deletion, model forgetting, or compliance-certification evidence.
