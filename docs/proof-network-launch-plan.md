# Proof Network launch plan

## Purpose

Launch Enigma Proof Network as the private memory controller for AI: a local-first proof system that turns Enigma-mediated memory boundaries into public-safe receipts, capability grants, revocations, benchmark attestations, and proof packets. Solana is an optional proof, permission, and settlement rail for hashes, roots, nullifiers, refs, counts, timestamps, and signatures only; it is not a raw-memory store and the current public demo path must not claim live transaction submission.

This plan is for product, developer relations, docs, sales, and ecosystem launch work. It is not evidence of live hosted SaaS, live Solana deployment, provider deletion, model forgetting, compliance certification, benchmark superiority, customer ROI, token value, or settlement finality.

## Launch thesis

AI memory needs a control plane before it needs another place to store text. The marketable wedge for Enigma is not "memory on-chain"; it is **proof-carrying AI memory**:

1. Keep private memory in the private data plane.
2. Generate public-safe proof artifacts for the boundaries Enigma controls.
3. Let developers verify those artifacts locally.
4. Let partners reference opaque roots and capability refs from optional public rails.
5. Bind benchmark claims to attestable report hashes and dataset/runner/package refs instead of unsupported leaderboard copy.

Primary message:

> Enigma is the private memory controller for AI: local proof artifacts for memory receipts, scoped capabilities, revocations, and benchmark attestations, with optional Solana-ready roots and refs that never place raw memory on-chain.

Short launch line:

> Proof-carrying AI memory. Public roots, private memory.

## Audience map

| Audience | Problem they care about | Message | Launch CTA | Best asset |
| --- | --- | --- | --- | --- |
| AI application developers | Need a credible memory layer they can test without credentials or hosted setup. | Run a local test drive, generate proof artifacts, and verify them offline. | `npx --yes --package enigma-memory enigma test-drive` | Five-command CLI walkthrough. |
| Agent framework maintainers | Need portable memory semantics across clients and tools. | Enigma can wrap agent memory with receipts, scoped grants, revocations, and proof packets. | Build against public-safe artifact schemas and refs. | Grant/revoke integration diagram. |
| Solana builders | Need a blockchain-specific AI primitive that does not leak user data. | Anchor opaque roots and capability refs; never publish prompts, transcripts, embeddings, ACL bodies, tenant names, or raw memory. | Prototype against Solana-ready anchor batches as planning artifacts. | Private data plane / public proof rail diagram. |
| Benchmark researchers | Need reproducible evidence without publishing private benchmark bodies. | Benchmark attestations bind report hashes to dataset, runner, package, environment, and verifier refs. | Create an attestation from a report hash and verify it locally. | Benchmark attestation packet. |
| Enterprise platform teams | Need memory control evidence without plaintext sprawl. | Enigma emits evidence for Enigma-controlled memory boundaries and keeps public artifacts minimized. | Review a proof packet and claim-boundary checklist. | Security review brief. |
| CISOs, legal, and compliance reviewers | Need clear limits on what is proven. | Proof artifacts support review workflows but do not certify compliance, prove provider deletion, or prove model forgetting. | Use the approved claims matrix before publishing or buying. | Claim-boundary one-pager. |
| Wallet, identity, and payment partners | Need capability and settlement references that do not expose private data. | Grants, nullifiers, and settlement refs can point to public-safe capability/accounting artifacts. | Explore partner flows with synthetic refs only. | Partner capability-flow mock. |

## Message architecture

### Pillar 1: Private memory controller

Say:

- Enigma helps control which memory is selected, exported, granted, revoked, attested, and verified inside the Enigma boundary.
- Proof artifacts are designed to carry hashes, roots, refs, counts, scopes, timestamps, signatures, validation status, and explicit safety flags.
- Local verification is useful before hosted verification or chain anchoring exists.

Do not say:

- Enigma controls every provider log, backup, cache, or model weight.
- Enigma proves a memory statement is true in the real world.
- Enigma guarantees permanent erasure from third-party systems.

### Pillar 2: Blockchain-specific value without blockchain data leakage

Say:

