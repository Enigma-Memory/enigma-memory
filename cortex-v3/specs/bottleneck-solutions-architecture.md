# Enigma Cortex v3 — Bottleneck Solutions Architecture

Research memo mapping each remaining Cortex v3 bottleneck to concrete solutions, implementation paths, vendor/options, cost/risk estimates, and next-step owners. This document folds in the latest public guidance on token legal structure and royalty mechanics for the optional SAL / ENIGMA token layer.

---

## 1. Bottleneck summary

| #   | Bottleneck                                | Current state                                                 | Target state                                                  | Owner domain           |
| --- | ----------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------- |
| 1   | Local Windows Anchor CLI                  | GitHub Actions Ubuntu runner works; local Windows build fails | `anchor build/test` works on Windows 11 Home (WSL2 or native) | Engineering / DevEx    |
| 2   | Mainnet deployment and custody            | Devnet only; no mainnet wallet or custody strategy            | Audited programs deployed to mainnet with documented custody  | Security / Operations  |
| 3   | Verifiable memory (TEE/STARK)             | Off-chain node is semi-trusted                                | Cryptographic proofs of memory access/processing              | Research / Engineering |
| 4   | Production vector DB + embedding pipeline | SQLite + OpenAI embeddings                                    | Scalable semantic search with own embedding pipeline          | ML / Backend           |
| 5   | Token legal structure                     | No legal review started                                       | Counsel-approved token classification and jurisdiction plan   | Legal / Tokenomics     |
| 6   | Security audit                            | No auditor selected                                           | External audit complete, findings remediated                  | Security               |
| 7   | Frictionless UX                           | Partially researched                                          | One-login cross-model memory with auto-save                   | Product / Frontend     |

---

## 2. Local Windows Anchor CLI

### Problem

Developers on Windows 11 Home cannot run `anchor build` or `anchor test` locally. All Solana/Anchor work depends on the GitHub Actions Ubuntu runner.

### Solution options

| Option                           | Path                                                                                     | Cost               | Trade-off                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------- |
| A. WSL2 Ubuntu toolchain         | Install WSL2, Ubuntu 22.04/24.04, Rust 1.75.0, Solana 1.18.26, Anchor 0.30.1, Node 20+   | Free (OS built-in) | Requires WSL2 enabled; filesystem cross-over can be slow |
| B. Native Windows toolchain      | Use `cargo-build-sbf` via `rustup` target, Solana CLI Windows binary, Anchor npm package | Free               | Historically fragile; path/MSYS2 issues common           |
| C. Dev container / Docker        | Provide `.devcontainer` with pre-installed toolchain and volume mounts                   | Free               | Heavier; requires Docker Desktop / WSL2 backend          |
| D. Cloud IDE (Gitpod/Codespaces) | Pre-built container with repo clone and dependencies                                     | ~$10–50/user/mo    | Removes local dependency entirely                        |

### Recommended path

**Option A + D**: publish a WSL2 setup runbook as the default local path, and provide a GitHub Codespaces / devcontainer definition as the zero-friction option. Keep the GitHub Actions runner as CI truth.

### Implementation steps

1. Verify WSL2 is installed and Ubuntu 22.04 is available.
2. Install Rust 1.75.0 via `rustup`.
3. Install Solana CLI 1.18.26 from GitHub release tarball.
4. Install Anchor 0.30.1 via `npm install -g @coral-xyz/anchor-cli@0.30.1`.
5. Confirm `cargo check --workspace`, `anchor build --no-idl`, and `anchor test --skip-build` pass.
6. Document the exact commands in `docs/windows-anchor-setup.md`.
7. Add a devcontainer config with the same versions pinned.

### Cost / risk

- **Cost**: $0 tooling; ~1–2 days setup/documentation.
- **Risk**: Low. Main risk is version drift between local and CI; mitigate by pinning versions in a single `cortex-v3/.tool-versions` or CI matrix.

---

## 3. Mainnet deployment and custody

### Problem

No mainnet wallet, no custody strategy, no mainnet CI job. Programs exist only on devnet. The devnet workflow stores a single hot wallet in GitHub secrets (`SOLANA_DEVNET_WALLET`), which is not a safe pattern for mainnet authority.

### Solution options

| Layer           | Option                                                                                       | Notes                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Wallet creation | Air-gapped machine + hardware signer (Ledger Flex/Stax or Keystone)                          | Generate key on isolated device; never expose seed in CI                                |
| Multisig        | **Squads Protocol v4** (recommended) or Glow/Solflare multisig                               | 3-of-5 or 4-of-7; formally verified, time locks, sub-accounts                           |
| Custody         | Institutional: Copper, Anchorage, BitGo, Fireblocks; Self-custody: Squads + hardware signers | Institutional adds cost and KYC; self-custody requires operational discipline           |
| CI/CD           | GitHub Actions job with narrowly scoped proposer key                                         | Use Squads vault PDA; never commit raw key; require `environment: production` reviewers |
| RPC             | Helius primary + QuickNode/Alchemy failover                                                  | Paid endpoints required for mainnet production                                          |

### 3.1 Custody model: hot wallet vs Ledger vs multisig vs HSM

#### Hot wallet (software keypair in CI)

- **Use case:** Devnet automation, low-value operational wallets, CI smoke tests.
- **Risk:** Private key exists in GitHub secret material and CI runner memory. A compromised PAT, reusable workflow, or third-party Action can drain funds or maliciously upgrade programs.
- **Current state:** `SOLANA_DEVNET_WALLET` is configured; `SOLANA_MAINNET_WALLET` is not.
- **Verdict:** Acceptable for devnet, **not acceptable as mainnet program upgrade authority or treasury controller**.

#### Ledger hardware wallet

- **Use case:** Cold storage of protocol treasury, deployer key, or multisig member key.
- **Solana support:** Ledger Nano S Plus / Nano X / Flex Solana Edition support the Solana app; referenced as `usb://ledger` from the Solana CLI.
- **Risk:** Physical loss, supply-chain attacks, UI blind signing. Must verify addresses on device and use a dedicated machine for signing.
- **Verdict:** Recommended for **at least one cold-key holder** in any multisig and for treasury withdrawal keys.

#### Multisig — Squads Protocol v4 (recommended)

- **Use case:** Program upgrade authority, treasury, payroll, and operational spending.
- **Why it fits Cortex:** Squads v4 is the current Solana standard for program custody. It adds time locks, spending limits, roles, sub-accounts, batch payments, and address-lookup-table support. The protocol is formally verified and secures >$10 B in value on Solana.
- **Key facts:**
  - One-time deployment fee: ~0.05 SOL (Basic tier).
  - Business tier unlocks workflows for ~$49/mo.
  - Network fees are higher than Phantom/Backpack because instructions execute through smart accounts.
  - CLI and browser verification tools are available for high-security environments.
- **Verdict:** **Primary custody layer for mainnet.** Transfer program upgrade authority and treasury ownership to a Squads multisig (e.g., 3-of-5 or 4-of-7).

#### Multisig — Realms / SPL Governance

- **Use case:** DAO governance of a protocol treasury or parameter changes.
- **Why consider it:** Realms hosts ~97% of Solana DAOs and supports on-chain voting + treasury control.
- **Trade-off:** Realms is heavier than Squads for day-to-day operations and is better suited to public governance than to engineering deployment keys.
- **Verdict:** Consider for **later DAO transition** of the Cortex treasury or royalty parameters, not for initial deployment authority.

#### Hardware Security Module (HSM)

- **Use case:** Institutional-grade signing of high-value keys without exposing key material to application memory.
- **Solana-specific concern:** Solana uses Ed25519. Not all HSMs/firmware replicate Ed25519 keys across clusters cleanly (e.g., Azure Cloud HSM has reported replication issues with ED25519 token keys).
- **Vendors:** AWS CloudHSM, Google Cloud HSM, Azure Dedicated HSM, Thales Luna, Utimaco.
- **Integration:** Typically through PKCS#11; the app sends the transaction hash to the HSM and receives a signature.
- **Verdict:** Overkill for the initial Cortex launch but a **valid future step** for institutional custody or regulated token operations. If adopted, require vendor proof of Ed25519 cluster replication before purchase.

#### Recommended tiered model

| Asset / Capability        | Tier 1 (devnet)        | Tier 2 (mainnet launch)                   | Tier 3 (institutional scale)  |
| ------------------------- | ---------------------- | ----------------------------------------- | ----------------------------- |
| Program upgrade authority | GitHub hot wallet      | Squads v4 multisig                        | Squads v4 + HSM-backed member |
| Treasury / protocol fees  | GitHub hot wallet      | Squads v4 treasury                        | Squads v4 → Realms DAO + HSM  |
| Deployer / fee payer      | GitHub hot wallet      | Dedicated CI hot wallet, funded sparingly | HSM or MPC signer             |
| Team operating wallet     | Individual hot wallets | Ledger-backed Squads member               | Ledger + HSM quorum           |

### 3.2 CI/CD safe signing patterns

**Principle:** CI should never hold the keys that can upgrade production programs or move treasury funds. Where CI must sign (e.g., buffer writes for Squads proposals), use a narrowly funded, single-purpose deployer key.

#### Pattern A — Direct hot-wallet deploy (devnet only)

- Store `SOLANA_DEVNET_WALLET` as a GitHub secret.
- Limit workflow triggers to `workflow_dispatch` or specific branches.

#### Pattern B — Squads multisig proposal from CI (mainnet)

- The CI runner holds a **proposer key** that has only `voter` permission in Squads.
- The workflow builds, writes a program buffer, writes an IDL buffer, and proposes a multisig transaction.
- Human signers approve the proposal in the Squads UI.
- After execution, on-chain verification runs automatically.

Required secrets for Pattern B:

| Secret                      | Purpose                                                |
| --------------------------- | ------------------------------------------------------ |
| `MAINNET_SOLANA_DEPLOY_URL` | Paid RPC endpoint (Helius/QuickNode).                  |
| `MAINNET_DEPLOYER_KEYPAIR`  | Base58/JSON keypair with Squads voter permission only. |
| `MAINNET_MULTISIG`          | Squads multisig PDA.                                   |
| `MAINNET_MULTISIG_VAULT`    | Squads vault address (default index 0).                |

#### General CI hardening

- Use **GitHub Environments** (`production`) with required reviewers for any mainnet job.
- Pin all third-party Actions by commit SHA, not floating tags.
- Add `actionlint` and `zizmor` to the pipeline to catch secret-exfiltration patterns.
- Never pass secrets to `toJSON()` or log them.
- Use OIDC workload-identity federation for cloud roles instead of long-lived credentials.
- Sign release artifacts with Cosign/Sigstore and generate SLSA provenance.
- Run `cipher-solana-wallet-audit` or similar to block plaintext keys in commits.

### 3.3 Mainnet RPC providers: Helius vs QuickNode

| Dimension            | Helius                                                              | QuickNode                                     |
| -------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| Focus                | Solana-native                                                       | Multi-chain (30+ chains)                      |
| Free tier            | 1 M credits / 10 RPS                                                | 10 M credits / 15 RPS                         |
| Paid entry           | $49/mo Developer (10 M credits)                                     | $10/mo Starter (25 M credits)                 |
| Business tier        | $499/mo (100 M credits, 200 RPS, staked connections)                | Growth $39/mo (75 M credits, 125 RPS)         |
| Latency (p95)        | ~140–225 ms                                                         | Slightly more variable under cross-chain load |
| Uptime               | 99.99%                                                              | 99.95%                                        |
| Solana-specific APIs | DAS, priority fee estimate, enhanced tx parsing, staked connections | Yellowstone gRPC, DAS, marketplace add-ons    |
| SOC 2                | Type II (June 2025)                                                 | Available on enterprise tiers                 |

