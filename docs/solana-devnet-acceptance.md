# Solana devnet acceptance gates

This document defines the minimum acceptance criteria before Enigma makes any public devnet or mainnet Solana claim.

Enigma is the private memory controller for AI. Solana is an optional proof, permission, and settlement rail that may carry public-safe hashes, Merkle roots, opaque refs, counts, signatures, slots, transaction signatures, public keys, and nullifiers. Solana must never receive raw memory, prompts, transcripts, completions, embeddings, tenant names, ACL bodies, provider responses, API keys, private keys, seed phrases, private policy text, or private customer identifiers.

Until every applicable gate below is complete and approved, public language must stay at the local-planning boundary: Enigma can prepare and validate Solana-ready public-safe artifacts; it must not claim that transactions were submitted, finalized, settled, deployed, audited, certified, or live.

## CLI submission path

`enigma chain submit-solana` is the production-safe handoff from a local proof-network artifact to the optional Solana proof rail. It validates the artifact with the same proof-network validators used by `enigma chain verify`, rejects private payload markers before transaction construction, and binds the artifact to a compact Memo-program reference containing only:

- the proof artifact schema;
- the artifact hash;
- the selected cluster;
- an Enigma proof commitment over those public values.

Dry-run is the default and does not require a network, keypair, or `@solana/web3.js`:

```sh
enigma chain submit-solana \
  --file ./proof-artifacts/anchor-batch.json \
  --cluster devnet
```

Dry-run output includes `transaction_submitted:false`, `raw_memory_on_chain:false`, the compact `memo_ref`, and a `would_submit` plan. It must not print the raw artifact body, raw memory, prompts, transcripts, provider responses, private keys, keypair bytes, or local absolute paths. Passing `--rpc` or `--keypair` during dry-run is accepted for command rehearsal, but those values are not required and are not echoed:

```sh
enigma chain submit-solana \
  --file ./proof-artifacts/benchmark-attestation.json \
  --cluster devnet \
  --rpc https://api.devnet.solana.com \
  --keypair ./operator-devnet-keypair.json
```

Network submission is opt-in only. Execute mode requires an explicit Solana cluster and keypair, lazily loads `@solana/web3.js`, and submits one Memo-program transaction containing only the compact `memo_ref` JSON:

```sh
enigma chain submit-solana \
  --file ./proof-artifacts/anchor-batch.json \
  --cluster devnet \
  --rpc https://api.devnet.solana.com \
  --keypair ./operator-devnet-keypair.json \
  --execute
```

Successful execute output may report `transaction_submitted:true` and a Solana transaction signature. That signature is evidence for only the selected cluster and artifact hash; it is not a mainnet claim, hosted-SaaS claim, compliance claim, provider-deletion claim, model-forgetting claim, benchmark-superiority claim, or customer-production claim.

Limitations:

- Only `devnet`, `testnet`, `mainnet-beta`, and `localnet` are accepted cluster values.
- The submitted instruction is a Solana Memo transaction, not an Enigma on-chain program deployment or account-state mutation.
- The Memo payload is intentionally compact and public-safe; it is not a storage layer for proof artifact bodies.
- `--execute` should not be used for public devnet or mainnet claims until the gate checklist below is complete for the exact artifact, cluster, transaction, signer custody process, and claim wording.
- Mainnet submissions require separate operator, legal, security, fee-payer, key-custody, incident-response, and release-owner approval before any public wording changes.

## Claim levels

| Claim level | Allowed language | Required evidence |
| --- | --- | --- |
| Local only | "Solana-ready artifact prepared locally." | Passing local validator output, `transaction_submitted:false`, `raw_memory_on_chain:false`, and public-safe sample values. |
| Mock client | "Mock Solana client acceptance passed." | Deterministic mock-client transcript showing the exact instruction set, account metas, signer set, fee-payer behavior, privacy scan, revocation/nullifier path, and rollback path. |
| Devnet | "Submitted on Solana devnet." | Approved devnet transaction signature, cluster, slot, program/account refs, explorer/RPC evidence, privacy scan, rollback evidence, fee-payer evidence, and legal/security approval. |
| Mainnet | "Submitted on Solana mainnet." | All devnet gates plus mainnet-specific deployment approval, production key custody approval, fee policy approval, explorer/RPC review, incident rollback plan, legal/security approval, and operator sign-off. |

No level inherits approval from a lower level automatically. Each public claim must cite the exact evidence packet that supports it.