- Solana can be an optional public rail for compact roots, capability refs, revocation nullifiers, benchmark report commitments, and settlement refs.
- Local anchor artifacts are Solana-ready planning payloads when they include public-safe roots/refs and `transaction_submitted:false`.
- Raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, private keys, seed phrases, API keys, and provider responses must never appear on-chain or in public proof examples.

Do not say:

- Enigma has submitted, finalized, settled, minted, staked, or paid unless separate approved transaction evidence exists.
- Enigma stores AI memory on-chain.
- Public hashes are automatically anonymous or safe in every legal context.

### Pillar 3: Permission and revocation as proof artifacts

Say:

- Capability grants can describe scoped access using public-safe subject refs, resource refs, capability names, expiry, signer refs, and policy hashes.
- Revocations can use nullifier-style artifacts that tell verifiers to stop accepting a prior grant or scope.
- A grant or revocation artifact is evidence about the public-safe ref boundary, not about private ACL bodies or third-party enforcement.

Do not say:

- Public grants expose full ACLs.
- Revocation proves provider deletion or model forgetting.
- A local revocation guarantees every downstream system has enforced it.

### Pillar 4: Benchmark claims with receipts

Say:

- Benchmark attestations bind report hashes to dataset refs, runner refs, package refs, environment refs, and review metadata.
- A numeric benchmark claim must cite the exact report/ref, runner, dataset/ref, package/ref, metric, and scope.
- The launch can demonstrate claim binding without claiming Enigma is best, fastest, more accurate, lower cost, or ROI-positive.

Do not say:

- A single local report proves universal performance.
- Retrieval/evidence proxy scores are LLM answer accuracy.
- Benchmark attestations prove hosted SaaS readiness, provider deletion, model forgetting, compliance, or customer savings.

## Launch sequence

### Phase 0: Claims and artifact freeze

Owner: product marketing with engineering, security, and docs review.

Actions:

1. Select the exact launch headline and one-sentence product definition.
2. Freeze the public-safe artifact vocabulary: anchor batch, capability grant, capability revocation, benchmark attestation, proof packet, verifier result.
3. Freeze the prohibited language list: no live hosted SaaS, no live Solana submission, no provider deletion proof, no model forgetting proof, no compliance certification, no ROI, no benchmark superiority, no raw memory on-chain.
4. Approve one canonical public-safety sentence for every asset: "Proof artifacts carry hashes, roots, refs, counts, scopes, timestamps, signatures, and validation status; they do not carry raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, secrets, or provider responses."
5. Prepare synthetic hashes and refs for screenshots and examples.

Exit criteria:

- Every planned launch asset has a named artifact, a named audience, and a claim boundary.
- No asset depends on live chain, live hosted SaaS, external provider calls, private customer data, or raw benchmark bodies.

### Phase 1: Developer test-drive reveal

Owner: developer relations.

Actions:

1. Publish the test-drive CTA as the first developer step:

   ```sh
   npx --yes --package enigma-memory enigma test-drive \
     --out-dir .enigma/proof-network/test-drive
   ```

2. Explain that the command is local-only, zero-credential, and bounded to Enigma-controlled demo artifacts.
3. Show the next local proof commands as the proof-network arc:

   ```sh
   npx --yes --package enigma-memory enigma chain anchor \
     --root sha256:1111111111111111111111111111111111111111111111111111111111111111 \
     --ref npm-test-drive:bundle-root:v1 \
     --ref npm-test-drive:receipt-root:v1 \
     --out .enigma/proof-network/anchor-batch.json

   npx --yes --package enigma-memory enigma chain verify \
     --file .enigma/proof-network/anchor-batch.json
   ```

4. Keep `transaction_submitted:false` and `raw_memory_on_chain:false` visible in every anchor screenshot.
5. Route users from the install page to the proof overview, demo script, claim boundaries, and benchmark attestation docs.

Exit criteria:

- A developer can understand the category in under two minutes: run local test drive, create a proof artifact, verify it, and understand what it does not prove.
- Screenshots and JSON snippets contain only synthetic public-safe refs and hashes.

### Phase 2: Proof Network narrative launch

Owner: product marketing.

Actions:

1. Publish the launch blog with this structure:
   - the AI memory control problem;
   - private data plane vs public proof plane;
   - artifact families;
   - local test-drive path;
   - optional Solana proof rail;
   - allowed and prohibited claims;
   - partner call to action.
