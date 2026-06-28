# Enigma Memory — Mainnet Wallet Custody Plan

This document describes how to secure the Solana wallets and authorities that control the Enigma Cortex v3 programs on mainnet. It is written for a security review and assumes the reader is the launch operator or a custody/security engineer.

> **Scope** — This plan covers program deployment keys, program upgrade authorities, treasury custody, emergency procedures, and the GitHub secrets needed for CI/CD. It does not cover consumer wallet security (Privy/passkey), off-chain node operator keys, or hosted-cloud KMS setup; those are handled in separate runbooks.
>
> **Safety rule** — No real private keys, seed phrases, or keypair file contents belong in this document, in repository source, in CI logs, or in chat. All examples use placeholder values.

---

## 1. Programs and authorities

The following Anchor programs make up the on-chain layer of Enigma Cortex v3. Each program is currently declared with a localnet program ID in `cortex-v3/Anchor.toml` and has been deployed to devnet under the operator's devnet wallet (`FasTsgodYjJwiiZ1eAxHmocVCvKcKNiXZYVJUZiZ3rh7`).

| Program | Localnet ID (`Anchor.toml`) | Authority model on chain |
| --- | --- | --- |
| `memory_registry` | `4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM` | No program-level admin; memories are owned by user wallets. |
| `budget_escrow` | `8opHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh` | No program-level admin; budgets are owned by user wallets. |
| `capability_registry` | `CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3` | `pause_all_sessions` increments a per-owner nonce, invalidating active sessions. Callable by the user's wallet/owner_nonce authority, not a protocol admin. |
| `royalty_router` | `GcdayuLaLyrdmUu324nahyv33G5poQdLUEZ1nEytDeP` | No program-level admin; routes royalties from payer budgets to payees. |
| `cortex_treasury` | `LX3EUdRUBUa3TbsYXLEUdj9J3prXkWXvLYSWyYyc2Jj` | `treasury.authority` is set on first `initialize` and must match on subsequent calls. Use a multisig or cold key, not the deployer hot wallet. |
| `cortex_token` | `EqV3aLfvqNycQzofXVLxsry8WMMfZX8WmomYNUBskZSb` | `mint_authority` is a program PDA (`[b"mint_authority"]`). No protocol admin signer is required for minting, but any external token metadata/freeze authorities must be secured separately. |

**Key consequences for custody:**

- The only protocol-level admin surface in the program suite is the `cortex_treasury` withdrawal authority.
- Program upgrade authority is a Solana-level concern, not an instruction in these programs.
- There is no global protocol pause instruction. Emergency response relies on (a) revoking session keys through the off-chain node, (b) rotating program upgrade authority, and (c) social/off-chain coordination.

---

## 2. Custody model options

For mainnet, choose a custody model for each key/authority below. The same model may not fit every key.

| Role | Examples | Recommended model | Rationale |
| --- | --- | --- | --- |
| Program deployer / upgrade authority | `solana program deploy`, `anchor upgrade` | **Multisig (Squads or Fuse)** | Single-signature hot wallets have caused catastrophic program upgrades. A multisig adds approval quorums, member rotation, and transaction visibility. |
| Treasury authority (`cortex_treasury`) | Treasury withdrawals, fee distribution | **Multisig or institutional MPC custody** | Controls protocol fees. Must survive individual key loss and resist insider abuse. |
| CI/CD deployment hot wallet | `SOLANA_MAINNET_WALLET` GitHub secret | **Dedicated hot wallet stored only as a GitHub secret, funded minimally** | Automation requires a signable key. It should hold only enough SOL for deployments and should **not** be the upgrade authority or treasury authority. |
| Token metadata / freeze authority (if any) | Metaplex token metadata update authority | **Cold hardware wallet or multisig** | Secondary authority; compromise can damage token legitimacy. |
| Developer/devnet wallet | `SOLANA_DEVNET_WALLET` | Existing devnet hot wallet is acceptable for devnet only. Never reuse it for mainnet. |

