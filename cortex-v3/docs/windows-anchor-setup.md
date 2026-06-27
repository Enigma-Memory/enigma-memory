# Windows Anchor / Solana Setup for Enigma Cortex v3

This guide covers two supported ways to build Enigma Cortex v3 on Windows:

1. **WSL2 (recommended for local development)** — run the full Linux toolchain on Ubuntu 22.04.
2. **GitHub Codespaces (zero-install path)** — open the project in a browser-based dev container with Rust 1.75.0, Solana 1.18.26, Anchor 0.30.1, and Node 20 already installed.

Both paths end with the same toolchain versions and run the same validation commands.

---

## Path 1: WSL2 on Windows 10/11

### 1.1 Prerequisites

- Windows 10 version 2004+ (Build 19041+) or Windows 11.
- Administrator access to enable Windows features.
- ~10 GB free disk space for WSL, Ubuntu, Rust, Solana, and build artifacts.

### 1.2 Automated setup

Open **PowerShell as Administrator**, navigate to the `enigma/cortex-v3` folder, and run:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force
.\scripts\windows-setup.ps1
```

The script performs the following steps:

1. Enables the **Windows Subsystem for Linux** and **VirtualMachinePlatform** features.
2. Sets WSL default version to `2`.
3. Installs **Ubuntu 22.04** if it is not already present.
4. Runs a Linux bootstrap script inside WSL that installs:
   - Rust `1.75.0`
   - Solana CLI `1.18.26`
   - Anchor CLI `0.30.1`
   - Node.js `20`

If WSL2 and Ubuntu are already installed, you can skip those steps:

```powershell
.\scripts\windows-setup.ps1 -SkipWslInstall -SkipUbuntuInstall
```

### 1.3 Manual WSL2 steps (if you prefer not to use the script)

```powershell
# PowerShell as Administrator
wsl --install
wsl --set-default-version 2
wsl --install -d Ubuntu-22.04
```

Then open an Ubuntu shell and run the Linux install commands:

```bash
# Update system packages
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libssl-dev libudev-dev \
    llvm clang libclang-dev protobuf-compiler libprotobuf-dev curl

# Rust 1.75.0
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.75.0
. "$HOME/.cargo/env"
rustup component add rustfmt clippy

# Solana 1.18.26
sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"

# Anchor 0.30.1
cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 1.4 Verify the installation

Inside the Ubuntu shell:

```bash
solana --version      # solana-cli 1.18.26
anchor --version      # anchor-cli 0.30.1
rustc --version       # 1.75.0
node --version        # v20.x.x
```

### 1.5 Build the project

```bash
cd /mnt/c/path/to/enigma/cortex-v3
cargo +1.75.0 check --workspace
npm test
```

---

## Path 2: GitHub Codespaces

### 2.1 What is included

The repository contains a dev container definition at `.devcontainer/devcontainer.json`. The container image is built from `.devcontainer/Dockerfile` and includes:

| Tool    | Version |
| ------- | ------- |
| Rust    | 1.75.0  |
| Solana  | 1.18.26 |
| Anchor  | 0.30.1  |
| Node.js | 20      |

Forwarded ports:

- `3000` — Next.js webapp
- `8899` — Solana local validator RPC
- `8900`–`8902` — Solana validator extra ports

### 2.2 Open in Codespaces

1. Push the `enigma/cortex-v3` directory to a GitHub repository.
2. On the repository page, click **Code → Codespaces → Create codespace on main**.
3. Wait for the container build to finish (the `postCreateCommand` prints toolchain versions).

### 2.3 Verify inside Codespaces

Open the integrated terminal and run:

```bash
solana --version
anchor --version
rustc --version
node --version
```

### 2.4 Build the project

```bash
cd /workspaces/cortex-v3
cargo +1.75.0 check --workspace
npm test
```

---

## Next steps

After either path completes successfully:

1. Set your Solana cluster to devnet or localnet:
   ```bash
   solana config set --url devnet
   ```
2. Generate a dev keypair (do **not** use this keypair for mainnet funds):
   ```bash
   solana-keygen new --outfile ~/.config/solana/id.json --no-bip39-passphrase
   ```
3. Continue with the project-specific build and test commands documented in `README.md`.

---

## Troubleshooting

| Symptom                                  | Fix                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| "WSL2 requires an update"                | Install the WSL2 kernel update from Microsoft’s WSL docs.                      |
| `anchor` not found after install         | Ensure `~/.cargo/bin` and `~/.local/share/solana/install/...` are in `PATH`.   |
| Codespaces build hangs on Anchor install | Rebuild the container; Anchor compiles from source and takes time.             |
| Node version is not 20                   | Run `nvm install 20 && nvm use 20` or reinstall via NodeSource.                |
| PowerShell execution policy error        | Run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force`. |
