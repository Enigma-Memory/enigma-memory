# Proof Network execution roadmap

## Purpose

This roadmap turns Enigma Proof Network from a local proof-artifact workflow into a staged ecosystem program over 30 days, 60 days, 90 days, and six months. The product thesis is narrow by design: Enigma is a private AI memory controller that emits public-safe evidence for Enigma-controlled memory boundaries. Solana is an optional proof, permission, and settlement rail for compact commitments only.

The roadmap is not evidence that any hosted verifier, Solana program, partner integration, or enterprise deployment is currently operating. Each stage has explicit dependencies and acceptance criteria so public copy can stay aligned with evidence.

## Non-negotiable boundaries

1. Public artifacts contain only hashes, roots, refs, counts, timestamps, schema names, validation status, and signatures.
2. Public artifacts do not contain private memory payloads, private policy bodies, private user content, private operational material, or private service output.
3. Local proof commands are useful before any hosted verifier or chain rail exists.
4. A local proof artifact is evidence about its own schema, digest, refs, and declared boundary. It is not a claim about systems that do not consume the artifact.
5. Solana integration remains optional. The data plane stays private; the public rail receives compact commitments and public-safe refs.
6. Benchmark attestations bind report hashes to dataset, runner, package, environment, and verifier refs. They do not turn a single report into a universal performance claim.
7. Enterprise beta work is scoped to review workflows, artifact governance, verifier policy, and operational evidence. It must not be described as an external credential or assured outcome.

## Workstream map

| Workstream | Objective | Primary artifacts | Owner profile |
| --- | --- | --- | --- |
| Local proof core | Make artifact creation and verification deterministic and easy to inspect. | Anchor batch, capability grant, capability revocation, proof packet, verifier result. | Protocol and CLI engineering. |
| CLI artifacts | Give developers repeatable commands that emit public-safe JSON. | `chain anchor`, `chain grant`, `chain revoke`, `chain attest`, `chain packet`, `chain verify`. | CLI and developer experience engineering. |
| Conformance | Define what it means for an implementation to be Enigma-memory-ready. | Conformance profile, fixture corpus, verifier matrix, claim boundary checklist. | Standards and QA. |
| Benchmark attestation | Bind benchmark evidence to hashes and refs without publishing private report bodies. | Benchmark attestation, report hash, runner ref, dataset ref, package ref. | Benchmark systems and docs. |
| Hosted verifier | Provide an optional service boundary for verifying public-safe packets. | Verification request ref, verifier result, audit event ref, operator policy. | Hosted platform engineering. |
| Solana devnet | Prototype compact public commitments without moving private data to chain. | Anchor instruction draft, account model, program id placeholder, devnet transaction refs when approved. | Protocol and Solana engineering. |
| Enterprise beta | Turn proof artifacts into reviewer workflows for controlled pilots. | Beta review packet, policy template, verifier runbook, feedback log. | Product, security, and solutions engineering. |

## Dependency model

| Dependency | Needed by | Blocking condition | Ready signal |
| --- | --- | --- | --- |
| Stable schema identifiers | Local proof, CLI artifacts, conformance, hosted verifier, Solana devnet. | Artifact families cannot be validated consistently. | Each artifact family has a versioned schema id, required fields, optional fields, and public-safety rule. |
| Canonical JSON hashing | Local proof, benchmark attestation, hosted verifier. | Verifiers may disagree on digests. | Same input object produces the same digest across fixtures and command paths. |
| Private-payload rejection | Local proof, CLI artifacts, hosted verifier. | Unsafe examples or packet contents could be emitted. | Constructors and verifiers reject known private-key and private-value patterns before writing public artifacts. |
| CLI fixture corpus | CLI artifacts, conformance, benchmark attestation. | Examples cannot be regression-tested manually or by adopters. | Every command has at least one passing fixture, one failing fixture, and one documented expected result. |
| Claim boundary checklist | Launch docs, enterprise beta, benchmark copy. | Public copy may overstate what artifacts prove. | Every external-facing asset maps each claim to an artifact and an explicit limitation. |
| Hosted verifier policy | Hosted verifier, enterprise beta. | Service behavior would be undefined for unsupported artifact families or oversized packets. | Request limits, supported schemas, failure modes, logging boundaries, and retention boundaries are documented. |
| Solana instruction draft | Solana devnet. | Chain prototype cannot be reviewed without an account and instruction model. | Anchor, grant, revoke, and attestation account concepts are mapped to public-safe seeds and compact data. |
| Enterprise pilot rubric | Enterprise beta. | Pilot feedback may become anecdotal and non-actionable. | Reviewers score setup, artifact clarity, verifier output, policy fit, and unresolved risks against the same rubric. |

