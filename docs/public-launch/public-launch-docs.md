# Public-launch documentation plan

This plan defines the documentation and information architecture required to make Enigma Memory understandable and usable by general consumers. The default path must feel like installing Dropbox: download a signed desktop app, click setup once, get a local vault, connect supported AI clients automatically, and see health/fix-it guidance without using a terminal, installing Node, or editing JSON.

## Claim and privacy boundary

Public launch copy must stay inside Enigma's evidence boundary:

- Enigma controls the local vault, local retrieval/context packaging, Enigma-generated receipts, public-safe proof artifacts, local diagnostics, and local client connection helpers.
- Enigma does not claim provider deletion, model-weight forgetting, provider-native memory removal, hosted SaaS/BYOC readiness, compliance certification, benchmark superiority, chain submission, legal effect, or patent conclusions unless separate approved evidence exists.
- Public docs, screenshots, examples, proof snippets, and support templates must not expose raw memory, prompts, transcripts, completions, embeddings, local absolute paths, credentials, tokens, private keys, account IDs, tenant names, customer identifiers, provider response bodies, or realistic private policies.

## Audience split

| Audience | Default entry | What they should see first | What must be hidden until advanced |
| --- | --- | --- | --- |
| General consumer | Public website and desktop app | Download, install, one-button setup, connected apps, vault health, privacy basics | npm, Node, shell commands, JSON config, source checkout, MCP stdio details |
| Curious consumer | Help center and FAQ | Plain-language explanations, screenshots, fix-it actions, proof/privacy boundaries | Raw proof schemas, CLI flags, package manager instructions |
| Developer/power user | Developer CLI appendix | CLI install, MCP server details, source checkout, exported artifacts | Consumer marketing walkthroughs |
| Release/support operator | Internal launch checklist, not public default | Claim-safe copy checks, screenshot redaction, support macros | Private support data, customer examples |

## Information architecture

### Public website pages

Create or update these public pages in this order:

1. `/` — consumer landing page.
2. `/download` — signed desktop app download and platform requirements.
3. `/setup` — visual first-run setup guide.
4. `/help` — app help hub.
5. `/help/install` — install guide.
6. `/help/connect-apps` — AI client connection guide.
7. `/help/troubleshooting` — fix-it troubleshooting guide.
8. `/privacy` — privacy explainer.
9. `/proofs` — proof explainer.
10. `/faq` — consumer FAQ.
11. `/developers/cli` — developer CLI appendix.
12. `/developers/source` — advanced source-build appendix.
13. `/release-notes` — consumer-safe release notes.

Default navigation must show: `Download`, `How it works`, `Privacy`, `Help`, `FAQ`. `Developers` belongs in the footer or a secondary nav group, not the hero or primary onboarding path.

### Repository docs to update

Update these repo docs after the desktop flow exists:

- `README.md` — replace the first-run npm block with desktop-first copy; move npm/Node/CLI setup into an explicit Developer CLI section.
- `docs/install-anywhere.md` — make desktop install the default section; demote npm/source installers to advanced.
- `docs/installers-and-desktop.md` — convert from current-state engineering boundary into a release-readiness page that lists signed desktop distribution requirements and current blockers.
- `docs/client-connectors.md` — add consumer connection states and app-driven fix-it actions before manual MCP snippets.
- `docs/proof-network-faq.md` — add consumer proof boundaries and avoid chain/submission implications.
- `docs/proof-network-claim-boundaries.md` — keep as the source of truth for public copy review.
- `SECURITY.md` — add consumer reporting language for leaked proof snippets, screenshots, and app logs.

### Desktop app surfaces

The desktop app must contain help content in-product so users do not need docs before setup:

- Welcome screen.
- Setup wizard.
- Client connection screen.
- Health dashboard.
- Fix-it drawer.
- Proof activity screen.
- Privacy settings screen.
- Help menu.
- About/release screen.

All app copy must use progressive disclosure: one primary action per screen, short explanation first, advanced details behind `Learn more`, `Advanced`, or `Show technical details`.

## First-screen copy hierarchy

### `/` consumer landing page