### 2.1 Hardware wallet (Ledger)

Best for: cold storage of backup keys, token authorities, and one-person operators who do not yet need a multisig.

- Use a Ledger Nano S Plus or Nano X with the Solana app.
- Reference the device in CLI commands: `solana config set --keypair usb://ledger`.
- Keep the recovery phrase offline in a tamper-evident location; do not store it in a password manager that syncs to the cloud.
- A hardware wallet alone is **not recommended** for the program upgrade authority because upgrades may need to be approved by multiple people.

### 2.2 Multisig (recommended for upgrade and treasury authorities)

Best for: program upgrade authority, treasury authority, and any protocol-level admin.

**Squads (squads.so)**

- Industry-standard Solana multisig with role-based permissions, spending limits, and program upgrade support.
- Create a Squad, add members, set a threshold (e.g., 2-of-3 or 3-of-5), and use the Squad vault/public key as the deployer and upgrade authority.
- For program upgrades, the upgrade instruction is proposed inside Squads and executed after threshold approval.
- Supports time-locks and sub-accounts for treasury segregation.

**Fuse (fusesecurity.xyz)**

- Alternative Solana multisig/permissions tool with programmable access control.
- Evaluate whether its permission model fits the treasury and upgrade workflows before committing.

**Recommended configuration:**

- Minimum threshold: 2-of-3 for small teams; 3-of-5 for larger launches.
- Include at least one cold/offline key or hardware-backed key as a break-glass member.
- Document each member's key storage method and rotation procedure.
- Never let a single engineer create, fund, and hold all multisig keys.

### 2.3 MPC (institutional custody)

Best for: treasury custody at scale, regulated entities, or when qualified custody is required.

- Providers such as Fireblocks, Copper, or Fordefi offer Solana MPC custody with policy engines.
- MPC can hold treasury assets and sign transactions through an API, but it adds vendor dependency and integration work.
- For program upgrades, MPC signing may be slower; many teams use a multisig for upgrade authority and MPC only for treasury token custody.

---

## 3. Migration sequence: devnet to mainnet

Follow this order. Do not skip steps because they are procedural.

### Phase 0 — Pre-mainnet gating

1. Complete a formal security audit of the Cortex v3 program suite and remediate all critical/high findings.
2. Obtain token legal review before `cortex_token` is deployed or minted on mainnet.
3. Freeze the audited commit hash. Tag it (e.g., `cortex-v3-audited`) and record it in release evidence.

### Phase 1 — Prepare mainnet identities

1. Create the mainnet multisig that will become the deployer and upgrade authority (Squads recommended).
2. Create the mainnet treasury authority key/multisig for `cortex_treasury`.
3. Create a dedicated CI hot wallet for automated builds/tests. This wallet must **not** be the upgrade authority.
4. Fund each wallet with mainnet SOL from a trusted exchange or custody provider. Fund only what is needed:
   - Multisig/deployer: enough for program deployment plus a small buffer.
   - CI hot wallet: enough for CI verification jobs only (often < 0.1 SOL if it does not deploy).
   - Treasury authority: usually 0 SOL if it does not pay network fees; the treasury PDA pays rent from its own lamports when initialized.

### Phase 2 — Configure repository secrets

1. Set `SOLANA_MAINNET_WALLET` to the JSON-serialized CI hot wallet. See `cortex-v3/deploy/MAINNET_SETUP.md` for the exact format and upload steps.
2. Set `SOLANA_MAINNET_UPGRADE_AUTHORITY` to the public key of the multisig that will hold program upgrade authority.
3. Set `SOLANA_MAINNET_TREASURY_AUTHORITY` to the public key of the treasury authority.
4. (Optional) Set `SOLANA_MAINNET_RPC_URL` to a private mainnet RPC endpoint (Helius, QuickNode, etc.). Do not use this secret for public-facing docs.

> **Important:** The `SOLANA_MAINNET_WALLET` secret should contain the **CI hot wallet**, not the upgrade authority keypair. The upgrade authority should never exist as a plain JSON keypair in GitHub Actions.

