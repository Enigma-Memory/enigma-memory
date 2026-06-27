# Enigma Cortex v3 — Mainnet Setup Guide

This guide describes how to create and secure a Solana mainnet wallet, store it as the `SOLANA_MAINNET_WALLET` GitHub secret, and switch the deployment cluster to `mainnet-beta`.

> ⚠️ **Safety warning**
> - Do **not** generate mainnet keys on shared or CI machines unless absolutely necessary.
> - For production, prefer a hardware wallet (Ledger) or a multisig (Squads).
> - Never commit a keypair file. Never print the secret array in logs.
> - This guide does **not** spend real funds or require a funded mainnet wallet to read.

---

## 1. Create a mainnet wallet

### Option A — Solana CLI keypair (dev/exercise only)

```bash
solana-keygen new --outfile ~/.config/solana/mainnet-wallet.json --no-passphrase
# or with a BIP39 passphrase:
solana-keygen new --outfile ~/.config/solana/mainnet-wallet.json
```

Record the public key:

```bash
solana-keygen pubkey ~/.config/solana/mainnet-wallet.json
```

Back up the file offline (e.g., encrypted USB or password manager) and set restrictive permissions:

```bash
chmod 600 ~/.config/solana/mainnet-wallet.json
```

### Option B — Hardware wallet (recommended for production)

Use a Ledger Nano S/X with the Solana app. In Anchor workflows you can reference the device instead of a file:

```bash
solana config set --keypair usb://ledger
```

For CI/CD automation that must sign transactions, use a dedicated hot wallet stored only as a GitHub secret and never on developer laptops.

---

## 2. Configure `SOLANA_MAINNET_WALLET` GitHub secret

The CI workflow expects the wallet as a JSON-serialized byte array in the `SOLANA_MAINNET_WALLET` repository secret.

### 2.1 Read the keypair file

```bash
cat ~/.config/solana/mainnet-wallet.json
```

The content looks like:

```json
[123,45,67,...,89]
```

### 2.2 Set the secret via the GitHub web UI

1. Go to **Settings → Secrets and variables → Actions** in the repository.
2. Click **New repository secret**.
3. Name: `SOLANA_MAINNET_WALLET`
4. Value: paste the entire JSON array from step 2.1.
5. Click **Add secret**.

### 2.3 Set the secret via the `gh` CLI

```bash
gh secret set SOLANA_MAINNET_WALLET --body "$(cat ~/.config/solana/mainnet-wallet.json)" --repo Enigma-Memory/enigma-memory
```

Replace `Enigma-Memory/enigma-memory` with the actual owner/repo.

### 2.4 Using `deploy/github-secret.py`

The helper script in this directory can upload a wallet file to GitHub. For mainnet, adapt the configuration at the top of the file:

```python
SECRET_NAME = "SOLANA_MAINNET_WALLET"
WALLET_FILE = os.path.join(os.path.dirname(__file__), "mainnet-wallet.json")
```

Then run:

```bash
export GITHUB_PAT=<your-pat-with-repo-secrets-scope>
python deploy/github-secret.py
```

---

## 3. Switch cluster to `mainnet-beta`

### 3.1 Local Solana CLI

```bash
solana config set --url mainnet-beta
solana config set --keypair ~/.config/solana/mainnet-wallet.json
solana config get
```

### 3.2 Anchor.toml

Change the provider cluster from `Localnet`:

```toml
[provider]
cluster = "mainnet-beta"
wallet = "~/.config/solana/mainnet-wallet.json"
```

Add or update `[programs.mainnet-beta]` with the deployed program IDs after you deploy:

```toml
[programs.mainnet-beta]
memory_registry = "<DEPLOYED_MEMORY_REGISTRY_ID>"
budget_escrow = "<DEPLOYED_BUDGET_ESCROW_ID>"
capability_registry = "<DEPLOYED_CAPABILITY_REGISTRY_ID>"
royalty_router = "<DEPLOYED_ROYALTY_ROUTER_ID>"
cortex_treasury = "<DEPLOYED_CORTEX_TREASURY_ID>"
```

### 3.3 CI workflow

Update `.github/workflows/cortex-v3-anchor.yml` to use the mainnet secret and cluster where appropriate:

```yaml
      - name: Configure Solana
        run: |
          mkdir -p ~/.config/solana
          echo '${{ secrets.SOLANA_MAINNET_WALLET }}' > ~/.config/solana/id.json
          solana config set --url mainnet-beta
          solana config get
          echo "Public key: $(solana address)"
```

> Keep a separate workflow or job for devnet; do not run mainnet deploys on every push.

---

## 4. Deploy to mainnet-beta

After the programs have passed `cargo check`, `anchor build`, and a formal security audit:

```bash
anchor build
anchor deploy --provider.cluster mainnet-beta
```

Then verify:

```bash
solana program show <PROGRAM_ID> --url mainnet-beta
```

---

## 5. Funding

Send only enough SOL to the deployer wallet to cover deployment and a small operational buffer. Use a trusted exchange or custody provider. Do **not** request airdrops on mainnet.

---

## 6. Checklist before mainnet

- [ ] Formal security audit completed and findings remediated.
- [ ] Token legal review completed.
- [ ] Mainnet wallet created on a secure machine.
- [ ] `SOLANA_MAINNET_WALLET` secret configured in GitHub.
- [ ] Anchor.toml and CI workflow point to `mainnet-beta`.
- [ ] Mainnet program IDs populated in `Anchor.toml`.
- [ ] Deployer wallet funded with real SOL.
- [ ] Production custody upgraded to Ledger/multisig where feasible.

---

*Mainnet setup guide — v3 — 2026-06-27*
