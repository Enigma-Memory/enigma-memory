# Consumer onboarding UX plan

## Scope

This plan turns Enigma Memory from an npm/CLI-first install into a consumer-first desktop onboarding flow. The target experience is closer to installing Dropbox than configuring a developer tool: download a signed desktop app, open it, press one primary button at a time, connect supported AI apps, and see a local memory health dashboard without installing Node, opening a terminal, or editing JSON.

CLI commands remain available for power users, but they are not part of the default first-run path.

## Claim and privacy boundaries

Default and support copy must stay inside these boundaries:

- Enigma creates and manages a local private memory vault and local evidence about Enigma-controlled memory actions.
- Enigma does not claim that an AI provider deleted data, changed model weights, removed provider logs, or forgot information.
- Enigma does not claim hosted SaaS, BYOC, compliance certification, benchmark leadership, legal conclusions, or patent conclusions.
- Public-facing screenshots, docs, telemetry, support bundles, and proof examples must not include raw memory text, prompts, transcripts, completions, embeddings, local absolute paths, credentials, tokens, private keys, account IDs, customer identifiers, or provider response bodies.
- Proof language in the consumer path must be framed as "local activity records" or "privacy-safe technical details," not as legal certification or provider-side guarantees.

## UX principles

1. **One primary action per screen.** Each first-run screen has one main button and one secondary escape hatch at most.
2. **Plain language first.** Explain outcomes before mechanisms. The first run avoids jargon-first words such as Merkle, schema, MCP, receipt chain, proof-of-non-use, and quarantine root.
3. **Progressive disclosure.** Consumers see what to do next. Advanced proof and CLI details stay reachable after setup from a clearly labeled technical details area.
4. **Repair over diagnosis.** When something is wrong, show a fix-it button before logs or explanations.
5. **Local-first trust.** Reassure users that setup creates a private vault on this computer and does not publish their memory.
6. **Deferral of optional work.** Optional proof export, CLI setup, advanced app profiles, and developer settings happen after the dashboard is usable.

## Consumer language map

| Technical concept | Default consumer phrase | Short explanation copy | Advanced label after setup |
| --- | --- | --- | --- |
| Memory Drive | Memory Drive | "Your private place for useful facts your AI apps can reuse." | Memory Drive / local vault |
| Private memory | Helpful facts | "Facts you chose to keep available for your AI apps, stored in your private vault." | Memory records |
| Local vault | Private vault | "Stored on this computer and protected by your operating system." | Vault location and key storage |
| MCP client | Connected app | "An AI app Enigma can work with." | MCP client connector |
| Connected apps | Connected apps | "AI apps you allow to ask Enigma for memory." | Client connectors |
| MCP configuration | App connection | "The setting that lets the app ask Enigma for memory." | Client configuration file |
| Retrieval/context pack | Shared memory | "The small set of relevant facts Enigma offers to a connected app." | Context pack |
| Proof details | Activity details | "Technical records that show what Enigma did without revealing your private text." | Proof details / receipts |
| Health score | Memory health | "A simple check that your vault, app connections, and privacy checks are working." | Health report |
| Quarantine | Needs review | "Enigma held something back because it may be unsafe or incomplete." | Quarantine / review queue |
| Connector sync | App status | "Whether a connected app can reach Enigma right now." | Connector health |
| Revocation/deletion marker | Removed from Enigma sharing | "Enigma will no longer offer this item to connected apps." | Revocation record |

## Public download and first-open surfaces

The consumer journey begins before the wizard. These surfaces must also keep one primary action visible.

### Download page

- **Title:** `Download Enigma Memory`
- **Body:** `Install the desktop app to create a private Memory Drive on this computer.`
- **Primary:** `Download for this computer`
- **Secondary:** `Advanced install options`
- **Trust note:** `Signed app. Local-first setup. No terminal required.`

The default download page must detect the operating system where possible and recommend the signed desktop installer. npm, CLI, and manual connection instructions belong behind `Advanced install options`.

### Installer complete

- **Title:** `Enigma Memory is installed`
- **Body:** `Open the app to create your private Memory Drive.`
- **Primary:** `Open Enigma Memory`
- **Secondary:** `Finish`