### Phase 3 — Update configuration files

1. In `cortex-v3/Anchor.toml`:
   - Change `provider.cluster` from `Localnet` to `mainnet-beta` for mainnet builds.
   - Add a `[programs.mainnet-beta]` section with placeholder IDs that will be filled after deployment.
2. Create or update `.github/workflows/cortex-v3-mainnet.yml` (separate from the devnet workflow). It should:
   - Trigger only on `workflow_dispatch`.
   - Use `secrets.SOLANA_MAINNET_WALLET`.
   - Set `solana config set --url mainnet-beta`.
   - Print the public key for logs but never the private key.
   - Never run on pull requests or untrusted branches.

### Phase 4 — Deploy to mainnet

1. Run `anchor build` from the audited tag.
2. Deploy each program from the multisig/deployer key:
   ```bash
   anchor deploy --provider.cluster mainnet-beta --provider.wallet <MULTISIG_KEYPAIR_OR_LEDGER_PATH>
   ```
3. Record each deployed program ID.
4. Update `Anchor.toml` `[programs.mainnet-beta]` with the real program IDs and commit the change.
5. Verify deployment:
   ```bash
   solana program show <PROGRAM_ID> --url mainnet-beta
   ```

### Phase 5 — Transfer upgrade authority to the multisig

Immediately after deployment, set the upgrade authority of every program to the multisig:

```bash
solana program set-upgrade-authority <PROGRAM_ID> \
  --new-upgrade-authority <MULTISIG_PUBKEY> \
  --url mainnet-beta \
  --keypair <DEPLOYER_KEYPAIR_OR_LEDGER_PATH>
```

Verify with:

```bash
solana program show <PROGRAM_ID> --url mainnet-beta
```

The "Upgrade authority" line should now show the multisig address.

### Phase 6 — Initialize protocol state

1. Call `cortex_treasury::initialize` from the treasury authority multisig (or a hardware wallet if the treasury authority is a single key). This sets `treasury.authority` permanently for that treasury PDA.
2. Record the treasury PDA and vault ATA.
3. Do not initialize the treasury from the CI hot wallet or deployer wallet unless that wallet is intended to be the permanent authority.

### Phase 7 — Post-deployment verification

1. Verify all program IDs and upgrade authorities in a spreadsheet and in on-chain `solana program show` output.
2. Verify the treasury authority matches the intended multisig/key.
3. Run mainnet smoke tests that read program state but do not spend user funds.
4. Archive deployment keypair files offline; the multisig is now the live authority.

---

## 4. Program upgrade authority policy

The upgrade authority is the most powerful key for each deployed program. Compromise or loss is catastrophic.

### 4.1 Ownership rule

- After Phase 5, every Cortex v3 program on mainnet must have its upgrade authority set to the **mainnet multisig** (`SOLANA_MAINNET_UPGRADE_AUTHORITY`).
- No program may keep the CI hot wallet, a single developer key, or an unbacked keypair as its upgrade authority.

### 4.2 Upgrade workflow

1. Propose the upgrade inside the multisig (Squads).
2. At least two members independently review the compiled `.so` and the source commit hash.
3. After quorum approval, execute the upgrade transaction from the multisig.
4. Record the upgrade in `cortex-v3/deploy/mainnet-upgrades.md` (or equivalent release evidence) with:
   - Program ID
   - Old and new program data hashes (`solana program show --buffers` or explorer link)
   - Source commit hash
   - Audit status (audited / emergency / patch)
   - Multisig transaction reference

### 4.3 Upgrade frequency and freezes

- Do not upgrade mainnet programs outside of a planned release window unless responding to a security incident.
- Implement a code-freeze period (e.g., 48 hours) after tagging a release before the on-chain upgrade is executed.
- Emergency upgrades may bypass the freeze, but they require a post-incident review and evidence write-up.

---

## 5. Treasury custody for protocol fees

