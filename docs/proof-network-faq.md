# Proof Network FAQ

Enigma's Proof Network is a public-safe evidence layer for AI memory. It lets teams prove that a memory system produced a specific batch, grant, revocation, benchmark report, or proof packet without publishing the private memory behind it.

The short version: proofs can be public; memory stays private.

## What problem does the Proof Network solve?

AI memory systems need trust boundaries that ordinary logs do not provide. A business may need to show that:

- a set of memory commitments existed at a point in time;
- a tool or agent had only a scoped permission grant;
- a grant was revoked through a public-safe nullifier;
- a benchmark report was tied to a specific dataset, runner, and package version;
- a reviewer can verify the artifact without seeing the tenant's raw memory.

The Proof Network turns those events into small JSON artifacts with hashes, roots, references, counts, signatures, and policy boundaries. It does not publish prompts, transcripts, completions, embeddings, tenant names, access-control bodies, private keys, provider responses, or raw memory.

## What role does blockchain play?

Blockchain is an optional public timestamp and settlement rail for proof roots. Enigma prepares Solana-ready anchor batches that can be submitted by an operator later, but the local commands do not submit transactions.

A chain anchor is useful when a team wants an outside observer to verify that a public-safe root existed before a certain time. The chain should only see an opaque root or reference, not the underlying memory records.

## Is raw memory ever written on-chain?

No. Raw memory does not belong on-chain.

Public chains are replicated, durable, and hard to erase. Putting private memory, prompts, transcripts, completions, embeddings, tenant identifiers, provider payloads, ACL bodies, keys, seed phrases, or customer data on-chain would be a privacy failure. The Proof Network is designed around the opposite boundary: keep private data off-chain and publish only public-safe commitments.

## If the chain only sees hashes, what can it prove?

A public hash or Merkle root can prove commitment, not content.

That means a verifier can check that a later artifact matches the same committed batch, grant, revocation, or benchmark report. It does not reveal what the private memory said. It also does not prove provider-side deletion, model forgetting, legal compliance, customer deployment status, or business outcomes.

## What is live now?

The 0.1.12 proof-network surface is local and public-safe:

- pure proof artifact builders and validators for `enigma.proof_network.anchor_batch.v1`;
- scoped capability grants with `enigma.proof_network.capability_grant.v1`;
- revocation/nullifier artifacts with `enigma.proof_network.capability_revocation.v1`;
- benchmark attestations with `enigma.proof_network.benchmark_attestation.v1`;
- bundled proof packets with `enigma.proof_network.packet.v1`;
- local CLI planning commands under `enigma chain anchor|grant|revoke|attest|verify`.

These are local artifact and verification tools. They do not call external providers, create Solana accounts, submit transactions, deploy infrastructure, or publish packages.

Every chain-oriented artifact should make the boundary explicit with fields such as `transaction_submitted:false` and `raw_memory_on_chain:false`.

## What is planned next?

Planned work is to make the local artifacts easier to operate across teams and ecosystems:

- stronger conformance fixtures for wallets, explorers, and auditors;
- clearer Solana submission guidance for operators who already control their own keys and deployment process;
- richer benchmark attestations for reproducible memory evaluations;
- reviewer packets that combine anchors, grants, revocations, and benchmark evidence;
- ecosystem rules for what claims can and cannot be made from each proof type.

Those plans do not change the current boundary: Enigma can prepare proof artifacts locally, but chain submission and production deployment remain operator-controlled steps.

## How do capability grants work?

A capability grant is a public-safe statement that a subject is allowed to use a limited capability for a limited scope. For example, it can describe the kind of memory access, the permitted purpose, expiry, and revocation reference without exposing the private memory itself.

A good grant is narrow. It should answer: who can do what, for which public-safe scope, until when, and how it can be revoked. It should not contain tenant names, raw ACL documents, prompts, transcripts, embeddings, or secrets.

## How do revocations work?

A revocation artifact proves that a previously granted capability has been revoked or nullified. It should use public-safe grant references and nullifiers, not private policy bodies or customer identifiers.

Revocation proves Enigma-side control-plane state. It does not prove that every downstream model, provider cache, export, log, or third-party system forgot data.

## How do benchmark attestations work?

A benchmark attestation ties a report hash to public-safe metadata such as dataset reference, runner reference, package reference, metric summaries, and boundary notes.

The attestation should not include raw dataset rows, private conversations, prompts, answers, completions, provider responses, or private file paths. If a dataset or report is private, publish only stable public references and hashes that reviewers are allowed to verify.

## How would a business use this?

A business can use Proof Network artifacts as audit evidence around AI memory operations:

- anchor memory commitment batches without disclosing customer records;
- grant a support bot or workflow a narrow memory capability;
- revoke that capability and retain a public-safe revocation record;
- attach benchmark attestations to an internal release review;
- send a proof packet to security, procurement, or compliance reviewers.

This is evidence infrastructure, not a compliance certification by itself. Legal, regulatory, customer, and production-readiness claims still require the business's own review process.

## How do developers test it?

Developers can test the proof flow locally with public-safe sample values. From an installed CLI, use `enigma chain ...`; from a source checkout, use `node apps/cli/bin/enigma.mjs chain ...` with the same arguments.

```sh
enigma chain anchor --root sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --ref memory-batch:demo --authority solana:local-plan --batch-ref batch:demo --out ./.enigma/proof-anchor.json
enigma chain grant --subject agent:demo --capability memory.read --scope purpose:support --resource-ref sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb --policy-hash sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc --expires-at 2026-12-31T00:00:00.000Z --grant-ref grant:demo --out ./.enigma/proof-grant.json
enigma chain revoke --grant-hash sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd --reason reason:rotated-scope --revocation-ref revocation:demo --out ./.enigma/proof-revocation.json
enigma chain attest --report-hash sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee --dataset-ref dataset:demo --runner-ref runner:demo --package-ref package:demo --score evidence_hit_at_5=0.90 --out ./.enigma/proof-attestation.json
enigma chain verify --file ./.enigma/proof-anchor.json
```

Use fake public roots and references in examples. Do not paste real memory, tenant names, private paths, API keys, seed phrases, provider outputs, prompts, transcripts, embeddings, or raw benchmark rows into proof artifacts.

## What should reviewers look for?

Reviewers should confirm that:

- the artifact schema is one of the supported `enigma.proof_network.*.v1` schemas;
- `raw_memory_on_chain` is false;
- `transaction_submitted` is false unless an operator separately provides real chain evidence;
- roots and hashes are stable and reproducible from approved private inputs;
- grants are scoped and expiring instead of broad and permanent;
- revocations point to public-safe grant references or nullifiers;
- benchmark attestations describe report hashes and refs, not raw dataset contents;
- no secret-looking values or private payload keys appear in public artifacts.

## What claims should not be made?

Do not claim that a Proof Network artifact proves any of the following unless separate reviewed evidence exists:

- raw memory was deleted from every provider or model;
- a model forgot training data or hidden cache state;
- Enigma is deployed for a customer in production;
- Solana transactions were submitted by the local CLI;
- compliance certification, audit completion, or legal approval;
- benchmark leadership, ROI, invoice savings, or provider quality rankings.

The safe claim is narrower and stronger: Enigma can create and verify public-safe proof artifacts for memory commitments, scoped grants, revocations, benchmark attestations, and proof packets while keeping raw memory off-chain.