1. Eyebrow: `Local-first memory for the AI apps you already use`
2. H1: `Your AI memory, kept in your own local vault.`
3. Subhead: `Install Enigma Memory once, connect supported assistants, and choose what context they can use without managing Node, terminals, or JSON files.`
4. Primary CTA: `Download Enigma Memory`
5. Secondary CTA: `See how privacy works`
6. Trust note: `Enigma creates and verifies Enigma-controlled local receipts. It does not claim that AI providers delete their own logs, backups, or model memories.`
7. Three cards:
   - `One local vault` — `Keep AI context in an Enigma-controlled local vault on your device.`
   - `Connect your assistants` — `Detect supported clients and apply reviewed MCP settings with one click.`
   - `Health and proof` — `See what is connected, what needs attention, and which local proof artifacts are safe to share.`

### `/download`

1. Eyebrow: `Download`
2. H1: `Install the desktop app. No terminal required.`
3. Subhead: `Choose your platform, open the signed installer, and Enigma will create a local vault during first run.`
4. Primary CTA: `Download for this device`
5. Secondary links: `macOS`, `Windows`, `Linux`, `Developer CLI`
6. Signing note:
   - Windows: `Use a signed Windows installer or Store/MSIX package before public launch to reduce SmartScreen friction.`
   - macOS: `Use Developer ID signing, notarization, and stapling before public launch so Gatekeeper recognizes the app.`
7. Boundary note: `The desktop app bundles its runtime. Consumers should not install Node or npm.`

### `/setup`

1. Eyebrow: `First run`
2. H1: `Set up your Memory Drive in one guided flow.`
3. Subhead: `Enigma creates a local vault, checks supported AI clients, and shows any fix-it steps before you start using memory.`
4. Primary CTA: `Open setup guide`
5. Step cards:
   - `1. Create local vault`
   - `2. Connect supported apps`
   - `3. Review health`
   - `4. Start using memory`
6. Advanced disclosure: `Need command-line setup? Use the Developer CLI appendix.`

### `/help/install`

1. Eyebrow: `Install guide`
2. H1: `Install Enigma Memory like a desktop app.`
3. Subhead: `Download, open, and approve the signed installer. Enigma handles the local runtime and vault setup.`
4. Primary section: platform-specific desktop steps with screenshots.
5. Secondary section: `If your system blocks the installer` with SmartScreen/Gatekeeper-safe guidance.
6. Advanced section: collapsed `Install from npm or source` linking to `/developers/cli` and `/developers/source`.

### `/help/connect-apps`

1. Eyebrow: `Connect apps`
2. H1: `Connect Enigma to supported AI clients without editing JSON.`
3. Subhead: `The desktop app detects installed clients, previews the setting it will change, and applies the Enigma connection only after you approve it.`
4. Primary CTA: `Open Connections in Enigma`
5. Client cards: Claude Desktop, Cursor, Kimi Code, VS Code/Cline, Roo, OpenCode, Generic MCP.
6. Claude Desktop note: `When available, a Claude Desktop Extension (.mcpb) should be offered as the easiest Claude path before manual MCP configuration.`
7. Advanced disclosure: `Manual MCP configuration is for developers and troubleshooting only.`

### `/help/troubleshooting`

1. Eyebrow: `Troubleshooting`
2. H1: `Fix common setup issues from the health dashboard.`
3. Subhead: `Enigma explains what is wrong, what it can fix automatically, and what you need to approve.`
4. Primary categories:
   - `Installer blocked`
   - `Vault needs setup`
   - `Client not detected`
   - `Client config needs review`
   - `App cannot reach Enigma`
   - `Proof export rejected as unsafe`
5. Each article format: symptom, likely cause, one-click fix if available, manual fallback, claim boundary, what to send support.
6. Support redaction warning: `Do not send raw memory, prompts, transcripts, credentials, account IDs, or local paths in support tickets.`

### `/privacy`

1. Eyebrow: `Privacy`
2. H1: `Your memory starts local.`
3. Subhead: `Enigma keeps its canonical vault on your device and only shares context with an AI client when you choose to connect and use it.`
4. Primary CTA: `Open privacy settings`
5. Sections:
   - `What stays local`
   - `What connected AI clients may receive`
   - `What proof artifacts can safely show`
   - `What Enigma cannot promise about third-party providers`