### First open before setup

- **Title:** `Set up Enigma Memory`
- **Body:** `Create a private Memory Drive, connect supported AI apps, and check that everything is ready.`
- **Primary:** `Start setup`
- **Secondary:** `Advanced options`

`Advanced options` may show CLI and technical setup paths, but it must not interrupt the default desktop path.

## First-run wizard overview

### Required steps

1. Welcome
2. Create private vault
3. Find apps
4. Connect apps
5. Health check
6. Ready

### Optional steps deferred until after setup

- Import existing memory files.
- Turn on advanced proof exports.
- Open CLI setup notes.
- Change vault location.
- Review technical connection details.

### Global wizard chrome

- Top-left: Enigma Memory app icon and name.
- Top-right: "Need help?" link.
- Progress text: "Step X of 6" and a plain-language label.
- Footer secondary link: "Set up later" only on app connection screens, never on vault creation.
- Primary button is always visually dominant and uses a verb.
- Back button is text-only and disabled while a fix or write operation is running.

## Wizard screens and exact copy

### Screen 1: Welcome

**Purpose:** Set expectation and reduce fear.

**Progress:** `Step 1 of 6 · Welcome`

**Title:** `Give your AI apps a private memory`

**Body copy:**

`Enigma Memory creates a private Memory Drive on this computer. Connected AI apps can ask for helpful facts when you allow it. Your memory is not published during setup.`

**Primary button:** `Create my Memory Drive`

**Secondary link:** `Learn what stays private`

**Secondary disclosure copy:**

`Setup creates local files for Enigma Memory. It does not delete anything from AI providers, change a model, or publish your memory.`

**Loading state after primary click:**

- Button: `Preparing...`
- Status line: `Checking this computer.`

**Acceptance:** A non-technical user can understand what the app is for without seeing terminal, package, protocol, or proof language.

### Screen 2: Create private vault

**Purpose:** Create or select the local vault with no file-system jargon.

**Progress:** `Step 2 of 6 · Private vault`

**Title:** `Create your private vault`

**Body copy:**

`This vault stores Enigma Memory data on this computer. You can move it later from Settings.`

**Primary button:** `Create vault`

**Secondary link:** `Choose a different location`

**Default location copy:**

`Recommended location selected`

**Location chooser warning copy:**

`Choose a folder you control. Avoid shared folders unless you understand who can access them.`

**Progress states:**

- `Creating vault...`
- `Protecting local files...`
- `Checking vault access...`

**Success inline copy:**

`Vault ready.`

**Error states:**

1. Permission issue
   - Title: `Enigma cannot write to that folder`
   - Body: `Choose another folder or allow access in your system settings.`
   - Primary: `Choose another folder`
   - Secondary: `Open help`
2. Existing vault found
   - Title: `We found an existing Memory Drive`
   - Body: `You can use it here, or create a separate one for this computer profile.`
   - Primary: `Use this Memory Drive`
   - Secondary: `Create a separate one`
3. Disk space low
   - Title: `This computer is low on space`
   - Body: `Enigma needs room for your private vault and search index.`
   - Primary: `Choose another location`
   - Secondary: `Try again`

**Acceptance:** The default path uses the recommended location and requires one click.

### Screen 3: Find apps

**Purpose:** Detect supported AI apps and avoid manual config.

**Progress:** `Step 3 of 6 · Find apps`

**Title:** `Find apps Enigma can connect to`

**Body copy:**

`Enigma can look for supported AI apps on this computer and prepare safe connection steps.`

**Primary button:** `Find my apps`

**Secondary link:** `I will connect apps later`

**Scanning progress copy:**

- `Looking for supported apps...`
- `Checking app settings...`
- `Preparing connection options...`

**Empty state if no apps found:**

- Title: `No supported apps found yet`
- Body: `You can finish setup now. Enigma will keep watching for apps you install later.`
- Primary: `Continue without apps`
- Secondary: `See supported apps`

**Partial state if apps found but closed:**

- Title: `Apps found`
- Body: `Some apps may need to be closed and reopened after connection.`
- Primary: `Continue`

**Acceptance:** The user is not asked to paste JSON, locate config folders, or know protocol names.

