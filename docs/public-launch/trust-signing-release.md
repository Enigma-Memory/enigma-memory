# Public trust, signing, and release plan

This plan turns Enigma Memory from an npm/CLI-first tool into a consumer-safe desktop release path without weakening the current claim boundary. The desktop app and the npm package are separate release channels with separate evidence, signing, approvals, and rollback paths.

## Claim boundary

Public release notes, evidence packets, installers, and in-app copy must not claim:

- provider deletion or provider-native memory removal;
- model forgetting;
- hosted SaaS or customer BYOC readiness;
- compliance certification;
- benchmark superiority;
- legal, patent, or regulatory conclusions.

Public artifacts must not include raw memory, prompts, transcripts, local absolute paths, credentials, tokens, private keys, account IDs, customer identifiers, or signing-secret material.

## Release channels

| Channel | Intended user | Artifact | Trust mechanism | Release owner | Boundary |
| --- | --- | --- | --- | --- | --- |
| Signed desktop app | General consumers | Windows installer/package and macOS app/package | OS signing, notarization where applicable, update signing, public-safe evidence packet | Desktop release owner | Installs and runs a local Enigma shell around the local engine. It does not prove provider deletion, model forgetting, hosted/BYOC readiness, or compliance. |
| npm package | Developers and power users | `enigma-memory` package | npm trusted publishing with GitHub Actions OIDC and registry provenance | Package release owner | Publishes the CLI engine. It is not the consumer default and does not substitute for signed desktop distribution. |
| Local evidence packet | Reviewers and support | Redacted checksums, manifests, logs, and release decisions | Human review plus optional detached signature once signing is added | Release engineering | Supports release review only. It is not registry provenance, OS notarization, compliance, or live deployment proof. |

## Desktop release deliverables

### Product deliverables

- A signed desktop shell, preferably Tauri, that bundles the required runtime internally so consumers do not install Node.
- One-button first run that creates an Enigma-controlled local vault automatically.
- Client detection for supported local AI clients without requiring terminal use or JSON editing.
- Fix-it actions for client connection, permissions, vault location, update state, and health issues.
- Health dashboard showing local vault status, connector status, update status, and bounded proof/evidence status.
- Progressive disclosure: default screens show essential setup and health; advanced CLI/proof/debug details stay behind explicit advanced links.
- CLI remains available as a power-user engine and support path, but consumer onboarding must not depend on it.

### Windows signing and packaging

Manual prerequisites that cannot be automated in this repository:

- Select a Microsoft signing identity: Microsoft Store Partner Center identity for Store/MSIX path, a trusted code-signing certificate for non-Store distribution, or both.
- Complete organization validation, certificate issuance, hardware-backed key or cloud-signing setup, and access control outside the repo.
- Decide whether the first public beta ships through Microsoft Store/MSIX, direct download with signed installer, or both.
- Define the legal publisher name exactly as it should appear in Windows trust prompts.

Implementation requirements:

- Produce a Windows artifact with a stable application identity, publisher identity, versioning scheme, icon, uninstall entry, and upgrade behavior.
- Sign every executable, installer, update helper, and packaged binary that Windows surfaces to users.
- If using MSIX, validate package identity, publisher subject, capabilities, file associations, protocol handlers, and update behavior before public beta.
- If using direct download, document expected SmartScreen behavior. New certificates may not have reputation at first launch; do not market the app as SmartScreen-warning-free until reputation is actually established.
- Keep signing keys out of repository secrets unless the chosen signing provider explicitly requires ephemeral CI access with least privilege, manual approval, and audit logs. Prefer hardware-backed or managed signing with no exportable private key.
- Release notes must say whether the Windows artifact is Store/MSIX, direct signed download, or both.

Windows public beta acceptance:

- A clean Windows 11 consumer machine can install, launch, update, and uninstall the app without Node, npm, terminal commands, or JSON editing.
- The displayed publisher name matches the approved Microsoft/certificate identity.
- SmartScreen behavior is recorded honestly in the evidence packet, including any warning shown during the beta.
- The app can create and open an Enigma-controlled local vault without writing raw memory or transcripts into public logs.
- The health dashboard reports installer, vault, connector, and update status without exposing local absolute paths in public evidence.