6. Boundary callout: `Removing memory from Enigma-controlled context is not the same as proving a provider deleted logs, backups, caches, or model state.`

### `/proofs`

1. Eyebrow: `Proofs`
2. H1: `Proof without publishing your memory.`
3. Subhead: `Enigma proof artifacts can show hashes, roots, counts, timestamps, signatures, opaque references, and validation results without exposing raw memory text.`
4. Primary CTA: `View proof activity`
5. Sections:
   - `What a proof can show`
   - `What a proof must never contain`
   - `How Enigma rejects unsafe public artifacts`
   - `Why a local proof is not provider deletion or model forgetting`
   - `Solana-ready means prepared for review, not submitted on-chain unless separate transaction evidence exists`
6. Example style: use synthetic opaque refs only, such as `ref_abc123`, never customer names or real memory.

### `/faq`

1. Eyebrow: `FAQ`
2. H1: `Questions people ask before installing Enigma Memory.`
3. Subhead: `Short answers for privacy, setup, AI app connections, proofs, and developer options.`
4. First questions:
   - `Do I need Node or npm?` — `No for the consumer desktop app. Node/npm belong to the Developer CLI appendix.`
   - `Does Enigma delete memory from AI providers?` — `No. Enigma controls its local vault and context selection; provider deletion requires provider evidence.`
   - `Can I use it without the command line?` — `Yes, that is the default public-launch path.`
   - `Where is my vault?` — `In an Enigma-controlled local app location shown inside the desktop app; public docs should not print local absolute paths.`
   - `What can I safely share with support?` — `Health status, app version, sanitized error codes, and public-safe proof refs only.`

### `/developers/cli`

1. Eyebrow: `Developers`
2. H1: `CLI and MCP setup for power users.`
3. Subhead: `Use npm, Node, terminal commands, and manual MCP snippets only when you want the developer engine instead of the desktop-first consumer app.`
4. Required warning: `This is not the default consumer setup path.`
5. Sections:
   - `Install with npm`
   - `Run setup`
   - `Run doctor`
   - `Connect MCP clients manually`
   - `Export and verify proof artifacts`
   - `Source checkout path`
6. Keep all terminal blocks, Node requirements, JSON snippets, bundle flags, MCP stdio commands, source checkout instructions, and package-manager details here or in `/developers/source`.


### `README.md` first screen

1. H1: `Enigma Memory`
2. One-line value prop: `A local-first Memory Drive for the AI apps you already use.`
3. Consumer lead: `For most people, start with the signed Enigma Memory desktop app. It creates your local vault, connects supported assistants, and shows health/fix-it guidance without requiring Node, npm, terminal commands, or JSON editing.`
4. Primary CTA link: `Download the desktop app`
5. Secondary CTA link: `Read privacy and proof boundaries`
6. Boundary note: `Enigma proves Enigma-controlled local vault and receipt events. It does not prove provider deletion, provider-native memory removal, model forgetting, hosted SaaS readiness, compliance certification, or benchmark superiority.`
7. Developer escape hatch: `Developers and power users can use the CLI appendix for npm, MCP stdio, source checkout, and manual JSON examples.`

The README top third must not show an install command. The first command block may appear only after a `Developer CLI` heading and a sentence that says it is not the default consumer setup.

### Desktop welcome first screen

1. Eyebrow: `Welcome to Enigma Memory`
2. H1: `Set up your private AI memory vault.`
3. Subhead: `Enigma keeps its canonical memory vault on this device, helps connect supported AI clients, and shows what needs attention before you use it.`
4. Primary CTA: `Create local vault`
5. Secondary CTA: `Learn how privacy works`
6. Trust note: `You stay in control of Enigma's local vault. Connected AI apps may still have their own logs, settings, and retention policies.`
7. Footer link: `Advanced: use the CLI instead`

### Desktop setup wizard screens