### Screen 4: Connect apps

**Purpose:** Connect supported apps with one fix-it path per app.

**Progress:** `Step 4 of 6 · Connect apps`

**Title:** `Connect your AI apps`

**Body copy:**

`Choose which apps can ask Enigma for memory. You can change this later.`

**App card fields:**

- App name
- Status badge
- One-sentence explanation
- One action button

**Status badges and copy:**

| State | Badge | Body copy | Primary action |
| --- | --- | --- | --- |
| Ready to connect | `Ready` | `Enigma can connect this app now.` | `Connect` |
| Needs restart | `Restart needed` | `Connection is ready. Restart the app to finish.` | `Show restart steps` |
| Needs permission | `Permission needed` | `Your system blocked access to this app's settings.` | `Fix permission` |
| Unsupported version | `Update needed` | `This app version cannot connect yet.` | `See options` |
| Connected | `Connected` | `This app can ask Enigma for memory.` | `Manage` |
| Skipped | `Skipped` | `This app will not use Enigma yet.` | `Connect later` |

**Primary page action when at least one app is connected:** `Run health check`

**Primary page action when no apps connected:** `Continue without apps`

**Secondary page link:** `What does connecting allow?`

**Disclosure copy for secondary link:**

`Connected apps can ask Enigma for relevant memory. Enigma still keeps your private vault local. You control which apps are connected.`

**Claude Desktop extension note, shown only when applicable:**

`If this app supports extensions, Enigma can install a packaged connection instead of asking you to edit settings.`

**Connection preview modal, shown before any app setting is changed:**

- Title: `Connect Enigma to this app?`
- Body: `Enigma will add its connection and keep your other app settings. A backup will be saved first.`
- Details row 1: `App: [app name]`
- Details row 2: `Change: Add Enigma connection`
- Details row 3: `Backup: Created before changes`
- Details row 4: `Restart: May be needed`
- Primary: `Connect Enigma`
- Secondary: `Cancel`

**Error states:**

1. Connection write failed
   - Title: `Enigma could not update this app's settings`
   - Body: `Your settings were not changed. Try the automatic fix again or open guided steps.`
   - Primary: `Try automatic fix`
   - Secondary: `Open guided steps`
2. App running during change
   - Title: `Close the app to finish connecting`
   - Body: `Save your work, close the app, then come back here.`
   - Primary: `I closed it, try again`
   - Secondary: `Skip for now`
3. Existing custom settings
   - Title: `This app already has custom settings`
   - Body: `Enigma can add its connection without removing your other settings.`
   - Primary: `Add Enigma safely`
   - Secondary: `Review first`

**Acceptance:** Each app card has one next action, and successful setup never requires the user to understand the underlying connection protocol.

### Screen 5: Health check

**Purpose:** Confirm setup works and present repair actions before technical details.

**Progress:** `Step 5 of 6 · Health check`

**Title:** `Check your Memory Drive`

**Body copy:**

`Enigma will check your vault, privacy guardrails, and app connections.`

**Primary button:** `Run health check`

**Progress states:**

- `Checking vault...`
- `Checking privacy guardrails...`
- `Checking connected apps...`
- `Checking memory search...`
- `Preparing your dashboard...`

**Healthy state:**

- Title: `Everything looks ready`
- Body: `Your Memory Drive is ready for connected apps.`
- Primary: `Open dashboard`

**Warning state:**

- Title: `A few things need attention`
- Body: `Your Memory Drive can open now, but these fixes will improve reliability.`
- Primary: `Fix recommended items`
- Secondary: `Open dashboard anyway`

**Blocked state:**

- Title: `Setup needs one fix`
- Body: `Enigma found an issue that can stop your Memory Drive from working.`
- Primary: `Fix it`
- Secondary: `Open help`

**Health item labels:**

| Technical check | Consumer label | Healthy copy | Warning or error copy |
| --- | --- | --- | --- |
| Vault readable/writable | Private vault | `Vault ready` | `Vault needs access` |
| Privacy denylist scan | Privacy guardrails | `Privacy checks ready` | `Review privacy warning` |
| Connector config | Connected apps | `Apps connected` | `App connection needs a fix` |
| Retrieval index | Memory search | `Memory search ready` | `Memory search needs rebuild` |
| Local evidence artifacts | Activity details | `Activity details ready` | `Activity details need refresh` |