## Hard gate rules

These gates are blocking controls, not advisory checklists.

- A devnet claim is forbidden until Gates 0 through 8 pass for the exact instruction set, program id, accounts, claim text, and evidence packet being published.
- A mainnet claim is forbidden until the devnet claim for the same flow has passed and the separate Mainnet gate below has passed.
- A successful local artifact, mock transcript, or unsigned transaction is not devnet evidence.
- A successful devnet transaction is not mainnet evidence.
- A transaction signature without account privacy review, revocation/nullifier review where applicable, fee-payer approval, explorer/RPC review, and legal/security approval is not publishable evidence.
- Any private payload discovered after submission is a release blocker and incident-response event. Do not redact screenshots and proceed; remove the claim and escalate.
- Evidence is valid only for the named cluster, program id, transaction signature, account refs, artifact hashes, and claim copy. Reworded claims require reapproval.

The default launch decision is **no claim**. The release owner may only promote the claim level when every required exit evidence item is attached.

## Gate 0: claim boundary approval

Before mock, devnet, or mainnet work starts, reviewers must approve the claim boundary:

- The claim names the exact cluster: local mock, devnet, or mainnet.
- The claim names the exact artifact class: anchor batch, capability grant, capability revocation/nullifier, benchmark attestation, proof packet, operator registry event, or settlement reference.
- The claim states that Enigma controls private memory off-chain and that Solana receives only public-safe commitments.
- The claim does not imply provider deletion, model forgetting, legal compliance, hosted SaaS operation, benchmark superiority, ROI, token appreciation, yield, or customer production deployment.
- The public copy avoids "live," "production," "mainnet," "finalized," "settled," "audited," and "certified" unless the corresponding gate below is complete.

Exit evidence: approved claim text and reviewer notes stored with the release evidence packet.

## Gate 1: mock-client acceptance

Mock-client acceptance proves the chain integration shape before any network submission.

Required checks:

1. **Instruction coverage.** The mock client exercises each instruction that public copy may mention, including anchor creation, capability grant, revocation/nullifier creation, and any settlement or operator action referenced by the claim.
2. **Account metas.** Every instruction records expected account metas, signer flags, writable flags, PDA seeds, and program ids using public-safe values only.
3. **Signer model.** The signer set is explicit. Private keys and seed phrases are never included in logs, examples, fixtures, packets, docs, screenshots, or approval artifacts.
4. **Fee payer.** The mock transcript names the fee payer by public key/ref only and proves that fee payer responsibility is explicit, not implicit.
5. **Privacy rejection.** The mock client rejects forbidden keys and secret-like values before constructing a transaction.
6. **Revocation/nullifier path.** The mock client proves that a revoked grant or consumed nullifier cannot be reused in the modeled flow.
7. **Rollback path.** The mock client exercises cancellation, refund, re-anchoring, or supersession behavior for every mutable flow public copy may describe.
8. **No submission language.** Mock artifacts must set or state `transaction_submitted:false` and must not include a devnet or mainnet transaction signature.

Exit evidence: deterministic mock transcript, reviewed public-safe fixture values, and approval that no private payload entered any mock artifact.

## Gate 2: devnet transaction acceptance

Devnet acceptance is required before any public "submitted on devnet," "anchored on devnet," or "devnet transaction" claim.

Required checks:

1. **Approved deployment target.** Program id, cluster, authority public key/ref, and account derivation plan are approved before submission.
2. **Public-safe transaction inputs.** All instruction data and accounts are built from hashes, roots, opaque refs, counts, public keys, signatures, slots, and nullifiers only.
3. **Real devnet signature.** The evidence packet includes a devnet transaction signature, slot, block time if available, commitment/finality status, program id, and RPC or explorer reference.
4. **Account state verification.** Reviewers fetch or inspect the created/updated devnet accounts and confirm that account data contains only public-safe fields.
5. **Fee-payer record.** The evidence packet identifies the fee payer public key/ref, funding source approval, expected fee exposure, and confirmation that no customer private data was used for fee funding metadata.
6. **Replay and idempotency.** Duplicate anchor, duplicate nullifier, expired grant, and unauthorized signer paths fail with expected errors.
7. **Rollback or supersession.** If the flow is mutable, reviewers verify the rollback path on devnet. If the flow is immutable, reviewers verify the documented supersession or correction process instead.
8. **Explorer review.** A reviewer inspects explorer-visible fields and screenshots/exports only the public-safe transaction and account metadata needed for evidence.
9. **Legal/security approval.** Legal and security approve the exact devnet claim wording and evidence packet before publication.