## First 30 days: local proof and CLI artifacts

### Goal

Make Proof Network credible as a local developer workflow: create public-safe artifacts, bundle them, verify them, and explain exactly what each result proves.

### Scope

1. Freeze the initial artifact vocabulary:
   - anchor batch;
   - capability grant;
   - capability revocation;
   - benchmark attestation;
   - proof packet;
   - verifier result.
2. Confirm the local-only proof boundary in every command that prepares Solana-ready payloads:
   - no network transaction implied;
   - no private data on the public rail;
   - explicit `transaction_submitted:false` where applicable.
3. Make the CLI path easy to reproduce:
   - create an anchor batch from one or more roots and refs;
   - create a scoped capability grant from public-safe refs;
   - create a revocation from a grant ref or nullifier ref;
   - create a benchmark attestation from a report hash and public-safe refs;
   - bundle artifacts into a proof packet;
   - verify a single artifact or packet locally.
4. Write one developer walkthrough that starts from a zero-credential local command and ends with a verifier result.
5. Add a reviewer-oriented artifact glossary that defines each field by purpose, safety boundary, and verifier behavior.

### Deliverables

| Deliverable | Description | Acceptance criteria |
| --- | --- | --- |
| Local proof command set | CLI commands that emit public-safe JSON artifacts. | A developer can generate every initial artifact family without credentials, hosted services, or chain access. Generated artifacts carry only public-safe fields and explicit safety flags. |
| Packet verifier | Local verifier for individual artifacts and packets. | Verifier accepts valid fixtures, rejects malformed schemas, rejects unsupported artifact types, and rejects private-payload patterns. |
| Artifact examples | Synthetic examples for every artifact family. | Examples use synthetic hashes and refs, include expected verifier status, and avoid private payloads. |
| CLI proof walkthrough | Developer path from local setup to verification. | Walkthrough has copy-pasteable commands, expected output shape, and a clear statement of what is and is not proven. |
| Claim boundary matrix | Internal table for launch and docs review. | Every allowed claim maps to one or more artifacts; every prohibited claim has a reason and safer replacement language. |

### Acceptance criteria for day 30

- A new developer can produce and verify a proof packet locally in under fifteen minutes using documented commands.
- Every artifact family has a stable schema identifier, canonical hash behavior, and a privacy rejection path.
- CLI output distinguishes local planning artifacts from submitted network transactions.
- Documentation describes Solana as optional and future-facing unless separately supported by approved transaction evidence.
- Benchmark attestation examples bind hashes and refs only; they do not publish report bodies or broad performance claims.
- Enterprise-facing copy says proof artifacts support review workflows; it does not promise external credentials or assured business outcomes.

### Day-30 risks and controls

| Risk | Control |
| --- | --- |
| Developers confuse a Solana-ready payload with a submitted transaction. | Keep `transaction_submitted:false` visible in examples and verifier output. |
| Examples accidentally include private operational context. | Use synthetic refs only and run examples through the same private-payload rejection path as user artifacts. |
| Verifier output is too low-level for reviewers. | Provide a concise status summary before detailed schema diagnostics. |
| Benchmark attestation is read as a leaderboard claim. | Require report hash, dataset ref, runner ref, package ref, metric scope, and limitation text together. |

## First 60 days: conformance and benchmark attestation

### Goal

Turn local proof artifacts into an ecosystem contract: independent implementers can understand the expected artifact shape, and benchmark evidence can be cited through attestations instead of unsupported copy.

### Scope