**Acceptance:** Health is explained as readiness and fixability, not as an audit, certification, or provider-side guarantee.

### Screen 6: Ready

**Purpose:** Give a simple success state and first useful next action.

**Progress:** `Step 6 of 6 · Ready`

**Title:** `Your Memory Drive is ready`

**Body copy:**

`Enigma is set up on this computer. Connected apps can now ask for helpful memory when you allow it.`

**Primary button:** `Open dashboard`

**Secondary link:** `Explore advanced details`

**Success checklist:**

- `Private vault created`
- `Privacy guardrails checked`
- `Apps connected` or `Apps can be connected later`
- `Dashboard ready`

**Post-setup nudge:**

`Next: try asking a connected app to remember a harmless preference, then check that it appears in your dashboard.`

**Acceptance:** The success screen gives one next step and does not push proof, command-line, or import workflows before the dashboard.

## Main dashboard after setup

### Default dashboard sections

1. **Memory Drive status**
   - Copy: `Your private memory vault on this computer.`
   - Primary action: `View health`
2. **Connected apps**
   - Copy: `Apps that can ask Enigma for memory.`
   - Primary action: `Manage apps`
3. **Recent activity**
   - Copy: `Recent Enigma actions, shown without private text.`
   - Primary action: `View activity`
4. **Needs review**
   - Copy: `Items Enigma held back until you review them.`
   - Primary action: `Review items`

### Dashboard empty states

**No memories yet**

- Title: `No memories yet`
- Body: `Use a connected app and allow Enigma to save a helpful preference. It will appear here without exposing private app transcripts.`
- Primary: `Manage connected apps`
- Secondary: `Learn what can be saved`

**No apps connected**

- Title: `No apps connected yet`
- Body: `Connect an AI app so it can ask Enigma for memory.`
- Primary: `Connect apps`
- Secondary: `See supported apps`

**No recent activity**

- Title: `No activity yet`
- Body: `Activity appears after Enigma creates, updates, shares, or withholds memory for a connected app.`
- Primary: `Try a sample walkthrough`

**Needs review empty**

- Title: `Nothing needs review`
- Body: `Enigma has not held back any items for manual review.`
- Primary: `Back to dashboard`

## Error state library

### App-level offline state

- Title: `Enigma is not running`
- Body: `Start Enigma to use your Memory Drive and connected apps.`
- Primary: `Start Enigma`
- Secondary: `Open help`

### Update required

- Title: `Update Enigma to continue`
- Body: `This version cannot complete setup safely. Update the app, then try again.`
- Primary: `Update Enigma`
- Secondary: `Open release notes`

### Privacy guardrail warning

- Title: `Enigma held something back`
- Body: `An item may include private or unsafe content, so Enigma did not use it automatically.`
- Primary: `Review item`
- Secondary: `Keep it held back`

### Connection conflict

- Title: `Another setting is in the way`
- Body: `This app has a custom setup. Enigma can add its connection without removing your existing settings.`
- Primary: `Add Enigma safely`
- Secondary: `Review changes`

### Recovery mode

- Title: `Open in recovery mode?`
- Body: `Use recovery mode if your Memory Drive cannot open normally. Enigma will not publish or share memory during recovery.`
- Primary: `Open recovery mode`
- Secondary: `Cancel`

## Advanced and proof disclosure strategy

Advanced details must be available, but never required to complete first run.

### Entry points after setup

- Ready screen secondary link: `Explore advanced details`
- Dashboard card: `Activity details`
- Settings section: `Advanced`
- Health item disclosure: `Show technical details`
- Support bundle flow: `Preview safe support report`

### Disclosure levels

1. **Default summary**
   - Audience: consumer.
   - Language: local vault, connected apps, health, activity details.
   - No raw memory or protocol terms.
2. **Technical summary**
   - Audience: advanced consumer, developer, support.
   - Language may include protocol and proof terms after setup.
   - Shows public-safe hashes, opaque references, counts, timestamps, validation status, and local file categories only.
