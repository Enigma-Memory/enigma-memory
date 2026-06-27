#!/usr/bin/env bash
set -euo pipefail

# deploy-devnet.sh — Build and deploy Cortex v3 programs to Solana devnet.
#
# Usage:
#   ./deploy/deploy-devnet.sh
#
# Environment:
#   SOLANA_CLI_VERSION   Solana CLI version to install if missing (default: 1.18.26)
#   ANCHOR_VERSION       Anchor CLI version to install if missing (default: 0.30.1)
#   SOLANA_CLUSTER       Solana cluster override (default: devnet)
#   SKIP_INSTALL         Set to "1" to skip installing/checking CLIs
#
# The wallet used for deployment is read from ~/.config/solana/id.json.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_DIR="${REPO_ROOT}/deploy"
IDL_DIR="${DEPLOY_DIR}/devnet-idls"

SOLANA_CLI_VERSION="${SOLANA_CLI_VERSION:-1.18.26}"
ANCHOR_VERSION="${ANCHOR_VERSION:-0.30.1}"
SOLANA_CLUSTER="${SOLANA_CLUSTER:-devnet}"
WALLET="${HOME}/.config/solana/id.json"

SOLANA_INSTALL_DIR="${HOME}/.local/share/solana"

log() {
    echo "[deploy-devnet] $*"
}

require_command() {
    if ! command -v "$1" &>/dev/null; then
        log "error: required command '$1' not found"
        return 1
    fi
}

install_solana_cli() {
    if command -v solana &>/dev/null; then
        log "Solana CLI already installed: $(solana --version)"
        return 0
    fi

    log "Installing Solana CLI v${SOLANA_CLI_VERSION}..."
    mkdir -p "${SOLANA_INSTALL_DIR}"
    local tmpdir
    tmpdir="$(mktemp -d)"
    trap 'rm -rf "${tmpdir}"' RETURN

    local tarball="solana-release-x86_64-unknown-linux-gnu.tar.bz2"
    local url="https://github.com/solana-labs/solana/releases/download/v${SOLANA_CLI_VERSION}/${tarball}"

    curl -fsSL -o "${tmpdir}/${tarball}" "${url}"
    tar -xjf "${tmpdir}/${tarball}" -C "${tmpdir}"
    mv "${tmpdir}/solana-release" "${SOLANA_INSTALL_DIR}/solana-${SOLANA_CLI_VERSION}"

    export PATH="${SOLANA_INSTALL_DIR}/solana-${SOLANA_CLI_VERSION}/bin:${PATH}"
    log "Solana CLI installed: $(solana --version)"
}

install_anchor_cli() {
    if command -v anchor &>/dev/null; then
        log "Anchor CLI already installed: $(anchor --version)"
        return 0
    fi

    log "Installing Anchor CLI v${ANCHOR_VERSION}..."
    npm install -g "@coral-xyz/anchor-cli@${ANCHOR_VERSION}"
    log "Anchor CLI installed: $(anchor --version)"
}

verify_wallet() {
    if [[ ! -f "${WALLET}" ]]; then
        log "error: wallet not found at ${WALLET}"
        return 1
    fi

    local pubkey
    pubkey="$(solana-keygen pubkey "${WALLET}")"
    log "Deployer wallet: ${pubkey}"

    solana config set --keypair "${WALLET}" --url "${SOLANA_CLUSTER}"
}

copy_idls() {
    local src="${REPO_ROOT}/target/idl"
    if [[ ! -d "${src}" ]]; then
        log "warning: IDL source directory not found: ${src}"
        return 0
    fi

    mkdir -p "${IDL_DIR}"
    rm -rf "${IDL_DIR:?}"/*

    local file
    for file in "${src}"/*.json; do
        if [[ -f "${file}" ]]; then
            cp "${file}" "${IDL_DIR}/"
            log "Copied IDL: $(basename "${file}")"
        fi
    done
}

print_program_ids() {
    log "Deployed program IDs:"
    local keypair
    for keypair in "${REPO_ROOT}/target/deploy"/*-keypair.json; do
        if [[ -f "${keypair}" ]]; then
            local name pubkey
            name="$(basename "${keypair}" -keypair.json)"
            pubkey="$(solana-keygen pubkey "${keypair}")"
            printf '  %-24s %s\n' "${name}:" "${pubkey}"
        fi
    done
}

main() {
    cd "${REPO_ROOT}"

    if [[ "${SKIP_INSTALL:-}" != "1" ]]; then
        install_solana_cli
        install_anchor_cli
    fi

    require_command solana
    require_command anchor

    verify_wallet

    log "Running anchor build..."
    anchor build

    log "Deploying to ${SOLANA_CLUSTER}..."
    anchor deploy --provider.cluster "${SOLANA_CLUSTER}"

    copy_idls
    print_program_ids

    log "Deployment complete. IDLs written to ${IDL_DIR}"
}

main "$@"
