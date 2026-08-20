# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Enigma Memory Desktop — Linux Tauri v2 build environment
#
# Reproducible Ubuntu image with all dependencies required to build
# the Tauri desktop app on Linux. Used by CI or local Docker builds
# when a Linux runner is preferred for the NSIS/AppImage target.
# ─────────────────────────────────────────────────────────────

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_VERSION=24 \
    CARGO_HOME=/usr/local/cargo \
    RUSTUP_HOME=/usr/local/rustup \
    PATH="/usr/local/cargo/bin:${PATH}"

# Tauri v2 Linux dependencies plus curl/git.
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    file \
    libwebkit2gtk-4.1-dev \
    libappindicator3-dev \
    librsvg2-dev \
    patchelf \
    pkg-config \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 24.
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Rust stable.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --no-modify-path --default-toolchain stable \
    && rm -rf ${CARGO_HOME}/registry/cache/*

# Install Tauri CLI globally.
RUN npm install -g @tauri-apps/cli \
    && npm cache clean --force

WORKDIR /workspace

# Default to showing tool versions.
CMD ["bash", "-c", "echo \"Enigma Memory desktop Linux build environment\" && rustc --version && node --version && cargo tauri --version"]