**Recommendation:** Use **Helius for mainnet production** because Cortex is Solana-only and benefits from staked connections (better transaction landing) and the priority-fee estimator. Keep a **QuickNode or Alchemy backup endpoint** for failover.

### 3.4 Fee estimation and compute budgets

**Fee formula:**

$$
\text{Total Fee} = \text{Base Fee} + \text{Priority Fee}
$$

where

$$
\text{Base Fee} = 5{,}000 \text{ lamports per signature}
$$

and

$$
\text{Priority Fee} = \left\lceil \frac{\text{compute\_unit\_price} \times \text{compute\_unit\_limit}}{1{,}000{,}000} \right\rceil \text{ lamports}
$$

**Key rules:**

- Fees are charged whether a transaction succeeds or fails.
- Priority fees are local to writable accounts, not global. Use account-aware estimation.
- Default CU limit is ~200,000 per non-built-in instruction; max per tx is 1,400,000.
- Set `SetComputeUnitLimit` to the actual measured CU count to avoid paying for unused units.
- During normal conditions, priority fees are unnecessary; use them for congestion or time-sensitive ops.

**Implementation:**

- Use Helius `getPriorityFeeEstimate` or QuickNode `qn_estimatePriorityFees` to fetch percentile bands.
- Target the 50th–75th percentile for routine operations, 90th+ for urgent upgrades.
- Pre-compute CU budgets in tests with `solana program run --compute-unit-limit` or simulate transactions before broadcast.

### 3.5 Program upgrade authority

**Current state:** Programs are deployed with the CLI wallet as upgrade authority (default for Anchor).

**Target state:**

1. Deploy initial programs with a temporary deployer key.
2. Transfer upgrade authority to the Squads v4 multisig:
   ```bash
   solana program set-upgrade-authority <PROGRAM_ID> \
     --new-upgrade-authority <SQUADS_VAULT_PDA> \
     --url mainnet-beta
   ```
3. Verify:
   ```bash
   solana program show <PROGRAM_ID> --url mainnet-beta | grep "Upgrade Authority"
   ```
4. For a final, audited release, consider making programs immutable:
   ```bash
   solana program set-upgrade-authority <PROGRAM_ID> --final --url mainnet-beta
   ```
   > Warning: immutable programs can never be updated or closed.

**Governance rules:**

- Minimum 3-of-5 signers for any upgrade.
- Time-lock proposals for ≥24 h on mainnet upgrades.
- Reject any buffer that does not match a verifiable build hash.
- Publish release notes and the on-chain verifiable-build hash before voting.

### 3.6 IDL publication

Anchor IDLs are required for client discovery and Solana Explorer rendering.

**Current build:** Uses `anchor build --no-idl` and copies committed IDLs from `idl/` to `target/idl/`.

**Mainnet workflow:**

1. Build normally; generate fresh IDLs.
2. Publish or upgrade the on-chain IDL:

   ```bash
   # Initial publish
   anchor idl init --filepath target/idl/<program>.json <PROGRAM_ID> \
     --provider.cluster mainnet-beta

   # Subsequent upgrades
   anchor idl upgrade <PROGRAM_ID> --filepath target/idl/<program>.json \
     --provider.cluster mainnet-beta
   ```

3. Verify on Solana Explorer at `https://explorer.solana.com/address/<PROGRAM_ID>/anchor-program`.

**Multisig path:** When using Squads, the CI workflow writes an IDL buffer and proposes a `set-buffer` transaction; human signers approve it. After execution, the buffer closes and lamports return to the IDL authority.

### 3.7 Proposed mainnet CI workflow design

Add a new workflow file `.github/workflows/cortex-v3-mainnet.yml` with the following characteristics:

- **Trigger:** `workflow_dispatch` only; require `environment: production`.
- **Required reviewers:** At least one core maintainer before any job runs.
- **Build job:**
  - Pin Solana CLI, Anchor, Rust versions (match devnet).
  - Run `cargo check --workspace`, `anchor build`, `anchor test --skip-build`.
  - Produce verifiable build artifacts and SHA-256 hashes.
- **Deploy job (depends on build):**
  - Use paid Helius RPC from `MAINNET_SOLANA_DEPLOY_URL`.
  - Load the CI proposer key from `MAINNET_DEPLOYER_KEYPAIR`.
  - Use `solana-developers/github-actions` or `solana-foundation/github-workflows` reusable actions with `use-squads: true`.
  - Write program buffer + IDL buffer.
  - Propose the upgrade in Squads.
  - Post the Squads proposal URL and buffer hash as a workflow summary.
- **Verify job (after human execution):**
  - Poll the program ID for the new executable hash.
  - Run on-chain verification via `solana-verify` or the Anchor verify action.
  - Update `Anchor.toml` `[programs.mainnet-beta]` entries in a follow-up PR.

Example job skeleton:

```yaml
name: Cortex v3 Mainnet Deploy

on:
  workflow_dispatch:
    inputs:
      priority_fee:
        description: "Priority fee (micro-lamports per CU)"
        required: true
        default: "5000"

jobs:
  build-and-propose:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: solana-developers/github-actions/setup-all@v1
        with:
          solana-cli-version: "1.18.26"
          anchor-version: "0.30.1"
          node-version: "20"
      - uses: solana-developers/github-actions/build@v1
        with:
          program: "memory_registry"
          network: "mainnet-beta"
          deploy: "false"
          upload-idl: "true"
          verify: "true"
          use-squads: "true"
        env:
          RPC_URL: ${{ secrets.MAINNET_SOLANA_DEPLOY_URL }}
          DEPLOYER_KEYPAIR: ${{ secrets.MAINNET_DEPLOYER_KEYPAIR }}
          MULTISIG: ${{ secrets.MAINNET_MULTISIG }}
          MULTISIG_VAULT: ${{ secrets.MAINNET_MULTISIG_VAULT }}
```

### 3.8 Cost and risk summary

| Item                        | Estimate                    | Notes                                  |
| --------------------------- | --------------------------- | -------------------------------------- |
| Helius Business RPC         | $499/mo                     | Staked connections + priority-fee API. |
| QuickNode failover          | $39–$99/mo                  | Backup endpoint, optional.             |
| Squads Basic multisig       | 0.05 SOL one-time           | Per multisig created.                  |
| Squads Business             | $49/mo                      | Workflow features, fee relayer.        |
| Program rent-exempt deposit | ~0.003–0.01 SOL per program | Use `solana rent <size>`.              |
| Deployment transaction fees | <0.01 SOL per program       | Plus priority fees in congestion.      |
| Security audit              | $50,000–$200,000            | Prerequisite for mainnet launch.       |
| Ledger devices              | ~$80–$280 each              | One per signer for cold-key members.   |

**Top risks:**

1. Single EOA upgrade authority → mandate Squads.
2. CI secret exfiltration → use environments, reviewers, SHA-pinned Actions, zizmor.
3. Malicious upgrade → require verifiable builds, time locks, multi-signature.
4. RPC downtime → maintain a failover provider.
5. Ed25519 HSM limitations → validate vendor claims before HSM purchase.

**Next owners:**

- `MainnetCustodySolver`: finalize custody policy and draft `cortex-v3-mainnet.yml`.
- `RustFixer`: integrate verifiable builds into CI.
- `AuditProcessSolver`: lock audit scope before first mainnet buffer write.

---

## 4. Verifiable memory (TEE/STARK)

### Goal

Move the off-chain memory node from a **semi-trusted** confidentiality model to a **cryptographically verifiable** model where users and on-chain programs can independently attest that:

1. Memory was retrieved only by an authorized, unaltered node runtime.
2. Retrieval results are consistent with the anchored content hash.
3. The computation executed inside the node (embedding search, capability checks, immunology filters) matches a published, auditable policy.

The current node (`node/src/server.mjs`, `store.mjs`, `embed.mjs`) encrypts blobs with AES-256-GCM and anchors content hashes on-chain, but a compromised host could still lie about retrieval results, return wrong embeddings, or bypass capability checks. Verifiable memory closes that gap with **TEEs** (fast, hardware-based confidentiality) and/or **STARK/SNARK proofs** (slower, cryptographic integrity without hardware trust).

### Threat model

| Threat                             | Current mitigation             | Verifiable-memory mitigation                                       |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| Host reads plaintext memory        | AES-256-GCM encryption at rest | TEE memory isolation; encrypted memory inaccessible to host        |
| Node returns fake retrieval result | On-chain content hash only     | TEE attestation of unaltered code + ZK proof of hash consistency   |
| Node bypasses capability check     | Capability registry on-chain   | Prove capability check inside TEE or in a ZK circuit               |
| Embedding model substitution       | Hard-coded OpenAI call         | Attest model/version inside TEE; prove inference in ZK (long-term) |
| Replay / rollback                  | N/A                            | Anchor attested root or proof in on-chain receipt                  |

### Solution taxonomy

| Technology                                       | Maturity               | Use case                                                                 | Vendors / projects                                                    |
| ------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| TEE (Intel TDX, AMD SEV-SNP, AWS Nitro Enclaves) | Production             | Attested execution of embedding/retrieval inside enclave                 | AWS Nitro, Azure Confidential Computing, Intel TDX, Gramine, Fortanix |
| STARKs / SNARKs                                  | Mature for ZK circuits | Prove correct execution of retrieval/ranking without revealing plaintext | RISC Zero, SP1, Cairo, Succinct                                       |
| MPC / FHE                                        | Research / early prod  | Private computation over encrypted data                                  | Zama (Concrete/TFHE), Sunscreen, Secret Network                       |
| Signed receipts + deterministic replay           | Available now          | Weakest but immediate: node signs receipts; users can replay locally     | In-house                                                              |

### TEE options

Trusted Execution Environments are the **near-term** solution. They provide memory isolation and remote attestation with low latency overhead and no proof-generation cost.

#### AWS Nitro Enclaves

- **Isolation model:** CPU and memory isolated enclave running as a child of an EC2 instance. Host cannot read enclave memory; enclave has no direct network or storage access.
- **Communication:** VSOCK socket only between parent instance and enclave.
- **Attestation:** Enclave requests a signed attestation document from the Nitro Hypervisor. The document is CBOR-encoded and COSE-signed by the AWS Nitro Attestation PKI. It includes PCR measurements of the enclave image, parent instance ID, IAM role ARN, and an enclave-generated public key.
- **Root of trust:** AWS Nitro Hypervisor / AWS Attestation PKI (software-controlled by AWS).
- **KMS integration:** Native KMS cryptographic attestation — KMS policies can require a valid attestation document before decrypting data keys.
- **Performance:** Reported 14–23% overhead versus bare metal.
- **Limitations:** No GPU passthrough; AWS-controlled root of trust; US legal jurisdiction considerations for GDPR/Schrems II workloads.
- **Fit for Cortex:** Good for a managed-cloud deployment where the embedding inference and vector search run in the parent instance, while decryption, capability validation, and signing run inside the enclave. The enclave can hold the `CORTEX_STORE_KEY` and only release derived keys after attestation.
- **Sources:** AWS Nitro Enclaves docs; AWS Compute Blog "Validating attestation documents produced by AWS Nitro Enclaves"; Trail of Bits Nitro notes (2024).