1. Publish an Enigma-memory-ready conformance profile:
   - required artifact families;
   - required verifier checks;
   - required privacy boundaries;
   - required failure modes;
   - optional Solana readiness fields.
2. Build a conformance fixture set:
   - valid anchor batch;
   - valid grant;
   - valid revocation;
   - valid benchmark attestation;
   - valid packet;
   - malformed schema case;
   - unsupported schema case;
   - private-payload rejection case;
   - expired or out-of-scope grant case.
3. Define benchmark attestation review rules:
   - report hash format;
   - dataset ref format;
   - runner ref format;
   - package ref format;
   - environment ref format;
   - verifier ref format;
   - metric scope and limitation text.
4. Create a benchmark attestation packet template that can be attached to a release, research note, or enterprise review packet.
5. Add a compatibility table for internal and external tools that consume proof-network artifacts.

### Deliverables

| Deliverable | Description | Acceptance criteria |
| --- | --- | --- |
| Conformance profile | Versioned definition of required behavior for proof-network-compatible tools. | Profile states mandatory checks, optional checks, supported schemas, unsupported behavior, and privacy boundary requirements. |
| Fixture corpus | Public-safe fixtures for implementer testing. | Fixtures cover positive and negative verifier paths and can be referenced from docs without private data. |
| Benchmark attestation template | Standard packet for binding report hashes to refs. | Template includes report hash, dataset ref, runner ref, package ref, environment ref, verifier ref, signature area, and limitation text. |
| Claim review workflow | Repeatable review path for benchmark and proof claims. | A claim cannot be approved unless it references an artifact, metric scope, verifier result, and limitation. |
| Partner integration notes | Guide for wallets, agent frameworks, benchmark tools, and reviewers. | Notes explain how to consume artifacts locally and how to avoid assuming public-chain or hosted-service behavior. |

### Acceptance criteria for day 60

- A third-party implementer can read the conformance profile and know what must be generated, verified, rejected, and left out.
- The fixture corpus catches both malformed artifacts and artifacts that are structurally valid but privacy-unsafe.
- Benchmark attestations can be reviewed without publishing private report contents.
- Public benchmark language is bound to exact refs and limitations, not generalized superiority statements.
- Partner integration notes keep Solana, hosted verification, and local verification as distinct boundaries.

### Day-60 risks and controls

| Risk | Control |
| --- | --- |
| Conformance becomes too broad for implementers. | Keep a small required core and move experimental fields to optional sections. |
| Negative fixtures reveal unsafe examples too vividly. | Use synthetic redacted placeholders and validate that fixtures themselves are safe to publish. |
| Partners treat optional fields as required. | Mark required, optional, experimental, and reserved fields separately. |
| Benchmark attestations become marketing shortcuts. | Require an artifact ref and limitation text next to any metric claim. |

## First 90 days: hosted verifier and Solana devnet prototype

### Goal

Add optional networked verification and a reviewed Solana devnet prototype while preserving the local-first and public-safe contract.

### Scope

1. Hosted verifier design:
   - accept proof packets containing supported schema families;
   - return a verifier result with status, artifact refs, digest summary, schema diagnostics, and policy diagnostics;
   - enforce size, schema, and private-payload rejection limits;
   - avoid requiring private data to verify public-safe packets;
   - document request and result retention boundaries before beta use.
2. Hosted verifier implementation path:
   - start with local verifier parity;
   - add deterministic request hashing;
   - add signed verifier result envelopes;
   - add operator policy configuration;
   - add failure-mode documentation.
3. Solana devnet prototype:
   - draft program account model for anchor batches, grants, revocations, and attestations;
   - use only public-safe seeds and compact commitments;
   - map local artifact fields to instruction data;
   - demonstrate devnet anchoring only after approved evidence exists;
   - keep local artifacts as the source of detailed review context.
4. Enterprise beta preparation:
   - identify pilot workflows that can be reviewed with synthetic or approved public-safe packets;
   - write beta entry criteria, exit criteria, and feedback rubric;
   - define what operators must collect before a pilot claim can be published.

### Deliverables

