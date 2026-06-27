# Enigma Cortex v3 — Dev container toolchain image
# Pre-installs Rust 1.75.0, Solana 1.18.26, Anchor 0.30.1 on Node 20 base.

FROM mcr.microsoft.com/devcontainers/javascript-node:20

ENV RUST_VERSION=1.75.0 \
    SOLANA_VERSION=1.18.26 \
    ANCHOR_VERSION=0.30.1 \
    PATH="/home/node/.cargo/bin:/home/node/.local/share/solana/install/active_release/bin:${PATH}"

# System dependencies required by Solana/Anchor/Rust on Debian/Ubuntu.
RUN apt-get update && apt-get install -y \
    build-essential \
    pkg-config \
    libssl-dev \
    libudev-dev \
    llvm \
    clang \
    libclang-dev \
    protobuf-compiler \
    libprotobuf-dev \
    && rm -rf /var/lib/apt/lists/*

USER node
WORKDIR /home/node

# Install Rust with the pinned toolchain.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain ${RUST_VERSION} \
    && . "$HOME/.cargo/env" \
    && rustup component add rustfmt clippy

# Install Solana CLI.
RUN sh -c "$(curl -sSfL https://release.solana.com/v${SOLANA_VERSION}/install)"

# Install Anchor CLI.
RUN . "$HOME/.cargo/env" \
    && cargo install --git https://github.com/coral-xyz/anchor --tag v${ANCHOR_VERSION} anchor-cli --locked

WORKDIR /workspaces/cortex-v3
