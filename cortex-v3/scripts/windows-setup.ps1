#Requires -RunAsAdministrator
#Requires -Version 5.1

<#
.SYNOPSIS
    Enable WSL2 and install the Enigma Cortex v3 Linux toolchain on Ubuntu 22.04.

.DESCRIPTION
    - Checks for administrator rights.
    - Enables the Windows Subsystem for Linux and VirtualMachinePlatform features.
    - Sets WSL default version to 2.
    - Installs Ubuntu 22.04 if not present.
    - Runs a Linux bootstrap script inside WSL that installs Rust 1.75.0,
      Solana 1.18.26, Anchor 0.30.1, and Node 20.

.PARAMETER SkipWslInstall
    Skip enabling WSL2 features (useful if WSL2 is already configured).

.PARAMETER SkipUbuntuInstall
    Skip installing Ubuntu 22.04.

.EXAMPLE
    .\windows-setup.ps1

.EXAMPLE
    .\windows-setup.ps1 -SkipWslInstall
#>

param(
    [switch]$SkipWslInstall,
    [switch]$SkipUbuntuInstall
)

$ErrorActionPreference = "Stop"

function Test-AdminRights {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-AdminRights)) {
    throw @"
This script must run as Administrator.
Right-click PowerShell and choose 'Run as administrator', then retry.
"@
}

if (-not $SkipWslInstall) {
    $wslFeature = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux
    $vmFeature = Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform

    if ($wslFeature.State -ne "Enabled") {
        Write-Host "Enabling Microsoft-Windows-Subsystem-for-Linux..."
        Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart
    }
    else {
        Write-Host "WSL is already enabled."
    }

    if ($vmFeature.State -ne "Enabled") {
        Write-Host "Enabling VirtualMachinePlatform (required for WSL2)..."
        Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart
    }
    else {
        Write-Host "VirtualMachinePlatform is already enabled."
    }

    Write-Host "Setting WSL default version to 2..."
    wsl --set-default-version 2
}
else {
    Write-Host "Skipping WSL feature installation because -SkipWslInstall was passed."
}

if (-not $SkipUbuntuInstall) {
    $distros = wsl --list --quiet
    $ubuntuInstalled = $distros | Where-Object { $_ -like "*Ubuntu-22.04*" }

    if (-not $ubuntuInstalled) {
        Write-Host "Installing Ubuntu 22.04 from the Microsoft Store..."
        wsl --install -d Ubuntu-22.04 --no-launch
    }
    else {
        Write-Host "Ubuntu 22.04 is already installed."
    }
}
else {
    Write-Host "Skipping Ubuntu installation because -SkipUbuntuInstall was passed."
}

Write-Host "Preparing the Linux toolchain bootstrap script..."

$linuxBootstrap = @'
#!/bin/bash
set -euo pipefail

export RUST_VERSION="1.75.0"
export SOLANA_VERSION="1.18.26"
export ANCHOR_VERSION="0.30.1"

echo "==> Updating package index..."
sudo apt-get update

echo "==> Installing build dependencies..."
sudo apt-get install -y \
    build-essential \
    pkg-config \
    libssl-dev \
    libudev-dev \
    llvm \
    clang \
    libclang-dev \
    protobuf-compiler \
    libprotobuf-dev \
    curl

echo "==> Installing Rust ${RUST_VERSION}..."
if ! command -v rustup &>/dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain "${RUST_VERSION}"
fi
. "$HOME/.cargo/env"
rustup default "${RUST_VERSION}"
rustup component add rustfmt clippy

echo "==> Installing Solana ${SOLANA_VERSION}..."
sh -c "$(curl -sSfL https://release.solana.com/v${SOLANA_VERSION}/install)"

echo "==> Installing Anchor ${ANCHOR_VERSION}..."
cargo install --git https://github.com/coral-xyz/anchor --tag "v${ANCHOR_VERSION}" anchor-cli --locked

echo "==> Installing Node 20..."
if ! command -v node &>/dev/null || [[ "$(node --version)" != v20* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo ""
echo "==> Toolchain versions:"
solana --version
anchor --version
rustc --version
node --version

echo ""
echo "Linux toolchain installation complete."
'@

$tempFile = [System.IO.Path]::GetTempFileName()
Set-Content -Path $tempFile -Value $linuxBootstrap -Encoding UTF8

$wslTempPath = wsl wslpath -u "$tempFile"
$wslScriptPath = "/tmp/cortex-v3-setup.sh"

wsl cp "$wslTempPath" "$wslScriptPath"
wsl chmod +x "$wslScriptPath"

Write-Host "Running Linux toolchain install inside WSL..."
wsl bash "$wslScriptPath"

Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Setup complete."
Write-Host "Open a new PowerShell window and run 'wsl -d Ubuntu-22.04' to start developing."
Write-Host "From there, cd to the Enigma Cortex v3 directory and run:"
Write-Host "  cargo +1.75.0 check --workspace"
Write-Host "  npm test"