3. **Export review**
   - Audience: user deciding whether to share.
   - Requires explicit preview and confirmation.
   - Redacts private text, prompts, transcripts, local absolute paths, credentials, tokens, private keys, account IDs, customer identifiers, and provider responses.

### Exact copy for advanced entry

**Title:** `Advanced activity details`

**Body:**

`These details are for troubleshooting and verification. They can show privacy-safe technical records about what Enigma did, but they do not include your private memory text.`

**Primary:** `Show technical details`

**Secondary:** `Keep simple view`

### Exact copy for export preview

**Title:** `Review before sharing`

**Body:**

`This report is designed to avoid private memory text, prompts, transcripts, account IDs, local paths, and secrets. Review it before sending.`

**Primary:** `Download safe report`

**Secondary:** `Cancel`

### Advanced proof boundaries

Technical views may explain that Enigma creates local, privacy-safe records for Enigma-controlled actions. They must not say:

- a provider deleted data;
- a model forgot information;
- a public proof contains hidden private memory;
- a local record is a compliance certification;
- a prepared chain artifact means a transaction was submitted;
- a benchmark or health report proves hosted readiness or market superiority.

## Accessibility requirements

- Full first-run setup must be keyboard navigable in logical order.
- All primary actions must have accessible names matching visible button text.
- Screen progress must be announced to screen readers as `Step X of 6`.
- Long-running actions must expose polite live-region updates for progress text.
- Error messages must be programmatically associated with the field, app card, or step they affect.
- Color cannot be the only status indicator; use text badges and icons with labels.
- Minimum contrast: 4.5:1 for body text and 3:1 for large text and non-text controls.
- Touch targets must be at least 44 by 44 CSS pixels.
- Motion must respect reduced-motion settings; progress changes should not depend on animation.
- Focus must move to the screen title after each step transition and to the error title when a blocking error appears.
- Support and help links must be reachable without hover.
- All screenshots in docs must include alt text that describes the state, not private content.

## Non-technical support requirements

### In-app help

- `Need help?` is always visible in setup.
- Help opens a plain-language panel with three options:
  1. `Fix setup problem`
  2. `Understand privacy`
  3. `Contact support`
- Help articles must start with symptoms and fixes, not protocols or command names.
- CLI commands may appear only under `Advanced: command-line steps`.

### Safe support report

Support flow must provide:

- preview before export;
- explicit statement that private memory text is excluded;
- redaction of local absolute paths and identifiers;
- app status, Enigma version, OS family, health statuses, error codes, and public-safe refs only;
- a `Copy support summary` button for users who do not want to download a file.

### Human support copy

**Contact support title:** `Send Enigma a safe setup summary`

**Body:**

`You can share a setup summary that avoids private memory text, prompts, transcripts, local paths, account IDs, and secrets. Review it before sending.`

**Primary:** `Preview summary`

**Secondary:** `Cancel`

### Support acceptance

A non-technical user can report setup failure without opening a terminal, copying hidden files, or exposing private memory.

## Concrete deliverables

### Desktop onboarding product

- Signed desktop app shell around the existing Enigma engine, preferably Tauri for small footprint and native OS integration.
- Bundled runtime so consumers do not install Node.
- First-run wizard with the six screens above.
- Local vault creation with recommended default path and optional chooser.
- Supported app detection and one-click connection.
- Claude Desktop extension package support where available to reduce manual settings edits.
- Health dashboard with fix-it actions.
- Advanced details drawer available after setup.
- Safe support report preview and export.

### Distribution

- Windows signed installer path through Microsoft Store/MSIX or trusted code signing that reduces SmartScreen friction.
- macOS Developer ID signing, notarization, and stapling before public distribution.
- Release page copy that clearly separates consumer desktop install from CLI power-user install.
- Download page that defaults to desktop installers and places npm/CLI under `Advanced`.

### Documentation

- Consumer quickstart with screenshots of the wizard and dashboard.
- Troubleshooting guide organized by symptoms.
- Privacy explainer using the consumer language map.
- Advanced proof explainer reachable after setup.
- CLI guide retained for power users but not linked as the default install path.

