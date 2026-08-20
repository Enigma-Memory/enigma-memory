# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Enigma Cortex v3 — Anchor/Solana build environment
#
# Reproducible Ubuntu image with:
#   - Rust 1.75.0
#   - Solana CLI 1.18.26
#   - Anchor CLI 0.30.1
#   - Node.js 24 + npm
#
# Use this on Windows 11 Home (or any host) where the native Anchor CLI
# is unavailable. Mount the repo and run `anchor build` inside the container.
# ─────────────────────────────────────────────────────────────

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    RUST_VERSION=1.75.0 \
    SOLANA_VERSION=1.18.26 \
    ANCHOR_VERSION=0.30.1 \
    NODE_VERSION=24 \
    CARGO_HOME=/usr/local/cargo \
    RUSTUP_HOME=/usr/local/rustup \
    SOLANA_HOME=/usr/local/solana \
    PATH="/usr/local/cargo/bin:/usr/local/solana/bin:${PATH}"

# Base build dependencies.
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
    curl \
    bzip2 \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 24 from NodeSource.
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Rust toolchain as root so it lands in /usr/local.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --no-modify-path --default-toolchain ${RUST_VERSION} \
    && rustup component add rustfmt clippy \
    && rm -rf ${CARGO_HOME}/registry/cache/*

# Install Solana CLI from the pinned GitHub release artifact. This avoids the
# release.solana.com install script, which intermittently fails from Docker on
# Windows with TLS EOF/SYSCALL errors.
RUN mkdir -p /usr/local/solana \
    && curl -fL --retry 5 --retry-all-errors \
      "https://github.com/solana-labs/solana/releases/download/v${SOLANA_VERSION}/solana-release-x86_64-unknown-linux-gnu.tar.bz2" \
      -o /tmp/solana-release.tar.bz2 \
    && tar -xjf /tmp/solana-release.tar.bz2 --strip-components=1 -C /usr/local/solana \
    && rm /tmp/solana-release.tar.bz2

# Install Anchor CLI.
RUN cargo install --git https://github.com/coral-xyz/anchor --tag v${ANCHOR_VERSION} anchor-cli --locked \
    && rm -rf ${CARGO_HOME}/registry/cache/*

WORKDIR /workspace

# Default to showing tool versions.
CMD ["bash", "-c", "echo \"Enigma Cortex v3 build environment\" && rustc --version && solana --version && anchor --version && node --version"]