2. Release a 90-second terminal demo that shows install/test-drive, anchor, benchmark attestation, verification, and packet recap.
3. Publish social clips around one message each:
   - "Anchor trust, not transcripts.";
   - "Grant capabilities without publishing ACLs.";
   - "Attest benchmark claims without raw benchmark bodies.";
   - "Verify locally before trusting a dashboard.".
4. Use the same visual grammar everywhere: private memory core, proof artifact ring, optional public rail.

Exit criteria:

- Launch copy explains blockchain value without implying raw-memory publication or live transaction submission.
- Every asset includes a "what this does not prove" note.

### Phase 3: Ecosystem activation

Owner: partnerships and developer relations.

Actions:

1. Invite Solana, wallet, identity, benchmark, and agent-framework builders to review public-safe artifact shapes.
2. Offer three integration prompts:
   - verify a proof packet locally;
   - reference a capability grant or revocation by public-safe ref;
   - bind a benchmark claim to an attestation.
3. Publish partner-safe example flows using synthetic refs only.
4. Collect questions around PDA seeds, authority refs, nullifiers, settlement refs, verifier API shape, and conformance requirements.
5. Convert repeated questions into docs issues or FAQ entries, not unsupported roadmap promises.

Exit criteria:

- Partners understand that Solana is optional infrastructure for roots/refs and not a requirement for local proof value.
- No partner material implies live payment rails, production settlement, live mainnet anchoring, or token economics.

### Phase 4: Enterprise trust motion

Owner: sales engineering with security and product marketing.

Actions:

1. Package an enterprise proof packet walkthrough: anchor batch, grant, revocation, benchmark attestation, verifier result, and claim-boundary matrix.
2. Lead with evidence minimization, not compliance certification.
3. Use a buyer checklist that asks:
   - what artifact is being reviewed;
   - what exact fields are public;
   - what private fields are excluded;
   - what local verifier checked;
   - what remains outside Enigma's boundary.
4. Treat all customer-specific language as private until separately reviewed and approved.

Exit criteria:

- Enterprise reviewers can separate Enigma-controlled artifact evidence from provider behavior, hosted operations, legal compliance, and business outcomes.

## Demo asset plan

| Asset | Audience | Contents | Must show | Must not show |
| --- | --- | --- | --- | --- |
| 90-second terminal demo | Developers, Solana builders | install/test-drive, anchor, attest, verify, packet recap | `transaction_submitted:false`, `raw_memory_on_chain:false`, synthetic refs | Provider dashboards, real secrets, real customer data, explorer claims. |
| Five-command CLI page | Developers | `test-drive`, `chain anchor`, `chain grant`, `chain revoke`, `chain attest`, `chain verify` | Local-only wording and public-safe output snippets | Raw memory text, prompts, completions, embeddings, tenant names. |
| Architecture graphic | All audiences | private data plane -> proof artifacts -> optional Solana rail | Hashes, roots, refs, nullifiers, report hashes | "Memory on-chain" or full-document proof payloads. |
| Capability flow mock | Wallets, agent frameworks, enterprises | grant, verifier, revocation/nullifier | scoped subject/resource refs and expiry | Private ACL bodies or real identity claims. |
| Benchmark attestation packet | Benchmark researchers | report hash, dataset ref, runner ref, package ref, verifier result | Exact scope of any metric mentioned | "Best," "fastest," "more accurate," ROI, raw benchmark rows. |
| Claim-boundary one-pager | Sales, enterprise, press | allowed/conditional/prohibited claims | local proof vs chain vs hosted vs provider boundaries | Any claim without an evidence ref. |
| Solana proof rail explainer | Crypto ecosystem | root batch, PDA concept, optional settlement refs | opaque commitments only | Live mainnet, token, staking, yield, finality, or payment claims without evidence. |

## NPM test-drive hook

The npm hook is the public conversion path: every developer-facing launch asset should point to a local command before asking for integrations, credentials, wallets, hosted accounts, or partner calls.

Primary command:

```sh
npx --yes --package enigma-memory enigma test-drive
```

Proof-network demo variant:

```sh
npx --yes --package enigma-memory enigma test-drive \
  --out-dir .enigma/proof-network/test-drive
```

