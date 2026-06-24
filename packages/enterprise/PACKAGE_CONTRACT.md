# Enterprise package contract

This package implements Enigma's hosted/BYOC enterprise policy gateway primitives.

Required named exports:

- `createEnterprisePolicy(options)`
- `evaluateEnterprisePolicy(policy, request)`
- `createGatewayDecision(options)`
- `verifyGatewayDecision(options)`
- `exportSiemEvent(options)`
- `runEnterpriseDemo(options)`

Invariants:

- Unknown provider, model, region, purpose, sensitivity, or enterprise policy shape fails closed.
- Policy evaluation returns `allowed`, `decision`, and stable `reason_codes` including `ALLOW`, `PROVIDER_UNKNOWN`, `PROVIDER_DENIED`, `MODEL_UNKNOWN`, `MODEL_DENIED`, `REGION_UNKNOWN`, `REGION_DENIED`, `PURPOSE_UNKNOWN`, `PURPOSE_DENIED`, `SENSITIVITY_UNKNOWN`, `SENSITIVITY_DENIED`, and `LEGAL_HOLD_DELETE_DENIED`.
- Legal holds block delete operations for matching memory addresses, memory ids, or subject ids.
- Gateway decisions are Ed25519-signed and bind the policy hash, memory address commitment, operation, provider/model/region/purpose, active root, and BYOK/KMS key evidence hash.
- Gateway verification checks both signature validity and policy-hash equality.
- SIEM exports are plaintext-minimized: provider, model, region, purpose, sensitivity, memory address, and key evidence are represented as hashes/ids/reason codes only.
- Provider-native memory is cache only; canonical durable state remains Enigma-owned and receipt/proof-backed.