| Screen | First-screen copy | Primary action | Secondary action | Success state |
| --- | --- | --- | --- | --- |
| Vault | `Create a local vault for Enigma-controlled memory.` | `Create vault` | `Choose storage location` | `Local vault ready` |
| Connections | `Connect Enigma to the AI clients installed on this device.` | `Review connections` | `Skip for now` | `Connection preview ready` |
| Approvals | `Approve the settings Enigma will change.` | `Apply selected connections` | `Back` | `Selected apps connected` |
| Health | `Check that your vault and app connections are ready.` | `Fix issues` or `Finish setup` | `Show details` | `Ready to use` |
| Privacy | `Understand what Enigma controls before you share context.` | `Open privacy settings` | `Finish` | `Privacy settings saved` |

### Health dashboard first screen

1. Eyebrow: `Health`
2. H1: `Your Memory Drive status`
3. Subhead: `See whether your local vault, connected apps, and proof checks are ready.`
4. Primary action when healthy: `Open Enigma`
5. Primary action when unhealthy: `Fix highest-priority issue`
6. Status groups:
   - `Vault`
   - `Connected apps`
   - `Proof safety`
   - `Updates`
   - `Diagnostics`
7. Technical details stay collapsed behind `Show details`.

### Help hub first screen

1. Eyebrow: `Help`
2. H1: `What do you want to fix or learn?`
3. Subhead: `Start with common setup and privacy questions. Developer commands are in the advanced appendix.`
4. Primary cards:
   - `Install Enigma`
   - `Connect an AI app`
   - `Fix a health warning`
   - `Understand privacy`
   - `Understand proofs`
   - `Use the CLI`

### Exact help article inventory

Create these help articles before public launch:

| Route | Title | Default-path requirement | Advanced placement |
| --- | --- | --- | --- |
| `/help/install/windows` | `Install on Windows` | Signed installer or Store/MSIX first; no npm path above the fold | Link to CLI appendix at bottom |
| `/help/install/macos` | `Install on macOS` | Developer ID/notarized/stapled installer first | Link to CLI appendix at bottom |
| `/help/install/linux` | `Install on Linux` | Desktop package/app image path first when available | Package-manager and source notes in advanced |
| `/help/connect-apps/claude-desktop` | `Connect Claude Desktop` | Desktop detection and `.mcpb` option before manual settings | Manual JSON only in advanced |
| `/help/connect-apps/cursor` | `Connect Cursor` | App detection, preview, apply, restart guidance | Manual JSON only in advanced |
| `/help/connect-apps/kimi-code` | `Connect Kimi Code` | App detection, preview, apply, restart guidance | Manual JSON only in advanced |
| `/help/connect-apps/generic-mcp` | `Connect a generic MCP client` | Explain this is advanced if no app-specific connector exists | Manual JSON allowed here only |
| `/help/troubleshooting/installer-blocked` | `Installer blocked by the operating system` | Signing-safe user guidance, no bypass-first framing | Signing technical details collapsed |
| `/help/troubleshooting/vault-not-ready` | `Vault not ready` | Use in-app repair first | CLI repair only in advanced |
| `/help/troubleshooting/client-not-detected` | `AI app not detected` | Install/open supported client, refresh detection | Manual config only in advanced |
| `/help/troubleshooting/proof-export-rejected` | `Proof export rejected as unsafe` | Explain private-field rejection | Schema details collapsed |
| `/help/troubleshooting/support-diagnostics` | `Send safe diagnostics to support` | Sanitized export only | Raw logs never requested |

### FAQ information architecture

Group FAQ entries in this order:

1. `Before you install` — desktop app, supported platforms, no Node/npm for consumers, signed installer expectations.
2. `Privacy and control` — local vault, connected AI app boundaries, provider deletion limits, what users can remove from Enigma context.
3. `Connecting AI apps` — supported clients, `.mcpb` where available, previews/approvals, restart guidance.
4. `Proofs` — what proofs show, what they never show, why opaque refs are safe to share, Solana-ready boundary.
5. `Troubleshooting` — blocked installer, app not detected, vault warning, health dashboard states.
6. `Developers` — CLI, npm, MCP JSON, source checkout, local proof artifacts.