Required copy beside the command:

- Runs locally and does not require provider API keys, cloud credentials, hosted Enigma accounts, wallets, npm tokens, or package registry accounts.
- Writes an isolated demo directory and emits a public-safe JSON summary.
- Demonstrates Enigma-controlled local vault state, receipts, checkpoints, committed roots, exported bundle shape, and declared boundary operations.
- Does not contact hosted Enigma SaaS, submit Solana transactions, prove provider deletion, prove model forgetting, certify compliance, or prove customer ROI.

Post-test-drive call to action:

1. Create a Solana-ready local anchor batch from synthetic or generated public-safe roots.
2. Create a scoped capability grant using public-safe refs.
3. Create a revocation/nullifier artifact for a grant ref.
4. Create a benchmark attestation from a report hash or reviewed report file.
5. Verify each artifact locally and attach only public-safe JSON to issues, demos, or partner conversations.

## Docs sequence

Publish and link docs in this order so readers learn the safety boundary before the ecosystem story:

1. **Install and test-drive**: zero-credential local command, expected files, and safety boundaries.
2. **Proof Network overview**: artifact families, local verifier, Solana role, and what it is not.
3. **Demo scripts**: safe terminal paths for anchor, grant, revoke, attest, and verify.
4. **Claim boundaries**: mandatory allowed/conditional/prohibited language for public copy.
5. **Benchmark attestation**: how report hashes, dataset refs, runner refs, package refs, and metrics refs support scoped benchmark claims.
6. **Solana proof rail**: optional roots/refs/nullifiers/settlement refs, planning vs submission states, and no raw memory on-chain.
7. **Conformance and schemas**: artifact identifiers, public-safe fields, fixture expectations, and verifier behavior.
8. **Enterprise control plane**: evidence minimization, review workflow, and non-claims around compliance/provider deletion/model forgetting.
9. **FAQ**: repeat the top objections in plain language: why blockchain, what is public, what is private, what local verification proves, what remains unproven.

Every page should include a small boundary block:

```text
Proof Network artifacts are public-safe commitments and refs. They do not publish raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, secrets, provider responses, or private benchmark bodies. Local chain commands prepare and verify JSON artifacts; they do not submit transactions unless a separate command and evidence explicitly say so.
```

## Allowed proof and benchmark claims

| Claim type | Allowed launch wording | Required evidence or condition | Disallowed shortcut |
| --- | --- | --- | --- |
| Local proof artifacts | Enigma can generate local proof-network JSON artifacts for anchors, grants, revocations, benchmark attestations, and packets. | Command output or documented artifact example. | "Enigma proves every memory event is true." |
| Privacy boundary | Artifacts are designed to contain hashes, roots, refs, counts, timestamps, scopes, signatures, and validation status instead of raw memory. | Artifact fields and private-payload review. | "Hashes make all private data anonymous." |
| Solana readiness | Enigma can prepare Solana-ready anchor batches from public-safe roots and refs. | Artifact includes safe roots/refs plus `transaction_submitted:false` and `raw_memory_on_chain:false`. | "Anchored on Solana" without transaction evidence. |
| Grant/revocation | Enigma can create scoped grant and revocation/nullifier artifacts. | Public-safe subject/resource/capability refs and verifier result. | "Access was revoked everywhere" without enforcement evidence. |
| Benchmark attestation | Enigma can bind a benchmark report hash to dataset, runner, package, environment, and metric refs. | Exact report/ref, runner, dataset/ref, package/ref, metric, and scope. | "Best," "leading," "faster," or "more accurate" without approved comparative evidence. |
| Verification | The verifier can validate supported artifact shape and private-payload boundaries. | Local verifier output for the named artifact. | "Verification proves provider deletion, model forgetting, hosted readiness, or legal compliance." |

## Feedback loops

### Developer loop

Channels: GitHub issues, npm install/test-drive friction, docs page feedback, CLI copy questions.

Questions to ask:

1. Did the user understand why the test drive needs no credentials?
2. Could they create and verify a local proof artifact without reading the whole docs set?
3. Did any command output make them think a transaction was submitted?
4. Which field names or refs were confusing?
5. Did private-payload rejection teach the boundary clearly?

Action rule: turn repeated confusion into CLI help/docs copy changes before adding new features.