| Deliverable | Description | Acceptance criteria |
| --- | --- | --- |
| Hosted verifier alpha | Optional verifier service for public-safe proof packets. | Service returns deterministic results for known fixtures, rejects unsupported or unsafe packets, and documents its supported boundary. |
| Verifier result envelope | Signed or signable result format for verification outcomes. | Envelope binds input packet digest, supported schema list, policy version, result status, timestamp, and verifier ref. |
| Solana devnet design packet | Account and instruction design for compact commitments. | Design shows public-safe seeds, data fields, size expectations, and local-artifact relationship for each artifact family. |
| Devnet prototype evidence packet | Approved evidence for any devnet transaction claim. | Packet includes program/ref identifiers, transaction refs if present, local artifact digest, verifier result, and explicit limitation text. |
| Enterprise beta readiness packet | Materials for controlled pilots. | Packet includes use-case scope, allowed data boundary, reviewer steps, acceptance rubric, escalation path, and claim boundary. |

### Acceptance criteria for day 90

- Hosted verifier output matches local verifier output on the shared fixture corpus except for documented service envelope fields.
- Hosted verifier documentation states supported schemas, limits, rejection cases, and what is not being verified.
- Any Solana devnet language is backed by approved evidence and remains limited to compact public-safe commitments.
- Local proof packets remain useful without hosted verification or chain anchoring.
- Enterprise beta candidates can review the workflow before sharing any sensitive operational context.

### Day-90 risks and controls

| Risk | Control |
| --- | --- |
| Hosted verification is mistaken for broader truth about the underlying system. | Result envelope states that verification covers the packet, schema, digest, and declared policy boundary. |
| Chain prototype tempts teams to publish more data than needed. | Program design accepts compact commitments and refs only; local packet holds review context. |
| Devnet evidence is treated as production evidence. | Label devnet materials plainly and require separate approval for stronger claims. |
| Enterprise pilots produce inconsistent feedback. | Use one beta rubric and one packet format across pilots. |

## Six months: enterprise beta and ecosystem hardening

### Goal

Move from proof-network prototype to controlled ecosystem adoption: enterprise beta workflows, partner conformance, hosted verifier hardening, and optional Solana proof rail readiness.

### Scope

1. Enterprise beta execution:
   - run controlled pilots around memory review packets, scoped capability review, revocation handling, and benchmark attestation review;
   - use public-safe artifacts and approved local evidence;
   - collect structured feedback against the same rubric;
   - document unresolved risks without overstating outcomes.
2. Hosted verifier hardening:
   - publish service limits;
   - add operator policy versions;
   - add result signing and key rotation plan;
   - add availability and incident runbooks;
   - keep local verification as a fallback and baseline.
3. Conformance program:
   - publish implementer checklist;
   - maintain fixture corpus versions;
   - define compatibility badge language that does not imply third-party approval;
   - add partner self-test packet template.
4. Solana readiness:
   - complete devnet review;
   - decide whether the rail remains a prototype, partner sandbox, or candidate for a later public release;
   - document account costs, instruction limits, replay and revocation behavior, and operator key practices;
   - keep private payloads off-chain by design.
5. Benchmark evidence program:
   - standardize benchmark report hashes and refs across release packets;
   - require verifier results for public benchmark packets;
   - separate evidence binding from performance interpretation.
6. Developer ecosystem:
   - provide examples for agent framework maintainers, wallets, benchmark tools, and reviewer workflows;
   - keep examples local-first and safe to inspect;
   - document upgrade behavior for schema versions.

### Deliverables

| Deliverable | Description | Acceptance criteria |
| --- | --- | --- |
| Enterprise beta report | Internal summary of pilot workflows and reviewer feedback. | Report includes artifact coverage, verifier outcomes, reviewer friction, unresolved risks, and approved public-safe excerpts only. |
| Hosted verifier beta | Hardened verifier service for controlled beta traffic. | Service has documented limits, policy versions, result signing, operational runbooks, and parity with local verifier fixtures. |
| Conformance kit | Implementer-facing profile, fixtures, self-test guide, and compatibility language. | A partner can run the self-test packet and understand exactly what compatibility means and does not mean. |
| Solana proof rail decision record | Decision on next stage for optional rail. | Record cites devnet evidence if any, unresolved engineering risks, cost and account assumptions, and claim boundaries. |
| Benchmark evidence packet standard | Standard release attachment for benchmark-related claims. | Packet binds report hashes and refs to verifier results and limitation text; it does not publish private report bodies or broad comparative promises. |
| Ecosystem examples | Public-safe examples for target integrators. | Examples are local-first, schema-versioned, verifier-backed, and free of private payloads. |