Each FAQ answer must start with a short direct answer, then one short explanation, then a link to the relevant help article. Do not place command blocks in FAQ answers except in the `Developers` group.

### Install guide content split

The install guide must be two-tiered:

1. `Install the desktop app` — default, visual, signed distribution, runtime bundled, no terminal.
2. `Advanced: install the CLI` — npm/Node/source commands, MCP stdio, manual JSON, and troubleshooting for power users.

The page must state that CLI remains supported as the engine and power-user path, but is not the public default. Any CLI command copied from current README/install docs belongs only in tier 2.

### Proof explainer content split

The proof explainer must avoid cryptographic detail on first screen. The default proof page should answer:

- `What did Enigma do locally?`
- `What evidence can I safely share?`
- `What private data is excluded?`
- `What does this not prove?`

Advanced proof details may include schemas, validators, signatures, roots, nullifiers, and Solana-ready payload language, but must keep raw memory and provider-response data out of examples.

### Privacy explainer content split

The privacy explainer must separate four concepts:

1. `Enigma local vault` — Enigma-controlled canonical memory state on the user's device.
2. `Context shared with connected AI apps` — selected context may be sent to the user's chosen client during use.
3. `Provider systems` — providers may have separate logs, retention, account settings, caches, or native memory outside Enigma control.
4. `Public-safe proofs` — hashes, roots, refs, counts, timestamps, signatures, and validation results that should not reveal raw memory.

Do not use `delete everywhere`, `make the model forget`, `erase provider memory`, or similar shorthand.

## Default vs advanced content rules

### Default consumer path must not include

- `npm install -g enigma-memory`.
- Node.js version requirements.
- `npx` setup.
- Git clone/source checkout steps.
- Raw MCP JSON snippets.
- Shell-specific bundle paths.
- `enigma-mcp` stdio commands.
- Release scripts, package publishing, Docker, Cloudflare, relay, gateway, benchmark, Solana operator, or BYOC instructions.

### Default consumer path may include

- Download signed app.
- Open app.
- Create local vault.
- Detect installed clients.
- Preview connection changes.
- Apply connection with approval.
- Run health check.
- Use fix-it actions.
- Open privacy/proof explanations.
- Contact support with sanitized diagnostics.

### Advanced/developer path must include

- Clear label: `Advanced / Developer CLI`.
- Prerequisites before commands.
- Exact claim boundary for local-only artifacts.
- Manual MCP snippets only after app and `.mcpb` options.
- Redaction guidance before any diagnostics/export instructions.
- Links back to consumer setup for non-technical users.

## App help content model

Each help article should use this structure:

1. Title in user language, not implementation language.
2. One-sentence outcome.
3. `Try this first` with one app action.
4. `What Enigma checks` with plain-language diagnostics.
5. `If that does not work` with the smallest manual fallback.
6. `Advanced details` collapsed by default.
7. `Safe to share with support` list.
8. `Do not share` list.

Example article titles:

- `Create your local vault`.
- `Connect Claude Desktop`.
- `Connect Cursor`.
- `Reconnect an app after it updates`.
- `Repair a missing vault`.
- `Understand a proof export warning`.
- `Remove Enigma from an app`.
- `Use the CLI instead of the desktop app`.

## Deliverables

### Public website deliverables

- Consumer landing page with desktop-first hero and claim boundary note.
- Download page with platform-specific signed installer copy and release-blocker messaging until signing is complete.
- Setup guide with screenshots of the desktop wizard.
- Help hub with install, connect, troubleshooting, proof, and privacy routes.
- Consumer FAQ with no terminal-first answers.
- Developer CLI appendix that preserves the npm/Node path without making it the public default.

### Product/app deliverables

- Desktop welcome and setup wizard copy.
- Local vault health dashboard labels and status descriptions.
- Client detection state taxonomy: `Detected`, `Ready to connect`, `Needs permission`, `Already connected`, `Needs repair`, `Unsupported`, `Not installed`.
- Fix-it action copy for each recoverable state.
- Privacy and proof in-app explainers.
- Sanitized diagnostic export labels and warnings.