The `cortex_treasury` program holds protocol fees in a token vault. Its `treasury.authority` signer can withdraw those funds.

### 5.1 Authority choice

- **Primary recommendation:** a multisig (Squads) with at least 2-of-3 threshold.
- **Secondary option:** institutional MPC custody if the treasury scales beyond a threshold that requires qualified custody.
- **Not allowed:** a single hot wallet, the CI deployment wallet, or a keypair stored in GitHub Secrets.

### 5.2 Treasury operational controls

- Use a dedicated treasury vault account for each token/mint. Do not mix protocol fees with operational funds.
- Define withdrawal policies in the multisig: daily/weekly limits, destination whitelist, and dual approval for large transfers.
- Record every withdrawal in the treasury ledger with a link to the multisig transaction.
- Rotate treasury authority only through a controlled migration: create a new treasury PDA, drain the old vault, and update all fee-routing configurations.

### 5.3 Fee routing

- The `royalty_router` program routes payments from user budgets to payees. Ensure payee addresses and royalty percentages are reviewed before launch.
- Any change to fee percentages or treasury destinations requires a program upgrade (for hard-coded values) or an authorized configuration transaction (if a config account is added later).

---

## 6. Emergency pause and upgrade procedures

There is no single global pause instruction in Cortex v3. The emergency response uses the available on-chain and off-chain controls.

### 6.1 Session-key emergency revocation

- Each user has an `OwnerNonce` account in `capability_registry`.
- Calling `pause_all_sessions` increments the nonce, invalidating all active session keys that were created with the old nonce.
- This is a **per-user** action, not a global kill switch. The off-chain node and webapp should expose a one-tap "Revoke all sessions" button.
- If a session key is compromised, the user (or an operator acting on a verified support request) revokes sessions from the user's wallet.

### 6.2 Program-level emergency responses

| Scenario | Response | Key/role required |
| --- | --- | --- |
| Critical bug in a program | Upgrade the program via the multisig upgrade authority. | Multisig members |
| Upgrade authority key suspected compromised | Rotate upgrade authority to a new multisig via `solana program set-upgrade-authority`. | Current multisig quorum |
| Treasury authority suspected compromised | Drain treasury vault to a safe address; deploy a new treasury with a new authority. | Treasury authority quorum |
| CI hot wallet leaked | Rotate `SOLANA_MAINNET_WALLET` secret; revoke any mainnet lamports; audit Actions logs. | Repository admin |
| RPC endpoint compromised or rate-limited | Rotate `SOLANA_MAINNET_RPC_URL` secret; verify no transactions were submitted to a malicious RPC. | DevOps operator |

### 6.3 Emergency communication

- Maintain an internal incident-response channel with the multisig members, repository admins, and off-chain node operators.
- Prepare a public incident status page template that does not disclose technical details, wallet addresses, or key material.
- After any emergency upgrade, publish a post-mortem with the program ID, commit hash, and remediation steps (public-safe).

---

## 7. Required GitHub secrets

The following secrets are required for mainnet CI/CD and custody. Placeholder values are shown; replace them with real values after secure generation.

| Secret name | Purpose | Example value (placeholder) | Storage rules |
| --- | --- | --- | --- |
| `SOLANA_MAINNET_WALLET` | CI hot wallet JSON array for automated mainnet builds/verification. | `[123,45,...,89]` | GitHub Actions secret only. Dedicated wallet, minimal balance, not upgrade authority. |
| `SOLANA_MAINNET_UPGRADE_AUTHORITY` | Public key of the multisig that owns program upgrade authority. | `Squads...xyz` | Repository variable or secret; public key only, no private key. |
| `SOLANA_MAINNET_TREASURY_AUTHORITY` | Public key of the treasury authority. | `Squads...abc` | Repository variable or secret; public key only. |
| `SOLANA_MAINNET_RPC_URL` | Private mainnet RPC endpoint. | `https://mainnet.helius-rpc.com/?api-key=...` | GitHub Actions secret only. Rotate if leaked. |

