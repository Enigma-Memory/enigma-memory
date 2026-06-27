# Cortex v3 Devnet Deployment Steps

This document describes how the Cortex v3 Anchor programs are built and deployed to Solana devnet.

## Files

- `deploy/deploy-devnet.sh` — local/CI deployment script
- `.github/workflows/deploy-devnet.yml` — GitHub Actions workflow (manual trigger)

## Prerequisites

- Solana CLI 1.18.26
- Anchor CLI 0.30.1
- Rust stable toolchain
- Node.js 20
- A funded devnet wallet at `~/.config/solana/id.json`

The GitHub repository already has the devnet wallet stored as the secret `SOLANA_DEVNET_WALLET`.

## Local Deployment

```bash
cd cortex-v3
./deploy/deploy-devnet.sh
```

The script performs the following steps:

1. **Install/check Solana CLI** — installs Solana 1.18.26 under `~/.local/share/solana` if it is not already on `PATH`.
2. **Install/check Anchor CLI** — installs `@coral-xyz/anchor-cli@0.30.1` globally if it is not already available.
3. **Verify the wallet** — confirms that `~/.config/solana/id.json` exists and prints the deployer public key.
4. **Anchor build** — compiles all programs in the workspace.
5. **Anchor deploy** — deploys each program to devnet (`anchor deploy --provider.cluster devnet`).
6. **Copy IDLs** — copies generated IDL JSON files from `target/idl/` to `deploy/devnet-idls/`.
7. **Print program IDs** — reads the public keys from `target/deploy/*-keypair.json` and prints the deployed program IDs.

## CI Deployment

1. Go to **Actions → Deploy Cortex v3 to Devnet** in the GitHub repository.
2. Click **Run workflow**.
3. Optionally override Solana CLI and Anchor CLI versions (defaults are 1.18.26 and 0.30.1).
4. The workflow runs `deploy/deploy-devnet.sh` with `SKIP_INSTALL=1` because the CLIs are already installed in earlier steps.

After the run finishes, the workflow uploads two artifacts:

- `devnet-idls` — the copied IDL files from `deploy/devnet-idls/`
- `devnet-deployment-keypairs` — the program keypairs from `target/deploy/`

## Programs Deployed

| Program               | Localnet ID (Anchor.toml)                     |
| --------------------- | --------------------------------------------- |
| `memory_registry`     | `4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM` |
| `budget_escrow`       | `8opHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh` |
| `capability_registry` | `CiDwVBFgWV9E5MvXWoLgnEgn2hK7rJikbvfWavzAQz3` |
| `royalty_router`      | `GcdayuLaLyrdmUu324nahyv33G5poQdLUEZ1nEytDeP` |
| `cortex_treasury`     | `LX3EUdRUBUa3TbsYXLEUdj9J3prXkWXvLYSWyYyc2Jj` |

After devnet deployment, Anchor.toml is updated with the devnet program IDs and should be committed.

## Security Notes

- Do not commit `devnet-wallet.json` or any private key file.
- Do not run this workflow against mainnet.
- The workflow is triggered only by `workflow_dispatch`; it does not deploy automatically on push.