#### Azure Confidential Computing (Intel SGX / AMD SEV-SNP / Intel TDX)

- **Isolation model:** Multiple tiers:
  - **Intel SGX (DCsv3):** application-level enclaves with the smallest trust boundary.
  - **AMD SEV-SNP:** VM-level memory encryption with integrity protection.
  - **Intel TDX:** VM/container-level isolation with hardware-protected memory and a unique hardware key.
- **Attestation:** Microsoft Azure Attestation service verifies enclave evidence against tenant-defined policies and issues a signed JWT token for relying parties. Intel TDX uses the same attestation primitives as SGX extended to the whole trust domain.
- **Root of trust:** Hardware manufacturer (Intel/AMD) plus Azure Attestation service.
- **Performance:** Intel TDX measured overhead ~3–7% (reported 5.2% on H200-class workloads).
- **Limitations:** TDX is newer and requires 4th Gen Intel Xeon Scalable processors; early access as of mid-2025.
- **Fit for Cortex:** Strongest fit for regulated workloads that need a hardware-rooted attestation chain independent of the cloud operator. A Confidential VM can run the entire node inside an attested boundary, simplifying deployment versus a split enclave/parent architecture.
- **Sources:** Microsoft Learn (Azure Confidential Computing products, Azure Attestation); Azure Blog on 4th Gen Intel Xeon with TDX (June 2025).

#### Intel SGX / Intel TDX (generic, on-prem or bare-metal)

- **Isolation model:** SGX provides application enclaves; TDX provides trust-domain isolation at the VM level.
- **Attestation:** Intel's remote attestation generates a quote signed by the CPU's hardware-protected key, verifiable via Intel's PKI.
- **Root of trust:** Intel CPU silicon.
- **Fit for Cortex:** Use when self-hosting or requiring the narrowest hardware trust boundary. More operational complexity than cloud-managed TEEs.

#### Phoenixx

- **Assessment:** No identifiable commercial TEE platform named "Phoenixx" was found in the confidential-computing landscape. Search results returned unrelated consumer brands, a web3 messaging app, and merchandise sites.
- **Action:** Treat as an unverified/internal codename. If the project has a specific vendor in mind, request a URL or datasheet and update this section. Do not select a vendor based on name alone.

### STARK / SNARK options

Zero-knowledge proofs are the **long-term** solution for memory retrieval integrity because they remove the hardware-trust assumption. They are currently slower and more expensive than TEEs, so the practical path is **TEE now, ZK incrementally**.

#### RISC Zero (zkVM)

- **Technology:** RISC-V zkVM using zk-STARKs (FRI, DEEP-ALI) with a recursive SNARK wrapper.
- **Memory model:** Algebraic memory checking via permutation argument (grand-product accumulator, migrating to log-derivative/LogUp). Constant overhead per memory access.
- **Developer experience:** Guest code in Rust/C; host runs the executor and prover; output is a Receipt (journal + seal).
- **Recent status (2024–2025):** zkVM 1.0 stable with Ethereum mainnet verifier contract. R0VM 2.0 (April 2025) reduced Ethereum-block proving from ~35 min to ~44 s, expanded user memory to 3 GB, and added deterministic formal verification of most RISC-V circuits. Groth16 trusted setup ceremony completed in 2024; Veridise audit (Round 2, Nov–Dec 2024).
- **Fit for Cortex:** Ideal for proving a deterministic retrieval function: `prove(content_hash, query_embedding, top_k) => [memory_ids, scores]`. The node runs search inside the zkVM guest and posts the receipt on-chain. Privacy is preserved because the encrypted blob stays off-chain and only hashes/scores are public.
- **Limitations:** Proving embedding search over a large vector index is still expensive; best suited for small indexed sets or batched proofs.
- **Sources:** RISC Zero docs; Veridise audit report; ChainCatcher / BroadNotes R0VM 2.0 analysis (2025).

#### Succinct SP1

- **Technology:** RISC-V zkVM built on the Plonky3 stack using STARKs + FRI.
- **Memory model:** Two-phase memory argument using the LogUp permutation technique; avoids Merkle-tree memory commitments.
- **Developer experience:** Rust guest code; `sp1_sdk` for proving and verification; supports recursive STARKs and a STARK-to-SNARK wrap for on-chain verification.
- **Recent status (2024–2025):** SP1 testnet launched late 2024. SP1 Hypercube (May 2025) targets sub-12-second proofs for Ethereum blocks. STARK-to-SNARK wrapper produces Groth16 proofs verifiable for ~300k gas on Ethereum.
- **Fit for Cortex:** Similar to RISC Zero but with a memory argument optimized for large trace sizes. Good if the retrieval policy grows complex (multi-step capability checks, immunology filters, royalty calculations).
- **Limitations:** Newer than RISC Zero; smaller production track record as of mid-2025.
- **Sources:** Succinct docs; L2BEAT SP1 entry; The Block on SP1 Hypercube (May 2025).

#### Starknet / Cairo

- **Technology:** Cairo is a STARK-friendly language compiling to CASM, running on the Cairo VM. Starknet v0.14.2 (2025) introduces native in-protocol proof verification.
- **Memory model:** Nondeterministic read-only memory; public memory via the Output builtin.
- **Storage proofs:** Herodotus uses Cairo to generate and verify STARK storage proofs for historical/cross-chain data (`HerodotusDev/integrity` verifier).
- **Fit for Cortex:** Cairo is a fit if Cortex wants to anchor verifiable-memory proofs **on Starknet** or use Starknet as a settlement/verification layer. For Solana settlement, Cairo proofs would need a Solana verifier (not native) or a bridge, which adds complexity. Less direct fit than RISC Zero/SP1 for a Solana-native protocol.
- **Sources:** Starknet docs; Cairo Book; Herodotus integrity repo.

#### SNARK vs STARK trade-off for Cortex

| Property                  | SNARK (Groth16 / PLONK)          | STARK (RISC Zero / SP1 / Cairo)         |
| ------------------------- | -------------------------------- | --------------------------------------- |
| Trusted setup             | Required (per circuit)           | Not required                            |
| Proof size                | Small (~200 B–1 KB)              | Larger (tens to hundreds of KB)         |
| Prover time               | Fast (ms for simple circuits)    | Slower (seconds to minutes)             |
| Verifier time             | ~1.5–3 ms                        | ~0.5 ms                                 |
| Post-quantum              | No                               | Hash-based, considered post-quantum     |
| On-chain verify on Solana | Feasible via existing ecosystems | Needs verifier program or wrapped SNARK |
| Best for                  | Simple, fixed policies           | General retrieval computation           |

**Recommendation:** Use STARKs for the research/experimentation phase because they are transparent and flexible. Wrap to a SNARK only if Solana on-chain verification cost becomes the dominant constraint.

### Remote attestation flows

A complete verifiable-memory retrieval flow combines TEE attestation with on-chain receipts:

```
1. User/client requests retrieval of a memory entry.
2. Off-chain node loads the capability grant from Solana (capability_registry).
3. Node enters TEE / runs ZK guest:
   a. Verify capability is valid (not expired, scope matches memory ID).
   b. Decrypt memory blob inside TEE or prove knowledge of preimage in ZK.
   c. Run embedding search / immunology filters.
   d. Produce output: { memory_id, content_hash, result_hash, timestamp, capability_pda }.
4. TEE generates attestation document / ZK prover generates receipt.
5. Node signs an on-chain receipt (royalty_router) embedding the attestation/receipt hash.
6. Client verifies:
   a. On-chain capability and budget are valid.
   b. Attestation document is signed by the TEE vendor PKI and matches the published node image PCR.
   c. ZK receipt verifies against the public inputs and a known verifier program.
```

### Integration with the Cortex off-chain node

The current node is a Node.js ESM service with:

- `EncryptedStore` (AES-256-GCM over SQLite).
- `createEmbedder` (OpenAI API or no-op fallback).
- `semanticSearch` (brute-force cosine similarity over all embeddings).
- HTTP endpoints: `/health`, `POST /ingest`, `GET /retrieve/:id`.
- MCP server exposing `store_memory` and `retrieve_memory` tools.

#### Phase 1 — TEE-hardened node (0–3 months)

1. **Containerize for Nitro Enclaves or Azure Confidential VM.**
   - Nitro: split into parent (HTTP/MCP/network) and enclave (decryption, search, signing).
   - Azure CVM: run the whole node inside a TDX/SGX VM and expose an attested TLS endpoint.
2. **Move `CORTEX_STORE_KEY` derivation into the TEE.** KMS cryptographic attestation ensures the key is released only to an enclave running the approved image.
3. **Publish PCR / measurement whitelist** in `specs/node-attestation-policy.md`.
4. **Add `/attest` endpoint** that returns the current attestation document so clients can verify before sending sensitive queries.

#### Phase 2 — Searchable encryption + vector DB (3–6 months)

1. Replace brute-force SQLite search with an encrypted vector index (Qdrant, Pinecone, Weaviate, or pgvector).
2. Keep plaintext embeddings inside the TEE boundary; host only sees ciphertext.
3. Add deterministic capability checks before returning results.

#### Phase 3 — ZK-proven retrieval (6–12 months)

1. Define a deterministic retrieval function in Rust:
   - Inputs: `query_embedding[]`, encrypted corpus commitment (Merkle root of content hashes), capability PDA, top_k.
   - Outputs: sorted `(memory_id, content_hash, score)` list.
2. Implement the function as a RISC Zero or SP1 guest.
3. Run the prover asynchronously; post the receipt/attestation hash to `royalty_router` as part of the payment receipt.
4. Client verifies the receipt locally or via a Solana verifier program.

### Recommended path

- **Phase 1 (now)**: Signed receipts with deterministic replay. Every retrieval/ingestion produces a signed receipt anchored on-chain. Users can replay operations locally and compare hashes.
- **Phase 2**: Integrate AWS Nitro Enclaves or Azure TDX CVM for TEE-attested embedding and inference. Attestations are published alongside receipts.
- **Phase 3**: Add STARK proofs for ranking/retrieval logic (e.g., prove top-k selection over encrypted vector index). Use RISC Zero or SP1 for Rust-friendly zkVM development.

### Cost / risk

| Solution           | Time to implement | Operating cost              | Risk                  | Owner                 |
| ------------------ | ----------------- | --------------------------- | --------------------- | --------------------- |
| AWS Nitro Enclaves | 2–4 weeks         | EC2 + enclave vCPU overhead | AWS root of trust     | DevOps / security     |
| Azure TDX CVM      | 2–4 weeks         | TDX VM premium              | Hardware availability | DevOps / security     |
| RISC Zero proofs   | 6–10 weeks        | Prover compute (CPU/GPU)    | Prover performance    | Cryptography engineer |
| SP1 proofs         | 6–10 weeks        | Prover compute              | Newer toolchain       | Cryptography engineer |
| Starknet/Cairo     | 8–12 weeks        | L2 gas + bridge             | Solana integration    | Cryptography engineer |