Windows GA acceptance:

- The selected distribution path has a documented support and rollback process.
- Signing identity access has at least two accountable administrators and no shared private-key export workflow.
- Update signing and rollback have completed a staged rehearsal on a non-production channel.
- Any recurring SmartScreen warning is either resolved through the selected distribution path or explicitly documented as a launch blocker.

### macOS signing, notarization, and stapling

Manual prerequisites that cannot be automated in this repository:

- Active Apple Developer Program membership for the releasing organization.
- Developer ID Application certificate for the app bundle.
- Developer ID Installer certificate if shipping a `.pkg`.
- App Store Connect API key or approved notarization credential managed outside public docs and repo artifacts.
- A macOS release machine or CI runner able to sign, notarize, staple, and verify artifacts.
- Approved legal publisher/team name for Gatekeeper prompts.

Implementation requirements:

- Sign the app bundle with hardened runtime enabled and only the entitlements actually required.
- Sign any helper binaries, native host components, update helpers, and embedded runtime files.
- Notarize every distributed `.dmg`, `.zip`, or `.pkg` artifact as appropriate for the selected packaging path.
- Staple notarization tickets to distributed artifacts when the format supports stapling.
- Verify Gatekeeper behavior on a clean macOS account before public beta.
- Document any required permissions using consumer language and show them only at the moment they are needed.

macOS public beta acceptance:

- A clean supported macOS machine can download, open, install, launch, update, and uninstall without Node, npm, terminal commands, or JSON editing.
- Gatekeeper shows the approved developer identity and does not require consumers to bypass security controls.
- Notarization status and stapling status are recorded in the evidence packet without exposing Apple account IDs, local paths, credentials, or private team metadata beyond the public developer identity.
- The app creates the local vault and reports health using public-safe logs.

macOS GA acceptance:

- Notarization, stapling, installation, update, rollback, and uninstall have each passed on the supported macOS versions.
- Certificate expiration dates, renewal owner, and emergency revocation process are recorded in the private release runbook.
- Entitlements have been reviewed and unnecessary permissions removed.

## Update signing and update safety

Update delivery is a separate trust surface from initial installation.

Requirements:

- Use a signed update manifest and signed update payloads. The app must reject unsigned updates, wrong-channel updates, downgrade attempts unless explicitly approved for rollback, and updates signed by unknown keys.
- Separate stable, beta, and internal update channels. A beta client must not silently move to stable or internal channels.
- Pin the update public key or trusted signing identity in the app build. Store private update signing material outside the repo.
- Show consumers plain-language update state: current version, available version, last check time, and whether update verification passed.
- Keep rollback packages signed and bounded to documented emergency use.
- Public evidence may include manifest hashes, artifact hashes, version numbers, signature verification result, and signer identity. It must not include signing private keys, tokens, local paths, account IDs, user vault paths, raw memory, prompts, transcripts, or customer identifiers.

Public beta blockers:

- Auto-update path is unsigned, unverifiable, or silently downgrades.
- Update failure leaves the local vault inaccessible or corrupt without a recovery path.
- Beta and stable channels are not separated.

GA blockers:

- No rehearsed emergency update revocation/rollback process.
- No documented owner for signing-key rotation and certificate renewal.
- Update telemetry or logs expose private user data in support packets.

## Release provenance

Desktop provenance and npm provenance must not be conflated.

Desktop release provenance should record:

- artifact names, versions, platforms, architectures, file sizes, and SHA-256 hashes;
- signing identity display names and certificate/notarization status safe for public release;
- update manifest version and public verification result;
- source revision or release tag reference when available;
- packaging tool version and build environment class, without local absolute paths;
- public-safe installer and first-run observations;
- known limitations and unresolved blockers.

Desktop provenance does not prove npm publication, provider deletion, model forgetting, hosted/BYOC readiness, legal approval, compliance certification, benchmark superiority, or absence of all vulnerabilities.

