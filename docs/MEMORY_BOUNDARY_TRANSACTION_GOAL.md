# Memory Boundary Transaction System goal

## Definition

Enigma is a Memory Boundary Transaction System: it records and verifies Enigma-controlled memory boundary state transitions without publishing raw memory or claiming control over external providers, models, legal outcomes, or hosted production systems.

A boundary transaction is valid only when it can be represented as public-safe metadata: hashes, Merkle roots, opaque refs, counts, schema IDs, timestamps, signer refs, signatures or signature refs, status bits, booleans, nullifiers, policy IDs, and capability IDs.

## Claim boundary

### Allowed claims

Enigma artifacts may claim only:

- local Enigma vault state transitions;
- receipt chain roots;
- active, quarantine, and tombstone roots;
- context passport selected, omitted, and tombstone roots;
- capability grants and revocations checked by Enigma-aware components;
- offline verifier output;
- public release and evidence metadata.

### Prohibited claims

Enigma artifacts and release copy must not claim:

- provider deletion;
- model forgetting;
- provider-native memory control;
- compliance certification;
- benchmark superiority;
- hosted SaaS or BYOC readiness without live evidence;
- patentability or legal conclusions;
- raw embeddings are safe public metadata;
- hardware tamper-proofing.

## Implementation phases

| Phase | Deliverable | Acceptance |
| --- | --- | --- |
| 1. Contract surface | Public goal artifact and claim ledger schema. | The schema uses `enigma.claim_ledger.v1`, rejects extra top-level properties, requires `evidence_refs`, and has no raw-evidence field. |
| 2. Boundary primitives | Offline contracts for vault transitions, receipt roots, context passport roots, grants, revocations, and verifier output. | Every public artifact contains only the public-safe grammar and explicit `public_payload_only:true` / `private_payload_detected:false` flags. |
| 3. Release evidence | Release metadata binds package refs, schema refs, reviewer refs, and claim status. | Claims cannot move to public release without required evidence refs, review due/expiry fields, and claim-boundary status. |
| 4. Publishing hardening | Tokenless npm publishing is the only acceptable public release path. | Any long-lived npm publishing credential blocks release until removed and replaced by trusted publishing evidence. |

## Public-safe artifact grammar

Public artifacts may contain only:

- hashes and Merkle roots;
- opaque artifact, release, reviewer, signer, signature, policy, capability, and nullifier refs;
- counts and status bits;
- schema IDs and policy IDs;
- timestamps and expiry/review timestamps;
- booleans that state safety posture, such as `public_payload_only:true` and `private_payload_detected:false`.

Public artifacts must never contain raw memory, prompts, transcripts, completions, embeddings, provider responses, tenant names, private ACL bodies, private policies, local absolute paths, private keys, tokens, seed phrases, credentials, or customer identifiers.

## Claim ledger requirement

Every ledger must have ledger-level `evidence_refs`, and every release-bound claim must have a claim-ledger entry with:

- `claim_status`: `allowed`, `conditional`, or `prohibited`;
- `boundary`: the exact Enigma-controlled boundary or prohibited boundary category;
- `evidence_requirements`: the evidence types required before publication;
- entry-level `evidence_refs`: public-safe refs only, never raw evidence;
- `release_status`: draft, blocked, approved, published, expired, or withdrawn;
- review owner/ref, review due timestamp, and expiry timestamp;
- public-safety flags proving raw/private payloads were absent from the ledger artifact.

## Release blocker

A release is blocked if any long-lived npm publishing credential is present, used, documented as an active fallback, or required by the release path. Public npm release evidence must use tokenless trusted publishing or an equivalent reviewed OIDC-based flow. The blocker is not satisfied by redacting a token in docs; the credential-dependent path must be removed from the release process.

## Done when

- The claim ledger schema is checked into `specs/claim-ledger-v1.schema.json`.
- Public claim-boundary docs link to this goal and the schema without duplicating the full contract.
- Release-bound claims are expressible as ledger entries using only public-safe refs.
- Long-lived publishing credentials fail the release gate instead of becoming documented operator procedure.

## 2026-06-27 implementation status

Implemented in the package:

- tokenless npm trusted-publishing workflow and runbook path;
- `enigma.claim_ledger.v1` plus public-safe memory atom, lifecycle log, context passport, proof-of-non-use, immune, quarantine, trust-card, and evidence-packet schemas;
- core public-safe hash, Merkle proof, nullifier, and public artifact verification helpers;
- vault lifecycle root summaries, memory-boundary transaction summaries, and public lifecycle receipt logs;
- context passport and proof-of-non-use builders/verifiers;
- importer and MCP immune-ingress quarantine reports;
- `enigma start` quickstart alias;
- `enigma context --proof` public context passport / non-use proof surface;
- connector trust-card builders.

Verification recorded for this slice:

- `node --test test/enigma-memory-boundary-core.test.mjs test/enigma-memory-boundary-vault.test.mjs test/enigma-context-passport.test.mjs test/enigma-immune-ingress.test.mjs test/enigma-memory-boundary-schemas.test.mjs test/enigma-connector-trust-card.test.mjs test/enigma-context-proof-cli.test.mjs test/enigma-onboarding.test.mjs`
- `npm run check`
- `npm test`
- `npm run secret-scan`
- `npm pack --dry-run`

## General public launch handoff

The consumer launch goal is a signed desktop app and one-click setup flow that uses this memory-boundary transaction layer without exposing technical setup in the default path. See `docs/GENERAL_PUBLIC_LAUNCH_GOAL.md` and `docs/GENERAL_PUBLIC_LAUNCH_WORKPLAN.md`.