### README deliverables

- New first screen: desktop-first product description, download CTA, claim boundary, and link to consumer docs.
- Move existing npm command block into `Developer CLI`.
- Move manual MCP JSON snippets below desktop and `.mcpb` paths.
- Preserve local-first and proof-boundary precision.
- Remove any implication that consumers must install Node, use terminals, or edit JSON.

## Release blockers for public docs

Public consumer docs should not launch until these are true or explicitly labeled unavailable:

- Signed desktop distribution path selected.
- Windows signing/MSIX/Store plan complete enough to avoid presenting unsigned `.exe` as the consumer default.
- macOS Developer ID signing, notarization, and stapling plan complete enough to avoid Gatekeeper confusion.
- Desktop app bundles the required runtime internally; no consumer Node/npm prerequisite.
- First-run wizard can create or initialize the local vault without terminal commands.
- Client detection and connection preview exist for supported clients.
- Health dashboard has user-readable statuses and fix-it actions.
- Claude Desktop `.mcpb` path is evaluated and documented when available; manual JSON is not the first Claude path.
- Diagnostic/export copy has a public-safe redaction checklist.
- Support intake template refuses raw memory, prompts, transcripts, credentials, local absolute paths, account IDs, and customer identifiers.

## Dependencies

- Desktop shell direction: Tauri preferred for a small native shell around the existing Enigma engine.
- Runtime packaging: bundle the Enigma engine/runtime internally for consumer installers.
- Release engineering: code signing, notarization, stapling, installer provenance, and public checksum/signature presentation.
- Connector implementation: app detection, config preview, write approval, rollback/repair, and Claude `.mcpb` packaging decision.
- Privacy/security review: diagnostic redaction, screenshot review, public proof artifact validation language.
- Support operations: sanitized support ticket form, safe attachment guidance, escalation categories.
- Design/content: screenshots and diagrams that use synthetic data only.


## Artifact change plan

Create or update only the public documentation artifacts below when implementation begins:

| Artifact | Action | Consumer/default content | Advanced content location |
| --- | --- | --- | --- |
| Public homepage `/` | Update | Desktop-first product story, download CTA, privacy/proof trust note | Footer link to developers |
| Public download page `/download` | Create/update | Signed desktop app download, platform selector, installer trust explanation | `Developer CLI` link only after desktop options |
| Public setup page `/setup` | Create/update | Visual wizard walkthrough, local vault, app detection, health dashboard | Collapsed CLI alternative |
| Public help hub `/help` | Create/update | Install, connect, troubleshooting, privacy, proofs cards | Developer card visually last |
| Install guide `/help/install` | Create/update | Signed app install by OS, blocked-installer guidance | npm/source install at bottom |
| Troubleshooting `/help/troubleshooting` | Create/update | Health states and fix-it actions | Manual CLI recovery only in advanced panels |
| Proof explainer `/proofs` | Create/update | Plain-language safe proof concepts | Schemas/roots/signatures/nullifiers after basics |
| Privacy explainer `/privacy` | Create/update | Local vault and connected-app boundaries | Provider and proof boundary details after basics |
| FAQ `/faq` | Create/update | Consumer questions first | Developer questions last |
| Developer CLI appendix `/developers/cli` | Create/update | Warning that this is not default setup | npm, Node, CLI flags, MCP JSON, stdio |
| Source appendix `/developers/source` | Create/update | None above the fold except warning | Git/source checkout/build notes |
| Repository `README.md` | Update | Desktop-first first screen and claim boundary | Move current npm/MCP/source details below `Developer CLI` |
| In-app help screens | Create/update | Welcome, setup, connections, health, privacy, proofs, diagnostics | `Show technical details` drawers |

Do not create separate consumer docs that duplicate CLI-first quickstarts. One consumer path should be canonical; advanced CLI/source content should be reachable but not interleaved with default setup.

## Test plan for docs readiness

These are documentation acceptance tests for the future launch review; they do not require project builds, package installs, or command execution:

1. `Five-second first-screen test` — show the homepage, download page, setup page, README top, and desktop welcome screen to a non-technical reviewer. Acceptance: they can state the next action and do not mention terminal, npm, Node, JSON, or Git.
2. `Consumer path walkthrough` — follow links from homepage to download, setup, connect-apps help, health troubleshooting, privacy, and proofs. Acceptance: the default route never requires a command-line step.
3. `Advanced containment review` — search the rendered consumer pages manually for command blocks, npm, Node, npx, Git clone, MCP JSON, and stdio. Acceptance: those items appear only in developer/source/advanced sections.
4. `Claim-boundary review` — compare homepage, privacy, proofs, FAQ, README, and troubleshooting copy against `docs/proof-network-claim-boundaries.md`. Acceptance: no provider deletion, model forgetting, hosted SaaS/BYOC readiness, compliance, benchmark superiority, legal, patent, or chain-submission claims leak into public copy.
5. `Sensitive-data review` — inspect every screenshot, example, proof snippet, and support instruction. Acceptance: no raw memory, prompts, transcripts, completions, embeddings, local absolute paths, credentials, tokens, private keys, account IDs, customer identifiers, tenant names, or provider responses.
6. `Readability review` — check headings, paragraph length, acronym use, CTA hierarchy, and FAQ answer shape. Acceptance: each consumer page has one obvious primary action, short direct answers, and plain-language headings.
7. `Support handoff review` — follow troubleshooting articles to support escalation. Acceptance: users are told exactly which sanitized fields are safe to share and which private fields must never be sent.

## Verification and readability acceptance criteria

Before publication, each public page and app help screen must pass these checks:

### Consumer path criteria

- A non-technical reader can identify the next action within five seconds on the first screen.
- The primary path never requires terminal, npm, Node, Git, JSON editing, source checkout, or MCP stdio knowledge.
- The first CTA on consumer pages is always desktop-app download, setup, or app help; never a CLI command.
- Advanced sections are clearly labeled and visually secondary.
- Every page links to help/troubleshooting before developer CLI details.

### Claim-safety criteria

- No page claims provider deletion, model forgetting, hosted SaaS/BYOC readiness, compliance certification, benchmark superiority, legal status, chain submission, or patent conclusions without approved evidence.
- Proof copy distinguishes local prepared artifacts from submitted on-chain transactions.
- Privacy copy distinguishes Enigma-controlled context exclusion from third-party provider deletion.
- Public proof examples contain only hashes, roots, opaque refs, counts, timestamps, signatures, schema names, and validation states.

### Sensitive-data criteria

- No screenshots or examples contain raw memory, prompts, transcripts, completions, embeddings, credentials, tokens, private keys, account IDs, local absolute paths, tenant names, customer names, provider responses, or real support cases.
- Troubleshooting pages tell users what is safe to share and what must be redacted.
- Diagnostic export copy describes public-safe fields before offering export.

### Readability criteria

- Consumer pages target plain-language comprehension: short paragraphs, action-led headings, and no unexplained acronyms above the fold.
- Each first screen has one H1, one primary CTA, one secondary CTA at most, and one boundary/trust note.
- Install and troubleshooting steps use numbered actions with one outcome per step.
- FAQ answers start with `Yes`, `No`, or `It depends` before explanation.
- Developer pages can be technical, but their first screen must state that they are not the default consumer setup.

### Docs QA plan

- Review each public page against the default-vs-advanced content rules.
- Review every first screen on desktop and mobile widths for CTA hierarchy and absence of terminal-first copy.
- Review all examples and screenshots for sensitive-data leakage.
- Review proof/privacy pages against `docs/proof-network-claim-boundaries.md`.
- Have one non-technical reviewer attempt the docs-only setup path and record where they expected a terminal, Node install, or JSON edit.
- Have one developer reviewer confirm the CLI appendix still contains the npm/MCP/source details needed by power users.

## Completion definition

The public-launch documentation work is complete when a consumer can start from the homepage, download the signed desktop app, complete setup, connect a supported AI client, understand health/fix-it states, and understand privacy/proof boundaries without seeing npm, Node, terminal, source checkout, or raw MCP JSON unless they intentionally open the developer appendix.