Npm release provenance should remain the npm trusted-publishing path:

- publish through the manual GitHub Actions trusted publisher configured for the public repository;
- use GitHub Actions OIDC and npm provenance;
- require the `npm-publish` environment approval before publication;
- require no `NPM_TOKEN`, `NODE_AUTH_TOKEN`, npm automation token, or other long-lived npm publish token in repository, organization, or environment secrets;
- keep Cloudflare, website, provider, KMS, SIEM, hosted deployment, Apple, and Microsoft signing credentials out of the npm publishing workflow.

## Public-safe evidence packets

Each public beta and GA candidate must produce a public-safe evidence packet for human review before announcement.

Required packet sections:

- release summary: version, channel, date, release owner, artifact list;
- claim boundary: explicit list of what the release does and does not prove;
- desktop artifacts: Windows and macOS artifact hashes, signing/notarization status, update manifest hash, and packaging path;
- npm artifacts: package version, trusted-publishing status, registry provenance status, and package boundary;
- first-run evidence: consumer setup path results written without local paths or user data;
- privacy review: confirmation that logs and screenshots exclude raw memory, prompts, transcripts, credentials, account IDs, customer identifiers, and private paths;
- support readiness: known issues, rollback path, support owner, escalation path, and public FAQ links;
- release decision: ship, hold, or rollback with named blockers.

The packet may include screenshots only if they show synthetic data and no private file paths, account names, memory content, credentials, or customer identifiers.

## Release blockers

### Public beta blockers

- No signed Windows artifact for the selected Windows distribution path.
- No signed and notarized macOS artifact for the selected macOS distribution path.
- Desktop first run requires Node, npm, terminal commands, or manual JSON editing.
- No automatic local vault creation or recovery-safe vault initialization.
- No client detection or guided fix-it path for the supported consumer MCP clients.
- No health dashboard for vault, connector, signing/update, and local evidence state.
- Update mechanism is unsigned, unverified, channel-confused, or able to apply unexpected downgrades.
- Public evidence packet contains raw memory, prompts, transcripts, credentials, tokens, private keys, local absolute paths, account IDs, customer identifiers, or signing secrets.
- Public copy claims provider deletion, model forgetting, hosted SaaS/BYOC readiness, compliance certification, benchmark superiority, or legal/patent conclusions.
- npm release path uses or requires a long-lived npm publish token.
- Manual prerequisites are incomplete: Apple Developer account/certificates, Microsoft signing identity, release owner, support owner, and signing-key custody owner.

### General availability blockers

- Public beta blockers remain open.
- No observed install, update, rollback, and uninstall path on clean supported Windows and macOS machines.
- No documented key/certificate renewal, revocation, and rotation ownership.
- No support process for corrupted local vault state, failed client connection, failed update, or signing/notarization warnings.
- No channel policy separating internal, beta, and stable releases.
- No redacted public-safe evidence packet approved for the GA candidate.
- No incident process for pulling a release, deprecating an npm version, or revoking an update manifest.
- Public documentation still leads consumers to npm/CLI as the default path instead of signed desktop install.

## Public beta acceptance criteria

A release candidate is public-beta ready when all of the following are true:

- Consumers install the signed desktop app on supported Windows and macOS systems without installing Node or editing JSON.
- First run creates a local vault, detects supported clients, offers one-button setup, and shows fix-it actions for recoverable issues.
- The health dashboard clearly distinguishes local vault health, connector status, update status, and bounded evidence status.
- Windows signing/MSIX or Store status is documented, including any SmartScreen warning observed.
- macOS Developer ID signing, notarization, and stapling status are documented.
- Update verification rejects unsigned or wrong-channel updates in the release rehearsal.
- npm package release, if included, uses trusted publishing with OIDC and no long-lived npm publish token.
- Public-safe evidence packet is reviewed and contains no restricted content.
- Release notes preserve the claim boundary and separate desktop, npm, and evidence claims.

## General availability acceptance criteria

A release candidate is GA-ready when all public beta criteria remain true and:

- Install, first-run, update, rollback, and uninstall have been rehearsed on each supported OS version and architecture.
- Signing identities, certificate expiration, key custody, revocation, renewal, and emergency contacts are owned and documented in the private release runbook.
- Stable update channel is separated from beta/internal channels and has a documented staged rollout policy.
- Support has approved consumer-facing troubleshooting for install warnings, connector setup, local vault recovery, and update failures.
- Public docs make signed desktop install the default consumer path while preserving CLI/npm as the power-user path.
- The final evidence packet is approved for public sharing and contains only bounded, public-safe claims.

## Release rehearsal and test plan

Release rehearsal must use synthetic data only and must produce redacted notes suitable for the public-safe evidence packet.

Required beta rehearsal coverage:

- Windows install path for the selected distribution route: Store/MSIX, direct signed installer, or both.
- macOS install path for the selected artifact type: signed/notarized app bundle, `.dmg`, `.zip`, or `.pkg`.
- First-run local vault creation with no Node install, terminal command, or JSON editing.
- Client detection and guided fix-it path for each supported consumer client. For Claude Desktop, prefer the lowest-friction supported connector path, including Claude Desktop Extensions or `.mcpb` packaging when available, before falling back to manual MCP configuration.
- Health dashboard review for local vault status, connector status, update status, and bounded evidence status.
- Update rehearsal from an older beta build to a newer beta build, including signature verification, channel check, and failed-update recovery.
- Rollback rehearsal using an approved signed rollback package or manifest.
- Uninstall rehearsal that leaves user-controlled vault data only when explicitly documented and consented.
- Public evidence review confirming no raw memory, prompts, transcripts, credentials, tokens, private keys, account IDs, customer identifiers, or local absolute paths appear in logs, screenshots, manifests, or release notes.

Required GA rehearsal coverage:

- Repeat beta coverage on every supported OS version and architecture.
- Verify stable-channel update behavior separately from beta and internal channels.
- Verify certificate/key renewal calendar, revocation procedure, emergency signer access, and signing audit log ownership.
- Verify support can reproduce and resolve install warning, connector setup failure, vault recovery, update failure, and uninstall issues using public-safe artifacts.
- Verify npm package publication, if included in the release train, remains a separate trusted-publishing flow and does not require or store a long-lived npm publish token.

## Dependencies and owners

| Dependency | Owner | Needed for | Repo-automatable? |
| --- | --- | --- | --- |
| Apple Developer Program membership | Company administrator | macOS signing and notarization | No |
| Developer ID Application certificate | macOS release owner | macOS app signing | No |
| Developer ID Installer certificate | macOS release owner | macOS `.pkg` signing if used | No |
| Microsoft Store/Partner Center identity or code-signing certificate | Windows release owner | Windows signing and distribution | No |
| Signing key custody policy | Security/release owner | Desktop and update signing | Partially; custody approval is manual |
| Update signing keypair or managed signing service | Desktop release owner | Safe auto-update | Partially; private key management is manual |
| npm trusted publisher configuration | Package release owner | CLI package release | No, configured in npm/GitHub UI |
| GitHub `npm-publish` environment reviewers | Package release owner | Manual npm approval | No, configured in GitHub UI |
| Public-safe evidence packet template | Release engineering | Beta and GA review | Yes |
| Consumer support runbook | Support owner | Public beta and GA | Partially |

## Launch sequence

1. Freeze the claim boundary and public-safe evidence rules.
2. Choose Windows distribution path: Store/MSIX, direct signed download, or both.
3. Complete Microsoft signing identity prerequisites.
4. Complete Apple Developer ID prerequisites.
5. Implement desktop packaging around the local Enigma engine with bundled runtime.
6. Implement update signing, channel separation, rollback policy, and health dashboard status.
7. Rehearse clean-machine install, first run, client setup, update, rollback, and uninstall.
8. Generate and review the public-safe evidence packet.
9. Publish npm package only through trusted publishing if the CLI package is part of the release train.
10. Ship public beta only after beta blockers are closed.
11. Promote to GA only after GA acceptance criteria are met and the GA evidence packet is approved.
