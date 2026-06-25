# Tokenless settlement strategy

**Audience:** product, revenue, partnerships, and protocol strategy.
**Status:** planning strategy, not a token plan, legal opinion, financing document, or production settlement claim.
**Boundary:** Enigma is the private memory controller for AI. Solana is an optional proof, permission, and settlement rail that carries hashes, roots, refs, and aggregate accounting pointers only.

## Executive position

Enigma should monetize the Proof Network with ordinary revenue mechanics before any token discussion: USD credits, card payments, invoices, enterprise contracts, partner billing, and optional future USDC escrow. The product should prove that buyers will pay for private AI memory control, proof packets, capability lifecycle evidence, hosted or managed verification convenience, and enterprise governance before introducing any native-token surface.

The first economic primitive is not a coin. It is a **settlement reference**: a public-safe identifier that links a billable Enigma action to an opaque proof artifact without exposing raw memory. A buyer can pay in USD for credits. Enigma can meter usage against those credits. A proof packet can include a settlement ref that lets finance, partners, or auditors reconcile the charge to a public-safe memory-control event.

That sequence keeps the product credible:

1. Sell useful software and verification workflows in USD.
2. Prove repeatable demand for memory control and proof artifacts.
3. Add optional USDC/Solana escrow only where it reduces partner friction.
4. Consider a native token only after legal review, product-market proof, real network participants, and a clear reason that credits, invoices, USDC, and normal contracts cannot solve.

## Economic thesis

Enigma's revenue opportunity is control-plane value, not speculative transaction volume. Customers pay because Enigma helps them manage durable AI memory safely:

- creating and verifying public-safe proof packets,
- managing capability grants and revocations,
- attaching benchmark reports to attestable hashes and refs,
- producing procurement-safe evidence packs,
- coordinating partner access to memory-bound permissions,
- operating private or managed verification workflows,
- reducing integration friction across agents, models, and enterprise review paths.

The economic moat is the mapping between private memory state and verifiable public-safe commitments. The settlement rail should make that mapping easier to buy, audit, and partner around. It should not become the product's center of gravity.

## Revenue-first settlement model

### 1. USD credits first

Credits should be denominated in USD, bought through normal payment channels, and consumed by metered Enigma activity. Credits are an internal commercial unit, not an investment instrument, transferable security, or governance right.

Good first credit sinks:

- hosted verification API requests,
- proof packet storage or management,
- managed anchor-batch preparation,
- enterprise evidence-pack generation,
- team seats or workspace usage,
- partner conformance runs,
- managed benchmark attestation workflows,
- support or integration bundles.

Credit records should reference public-safe artifact IDs, packet hashes, workspace refs, usage counts, timestamps, and invoice refs. They should not contain prompts, transcripts, completions, embeddings, raw memory, tenant names, private ACL bodies, API keys, private keys, provider responses, or human-readable customer data.

### 2. Stripe and invoice rails before crypto rails

The default buyer path should be familiar:

- self-serve card payment for developer and team credits,
- invoice and purchase order for enterprise buyers,
- annual or monthly contracts for governance features,
- partner billing for integrations and conformance programs.

This lets Enigma validate price, packaging, retention, support cost, buyer role, procurement friction, and margin before introducing wallet operations or on-chain settlement risk. It also keeps the proof story legible to customers who care about AI governance but are not crypto-native.

### 3. Optional USDC/Solana escrow later

USDC/Solana should be introduced only when it solves a specific partner or marketplace problem. Suitable later use cases:

- partner escrow for a marketplace integration,
- prepaid settlement between independent verifier/operators,
- usage deposits for high-volume API consumers,
- programmable split settlement for partner channels,
- public proof that a settlement obligation references a specific packet hash or capability ref.

Even then, the on-chain payload should remain narrow:

- invoice or settlement refs,
- proof packet hashes,
- capability or revocation refs,
- aggregate usage roots,
- payer/payee public identifiers or opaque refs,
- escrow status and expiry,
- token mint reference for USDC when applicable.

No raw memory or private business payload belongs on-chain.

## Product packaging

### Free and open trust layer

Keep basic verification accessible enough to become a standard:

- public schemas,
- local verifier,
- sample proof packets,
- basic anchor-batch planning,
- public-safe examples,
- documentation that explains what artifacts do and do not prove.

This creates distribution without forcing payment before trust.

### Developer credits

Developer credits should price convenience and volume:

- hosted verifier calls,
- proof packet workspace history,
- team artifact sharing,
- CI integration for benchmark attestations,
- managed packet export and retention,
- integration support.

The developer SKU should be easy to understand: pay dollars, receive credits, use credits against clearly metered actions. No token wallet should be required.

### Enterprise contracts

Enterprise revenue should be contract-led:

- private verifier deployment or dedicated hosted environment,
- SSO/SCIM and policy controls,
- KMS/BYOK integrations when available,
- procurement evidence packs,
- audit export workflows,
- support and implementation services,
- partner conformance management.

Enterprise buyers should not have to understand Solana to buy Enigma. Solana readiness should be presented as optional accountability infrastructure, not a prerequisite.

### Partner and operator programs