Exit evidence: approved devnet packet containing transaction signature, slot, account refs, privacy scan results, fee-payer approval, rollback/supersession evidence, explorer/RPC review, and legal/security approval.

## Gate 3: account privacy scan

Every mock, devnet, and mainnet evidence packet must pass an account privacy scan.

The scan must fail if any transaction instruction, account data, event, log, memo, explorer-visible value, screenshot, or exported artifact contains:

- raw memory, memory text, prompts, transcripts, completions, embeddings, provider responses, raw benchmark rows, raw dataset records, or private runner logs;
- tenant names, customer names, human employee names, private workspace names, private file paths, account ids, provider ids, ticket ids, or support-case ids;
- ACL bodies, private policy text, legal terms, contracts, data-processing terms, internal comments, or free-text revocation reasons;
- API keys, private keys, seed phrases, mnemonics, bearer tokens, session cookies, connection strings, webhook secrets, passwords, or secret-looking values;
- URLs containing credentials, private bucket paths, signed URLs, or unapproved internal hostnames.

The scan must also confirm:

- all roots, hashes, nullifiers, and refs are stable and reproducible from approved private inputs;
- free-text fields are absent or constrained to approved public enums;
- screenshots and explorer exports are redacted only by omission, not by hiding private data that was already placed on-chain;
- `raw_memory_on_chain:false` remains true for local artifacts and is reflected by observed chain/account state for submitted transactions.

Exit evidence: scan report, reviewer initials/approval, and a list of inspected transaction signatures/accounts/fixtures.

## Gate 4: revocation and nullifier acceptance

Revocation/nullifier acceptance is mandatory before claims about grants, permission removal, replay prevention, one-time rights, escrow settlement finality, or access invalidation.

Required checks:

1. A valid grant or right works before revocation/nullifier creation.
2. The revocation or nullifier is created with public-safe `target_hash`, `domain_hash`, `nullifier_hash`, reason code enum, authority public key/ref, and timestamp/slot.
3. Reuse of the revoked grant or consumed nullifier fails.
4. Duplicate nullifier creation fails for the same domain/hash pair.
5. Unauthorized revoker attempts fail.
6. Expired grants fail independently of revocation.
7. The public artifact does not claim provider deletion, model forgetting, tenant-wide enforcement, or downstream cache/log removal.

Exit evidence: passing mock and, when claiming devnet/mainnet, passing network transaction evidence for the positive path and the failure paths.

## Gate 5: rollback, correction, and incident path

No devnet or mainnet claim may ship without an approved recovery story.

Required checks:

- Immutable anchors define a supersession process that publishes a corrected root/ref without mutating historical chain state.
- Mutable accounts define who can cancel, refund, revoke, dispute, pause, rotate authority, or close state.
- Rollback/correction paths are tested in mock before devnet and in devnet before mainnet.
- Failure handling avoids private incident details in public chain data, logs, memos, or explorer-visible fields.
- Public copy says "superseded," "revoked," "refunded," "cancelled," or "corrected" only when the corresponding evidence exists.

Exit evidence: rollback/supersession transcript, authority approval, and public-safe incident wording if any public correction is needed.

## Gate 6: fee payer and key custody

Fee-payer and key-custody approval is mandatory before any network submission claim.

Required checks:

- Fee payer is named by public key/ref only and approved for the cluster.
- Funding source is approved for devnet or mainnet use; customer private identifiers are not embedded in funding metadata.
- Signing keys are generated, stored, rotated, and revoked under the approved custody process for the claim level.
- No private key, seed phrase, mnemonic, hardware-wallet backup, or raw signer transcript appears in evidence artifacts.
- Mainnet submissions require separate approval for expected fees, spending limits, signer quorum, emergency pause/rotation, and operational ownership.

Exit evidence: fee-payer approval, signer/custody approval, and evidence packet confirming only public keys/refs are published.

## Gate 7: explorer and RPC review

Explorer/RPC review is required because public chains make mistakes permanent.

Required checks:

1. Review the transaction page, account pages, program logs/events, memos, token transfers, and visible account data.
2. Confirm the cluster is correct and cannot be confused with mainnet when the claim is devnet-only.
3. Confirm all visible fields match the approved artifact packet.
4. Confirm no private data appears in explorer-rendered labels, memos, logs, decoded instruction data, account names, token metadata, or linked refs.
5. Capture only approved public-safe evidence for docs, demos, sales material, or release notes.