## Acceptance criteria

- A fresh consumer can complete setup with no terminal, no Node install, and no JSON editing.
- Every first-run screen has one primary action.
- Optional setup is deferred until after the dashboard opens.
- The default path avoids jargon-first words: Merkle, schema, MCP, receipt chain, proof-of-non-use, quarantine root.
- Advanced details are reachable after setup through visible links.
- App connection failures offer fix-it actions before technical logs.
- Health communicates readiness and next action, not legal/compliance proof.
- Support report preview excludes private memory, prompts, transcripts, completions, embeddings, local absolute paths, credentials, tokens, private keys, account IDs, customer identifiers, and provider responses.
- Public copy does not claim provider deletion, model forgetting, hosted SaaS/BYOC readiness, compliance certification, benchmark superiority, or legal/patent conclusions.

## UX test plan

No automated commands are required for this plan. Product validation should use moderated and unmoderated first-run sessions.

### Participant profile

- 5 non-technical AI app users who have never installed a CLI tool.
- 3 power users who have installed AI tools before but are not Enigma contributors.
- 2 accessibility users or assistive-technology reviewers.

### First-run task script

1. Install the signed desktop app from the public download page.
2. Open Enigma Memory.
3. Create a Memory Drive.
4. Connect one supported AI app if detected.
5. Run the health check.
6. Open the dashboard.
7. Find where advanced details live without opening them during setup.
8. Preview a safe support report.

### Measures

- Setup completion rate without support.
- Number of times users ask what to do next.
- Number of screens where users mention jargon confusion.
- Time from app open to dashboard.
- App connection success rate.
- Health warning comprehension: user can explain what needs fixing.
- Support report trust: user can identify what is and is not included.
- Screen reader completion with no mouse.

### Pass thresholds for public launch

- At least 80% of non-technical participants reach the dashboard without terminal or support intervention.
- 100% of participants can identify the primary next action on each wizard screen.
- 0 participants are required to edit JSON or install Node.
- 0 public-facing support reports include private text, prompts, transcripts, local absolute paths, credentials, tokens, private keys, account IDs, or customer identifiers.
- Accessibility review finds no blocker for keyboard-only setup or screen-reader step progression.

## Release blockers

- No signed Windows installer or trusted Microsoft Store/MSIX path.
- No macOS Developer ID signing, notarization, and stapling.
- Desktop shell not yet packaging the engine with an internal runtime.
- No consumer-safe app detection and one-click connection layer.
- No packaged connection path for Claude Desktop where extension packaging is available.
- No first-run vault creation UI with OS keychain/keyring integration decision finalized.
- No health dashboard UI with fix-it actions.
- No safe support report preview and redaction review.
- No consumer privacy copy review against claim boundaries.
- No accessibility review of the wizard.
- No public download page that defaults to desktop install and demotes CLI to advanced.

## Dependencies

- Desktop architecture decision and Tauri shell implementation.
- Runtime bundling plan for the existing Enigma engine.
- OS signing identities, certificate custody, notarization pipeline, and release approval.
- App detection matrix for supported clients and versions.
- Safe app connection writer with backup, preview, rollback, and conflict handling.
- Claude Desktop extension package generation and installation path where supported.
- Local vault path, key storage, migration, and recovery design.
- Health check API that returns consumer-safe statuses and fix actions.
- Support report generator with denylist scanning and preview UI.
- Documentation screenshots that use synthetic, non-private sample data.
- Support playbooks for permission failures, app conflicts, update issues, and vault recovery.

## Launch readiness checklist

- [ ] Desktop installer opens without command-line prerequisites.
- [ ] First run completes with one primary action per screen.
- [ ] Default copy uses consumer language from this plan.
- [ ] Advanced proof and CLI details are reachable only after setup or explicit disclosure.
- [ ] Health dashboard shows clear statuses and fix-it actions.
- [ ] App connection supports automatic setup and safe rollback.
- [ ] Safe support report passes redaction review.
- [ ] Windows and macOS distribution trust requirements are met.
- [ ] Accessibility requirements pass review.
- [ ] Public docs and screenshots respect privacy and claim boundaries.