Partner economics can use credits first and escrow later:

- integration partners consume credits for verifier calls and conformance runs,
- operators earn contracted fees for validated services,
- marketplaces can reference packet hashes and settlement refs,
- future USDC escrow can hold funds against public-safe operator obligations.

Do not design partner economics around token emissions. Pay for useful work with ordinary commercial terms until a real network requires a stronger mechanism.

## Commercial ledger design

The credit ledger should be boring, auditable, and finance-friendly. It should answer four questions without exposing private data:

1. Who bought credits, represented by an internal account or payer ref.
2. Which product action consumed credits, represented by a public-safe usage category.
3. Which proof artifact or packet the action relates to, represented by a hash or ref.
4. Which invoice, card payment, or enterprise contract funded the credit balance.

Recommended ledger entries:

- credit purchase,
- credit adjustment,
- proof-action debit,
- invoice reconciliation,
- refund or contract correction when approved through normal finance process,
- partner usage allocation,
- escrow reservation if a future USDC flow is enabled.

The ledger should not try to become a public chain by itself. It is an internal commercial accounting surface that can export public-safe commitments when a buyer or partner needs portable evidence. The exported commitment should be smaller than the ledger row: refs, hashes, counts, schema IDs, and flags only.

## Pricing units

Pricing should attach to value that customers can understand before they care about settlement infrastructure:

| Unit | Why it can be sold | Settlement evidence |
| --- | --- | --- |
| Verified proof packet | Customer needs portable proof for review or integration. | Packet hash, schema ref, verifier ref. |
| Capability lifecycle event | Customer needs grant/revoke evidence around memory access. | Capability ref, revocation ref, expiry, signer ref. |
| Benchmark attestation | Customer needs a report bound to reproducible refs. | Report hash, dataset ref, runner ref, package ref. |
| Hosted or managed verification | Customer wants convenience, history, quotas, or support. | Usage count, workspace ref, invoice ref. |
| Partner conformance run | Partner needs an integration checked against Enigma formats. | Conformance packet hash, partner ref, version ref. |

Do not price the story as "transactions on Solana." Price the memory-control outcome. Solana can later make selected commitments easier to prove publicly, but the buyer value starts with controlled private AI memory and usable evidence.

## Stripe and invoice operating rules

Stripe/card and invoice flows should be the canonical settlement path until a specific partner requires crypto settlement.

- Card payment buys USD-denominated credits for self-serve users.
- Invoice payment funds credits, committed usage, or enterprise contract entitlements.
- Enterprise contracts can include minimum commitments, support terms, private deployment services, or partner program fees.
- Credit usage should be visible in a customer-facing account view using public-safe refs and categories.
- Internal finance records may contain private billing data, but exported proof artifacts must not.

If Stripe, invoice, and contract workflows cannot explain the business, a native token will not fix it. The tokenless system is the discipline test.

## Settlement artifact boundary

A settlement record may safely bind money movement to proof-network evidence if it contains only public-safe commitments.

Recommended public-safe fields:

- `settlement_ref`,
- `invoice_ref`,
- `workspace_ref`,
- `artifact_kind`,
- `packet_hash`,
- `capability_ref`,
- `revocation_ref`,
- `usage_period`,
- `usage_count`,
- `credit_amount_usd`,
- `payer_ref`,
- `payee_ref`,
- `created_at`,
- `schema_ref`,
- `verifier_ref`,
- `raw_memory_included:false`,
- `transaction_submitted:false` unless a real transaction path exists and is verified.

Fields to exclude:

- prompts,
- transcripts,
- completions,
- embeddings,
- raw memories,
- tenant or customer names,
- private ACL bodies,
- detailed user identities,
- API keys,
- private keys,
- seed phrases,
- provider responses,
- private invoices or contract terms.

The artifact should prove enough for reconciliation without becoming a privacy leak.

## Optional USDC/Solana escrow constraints

USDC/Solana escrow should be treated as a later settlement adapter, not a new product category. It should be added only when a specific workflow benefits from public, programmable settlement between parties that do not want to rely solely on Enigma's internal ledger.

Acceptable escrow shape:

- payer deposits USDC against an opaque settlement ref,
- release conditions point to proof packet hashes, capability refs, verifier refs, or aggregate usage roots,
- expiry and refund paths are explicit,
- off-chain invoices or contracts remain the source for private commercial terms,
- transaction status is represented truthfully as planned, submitted, finalized, expired, released, or refunded,
- raw memory remains outside both the transaction and the public proof packet.

Escrow should not become a way to publish customer economics. Public chain records can reveal timing, counterparties, amounts, and activity patterns. If that metadata is sensitive, keep settlement in Stripe, invoice, contract, or private ledger form and export only a minimized proof ref.

## Token boundary

A native token is not required for the initial product. It should remain explicitly out of scope until Enigma has evidence that normal payment rails and optional USDC cannot support the network.

### Conditions before any native-token exploration

Do not begin native-token design unless all of the following are true:

1. The USD-credit product has repeatable paying usage.
2. There are independent participants whose incentives cannot be handled by contracts, credits, or USDC escrow.
3. The token has a concrete job that is not marketing, fundraising, community speculation, or artificial scarcity.
4. Legal counsel has reviewed the structure, jurisdictions, distribution plan, disclosures, and operational controls.
5. Product leadership can explain why a native token improves customer outcomes rather than distracting from private memory control.
6. The protocol can operate without exposing private memory, customer data, or private business terms on-chain.

### Token jobs that are not enough

These are weak reasons to launch a token:

- creating buzz,
- implying decentralization before independent operators exist,
- subsidizing usage with emissions,
- replacing revenue with speculation,
- avoiding normal sales work,
- making a roadmap look more crypto-native,
- turning credits into a tradeable asset,
- promising future network value before product proof.

If the token does not make verification, permissioning, operator coordination, or settlement materially better for real users, do not launch it.

## What not to do

- Do not claim live Solana settlement unless verified production transactions exist.
- Do not imply that local planning artifacts are submitted transactions.
- Do not put raw memory, prompts, transcripts, completions, embeddings, tenant names, customer names, ACL bodies, provider responses, secrets, private keys, or API keys on-chain.
- Do not call USD credits a token, coin, yield product, staking instrument, governance right, or investment.
- Do not sell credits as appreciating, transferable, refundable by default, or profit-bearing.
- Do not promise ROI, revenue share, compliance certification, benchmark superiority, provider deletion, model forgetting, or hosted-SaaS operation without verified evidence.
- Do not make Solana required for ordinary Enigma adoption.
- Do not use token emissions to hide weak pricing, unclear value, or missing demand.
- Do not create a native token before the product has legal clearance and a reason that simpler rails cannot solve.
- Do not let settlement artifacts become a second data exhaust channel.

## Example settlement flows

### Self-serve developer

1. Developer buys USD credits through Stripe/card.
2. Enigma records a credit purchase against an account ref and payment ref.
3. Developer generates proof packets, verifier calls, or benchmark attestations.
4. Credits are debited by metered action.
5. The customer-facing usage view shows dates, action categories, artifact refs, packet hashes, credit debits, and remaining balance.
6. No wallet, token, raw memory disclosure, or Solana transaction is required.

### Enterprise invoice

1. Enterprise signs a contract or purchase order for a defined entitlement.
2. Enigma maps the entitlement to credits, seats, support, deployment work, or managed verification capacity.
3. Usage records bind invoice refs to public-safe packet hashes and workspace refs.
4. Procurement receives an evidence export that proves what categories of artifacts were generated without exposing private memory or private contract terms.
5. Optional Solana anchoring remains a separate review decision.

### Partner escrow candidate

1. A partner wants programmable settlement for a marketplace or operator workflow.
2. Enigma first proves the same workflow using USD credits and settlement refs.
3. If escrow still reduces counterparty friction, a USDC deposit can reference the settlement ref and release against packet hashes or verifier refs.
4. The on-chain record contains only refs, hashes, status, expiry, and public settlement metadata.
5. Private invoices, customer names, memory contents, and detailed usage logs stay off-chain.

## Decision rules

- If a buyer can pay through card or invoice, do that first.
- If a partner needs stablecoin settlement but not a new asset, use USDC later.
- If a workflow only needs proof of event existence, use hashes, roots, refs, and optional anchoring.
- If a workflow requires private commercial terms, keep it off-chain.
- If a proposed token primarily changes marketing language, reject it.
- If a proposed token materially improves a real multi-party network after revenue, legal review, and product proof, evaluate it then.

## Sequencing roadmap

### Phase 1: Commercial proof without crypto dependency

- Define metered proof-network actions.
- Sell USD credits and invoice-based contracts.
- Attach internal settlement refs to proof packets and usage records.
- Keep all settlement artifacts public-safe and local-verifiable.
- Measure which workflows buyers actually pay for.

### Phase 2: Partner settlement readiness

- Standardize settlement refs that can point to packet hashes, capability refs, revocation refs, and aggregate usage roots.
- Add partner-facing reconciliation exports.
- Keep card, invoice, and enterprise contract rails as the primary payment paths.
- Document optional Solana/USDC mapping without claiming live settlement.

### Phase 3: Optional USDC escrow

- Introduce USDC escrow only for partners that need programmable settlement.
- Keep private memory off-chain.
- Anchor only refs, hashes, roots, expiry, aggregate usage, and escrow state.
- Provide explicit flags for submitted vs. planned transactions.

### Phase 4: Native-token decision gate

- Reassess only after repeatable revenue, active partners, clear operator roles, and legal review.
- Prefer no token unless it solves a real coordination problem.
- If the answer is unclear, keep scaling USD credits, invoices, contracts, and optional USDC.

## Strategic message

The marketable line is:

> Enigma lets teams buy private AI memory control in dollars today, while keeping proof and settlement artifacts ready for public rails tomorrow.

That message is stronger than a token launch. It tells enterprise buyers that Enigma understands procurement. It tells Solana partners that the chain role is precise and privacy-preserving. It tells developers that no wallet is required to start. And it keeps the product thesis intact: Enigma is the private memory controller for AI; public rails carry commitments, permissions, and settlement references only.