Exit evidence: explorer/RPC review record with transaction signature, slot, cluster, inspected account refs, and approval status.

## Gate 8: legal and security approval

Legal and security approval is the final gate before public devnet or mainnet language.

They must confirm:

- the claim is scoped to the actual evidence and cluster;
- the copy does not imply production hosted SaaS, compliance certification, provider deletion, model forgetting, investment return, token economics, or customer deployment unless separately approved;
- the evidence packet contains no private payloads, secrets, regulated data, private customer identifiers, private provider data, or contractual terms;
- the team has an incident response path if an irreversible public-chain disclosure occurs;
- mainnet language has explicit operator, legal, security, and release-owner approval.

Exit evidence: final approval record attached to the exact public copy and evidence packet.

## Mainnet gate

Mainnet is a separate launch decision, not a continuation of devnet.

A mainnet claim is prohibited until all of the following are complete:

- every mock and devnet gate above is complete for the exact instruction set and public claim;
- mainnet program id/account plan is approved;
- signer custody, fee-payer funding, spending limits, authority rotation, and emergency controls are approved;
- account privacy scan passes against the exact mainnet transaction/account plan;
- rollback/supersession path is approved for irreversible public-chain records;
- explorer/RPC review procedure is rehearsed on devnet and assigned for mainnet;
- legal, security, operator, and release-owner approvals are recorded;
- public copy names mainnet only with the transaction signature, slot/finality evidence, and evidence packet ref.

Until this gate is complete, approved wording is limited to: "Enigma has local Solana-ready proof artifacts" or, if Gate 2 is complete, "Enigma has reviewed devnet evidence for the named transaction." Do not say or imply mainnet deployment, live settlement, production payment rail, token launch, staking, yield, or public network operation.


## Evidence packet minimum

Every devnet or mainnet evidence packet must include, at minimum:

| Field | Devnet | Mainnet |
| --- | --- | --- |
| Claim text | Exact approved sentence or paragraph. | Exact approved sentence or paragraph. |
| Cluster | `devnet`. | `mainnet-beta` or the approved mainnet cluster name used by the release owner. |
| Program/account refs | Program id, account refs, PDA seed description, and instruction names. | Mainnet program id, account refs, PDA seed description, and instruction names. |
| Transaction evidence | Signature, slot, block time if available, commitment/finality status, and RPC/explorer ref. | Signature, slot, finality evidence, and RPC/explorer ref. |
| Privacy scan | Account/instruction/log/memo/explorer review showing public-safe values only. | Same scan repeated against mainnet transaction/account evidence. |
| Revocation/nullifier | Positive and negative-path evidence when permission, replay prevention, one-time right, or settlement-finality language is used. | Same evidence repeated or explicitly mapped to the mainnet transaction set. |
| Rollback/supersession | Tested devnet rollback, cancellation, refund, revocation, or supersession path. | Approved incident and supersession/rollback plan for irreversible public state. |
| Fee payer/key custody | Devnet fee-payer public key/ref and signer approval. | Mainnet fee-payer public key/ref, spending limits, signer quorum, custody, rotation, and emergency controls. |
| Explorer/RPC review | Reviewer-approved explorer/RPC inspection record. | Reviewer-approved mainnet explorer/RPC inspection record. |
| Approvals | Legal, security, operator, and release-owner approvals for devnet copy. | Legal, security, operator, and release-owner approvals for mainnet copy. |

Missing evidence means the claim is not accepted, even when the transaction itself succeeded.

## Publication checklist

Before publishing any Solana claim, the release owner must verify:

- [ ] Claim level is identified: local, mock, devnet, or mainnet.
- [ ] Evidence packet ref is attached.
- [ ] Account privacy scan passed.
- [ ] Revocation/nullifier acceptance passed when permission or replay-prevention language is used.
- [ ] Rollback or supersession path is documented and tested for the claim level.
- [ ] Fee payer and signer custody approvals are attached for network submissions.
- [ ] Explorer/RPC review is attached for devnet/mainnet claims.
- [ ] Legal and security approvals are attached.
- [ ] Copy avoids prohibited claims and names the exact cluster/evidence.
- [ ] Public examples contain only public-safe hashes, roots, refs, counts, signatures, public keys, slots, and nullifiers.

If any box is unchecked, the public claim must be downgraded to the highest completed level or removed.