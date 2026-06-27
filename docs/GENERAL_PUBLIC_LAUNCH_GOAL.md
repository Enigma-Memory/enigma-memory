# General public launch goal

## Goal

Make Enigma Memory usable by a non-technical consumer as a signed desktop app: download, install, click **Set up Enigma Memory**, create a local Memory Drive, connect supported AI apps with consent, see health/fix-it status, and generate privacy-safe proof summaries without installing Node, running npm, opening a terminal, or editing MCP JSON.

The CLI remains the engine for developers, support, and automation. It is not the default public setup path.

## Consumer promise

A general user can complete first run in one guided flow:

1. Download a signed Windows or macOS desktop installer.
2. Open Enigma Memory.
3. Click **Create my Memory Drive**.
4. Let Enigma find supported AI apps.
5. Approve one-click connection for selected apps.
6. See **Memory Drive healthy** or one fix-it action per problem.
7. Use Enigma locally, including offline health/proof views.

## Hard requirements

Public launch is not ready until every requirement below is satisfied on clean supported Windows and macOS machines.

| Requirement | Acceptance |
| --- | --- |
| No developer prerequisite | Default install requires no Node, npm, Git, shell, source checkout, package registry account, database, cloud account, provider key, hosted Enigma account, or manual MCP JSON edit. |
| Signed desktop distribution | Windows artifact is signed through the chosen Store/MSIX/trusted-signing path. macOS artifact is Developer ID signed, notarized, and stapled where applicable. |
| Bundled runtime | Desktop app bundles the Enigma runtime/engine internally and exposes setup through typed app actions, not shell snippets. |
| One-button vault setup | First run creates or detects the local vault through a consumer wizard and never displays private expanded paths in public logs, docs, screenshots, telemetry, or evidence. |
| One-click connectors | Claude Desktop, Cursor, Kimi Code, VS Code/Cline, Roo, OpenCode, and Generic MCP have detect, preview, connect, disconnect, repair, rollback, and test flows where platform/client support allows it. |
| Explicit consent before writes | Detection and preview are read-only. Connector writes require a human-readable preview and user approval. |
| Safe rollback | App creates rollback snapshots before client config writes and preserves unrelated client settings and MCP servers. |
| Health dashboard | Dashboard shows vault, connector, update, proof, offline, and support status with one primary fix action per issue. |
| Privacy-safe diagnostics | Diagnostics are local-only by default, previewable before sharing, and reject raw memory, prompts, transcripts, credentials, tokens, account IDs, customer identifiers, provider responses, private keys, and local absolute paths. |
| Opt-in telemetry only | Crash/error reporting is off by default and requires explicit opt-in or one-time approval after preview. |
| Signed updates | Updates verify signed manifests and signed payloads, preserve vault data, reject wrong-channel updates, and fail without corrupting existing installs. |
| Uninstall preserves user data by default | Normal uninstall removes app binaries but keeps the local vault unless the user chooses a separate destructive removal path. |
| Public docs are consumer-first | Website, README, install help, and app help lead with signed desktop install. npm/Node/terminal/source/MCP JSON details move to developer appendix. |

## Claim boundary

Public launch copy, app UI, release notes, support docs, and evidence packets may claim only Enigma-controlled local facts:

- local vault creation and lifecycle state;
- local connector setup/repair status;
- local receipt/proof summaries;
- public-safe schema/version/evidence metadata;
- signed installer/update status;
- local health checks and support codes.

They must not claim:

- provider deletion;
- provider-native memory removal;
- model forgetting;
- hosted SaaS or BYOC readiness without separate live evidence;
- compliance certification;
- benchmark superiority;
- legal, regulatory, or patent conclusions;
- chain submission unless separate transaction evidence exists.

## Public beta definition of done

Public beta can start only when:

- a signed Windows candidate and signed/notarized macOS candidate install and launch on clean machines;
- first run completes without terminal, Node, npm, or JSON editing;
- local vault creation, app detection, at least one connector path, proof summary, offline launch, diagnostic bundle, update check, and uninstall are tested;
- every public beta blocker in `docs/public-launch/trust-signing-release.md` and `docs/public-launch/qa-support-observability.md` is closed or explicitly marked blocking;
- public docs no longer present npm/CLI as the default consumer path;
- a public-safe evidence packet is reviewed and contains no restricted fields.

## General availability definition of done

GA can ship only after public beta criteria remain green and:

- install, update, rollback, uninstall, reconnect, offline, and corrupted-config recovery pass across supported Windows/macOS versions and architectures;
- stable, beta, and internal update channels are separated;
- signing key/certificate custody, renewal, revocation, and emergency release ownership are documented in private runbooks;
- support has approved consumer troubleshooting for install warnings, connector setup, local vault recovery, update failures, diagnostic bundles, and privacy boundaries;
- consumer docs, app copy, release notes, and website copy pass claim-boundary review;
- final public-safe evidence packet is approved for sharing.

## Current state

Implemented today on the CLI/package branch:

- `enigma start` quickstart alias;
- `enigma doctor --bundle` first-run guidance;
- public-safe context proof output through `enigma context --proof`;
- memory-boundary schemas and proof primitives;
- trusted npm publishing path without a long-lived npm publish token.

Not yet built for public consumer launch:

- signed desktop app;
- bundled runtime and local service bridge;
- consumer wizard UI;
- one-click connector UI;
- Claude Desktop Extension / `.mcpb` package;
- Windows/macOS signing and notarization pipeline;
- signed desktop updater;
- opt-in crash/error reporting and diagnostic preview UI;
- consumer-first website/docs rewrite.

## Source plans

The full buildout is decomposed into these plan documents:

- `docs/GENERAL_PUBLIC_LAUNCH_WORKPLAN.md`
- `docs/public-launch/desktop-app-plan.md`
- `docs/public-launch/consumer-onboarding-ux.md`
- `docs/public-launch/one-click-connectors.md`
- `docs/public-launch/trust-signing-release.md`
- `docs/public-launch/qa-support-observability.md`
- `docs/public-launch/public-launch-docs.md`