### Acceptance criteria for six months

- At least one controlled enterprise beta workflow can be reviewed end-to-end using public-safe proof packets, local verification, and documented reviewer steps.
- Hosted verifier beta returns signed or signable results that can be checked against local verifier behavior for the same fixture packet.
- Conformance kit supports implementer self-testing without requiring hosted services or chain access.
- Solana rail status is explicit: prototype, sandbox, or later-release candidate. No stronger claim is used without approved evidence.
- Benchmark evidence packets are attached to relevant benchmark claims and preserve the distinction between evidence binding and metric interpretation.
- Developer ecosystem examples show how to consume artifacts without depending on private data disclosure.

### Six-month risks and controls

| Risk | Control |
| --- | --- |
| Beta feedback is marketed as proof of broad enterprise readiness. | Keep beta report internal unless excerpts pass claim review and public-safety review. |
| Hosted verifier creates centralization concerns. | Preserve local verifier parity and document the hosted service as optional. |
| Conformance badge language is overread. | Use compatibility language tied to fixtures and schemas, not third-party approval wording. |
| Solana roadmap becomes a distraction from local proof value. | Keep local proof as the default workflow and evaluate Solana only where public commitments add value. |
| Benchmark evidence is used beyond its scope. | Require artifact refs, metric scope, and limitations with every benchmark statement. |

## Cross-phase acceptance checklist

Before any milestone is called complete, the following checklist must pass:

1. **Artifact safety**: emitted public artifacts contain only hashes, roots, refs, counts, timestamps, schema names, validation status, and signatures.
2. **Schema stability**: every artifact has a versioned schema id and documented required fields.
3. **Verifier determinism**: the same valid fixture produces the same digest and verifier status across supported paths.
4. **Negative coverage**: malformed, unsupported, expired, out-of-scope, and privacy-unsafe packets are rejected with actionable diagnostics.
5. **Local-first path**: developers can create and verify a proof packet without hosted services or chain access.
6. **Solana boundary**: chain-related work uses compact commitments and public-safe refs only, with local artifacts retaining review context.
7. **Benchmark boundary**: benchmark attestations bind evidence to refs and limitations; they do not assert broad performance conclusions by themselves.
8. **Enterprise boundary**: beta materials support review and governance workflows; they do not state assured outcomes.
9. **Claim review**: every public claim cites the artifact, verifier result, limitation, and evidence status that support it.
10. **Dependency status**: each milestone names unmet dependencies plainly instead of implying that unfinished work is done.

## Milestone summary

| Horizon | Main outcome | Acceptance headline |
| --- | --- | --- |
| 30 days | Local proof and CLI artifacts. | Developers can generate, packetize, and verify public-safe proof artifacts locally. |
| 60 days | Conformance and benchmark attestation. | Implementers can test against fixtures, and benchmark claims can cite attestations instead of broad assertions. |
| 90 days | Hosted verifier alpha and Solana devnet prototype. | Optional service verification and optional devnet work preserve local-first, public-safe boundaries. |
| Six months | Enterprise beta and ecosystem hardening. | Controlled pilots, conformance kit, hosted verifier beta, and Solana decision record are evidence-backed and claim-bounded. |

## Execution cadence and decision gates