### 7.1 How to set the secrets

Via the GitHub web UI:

1. Go to **Settings → Secrets and variables → Actions**.
2. Click **New repository secret**.
3. Enter the name and value.
4. Click **Add secret**.

Via the `gh` CLI:

```bash
gh secret set SOLANA_MAINNET_WALLET --body "$(cat ~/.config/solana/mainnet-ci-wallet.json)" --repo Enigma-Memory/enigma-memory
gh variable set SOLANA_MAINNET_UPGRADE_AUTHORITY --body "<MULTISIG_PUBKEY>" --repo Enigma-Memory/enigma-memory
gh variable set SOLANA_MAINNET_TREASURY_AUTHORITY --body "<TREASURY_PUBKEY>" --repo Enigma-Memory/enigma-memory
```

Replace `Enigma-Memory/enigma-memory` with the actual owner/repo.

---

## 8. Concrete next steps for the operator

Use this checklist to configure custody before mainnet deployment. Each item should have an owner and a completion date.

### Multisig setup

- [ ] Create a Squads multisig for program upgrade authority (recommend 2-of-3 or 3-of-5).
- [ ] Create a separate Squads multisig (or institutional MPC account) for `cortex_treasury` authority.
- [ ] Record each member's key storage method and backup location.
- [ ] Test one propose-and-execute flow on devnet with the same multisig configuration.

### Keys and secrets

- [ ] Generate a dedicated CI hot wallet for `SOLANA_MAINNET_WALLET`. Do not reuse the devnet wallet or any developer personal wallet.
- [ ] Fund the CI hot wallet with the minimum mainnet SOL needed for CI verification.
- [ ] Set `SOLANA_MAINNET_WALLET`, `SOLANA_MAINNET_UPGRADE_AUTHORITY`, `SOLANA_MAINNET_TREASURY_AUTHORITY`, and `SOLANA_MAINNET_RPC_URL` in GitHub.
- [ ] Verify that no repository code, log, or artifact prints the CI wallet private key.

### Configuration

- [ ] Update `cortex-v3/Anchor.toml` to use `mainnet-beta` and add `[programs.mainnet-beta]` placeholders.
- [ ] Create `.github/workflows/cortex-v3-mainnet.yml` that triggers only on `workflow_dispatch` and uses the mainnet secrets.
- [ ] Confirm the devnet workflow (`.github/workflows/cortex-v3-anchor.yml`) still uses `SOLANA_DEVNET_WALLET` and cannot be accidentally switched to mainnet.

### Deployment and authority transfer

- [ ] Tag the audited source commit.
- [ ] Deploy programs to mainnet from the upgrade-authority multisig.
- [ ] Immediately transfer upgrade authority of every program to the multisig.
- [ ] Initialize `cortex_treasury` from the treasury authority (not the deployer or CI wallet).
- [ ] Verify on-chain upgrade authorities and treasury ownership.

### Documentation and evidence

- [ ] Record all mainnet program IDs, buffer IDs, and authority public keys in a secure deployment ledger.
- [ ] Write a short mainnet deployment evidence note and link it from the release audit.
- [ ] Schedule a quarterly review of multisig members, GitHub secret rotation, and treasury withdrawal policies.

---

## 9. Security review checklist

Before signing off on this plan, confirm:

- [ ] No private key material is present in this document or in any public repository file.
- [ ] Program upgrade authority will be a multisig, not a hot wallet, before any user funds touch the programs.
- [ ] Treasury authority is separate from the deployer and CI wallets.
- [ ] Devnet and mainnet workflows are separated and cannot be triggered by untrusted branches.
- [ ] Emergency procedures are written down and known to all multisig members.
- [ ] A formal security audit and token legal review are tracked as blockers, not afterthoughts.

---

_This plan is a living document. Update it after every mainnet deployment, authority rotation, or incident._

_— Enigma Memory mainnet custody plan, v1.0 — 2026-06-28_