- **Cost**: Phase 1 ~1–2 eng weeks; Phase 2 ~$1–3k/mo infra + 4–6 weeks; Phase 3 ~2–4 months research/engineering.
- **Risk**: TEE side-channel attacks; STARK proof generation latency. Mitigate by not over-promising — publish a proof boundary (see `04_TOKEN_UTILITY_AND_TOKENOMICS.md`).

---

## 5. Production vector database + embedding pipeline

### Problem

Encrypted SQLite + OpenAI embedding search is a stub. It will not scale and depends on an external provider for embeddings.

### Solution options

| Component     | Options                                                                                       | Trade-off                                                             |
| ------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Vector DB     | Pinecone, Weaviate, Qdrant, pgvector, Milvus, Chroma                                          | Managed (Pinecone) vs. self-hosted (Qdrant/pgvector)                  |
| Embeddings    | OpenAI `text-embedding-3`, Cohere, voyage-ai, self-hosted (SentenceTransformers, nomic, jina) | External = easy; self-hosted = privacy/control but operational burden |
| Metadata DB   | Postgres, SQLite (encrypted), DynamoDB                                                        | Postgres is the production default                                    |
| Hybrid search | Vector similarity + BM25/keyword (e.g., Weaviate, Qdrant, pgvector)                           | Better recall for sparse queries                                      |

### Recommended path

1. Deploy **Qdrant** or **Weaviate** as the vector store (open-source, can run in Docker/K8s, supports hybrid search and tenant isolation).
2. Move metadata to **Postgres** with row-level security per user.
3. Add a pluggable embedding provider interface; default to OpenAI for speed, allow local `nomic-embed-text-v1.5` or `jina-embeddings-v2` as privacy-preserving alternative.
4. Cache embeddings and support embedding versioning so model changes do not corrupt retrieval.
5. Add ANN benchmarking using Enigma’s standard memory benchmarks.

### Cost / risk

- **Cost**: Managed vector DB ~$100–1k/mo at launch; self-hosted ~$50–300/mo compute. Embeddings: OpenAI ~$0.02–0.13/1M tokens; self-hosted GPU optional.
- **Risk**: Vendor lock-in, latency. Mitigate with provider abstraction and local fallback embeddings.

---

## 6. Token legal structure

> **Scope:** This section addresses the optional SAL / ENIGMA token layer and the on-chain royalty mechanics described in `launch/04_TOKEN_UTILITY_AND_TOKENOMICS.md`, `launch/05_SOLANA_TOKEN_LAUNCH_RUNBOOK.md`, and the v3 novelty spec. Base USDC/SOL settlement in `budget_escrow` is outside securities analysis unless it is restructured to hold tokenized claims.

### 6.1 Current token design

The project contemplates two token-like layers:

| Layer                   | Name        | Role                                                                        | Current risk signals                                      |
| ----------------------- | ----------- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| Network utility token   | ENIGMA      | Optional relay/witness/gateway access, operator bonding, bounded governance | Framed as utility; explicit disclaimers; no revenue share |
| Governance/upside token | SAL / veSAL | Optional governance + revenue share / buyback-burn upside                   | Explicit revenue-share language raises securities risk    |

The on-chain royalty mechanics (`memory_registry.royalty_bps`, `royalty_router.route_royalty`) route USDC/SOL payments from memory consumers to memory owners. These are **user-to-user payments for opted-in data reuse**, not protocol revenue distributions to token holders. That distinction is legally important.

### 6.2 United States — SEC and the Howey test

#### 6.2.1 Framework

The Supreme Court’s _SEC v. W.J. Howey Co._ test asks whether an arrangement is an "investment contract":

1. **Investment of money** (or other consideration);
2. **Common enterprise**;
3. **Expectation of profit**;
4. **Derived from the efforts of others**.

The SEC’s March 2026 Interpretation (Project Crypto) affirmed that all four prongs must be satisfied and narrowed the agency’s prior broad reading of "common enterprise." It also introduced a five-category taxonomy: digital commodities, digital collectibles, digital tools, stablecoins, and digital securities. Digital tools and collectibles are generally not securities by classification, but the surrounding **offering or sale** can still be an investment contract if the issuer makes explicit promises of essential managerial efforts that drive expected profits.

#### 6.2.2 Application to SAL

SAL is currently described as:

- optional governance;
- revenue share via veSAL;
- buyback/burn from protocol fees;
- membership/upside layer.

That combination is **highly likely to satisfy Howey** for the initial offering:

| Howey prong           | SAL/veSAL facts                                                         | Risk    |
| --------------------- | ----------------------------------------------------------------------- | ------- |
| Investment of money   | Purchasers acquire SAL (or lock it for veSAL)                           | Present |
| Common enterprise     | Single issuer/protocol; pooled economic interest                        | Present |
| Expectation of profit | "Revenue share," "upside," buyback/burn                                 | Present |
| Efforts of others     | Protocol development, marketing, fee generation depend on founding team | Present |

**Conclusion:** A US counsel would likely classify the **initial sale of SAL/veSAL** as a securities offering unless restructured.

#### 6.2.3 Pathways for US compliance

| Path                            | Description                                                                                                   | Fit for SAL/veSAL                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Regulation D / Rule 506(c)**  | Private placement to accredited investors with general solicitation; reasonable steps to verify accreditation | Best fit for a pre-functional or revenue-share token sale to accredited investors only          |
| **Regulation D / Rule 506(b)**  | Private placement to accredited + up to 35 sophisticated non-accredited investors; no general solicitation    | Alternative if no public marketing                                                              |
| **Regulation S**                | Offshore offering; no directed selling efforts in the US; resale restrictions                                 | Can run in parallel with Reg D for non-US persons, but does not immunize the issuer from US law |
| **Regulation A+**               | Mini-public offering up to $75M (as amended) with SEC qualification; broader investor base                    | Possible for a mature, disclosure-ready project; expensive and slow                             |
| **Full SEC registration**       | Public offering of securities                                                                                 | Generally avoided by crypto projects unless building a registered security token                |
| **Restructure to non-security** | Remove revenue share, profit expectations, and essential-managerial-effort promises                           | Long-term option if the token is meant to be freely tradable in the US                          |

**Practical US recommendation:**

1. Treat the **initial SAL/veSAL distribution as a securities offering** and conduct it under **Reg D 506(c)** to accredited investors, with a proper PPM and accredited-investor verification (the SEC’s March 2025 C&DI guidance permits reliance on minimum investment amounts and written representations in many cases).
2. Use **Reg S** for non-US purchasers, with clear geofencing, disclaimers, and lock-up mechanics.
3. Avoid any public statements that promise profit, appreciation, or returns from the team’s efforts.
4. If the token later becomes functional and governance is meaningfully decentralized, counsel may opine that secondary-market trading no longer involves an investment contract — but this is fact-specific and not automatic.

#### 6.2.4 Application to ENIGMA utility token

ENIGMA is framed as a network-access and operator-bonding token. Under the SEC’s 2025–2026 guidance, "digital tools" that are purchased for use are generally not securities by classification. Key risk factors to manage:

- **Functionality at launch:** The token should be usable for its stated purpose at or shortly after distribution.
- **No revenue share / dividend:** Treasury must not distribute surplus to holders.
- **No buyback/burn tied to protocol profit:** Avoid mechanics that look like profit distribution.
- **No essential-managerial-effort promises:** Roadmap should focus on deployed functionality, not team-driven value creation.
- **Governance limits:** Governance should cover protocol parameters, not company assets or income.

If these boundaries are maintained, ENIGMA has a plausible path to a US legal opinion that it is not a security, though the initial sale mechanics still matter.

#### 6.2.5 Application to data-dignity royalties

The `memory_registry`/`royalty_router` design routes payments from consumers to memory owners. This is a **user-to-user licensing royalty**, not a distribution of protocol revenue to token holders. Under Howey, a pure royalty stream to an asset owner may fail the "common enterprise" prong if there is no pooling of funds. However, if the royalty is marketed as an investment product or bundled with promises of platform growth, it can be recharacterized as a security.

**Risk mitigation:**

- Frame royalties as **compensation for data reuse** under user-controlled terms.
- Do not pool, securitize, or fractionalize memory royalty streams.
- Do not market memory ownership as an investment or yield product.
- Keep the royalty percentage set by the memory owner, not the protocol.

### 6.3 European Union — MiCA

#### 6.3.1 Framework

The Markets in Crypto-Assets Regulation (MiCA) entered into force in June 2023 and applies from 30 December 2024 (with ART/EMT rules from 30 June 2024). It creates three main categories:

1. **Asset-Referenced Tokens (ARTs)** — reference a basket of assets or non-fiat value;
2. **Electronic Money Tokens (EMTs)** — reference a single official currency;
3. **Other Crypto-Assets** — including utility tokens.

#### 6.3.2 Application to SAL/ENIGMA

Neither SAL nor ENIGMA references fiat or a basket of assets, so they are **not ARTs or EMTs**. They fall into the "other crypto-assets" bucket.

MiCA’s utility-token carve-out applies only to tokens that provide access to **an existing good or service supplied by the issuer** and are **not used for fundraising or admission to trading**. If the token is sold to fund development or is listed on exchanges, the carve-out likely does not apply and a **white paper** must be published and notified to the home Member State’s competent authority.

Additional MiCA requirements:

- **White paper** (Article 6): detailed disclosure of issuer, project, rights, risks, and technology. New iXBRL formatting requirements entered into application on 23 December 2025.
- **Authorization** for crypto-asset service providers (CASPs): exchanges, custody, brokerage, etc.
- **Significant token thresholds**: >10M EU holders, >€500M daily volume, or >€5B market cap triggers enhanced supervision by ESMA/EBA.
- **Marketing communications**: must be fair, clear, not misleading, and consistent with the white paper.

#### 6.3.3 MiCA classification of SAL/ENIGMA

| Token                           | Likely MiCA category                                                           | Key obligation                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| ENIGMA utility token            | Other crypto-asset / utility token                                             | White paper if not fully within carve-out; CASP licensing for any EU exchange/custody operation                                 |
| SAL / veSAL                     | Other crypto-asset (possibly financial instrument if profit rights are strong) | White paper; if revenue-share rights are structured as profit participation, may trigger MiFID II financial-instrument analysis |
| Royalty payments (user-to-user) | Not a crypto-asset issuance                                                    | Contract/licensing matter; GDPR and consumer law apply                                                                          |

**Practical EU recommendation:**

1. Assume a **MiCA white paper** is required for any public offering of ENIGMA or SAL in the EU.
2. Engage a **MiCA-authorized legal advisor** in the chosen home Member State (Ireland, Luxembourg, France, Germany, and Lithuania are common).
3. Do not rely on the utility-token carve-out if fundraising or exchange admission is planned.
4. Ensure marketing materials are reviewed against MiCA’s fair/clear/not-misleading standard.

### 6.4 Switzerland — FINMA

#### 6.4.1 Framework

FINMA classifies tokens into:

- **Payment tokens** — means of payment / value transfer;
- **Utility tokens** — digital access rights to an application or service;
- **Asset tokens** — securities-like claims or derivatives.

FINMA applies a **substance-over-form** test. A January 2024 Swiss Federal Administrative Court ruling held that **pre-functional utility tokens** (tokens that cannot be used at issuance) are generally asset tokens if standardized and transferable.