### Solana ecosystem loop

Channels: builder calls, hackathon feedback, wallet/identity/payment partner reviews.

Questions to ask:

1. Which proof refs would a Solana program, wallet, or indexer need?
2. Are PDA seeds and account refs public-safe and compact?
3. Which settlement refs are useful without implying live payments?
4. What evidence would be required before anyone can say "anchored" or "finalized"?

Action rule: collect protocol feedback as spec questions; do not convert it into live-chain claims until implementation and transaction evidence exist.

### Benchmark loop

Channels: benchmark researchers, third-party runner maintainers, reproducibility reviews.

Questions to ask:

1. Can a third party reproduce the attestation from the report hash and public-safe refs?
2. Is the metric scope narrow enough to avoid universal claims?
3. Are private prompts, completions, provider responses, and raw dataset rows excluded from public artifacts?
4. Does the attestation invite verification rather than asserting superiority?

Action rule: publish scoped benchmark examples; hold comparative claims until fixed methodology, pinned versions, and approved evidence exist.

### Enterprise loop

Channels: sales engineering reviews, security questionnaires, legal/compliance calls.

Questions to ask:

1. Did the reviewer understand what Enigma controls and what providers control?
2. Did the proof packet reduce plaintext disclosure in the review process?
3. Which claim boundaries require clearer wording?
4. What additional evidence would be needed for a customer-specific deployment or control claim?

Action rule: keep enterprise feedback tied to evidence requirements, not broad promises.

## Launch package and channel plan

The launch should ship as one coordinated package, not as scattered claims. Each channel gets a specific job and a safety boundary.

| Channel | Job | Asset to ship | CTA | Safety boundary |
| --- | --- | --- | --- | --- |
| NPM / install docs | Convert curiosity into a local proof trial. | Test-drive command block, expected output fields, next proof commands. | Run `npx --yes --package enigma-memory enigma test-drive`. | No credentials, hosted account, wallet, provider call, or transaction claim. |
| README / developer docs | Teach the artifact model. | Artifact family table, five-command walkthrough, verifier notes. | Generate and verify one local artifact. | Local verification checks shape and privacy boundaries, not real-world truth. |
| Launch blog | Create the category. | Private data plane / public proof plane narrative. | Try the local test drive and read claim boundaries. | Solana is optional root/ref infrastructure, not raw-memory storage. |
| Short demo video | Make the product tangible. | 90-second terminal path from test-drive to verify. | Install, test-drive, verify. | Show `transaction_submitted:false` and `raw_memory_on_chain:false`. |
| Solana ecosystem post | Explain blockchain-specific value. | Opaque roots, capability refs, nullifiers, benchmark commitments, settlement refs. | Review anchor-batch and grant/revocation artifacts. | No live mainnet, token, staking, yield, or finality language without evidence. |
| Benchmark note | Build technical credibility. | Attestation example tied to report hash and refs. | Create a scoped benchmark attestation. | No leaderboard or comparative claim without approved methodology. |
| Enterprise brief | Reduce buyer risk. | Proof packet review flow and claims matrix. | Ask for a proof packet walkthrough. | Not a compliance certification, provider deletion proof, or model forgetting proof. |

## Two-week launch calendar

| Day | Work | Output | Go/no-go check |
| --- | --- | --- | --- |
| -10 | Claims review | Final approved message, prohibited-claim list, synthetic demo refs. | All launch copy distinguishes local artifacts from hosted/chain/provider behavior. |
| -8 | Demo rehearsal | Terminal recording script, screenshot list, fallback snippets. | No raw memory, local paths with usernames, secrets, provider responses, or fake transaction IDs appear. |
| -6 | Docs staging | Install, proof overview, demo, claim boundaries, benchmark attestation, and Solana proof rail links. | A new reader reaches the test-drive before any advanced integration ask. |
| -4 | Partner preview | Solana, benchmark, wallet/identity, and agent-framework review packet. | Feedback is recorded as questions or docs fixes, not converted into unsupported promises. |
| -2 | Sales enablement | Enterprise one-pager, FAQ answers, demo talk track. | Every buyer-facing claim has an artifact, evidence ref, or explicit condition. |
| 0 | Public launch | Blog, README/docs update, demo video, social clips, partner outreach. | Launch assets contain the same product definition and boundary block. |
| +2 | Developer triage | Issue labels for install, proof artifact, verifier, privacy rejection, docs confusion. | Repeated confusion is assigned to docs/CLI copy owners. |
| +7 | Feedback synthesis | Public-safe launch learning memo. | The memo contains no raw user memory, tenant names, prompts, transcripts, completions, provider responses, or secrets. |