| Cadence | Decision | Evidence required | Stop condition |
| --- | --- | --- | --- |
| Weekly during first 30 days | Are local artifacts and verifier behavior stable enough for docs examples? | Passing fixture review, deterministic hashes, and private-payload rejection notes. | Any artifact family changes required fields without a version decision. |
| Biweekly during days 31-60 | Is the conformance profile narrow enough for implementers? | Fixture results, field classification, and implementer feedback from dry runs. | Required core expands beyond local artifact creation and verification. |
| Biweekly during days 61-90 | Can hosted verifier and Solana devnet work proceed without changing the local packet contract? | Hosted/local parity report, public-safe instruction draft, and claim review. | Hosted or chain path requires private payload disclosure or unsupported claims. |
| Monthly through six months | Should enterprise beta and ecosystem materials advance to the next audience? | Beta rubric results, conformance kit results, verifier envelope review, and Solana decision record. | Evidence is incomplete, claims outrun artifacts, or reviewers cannot reproduce the local path. |

Decision gates are intentionally evidence-heavy. A phase can continue internal engineering with open issues, but external copy must wait until the artifact, verifier result, limitation, and current status are all available.

## Artifact deliverables by milestone

| Artifact or packet | 30 days | 60 days | 90 days | Six months |
| --- | --- | --- | --- | --- |
| Anchor batch | Local CLI output and verifier fixture. | Conformance fixture and field guide. | Solana account/instruction mapping. | Included in partner self-test packet. |
| Capability grant | Local CLI output and verifier fixture. | Scope, expiry, and subject-ref conformance rules. | Hosted verifier policy diagnostics. | Enterprise reviewer workflow for scoped access. |
| Capability revocation | Local CLI output and verifier fixture. | Nullifier and grant-ref conformance rules. | Hosted verifier policy diagnostics. | Enterprise reviewer workflow for stop-acceptance handling. |
| Benchmark attestation | Local CLI output from report hash and refs. | Standard attestation packet template. | Hosted verifier result envelope for attestation packets. | Release evidence packet standard. |
| Proof packet | Bundle valid local artifacts and verify offline. | Packet-level positive and negative fixtures. | Hosted verifier request and result envelope. | Partner self-test packet and enterprise review packet. |
| Verifier result | Local status, digest, and schema diagnostics. | Conformance result matrix. | Signed or signable hosted result envelope. | Local/hosted parity baseline for beta. |
| Solana anchor evidence | Not claimed beyond local planning fields. | Public-safe account and instruction draft. | Devnet evidence packet only if approved evidence exists. | Decision record for prototype, sandbox, or later-release candidate. |

## Dependency and risk register

| Item | Dependency | Risk if weak | Mitigation |
| --- | --- | --- | --- |
| Schema versioning | Stable artifact identifiers and field rules. | Verifiers and docs drift apart. | Version every artifact family and keep unsupported versions explicit. |
| Canonical hashing | Deterministic JSON serialization. | Reviewers cannot reproduce packet digests. | Use one canonicalization rule in CLI, hosted verifier, fixtures, and docs. |
| Privacy rejection | Shared unsafe-key and unsafe-value rules. | Public artifacts may contain private payload material. | Run artifact constructors, packet builders, and verifiers through the same rejection layer. |
| Conformance fixtures | Positive and negative examples. | Partners integrate only the happy path. | Require failing fixtures for malformed, unsupported, expired, out-of-scope, and privacy-unsafe packets. |
| Benchmark evidence | Report hash plus dataset, runner, package, environment, and verifier refs. | Metrics may be quoted without sufficient scope. | Bind every benchmark statement to an attestation and limitation text. |
| Hosted verifier parity | Local verifier baseline. | Hosted results become a different trust model. | Treat local verifier output as the baseline and document service-only envelope fields. |
| Solana devnet readiness | Public-safe instruction draft and local packet mapping. | Chain work expands beyond compact commitments. | Reject instruction designs that require private payloads or omit local packet context. |
| Enterprise beta rubric | Shared reviewer criteria. | Pilot feedback becomes inconsistent. | Score each pilot against setup, artifact clarity, verifier output, policy fit, and unresolved risks. |

## Cross-phase dependency graph

```text
Stable schemas
  -> local CLI artifacts
  -> local verifier fixtures
  -> conformance profile
  -> hosted verifier parity
  -> enterprise beta packets

Canonical hashing
  -> artifact digests
  -> proof packet roots
  -> benchmark attestations
  -> hosted verifier envelopes
  -> Solana compact commitments

Privacy rejection
  -> CLI constructors
  -> packet builder
  -> fixture corpus
  -> hosted verifier policy
  -> public examples

Claim boundary checklist
  -> developer docs
  -> benchmark copy
  -> Solana devnet language
  -> enterprise beta excerpts
```