Hybrid tokens are classified in the **most restrictive** applicable category.

#### 6.4.2 Application

| Token                                  | FINMA view                                | Key obligation                                       |
| -------------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| ENIGMA (functional utility)            | Likely utility token if usable at launch  | AML if widely used as payment; otherwise light-touch |
| SAL/veSAL (revenue share + governance) | Likely asset token / security             | Prospectus requirements; securities law compliance   |
| Royalty payments                       | Contractual/licensing; not token issuance | General contract and AML law if intermediated        |

**Practical Switzerland recommendation:**

1. If offering to Swiss investors, obtain a FINMA **no-action letter** or legal opinion on classification.
2. Avoid pre-functional sales of any token in Switzerland.
3. Consider Swiss-incorporated entities for foundation/treasury roles, but issue the token from a non-Swiss vehicle if securities treatment is undesirable.

### 6.5 Singapore — MAS

#### 6.5.1 Framework

The Monetary Authority of Singapore (MAS) applies a **substance-over-form** test:

- **Digital Payment Tokens (DPTs)** — value not pegged to fiat; require a Payment Services Act (PSA) license for dealing/exchange.
- **Capital Markets Products (CMPs)** — securities/derivatives/unit trusts; regulated under the Securities and Futures Act.
- **Utility/governance tokens** — not DPTs or CMPs if purely for governance/access.
- **Stablecoins** — standalone framework for SGD/G10 pegged coins.

The Digital Token Service Provider (DTSP) regime, effective 30 June 2025, requires licensing for Singapore-linked persons providing digital token services to customers outside Singapore. MAS has stated it will grant such licenses only in "extremely limited circumstances."

#### 6.5.2 Application

| Token                         | MAS view                                                                    | Key obligation                                                             |
| ----------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| ENIGMA utility / access token | Likely not DPT if used for network services and not broadly traded as value | Avoid exchange/custody activity without PSA license                        |
| SAL/veSAL (revenue share)     | High risk of being a CMP if it conveys profit participation                 | Full securities-law analysis; avoid offering to Singapore retail investors |
| Royalty payments              | Not a DPT issuance if user-to-user                                          | Contract law; AML if platform intermediates                                |

**Practical Singapore recommendation:**

1. Do not actively market SAL/veSAL to Singapore retail investors.
2. If any entity or personnel are Singapore-linked, obtain Singapore counsel before offering any token.
3. Consider Singapore for operational/regulatory clarity only after legal classification is confirmed.

### 6.6 BVI / Cayman foundation structures

#### 6.6.1 The "crypto catamaran"

The industry-standard structure for token issuers is:

- **BVI company** — issues tokens, manages token sales, receives sale proceeds.
- **Cayman Islands foundation company** — holds protocol IP, manages treasury, executes DAO votes, has no shareholders (memberless/ownerless).

This separates commercial issuance from long-term protocol governance and limits liability for contributors.

#### 6.6.2 Cayman foundation

- Created under the Cayman Foundation Companies Law 2017.
- Can be **memberless and ownerless**, making it a natural DAO wrapper.
- Holds treasury, IP, and governance execution authority.
- Cayman VASP Act may require licensing if the foundation provides virtual-asset services (issuance to the public, custody, exchange). Phase 2 full licensing took effect by April 2025 for trading platforms and custodians.
- Over 1,700 Web3 foundations were registered in Cayman by 2025.

#### 6.6.3 BVI company

- If the BVI company is not offering VASP services, no pre-issuance license is required.
- Flexible, low-cost, privacy-protective.
- Typically owns the token-issuance entity and the commercial agreements.

#### 6.6.4 Costs

| Item                           | Upfront             | Annual recurring    |
| ------------------------------ | ------------------- | ------------------- |
| Cayman foundation              | ~$6,000+            | ~$5,000             |
| BVI company                    | ~$2,500+            | ~$2,000             |
| Nominee directors / supervisor | —                   | $2,000–3,000/role   |
| Registered office / secretary  | Included or nominal | Included or nominal |

#### 6.6.5 Practical structure recommendation

1. Form a **Cayman Islands foundation company** to hold protocol IP, treasury, and governance execution.
2. Form a **BVI company** as the token issuance vehicle and commercial counterparty.
3. The foundation holds shares in the BVI company and may act as director.
4. Ensure the BVI company does not perform regulated VASP activity without licensing (e.g., do not operate an exchange from BVI).
5. Add a **Wyoming DUNA** or Swiss association only if US/European operational presence requires it.

### 6.7 Utility vs. governance vs. revenue-share framing

The legal classification of a token is driven by **economic substance**, not label. The following table summarizes how features map to risk:

| Feature                                       | Utility framing | Governance framing                           | Revenue-share framing       | Securities risk   |
| --------------------------------------------- | --------------- | -------------------------------------------- | --------------------------- | ----------------- |
| Access to network services                    | ✅ Low risk     | ⚠️ Moderate if combined with economic rights | ❌ High risk                | Low → High        |
| Voting on protocol parameters                 | ⚠️ Moderate     | ⚠️ Moderate                                  | ❌ High risk                | Moderate          |
| Voting on treasury spend                      | ❌ High risk    | ❌ High risk                                 | ❌ High risk                | High              |
| Share of protocol revenue / buyback-burn      | ❌ High risk    | ❌ High risk                                 | ❌ High risk                | Very high         |
| Fixed supply, no minting                      | ✅ Neutral      | ⚠️ Can imply scarcity value                  | ❌ Often marketed as upside | Context-dependent |
| Staking for yield / fixed rewards             | ⚠️ High risk    | ❌ High risk                                 | ❌ High risk                | High              |
| Staking for active-service bonding / slashing | ✅ Lower risk   | ⚠️ Moderate                                  | ❌ High risk                | Moderate → High   |

**Design recommendations to reduce securities risk:**

1. **Separate the utility layer (ENIGMA) from the upside layer (SAL/veSAL).**
2. For ENIGMA, emphasize **consumptive use**: pay for relay/witness/gateway jobs, bond for active service, vote only on protocol parameters.
3. For SAL/veSAL, if revenue share is retained, accept that it will likely be treated as a security in the US and EU and plan for **Reg D / MiCA white paper** compliance.
4. Never use language like "dividend," "profit share," "expected return," "yield," "buy for upside," or "scarcity-driven appreciation" in public materials.
5. Ensure the protocol is **functional** before any broad token distribution; pre-functional sales are viewed most skeptically.

### 6.8 SAFTs (Simple Agreements for Future Tokens)

A SAFT is a contractual right to receive tokens in the future. Courts and the SEC have increasingly treated SAFTs as **securities offerings** (see _SEC v. Telegram_). The March 2026 SEC Interpretation treats SAFTs as delayed-delivery offerings in which the cryptoasset can become subject to an investment contract at the time of the SAFT, regardless of delivery timing.

**SAFT recommendations:**

1. If a SAFT is used for SAL/veSAL, assume it is a security and fit it within **Reg D 506(c)** or **506(b)**.
2. Prepare a full **Private Placement Memorandum (PPM)** — anti-fraud rules apply regardless of exemption.
3. Do not assume the underlying token will "automatically" be non-securities upon delivery; counsel must analyze the token and the offering facts at that time.
4. Consider **direct token sales of functional utility tokens** instead of SAFTs for ENIGMA, if functionality exists.

### 6.9 Practical steps to get a legal opinion

A token legal opinion is typically required by exchanges, investors, and institutional partners. The process is:

#### Step 1 — Engage qualified counsel

Select a firm with proven crypto/securities experience. Options include:

- **Big Law:** Skadden, WilmerHale, Perkins Coie, Cooley, Fenwick, Goodwin, A&O Shearman, Paul Hastings.
- **Crypto-native boutiques:** K&L Gates blockchain practice, Dilendorf, Legal Nodes, Whale Law, Lexr.
- **Regional specialists:** Swiss (Lenz & Staehelin, MLL, Bär & Karrer), Singapore (Rajah & Tann, WongPartnership), BVI/Cayman (Maples and Calder, Carey Olsen, Mourant).

#### Step 2 — Prepare the diligence package

Counsel will request:

1. White paper / litepaper / tokenomics document;
2. Token smart-contract code and program IDL;
3. Cap table and allocation/vesting schedule;
4. Governance charter and treasury policy;
5. SAFT or purchase agreements;
6. Marketing materials, website copy, blog posts, social posts;
7. Jurisdiction and entity structure chart;
8. AML/KYC policy;
9. Exchange/listing plans;
10. List of target jurisdictions and investor types.

#### Step 3 — Jurisdiction-by-jurisdiction analysis

Ask counsel for written opinions or memos on:

- US: Howey analysis; Reg D/Reg S/Reg A path;
- EU: MiCA classification; white-paper requirements; CASP implications;
- Switzerland: FINMA classification; prospectus/no-action path;
- Singapore: MAS classification; PSA/SFA licensing;
- BVI/Cayman: VASP licensing; foundation structure;
- Other key markets (UK FCA, Japan FSA, Hong Kong SFC, UAE VARA) as needed.

#### Step 4 — Restructure based on counsel input

Typical changes may include:

- Removing revenue-share language from public docs;
- Adding accredited-investor checks;
- Geofencing the US, Canada, and other restricted jurisdictions;
- Creating a foundation structure;
- Drafting compliant terms of sale and risk disclosures;
- Implementing lock-ups and transfer restrictions.

#### Step 5 — Deliver the opinion letter

The final letter typically states:

- Whether the token is likely a security under US federal law;
- Basis for any exemption relied upon;
- Classification under other key jurisdictions;
- Qualifications, assumptions, and risk factors.

#### Step 6 — Maintain and update

Token classification can evolve with network maturity, issuer representations, and regulatory changes. Budget for annual updates or trigger-based reviews (e.g., before exchange listing, before governance activation, before revenue-share feature launch).

### 6.10 Cost and timeline estimates

| Item                                                                 | Cost                                       | Timeline   |
| -------------------------------------------------------------------- | ------------------------------------------ | ---------- |
| Initial legal opinion (US Howey + one jurisdiction)                  | $15,000–$50,000+                           | 2–6 weeks  |
| Multi-jurisdiction memo (US, EU, Switzerland, Singapore, BVI/Cayman) | $50,000–$150,000+                          | 4–10 weeks |
| Ongoing retainer for token launch                                    | $5,000–$25,000/mo                          | Ongoing    |
| BVI/Cayman foundation setup                                          | $10,000–$20,000 upfront; $7,000–$12,000/yr | 2–6 weeks  |
| MiCA white-paper preparation and notification                        | $30,000–$100,000+                          | 4–12 weeks |
| Reg D 506(c) offering docs + PPM                                     | $25,000–$75,000+                           | 3–6 weeks  |

### 6.11 Token legal risk register

| Risk                                                   | Likelihood | Impact | Mitigation                                                                                |
| ------------------------------------------------------ | ---------- | ------ | ----------------------------------------------------------------------------------------- |
| SAL/veSAL deemed a security in the US                  | High       | Severe | Conduct Reg D 506(c) sale; add accredited-investor checks; no retail marketing            |
| ENIGMA reclassified due to governance/revenue features | Medium     | High   | Keep governance bounded; no revenue share; functionality at launch                        |
| MiCA white-paper deficiency or marketing violation     | Medium     | High   | Engage EU counsel; prepare white paper before public offer; review all marketing          |
| Unlicensed VASP/CASP activity in BVI/Cayman/EU         | Medium     | High   | Structure to avoid exchange/custody activity from token issuer; license if needed         |
| Pre-functional sale reclassified as security           | High       | Severe | Delay broad distribution until token is usable; use SAFT only within securities exemption |
| Royalty mechanics marketed as investment product       | Medium     | High   | Frame as user-to-user data reuse; no pooling/securitization                               |