## Asset acceptance checklist

Before an asset is publishable, the owner must answer these questions in writing inside the review ticket or launch checklist:

1. What exact artifact family does the asset mention: anchor batch, capability grant, capability revocation, benchmark attestation, proof packet, or verifier result?
2. What command, schema, report hash, package ref, runner ref, dataset ref, or example field supports the claim?
3. Does the asset say whether the artifact is local-only, Solana-ready, devnet-submitted, or live-submitted? If there is no approved transaction evidence, it must say local-only or planning.
4. Does the asset avoid raw memory, prompts, transcripts, completions, embeddings, ACL bodies, tenant names, private keys, API keys, seed phrases, provider responses, local usernames, and private benchmark bodies?
5. Does the asset avoid unsupported claims about hosted SaaS, compliance, provider deletion, model forgetting, ROI, settlement finality, token economics, or benchmark leadership?
6. Is the call to action concrete enough for the audience to take the next safe step?

## Objection handling

| Objection | Safe response | Follow-up asset |
| --- | --- | --- |
| "Why blockchain?" | Public rails can make opaque proof roots, capability refs, nullifiers, benchmark commitments, and settlement refs discoverable without exposing memory. | Solana proof rail explainer. |
| "Is memory on-chain?" | No. Launch examples must show roots/refs/counts/signatures only and `raw_memory_on_chain:false`. | Architecture graphic and claim-boundary one-pager. |
| "Does this prove deletion?" | It can represent Enigma-controlled revocation or deletion-request boundaries when instrumented; it does not prove provider deletion or model forgetting. | FAQ and enterprise brief. |
| "Can I test it without credentials?" | Yes. Start with the npm test-drive, which is local-only and zero-credential. | Install/test-drive page. |
| "Can benchmarks prove Enigma is best?" | Benchmark attestations bind scoped report evidence; superiority claims require separate comparative methodology and approval. | Benchmark attestation packet. |
| "Is hosted SaaS live?" | Do not claim live hosted service unless separate deployment, auth, support, legal, monitoring, and go-live evidence exists. | Claim-boundary matrix. |

## Operating checklist before launch

- The homepage, README, docs, demo script, sales deck, and social posts all use the same product definition.
- Every public artifact example uses synthetic public-safe roots, refs, counts, scopes, signatures, and timestamps.
- Every chain-related screenshot visibly shows local/planning status unless actual approved transaction evidence exists.
- Every benchmark number is scoped to an exact report/ref and avoids broad comparison language unless approved evidence exists.
- Every enterprise asset states that Proof Network is not a compliance certification, provider deletion proof, model forgetting proof, hosted SaaS evidence, or ROI guarantee.
- Every CTA sends developers to the npm test-drive before advanced integration steps.
- Every feedback channel has an owner and a rule for converting repeated confusion into docs, examples, or product copy.

## Launch success indicators

Use qualitative and artifact-based indicators rather than unsupported business-outcome claims:

- Developers complete the local test-drive and can explain the public-safe artifact boundary.
- Builders create or inspect anchor, grant, revocation, attestation, or packet artifacts without including private payloads.
- Solana ecosystem readers describe Enigma as optional proof/permission/settlement rails for roots and refs, not raw memory storage.
- Benchmark readers cite exact report hashes, dataset refs, runner refs, package refs, and metric scopes.
- Enterprise reviewers ask for proof packets and claim-boundary matrices instead of raw transcripts or broad compliance promises.

## Final launch rule

The strongest launch claim is the narrow one: Enigma creates and verifies public-safe proof artifacts for Enigma-controlled AI memory boundaries. Everything else—hosted service operation, live chain submission, provider deletion, model forgetting, compliance, benchmark superiority, payments, ROI, or settlement finality—requires separate evidence and separate approval before it appears in public copy.