No downstream phase is allowed to weaken an upstream boundary. If hosted verification or Solana devnet work requires a different artifact shape, the schema must version forward and the local verifier must remain able to explain the difference.

## Six-month month-by-month sequence

| Month | Primary build focus | Acceptance check |
| --- | --- | --- |
| Month 1 | Local proof commands, verifier fixtures, proof packet examples, claim boundary matrix. | A developer can generate and verify every initial artifact family locally with public-safe examples. |
| Month 2 | Conformance profile, fixture corpus, benchmark attestation template, partner notes. | An implementer can run positive and negative fixtures and understand required versus optional behavior. |
| Month 3 | Hosted verifier alpha, result envelope, Solana devnet design packet, beta readiness packet. | Hosted results match local verifier fixtures, and Solana design remains compact-commitment only. |
| Month 4 | Enterprise beta intake, hosted verifier policy versions, conformance self-test packet. | Reviewers can complete a controlled packet review and record issues against the shared rubric. |
| Month 5 | Partner self-tests, benchmark evidence packet standard, verifier runbooks, Solana cost and account review. | External implementers can test compatibility without hosted services or chain access. |
| Month 6 | Beta report, hosted verifier beta, conformance kit, Solana decision record, ecosystem examples. | Public-safe excerpts and roadmap decisions are backed by artifacts, verifier results, limitations, and current status. |

## Definition of done by capability

| Capability | Done means | Not done if |
| --- | --- | --- |
| Local proof | CLI can emit every initial artifact family and local verifier can explain acceptance or rejection. | Any artifact needs hosted services, chain access, or private payload disclosure. |
| CLI artifacts | Commands produce deterministic JSON with documented fields, examples, and expected verifier output. | Output fields are undocumented, unstable, or ambiguous about transaction status. |
| Conformance | Profile and fixtures let another implementer test required behavior. | The profile is descriptive only and cannot be checked against fixtures. |
| Benchmark attestation | A report hash can be bound to dataset, runner, package, environment, verifier refs, and limitations. | A benchmark statement can stand without an attestation ref and scope. |
| Hosted verifier | Service returns packet-scoped results that match local verifier behavior on shared fixtures. | Service output implies broader truth than packet, schema, digest, and policy validation. |
| Solana devnet | Prototype maps compact commitments and public-safe refs to accounts/instructions with approved evidence for any devnet statement. | Program design requires private payloads or replaces local packet review. |
| Enterprise beta | Reviewers can use proof packets, verifier results, and rubric criteria to evaluate controlled workflows. | Pilot materials imply broad production readiness or assured outcomes. |

## Global acceptance checklist

Use this checklist before publishing a milestone update, partner note, demo script, or beta excerpt:

1. The artifact family and schema version are named.
2. The artifact contains only public-safe hashes, roots, refs, counts, timestamps, schema names, validation status, and signatures.
3. A verifier result or expected verifier result is attached.
4. Dependencies and unresolved blockers are named.
5. The local-first path remains usable without hosted services or chain access.
6. Hosted verifier claims are packet-scoped and optional.
7. Solana claims are limited to compact commitments and current evidence status.
8. Benchmark claims cite an attestation ref, metric scope, and limitation.
9. Enterprise beta statements describe reviewer workflow evidence, not assured outcomes.
10. Public copy can be traced back to a proof artifact, fixture, packet, or decision record.

## Recommended sequencing rule

Do not advance a public claim ahead of its artifact evidence. The safe order is:

1. Define the artifact and schema.
2. Generate synthetic public-safe fixtures.
3. Verify locally.
4. Document the claim boundary.
5. Add hosted or Solana paths only when they preserve the same public-safe packet contract.
6. Publish externally only after the artifact, verifier result, limitation, and evidence status are all available.

This keeps the roadmap aligned with the core promise: private AI memory stays private, while Enigma emits public-safe proof artifacts that reviewers and integrators can inspect.