### 6.12 Recommended immediate actions (legal)

1. **Engage US securities counsel** for a Howey analysis of SAL/veSAL and ENIGMA within 2 weeks.
2. **Engage BVI/Cayman counsel** to design the issuer/foundation structure within 4 weeks.
3. **Freeze public token language** until counsel reviews all white papers, runbooks, and website copy.
4. **Decide on SAL restructuring** within 6 weeks: either (a) accept securities treatment and design a Reg D/Reg S offering, or (b) remove revenue-share features to pursue a utility-token path.
5. **Prepare MiCA white-paper roadmap** if any EU offering is planned.
6. **Do not deploy SAL/veSAL to mainnet** until the legal opinion and jurisdiction plan are complete.

---

## 7. Security audit

### Current state

No external auditor has been selected, no scope has been written, and no timeline is in place. The Anchor program suite is scaffold-plus (5 programs, ~547 Rust source lines) with SPL settlement and cross-program CPI, but it has not been independently reviewed. The off-chain node, webapp, and deployment pipeline are also outside any prior audit boundary.

### Goal

Select a reputable Solana/Anchor auditor, define a tight scope, run a pre-audit hardening pass, execute the audit, remediate findings, and integrate the findings into CI so security does not regress.

---

#### 7.1 Reputable auditors for Solana/Anchor programs

The Solana ecosystem has a small set of auditors with deep Rust/Sealevel experience. For a protocol that will custody user value on mainnet, the auditor should have a public track record of Solana engagements, not just EVM/Solidity experience. Market research shows that firms with documented Solana specialization are preferred over generalist brands for Rust programs [^sec1][^sec2].

| Firm                                | Solana focus / reputation                                                                                                       | Typical clients / evidence                                   | Best fit for Cortex v3                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **OtterSec (osec.io)**              | Solana-native specialist; secured >$36.8B in TVL and patched >$1B in vulnerabilities [^sec3].                                   | Solana Foundation, Wormhole, Jito Labs, Squads, Jet [^sec4]. | Strong first choice for a full protocol review given deep Anchor/CPI expertise.                                     |
| **Neodyme (neodyme.io)**            | Long-standing Solana core-protocol auditor; maintains Solana PoC framework and training materials [^sec5].                      | Solana Labs, Mango, Marinade, Wormhole, deBridge [^sec6].    | Excellent for complex Anchor programs and proof-of-concept exploit validation.                                      |
| **Sec3 (sec3.dev)**                 | Solana-only security + formal verification; publishes systematic Solana audit methodology and the X-Ray scanner [^sec7][^sec8]. | UXD, Mean, Invariant, Solana Stake Pool [^sec9].             | Strong choice if we want to bundle automated scanning (X-Ray) with the human audit.                                 |
| **Zellic (zellic.io)**              | Boutique offensive-security firm; widely used for Solana/Move and ZK work [^sec10].                                             | Drift, Mango, Phoenix, Pyth, Solana Foundation [^sec11].     | Good for high-assurance review, especially if TEE/STARK or ZK components are added later.                           |
| **CertiK (certik.com)**             | Multi-chain, institutional brand with Solana/Rust AI-assisted audits and 24/7 Skynet monitoring [^sec12][^sec13].               | Jito, Bonk [^sec14].                                         | Useful for exchange listings and institutional credibility; verify that individual auditors are Solana-experienced. |
| **Trail of Bits (trailofbits.com)** | Elite full-system security firm with Solana/Rust/Sealevel capability and public reports [^sec15][^sec16].                       | Squads v4, Drift, Solana core (2022) [^sec17][^sec18].       | Best for comprehensive system review that includes off-chain node, deployment pipeline, and cryptography.           |

**Recommendation:** short-list **OtterSec** or **Neodyme** for the primary Anchor program audit because they live in the Solana runtime daily. Add **Sec3** for a complementary X-Ray/automation engagement, or **Trail of Bits** if we want to extend scope to the off-chain node, deployment, and governance in the same engagement.

---

#### 7.2 Typical scope and timeline

A Solana audit is a manual, adversarial review of instruction handlers, account validation, PDA derivation, CPI trust boundaries, arithmetic, and economic invariants. The work is usually measured in auditor-weeks, with a minimum of two auditors to catch different bug classes [^sec19].

##### Audit phases

1. **Kickoff & scope lock** — define which programs, commits, and off-chain components are in scope; freeze the codebase.
2. **Architecture & threat-model review** — validate PDA seeds, account types, privileged roles, and attacker goals.
3. **Manual code review** — line-by-line review of instruction handlers, account structs, CPI calls, and math.
4. **Automated scanning + fuzzing** — run static analysis (X-Ray, clippy, cargo-audit) and property-based/fuzz tests.
5. **Exploit development** — write PoCs for severity-relevant findings using Neodyme/OtterSec PoC frameworks where useful.
6. **Reporting & remediation** — deliver a report with severity (Critical/High/Medium/Low/Informational), fix recommendations, and a re-test of patches.

##### Complexity tiers and timelines

| Tier                    | Size (Anchor nSLOC)    | Duration   | Effort       | Typical depth                                                         |
| ----------------------- | ---------------------- | ---------- | ------------ | --------------------------------------------------------------------- |
| Simple program          | 500–2,000              | 3–7 days   | 2 auditors   | Account validation, signer/owner checks, arithmetic                   |
| Standard DeFi           | 2,000–6,000            | 1–3 weeks  | 2 auditors   | + economic logic, CPI state consistency, upgrade paths                |
| Complex protocol        | 6,000–15,000           | 2–5 weeks  | 2–4 auditors | + multi-program interactions, formal verification, novel cryptography |
| Critical infrastructure | 15,000+ or ZK/circuits | 4–8+ weeks | 3+ auditors  | Full-system review, custom tooling, re-audits [^sec19][^sec20]        |

**Cortex v3 sizing:** The program suite is ~547 raw Rust source lines across 5 programs. After stripping comments/blanks the nSLOC is likely under 500, but the cross-program CPI surface (`cortex_treasury → budget_escrow`, `capability_registry → memory_registry`, `royalty_router → budget_escrow`) raises the effective complexity from "simple" toward "standard small protocol." Plan for **1–2 weeks with 2 auditors** (roughly 2–4 auditor-weeks).

**Lead time:** Top Solana auditors are typically booked **4–12 weeks** out; rush fees add 20–100% [^sec21]. Start outreach before the code is feature-complete.

---

#### 7.3 Cost ranges

Solana audits command a premium over EVM audits because experienced Rust/Sealevel auditors are scarcer; estimates put the premium at 20–30% [^sec22].

| Tier                           | USDC/USD range     | Cortex v3 estimate                                                               |
| ------------------------------ | ------------------ | -------------------------------------------------------------------------------- |
| Simple program                 | $7,000–$20,000     | Lower bound if we scope only one program                                         |
| Standard DeFi                  | $20,000–$60,000    | **Most likely range for the 5-program suite**                                    |
| Complex protocol               | $60,000–$130,000   | Upper bound if Token-2022, ZK, or off-chain node is added                        |
| High-TVL / formal verification | $150,000–$500,000+ | Only if the protocol handles large TVL or adds STARK/TEE proofs [^sec19][^sec22] |

**Additional cost drivers to budget for:**

- **Rush / expedite fees:** +25–100% for aggressive timelines [^sec21].
- **Re-audit of major changes:** usually scoped as a separate mini-engagement (expect 20–50% of original cost).
- **Fix verification:** some firms include fix reviews; others charge hourly. Confirm this in the statement of work.
- **Audit badge / public report branding:** can be $1,000–$5,000 extra if required [^sec21].
- **Post-audit monitoring / retainer:** optional services such as CertiK Skynet or Sec3 continuous monitoring.

**Risk-adjusted recommendation:** Budget **$25,000–$45,000** for the initial program audit, plus a **$10,000–$15,000** contingency for re-audit after fixes. This assumes no ZK/TEE expansion and no rush fee.

---

#### 7.4 What to prepare

Auditor time is the single largest cost driver; preparation directly reduces both bill and bug count [^sec19].

##### Architecture documentation

Provide a single source of truth that auditors do not have to reverse-engineer from code:

- **Program interaction diagram** showing all 5 programs and the SPL Token Program/System Program calls between them.
- **PDA seed catalog** for every `seeds = [...]` and `find_program_address` call, including bump usage.
- **Account validation matrix** mapping each instruction to required signers, owners, writable accounts, and expected program IDs.
- **Privileged roles** — admin/authority keys, upgrade authority, treasury withdrawer, capability granter [^sec23].
- **Token / value flow diagram** covering deposits, withdrawals, royalty routing, and budget transfers.

Existing Cortex assets to leverage: `specs/unified-architecture.md` and `design-smart-contracts.json` already cover much of this; the pre-audit task is to update them against the current code and add the PDA/account matrix.

##### Threat model

Document the adversarial assumptions explicitly:

- Attacker can craft arbitrary `instruction_data` and arbitrary account arrays (except program ID) [^sec7].
- Off-chain node is semi-trusted; what happens if the node submits a false embedding hash or royalty event?
- Economic attacks: can a user drain budgets via repeated small royalties, stale receipts, or PDA seed collisions?
- Upgrade / admin rug vectors: who controls program upgrades and what is the multisig/timelock plan?

Common Solana attack classes to map against the codebase [^sec7][^sec24]:

- Missing signer / owner checks
- Account confusion and type mismatch
- Unsafe CPI to untrusted programs
- Arithmetic overflow/underflow and precision loss
- PDA seed collision / incorrect derivation
- Re-initiation / re-entrancy within CPI depth limits
- Token-2022 extension edge cases (if used)

##### Test coverage

Before the audit starts, the suite should already exercise happy paths and failure modes:

- **Unit and integration tests** using `anchor test`; aim for high branch coverage of instruction handlers.
- **Boundary tests** for PDA seeds, zero amounts, maximum `u64` values, and expired capabilities [^sec25].
- **Fuzz tests** using [Trident](https://github.com/Ackee-Blockchain/trident) with property/invariant checks (e.g., "total budget balance >= sum of spent amounts") [^sec26].
- **Dependency audit** — run `cargo audit` on `Cargo.lock` and pin/remove vulnerable crates [^sec8].
- **Unsafe Rust scan** — run `cargo geiger`; ideally `#![forbid(unsafe_code)]` is present in all programs [^sec8].

Provide the auditor with a **known-issues list** and a **frozen commit hash**. Changing code during the audit is the most common source of scope creep and cost overruns [^sec19].

---

#### 7.5 Integrating audit findings into CI

A one-time audit is not enough. Findings should become regression tests and gates. The recommended pipeline is:

> Every commit → static analysis; every PR → static analysis + manual spot-check; weekly/overnight → fuzz campaign [^sec27].

##### Static analysis in GitHub Actions

**Sec3 X-Ray (pro-action)**

Sec3 provides a GitHub Action that uploads a SARIF report to GitHub Code Scanning alerts. It scans for 50+ vulnerability classes including missing account validation and arithmetic overflow [^sec28].

```yaml
name: Sec3 Pro Audit
on:
  push:
    branches: [main]
  pull_request:
    branches: ["*"]
jobs:
  audit:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: sec3dev/pro-action@v1
        continue-on-error: true
        with:
          sec3-token: ${{ secrets.SEC3_TOKEN }}
          path: programs
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: sec3-report.sarif
```

False positives can be suppressed with `//#[soteria(ignore_signer)]` style annotations [^sec29].

**Solanaizer AI audit**

A lighter, AI-based option for quick PR feedback on common vulnerability patterns (integer overflow, unsafe memory, authorization errors, CPI depth) [^sec30]:

```yaml
name: Solanaizer AI Audit
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: solanaizer/solanaizer-action
```

**Cargo-native gates**

Run on every PR before the Anchor build:

```yaml
- run: cargo clippy --workspace -- -D warnings
- run: cargo audit
- run: cargo geiger --output-format stdout
```

`cargo audit` checks `Cargo.lock` against the RustSec advisory DB, and `cargo geiger` flags unsafe code [^sec8].

##### Fuzzing in CI

Use [Trident](https://github.com/Ackee-Blockchain/trident) (Ackee Blockchain / Solana Foundation) to run property-based fuzz tests. The Trident repo itself runs fuzz tests in CI using `hubbleprotocol/solana-setup-action`, `Swatinem/rust-cache`, `cargo build-sbf`, and `trident fuzz run fuzz_0` [^sec31]. For Cortex v3, add a matrix entry per program and run each fuzz target for a bounded duration on PRs (e.g., 5 minutes) and longer overnight on `main` (e.g., 30–60 minutes).

Example matrix job (adapted from Trident’s own workflow [^sec31]):

```yaml
jobs:
  fuzz:
    runs-on: ubuntu-24.04
    strategy:
      fail-fast: false
      matrix:
        program:
          [
            budget_escrow,
            capability_registry,
            cortex_treasury,
            memory_registry,
            royalty_router,
          ]
    steps:
      - uses: actions/checkout@v4
      - uses: hubbleprotocol/solana-setup-action@v0.5
        with:
          solana-version: v1.18.26
          rust-version: "1.75"
      - uses: Swatinem/rust-cache@v2
      - run: cargo install trident-cli honggfuzz
      - run: cargo build-sbf
        working-directory: programs/${{ matrix.program }}
      - run: trident fuzz run fuzz_0 --run-time 300
        working-directory: programs/${{ matrix.program }}/trident-tests
```

##### Findings remediation workflow

When the audit report arrives, convert each finding into a tracked remediation item:

1. Create one GitHub issue per Critical/High/Medium finding, tagged `security/audit` and severity label.
2. Link each fix PR to its issue; require a second reviewer for any code touching the affected instruction or account struct.
3. Re-run the full static-analysis and fuzz pipeline on the fix branch; fail CI on new Critical/High findings.
4. Return the patched commit to the auditor for fix verification (confirm whether this is included in the SoW).
5. Archive the final report, SARIF artifacts, and proof-of-concepts in `specs/audit-reports/` and update `BLOCKERS.md`.

---

#### 7.6 Concrete implementation path and owners

| Step | Action                                                                              | Owner                         | Timeline | Deliverable                                                     |
| ---- | ----------------------------------------------------------------------------------- | ----------------------------- | -------- | --------------------------------------------------------------- |
| 1    | Freeze features for v1 program suite; tag a release candidate.                      | Smart-contract lead           | Week 0   | Git tag `v0.9.0-audit-rc`                                       |
| 2    | Update `specs/unified-architecture.md` with PDA/account matrix and token flow.      | Security / architecture       | Week 0–1 | Architecture addendum                                           |
| 3    | Add Trident fuzz templates and run an internal fuzz campaign; fix trivial findings. | Smart-contract lead           | Week 1–2 | Fuzz tests + internal bug list                                  |
| 4    | Enable Sec3 X-Ray + cargo-audit/clippy/geiger in CI on every PR.                    | DevOps / security             | Week 1   | `.github/workflows/cortex-v3-security.yml`                      |
| 5    | Request quotes from OtterSec, Neodyme, Sec3 (and optionally Trail of Bits).         | Security audit coordinator    | Week 1–2 | 3 quotes + scope comparison                                     |
| 6    | Select auditor, sign SoW, and schedule kickoff.                                     | Project lead / legal          | Week 2–3 | Signed contract + kickoff date                                  |
| 7    | Execute audit and triage findings daily with auditors.                              | Smart-contract lead + auditor | Week 4–5 | Draft report                                                    |
| 8    | Remediate Critical/High findings and request fix verification.                      | Smart-contract lead           | Week 5–7 | Closed issues + re-test memo                                    |
| 9    | Publish final report, update docs, and gate mainnet deployment on sign-off.         | Security audit coordinator    | Week 7   | `specs/audit-reports/2026-XX-final.pdf` + updated `BLOCKERS.md` |

**Estimated total calendar time:** 7–9 weeks from today, assuming 4–6 weeks of auditor lead time.

**Estimated cost:** $25,000–$45,000 for the initial audit + $10,000–$15,000 contingency for re-audit/fix verification. Add ~$20,000 if Trail of Bits or Zellic is chosen for full-system coverage.

---

#### 7.7 Security audit sources

[^sec1]: Sherlock, "Top 10 Best Smart Contract Auditing Companies in 2026" — notes that Solana/Move builders often pick OtterSec or Zellic. https://sherlock.xyz/post/top-10-best-smart-contract-auditing-companies-in-2026
[^sec2]: Tokenmetrics, "Top Smart Contract Auditors 2025". https://www.tokenmetrics.com/blog/top-smart-contract-auditors-2025
[^sec3]: Solana Compass, "OtterSec on Solana" — $36.8B+ TVL secured. https://solanacompass.com/projects/ottersec
[^sec4]: sannykim/solsec, "Audits and Code Reviews" section lists OtterSec reports for Squads, Jet, Cashmere, Cega, Solvent. https://github.com/sannykim/solsec
[^sec5]: sannykim/solsec, "Foundations" section — Neodyme common pitfalls and Solana security workshop. https://github.com/sannykim/solsec
[^sec6]: sannykim/solsec, "Audits and Code Reviews" section — Neodyme reports for Mango, Marinade, Wormhole, deBridge, Solido. https://github.com/sannykim/solsec
[^sec7]: Sec3, "How to Audit Solana Smart Contracts Part 1: A Systematic Approach" — attacker goals and common vulnerability classes. https://www.sec3.dev/blog/how-to-audit-solana-smart-contracts-part-1-a-systematic-approach
[^sec8]: Sec3, "How to Audit Solana Smart Contracts Part 2: Automated Scanning" — X-Ray, cargo-audit, cargo-clippy, cargo-geiger. https://www.sec3.dev/blog/how-to-audit-solana-smart-contracts-part-2-automated-scanning
[^sec9]: sannykim/solsec, "Audits and Code Reviews" section — Sec3 reports for UXD, Mean, Invariant, Solana Stake Pool. https://github.com/sannykim/solsec
[^sec10]: Zellic homepage — Solana specialization and 2025 statistics. https://www.zellic.io/
[^sec11]: sannykim/solsec, "Audits and Code Reviews" section — Zellic reports for Drift, Pyth. https://github.com/sannykim/solsec
[^sec12]: CertiK, "Smart Contract Audit" product page — manual + AI review and formal verification option. https://www.certik.com/products/smart-contract-audit
[^sec13]: CertiK, "What is Solana?" — Skynet 24/7 monitoring. https://www.certik.com/resources/blog/6FXjQJLF2kQoAOnwIedhDX-what-is-solana
[^sec14]: Solana Compass, "CertiK on Solana" — audited Jito and Bonk. https://solanacompass.com/projects/certik
[^sec15]: Trail of Bits, "Blockchain" services page — full-system coverage and Solana/Rust/Sealevel expertise. https://www.trailofbits.com/services/software-assurance/blockchain/
[^sec16]: Trail of Bits publications repository. https://github.com/trailofbits/publications
[^sec17]: Squads blog, "Trail of Bits Security Audit of Squads v4" — 4 engineer-weeks, Sep 2023. https://squads.xyz/blog/trail-of-bits-security-audit-v4
[^sec18]: Drift update, "Trail of Bits Security Audit". https://www.drift.trade/updates/tob-security-audit
[^sec19]: Accretion, "How Much Does a Solana Audit Cost in 2026?" — pricing tiers, auditor-week model, rush fees, cost-reduction advice. https://accretion.xyz/blog/solana-audit-cost
[^sec20]: Zealynx, "Smart Contract Audit Cost in 2026" — complex protocol pricing. https://www.zealynx.io/blogs/audit-pricing-2026
[^sec21]: Nadcab, "Smart Contract Audit Pricing Models Explained in 2026" — rush fees, badge costs, post-audit fees. https://www.nadcab.com/blog/smart-contract-audit-pricing-models-explained
[^sec22]: Zealynx, "Smart Contract Audit Cost in 2026" — Solana premium over EVM. https://www.zealynx.io/blogs/audit-pricing-2026
[^sec23]: Rektoff, "Security Roadmap for Solana Applications" — protocol documentation must map privileged roles and permissions. https://github.com/Rektoff/Security-Roadmap-for-Solana-applications
[^sec24]: Zealynx, "Solana Security Guide: 45 Exploit Checks for Anchor & Native Programs" — missing signer/owner checks, account confusion, state sharding. https://www.zealynx.io/blogs/solana-security-checklist
[^sec25]: Rektoff, "Security Roadmap for Solana Applications" — PDA boundary testing and fuzz testing. https://github.com/Rektoff/Security-Roadmap-for-Solana-applications
[^sec26]: Ackee Blockchain, "Introducing Trident: The First Open-Source Fuzzer for Solana Programs". https://ackee.xyz/blog/introducing-trident-the-first-open-source-fuzzer-for-solana-programs
[^sec27]: DEV Community, "The Solana Security Toolbox in 2026" — recommended CI pipeline: every commit X-Ray, every PR X-Ray + Octane, weekly Trident. https://dev.to/ohmygod/the-solana-security-toolbox-in-2026-a-practitioners-guide-to-fuzzing-static-analysis-and-5h7f
[^sec28]: Solana Compass, "Sec3 on Solana" — X-Ray 50+ vulnerability classes and GitHub Action integration. https://solanacompass.com/projects/sec3
[^sec29]: Sec3, `sec3dev/pro-action` README — SARIF output, Code Scanning alerts integration, ignore annotations. https://github.com/sec3dev/pro-action
[^sec30]: Solanaizer, `solanaizer-sample-project` README — GitHub Action usage and detected vulnerability classes. https://github.com/solanaizer/solanaizer-sample-project

## [^sec31]: Ackee-Blockchain/trident, `.github/workflows/fuzz.yml` — CI matrix using `solana-setup-action`, `rust-cache`, `cargo build-sbf`, and `trident fuzz run`. https://github.com/Ackee-Blockchain/trident/blob/master/.github/workflows/fuzz.yml

## 8. Frictionless UX

### Problem

Cross-model memory requires too many manual steps and per-action approvals.

### Solution

Adopt the architecture from `specs/frictionless-memory-ux-research.md`:

1. Expose memory as MCP tools (`search_memory`, `add_memory`) and resources (`memory_index`, `capability`, `budget`).
2. Authenticate once via MCP OAuth 2.1 + PKCE, with Privy as the recommended IDP/embedded-wallet bridge.
3. Issue wallet-derived Capability PDAs scoped per model.
4. Use Privy delegated server sessions to sign memory-anchor and budget operations without per-action prompts.
5. Apply server-side auto-save heuristics (immunology scanner, salience score, budget cap, category filters).
6. Support resource subscriptions where clients allow them; fall back to model-initiated `search_memory` calls.

### Implementation steps

1. Add MCP OAuth authorization server to the off-chain node.
2. Implement `Capability` grant/verify flow in `capability_registry`.
3. Integrate Privy server sessions for Solana transaction signing.
4. Build auto-save policy engine with user-configurable thresholds.
5. Add per-model revocation UI and on-chain burn.

### Cost / risk

- **Cost**: 4–8 weeks engineering; Privy/Dynamic usage-based pricing.
- **Risk**: Medium. MCP client behavior varies across ChatGPT/Claude/Gemini; plan for client-specific fallbacks.

---

## 9. Cross-cutting dependencies and recommended sequence

```
Weeks 1–2:   Engage legal counsel (token) + security auditor (scoping)
Weeks 2–4:   Windows Anchor CLI (WSL2 + devcontainer); mainnet custody design
Weeks 4–6:   Production vector DB + embedding pipeline; TEE/STARK proof of concept
Weeks 6–10:  Security audit execution + remediation
Weeks 8–12:  Token legal opinion + jurisdiction/structure implementation
Weeks 10–14: Frictionless UX integration + MCP OAuth
Weeks 12–16: Mainnet deployment (after audit and legal sign-off)
```

**Critical path blockers:**

- Token legal review must precede any SAL/veSAL mainnet deployment.
- Security audit must precede mainnet deployment.
- Mainnet custody must be configured before any mainnet CI job is enabled.

---

## 10. Sources and references

### Legal / regulatory

- SEC, "SEC Clarifies the Application of Federal Securities Laws to Crypto Assets" (March 17, 2026) — https://www.sec.gov/newsroom/press-releases/2026-30-sec-clarifies-application-federal-securities-laws-crypto-assets
- WilmerHale, "The SEC’s New Framework for Crypto Assets Under Howey" (March 24, 2026) — https://www.wilmerhale.com/en/insights/client-alerts/20260324-the-secs-new-framework-for-crypto-assets-under-howey
- SEC, "The SEC’s Approach to Digital Assets: Inside ‘Project Crypto’" (speech, Paul S. Atkins, December 11, 2025) — https://www.sec.gov/newsroom/speeches-statements/atkins-111225-secs-approach-digital-assets-inside-project-crypto
- SEC, "Framework for ‘Investment Contract’ Analysis of Digital Assets" (April 3, 2019) — https://www.sec.gov/files/dlt-framework.pdf
- Paul Hastings, "SEC Provides Updated Guidance Reducing Burden for Rule 506(c) Verification Requirement" (March 25, 2025) — https://www.paulhastings.com/insights/client-alerts/sec-provides-updated-guidance-reducing-burden-for-rule-506-c-verification-requirement
- ESMA, "Markets in Crypto-Assets Regulation (MiCA)" — https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica
- European Banking Authority, "Asset-referenced and e-money tokens (MiCA)" — https://www.eba.europa.eu/regulation-and-policy/asset-referenced-and-e-money-tokens-mica
- Paul Hastings, "MiCA Crypto White Papers — Comply or Be De-Listed" (October 22, 2025) — https://www.paulhastings.com/insights/client-alerts/mica-crypto-white-papers-comply-or-be-de-listed
- FINMA, "FINMA publishes ICO guidelines" (February 16, 2018) — https://www.finma.ch/en/news/2018/02/20180216-mm-ico-wegleitung/
- Chambers & Partners, "Blockchain 2025 — Switzerland" — https://practiceguides.chambers.com/practice-guides/blockchain-2025/switzerland/trends-and-developments
- MAS, "MAS Clarifies Regulatory Regime for Digital Token Service Providers" (May 30, 2025) — https://www.mas.gov.sg/news/media-releases/2025/mas-clarifies-regulatory-regime-for-digital-token-service-providers
- MAS, "Guidelines on Licensing for Digital Token Service Providers" — https://www.mas.gov.sg/regulation/guidelines/guidelines-on-licensing-for-dtsps
- DAO SPV, "Crypto catamaran: why, when, and how to use the BVI & Cayman structure for token issuance" (November 22, 2025) — https://blog.daospv.com/crypto-catamaran-why-when-and-how-to-use-the-bvi-cayman-structure-for-token-issuance/
- Legal Nodes, "Cayman Foundation with a BVI Company for Token Launches & DAOs" (August 25, 2025) — https://www.legalnodes.com/article/cayman-foundation-bvi-company-token-launches

### Token legal opinion / practice

- Whale Law, "Crypto Exchange Token: Legal Security Opinion Letter" (September 26, 2025) — https://law-kc.com/crypto-exchange-token-legal-opinion-letter-security
- Legal Kornet, "Legal Opinion for Crypto Tokens" — https://legal-kornet.com/services/blockchain-ico-sto-ieo/legal-opinion-howey-test/
- Metapress, "How to Choose a Law Firm for a Cryptocurrency Legal Opinion" (May 21, 2025) — https://metapress.com/how-to-choose-a-law-firm-for-a-cryptocurrency-legal-opinion/
- Onchain Accounting, "Cryptocurrency Lawyer Fee Rates: A Complete Overview" (August 3, 2024) — https://onchainaccounting.com/articles/cryptocurrency-lawyer-fee-rates-complete-overview

### Revenue-share / royalty tokens

- Cointelegraph, "SEC’s 2025 guidance: What tokens are (and aren’t) securities" (June 2, 2025) — https://cointelegraph.com/explained/secs-2025-guidance-what-tokens-are-and-arent-securities
- CFA Institute, "Beyond Speculation: The Rise of Revenue-Sharing Tokens" (January 24, 2025) — https://blogs.cfainstitute.org/investor/2025/01/24/beyond-speculation-the-rise-of-revenue-sharing-tokens/
- Skadden, "Howey’s Still Here: A Recent Reminder on the Limits of the SEC’s Crypto Thaw" (August 18, 2025) — https://www.skadden.com/insights/publications/2025/08/howeys-still-here

### TEE / remote attestation

- AWS Nitro Enclaves attestation: [AWS docs](https://docs.aws.amazon.com/enclaves/latest/user/set-up-attestation.html), [AWS Compute Blog "Validating attestation documents"](https://aws.amazon.com/blogs/compute/validating-attestation-documents-produced-by-aws-nitro-enclaves/), [Trail of Bits Nitro notes (2024)](https://blog.trailofbits.com/2024/02/16/a-few-notes-on-aws-nitro-enclaves-images-and-attestation/).
- Azure Confidential Computing / TDX: [Microsoft Learn overview](https://learn.microsoft.com/en-us/azure/confidential-computing/overview-azure-products), [Azure Attestation overview](https://learn.microsoft.com/en-us/azure/attestation/overview), [Azure Blog on 4th Gen Intel Xeon with TDX (June 2025)](https://azure.microsoft.com/en-us/blog/azure-confidential-computing-on-4th-gen-intel-xeon-scalable-processors-with-intel-tdx/).
- AWS Nitro vs Intel TDX attestation-root comparison: [DEV Community (2026)](https://dev.to/voltagegpu/aws-nitro-enclaves-vs-intel-tdx-why-attestation-root-matters-for-regulated-workloads-56ib), [VoltageGPU blog (2026)](https://voltagegpu.com/blog/aws-nitro-alternative-confidential-why-intel-tdx-beats-nitro-enclaves-on-attesta).
- Remote attestation primer: [Edera "Explaining Remote Attestation in Confidential Computing"](https://edera.dev/stories/remote-attestation-in-confidential-computing-explained).
- Solana TEE / oracle context: [Solana TEE docs](https://docs.solanatee.com/), [Solana Foundation oracles course](https://github.com/solana-foundation/solana-com/blob/main/content/courses/connecting-to-offchain-data/oracles.mdx).

### STARK / SNARK / zkVM

- RISC Zero: [RISC Zero docs](https://dev.risczero.com/), [Veridise audit Round 2 (Nov–Dec 2024)](https://veridise.com/wp-content/uploads/2025/04/VAR-Risc0-241028-Round2-V4.pdf), [ChainCatcher / BroadNotes R0VM 2.0 analysis (2025)](https://www.chaincatcher.com/en/article/2200417).
- SP1: [Succinct docs](https://docs.succinct.xyz/docs/sp1/what-is-a-zkvm), [L2BEAT SP1 entry](https://l2beat.com/zk-catalog/sp1), [The Block on SP1 Hypercube (May 2025)](https://www.theblock.co/post/355013/succinct-introduces-zkvm-sp1-hypercube-claims-real-time-ethereum-proving).
- RISC Zero vs SP1 comparison: [Trapdoor-Tech SP1 source walkthrough](https://trapdoortech.medium.com/zero-knowledge-proof-introduction-to-sp1-zkvm-source-code-d26f88f90ce4), [Jung-Hua Liu comparative analysis (Aug 2025)](https://medium.com/@gwrx2005/comparative-analysis-of-sp1-and-risc-zero-zero-knowledge-virtual-machines-4abf806daa70).
- Starknet / Cairo: [Starknet docs](https://docs.starknet.io/), [Cairo Book](https://www.starknet.io/cairo-book/ch200-introduction.html), [Herodotus integrity verifier](https://github.com/HerodotusDev/integrity).
- ZK memory consistency / database proofs: [ZKSQL (VLDB 2023)](https://www.vldb.org/pvldb/vol16/p1804-li.pdf), [Constant-Overhead ZK for RAM Programs](https://eprint.iacr.org/2021/979.pdf), [RISC Zero STARK memory argument](https://dev.risczero.com/proof-system/proof-system-sequence-diagram).

### Mainnet deployment and custody

- Solana Docs — Fees: https://solana.com/docs/core/fees
- Solana Docs — Fee Structure: https://solana.com/docs/core/fees/fee-structure
- Solana Docs — Deploying Programs: https://solana.com/docs/programs/deploying
- Helius Priority Fee API: https://www.helius.dev/docs/priority-fee-api
- QuickNode Solana Guides: https://www.quicknode.com/guides/solana-development
- Squads Protocol v4: https://github.com/Squads-Protocol/v4
- Squads Docs: https://docs.squads.so/main
- Squads Pricing: https://squads.xyz/blog/new-pricing-plan
- Solana Foundation GitHub Workflows: https://github.com/solana-foundation/github-workflows
- Solana Developers GitHub Actions: https://github.com/solana-developers/github-actions
- Anchor CLI IDL docs: https://www.anchor-lang.com/docs
- Ledger Solana Wallet: https://www.ledger.com/coin/wallet/solana
- Realms: https://app.realms.today

---

_Research memo — Enigma Cortex v3 — 2026-06-27_
