# Enigma launch checklist

This checklist is for a professional launch of Enigma as provider-neutral AI memory/proof infrastructure with a legally reviewed Solana utility-token plan. It is intentionally product-first: local install, MCP, offline verifier, relay/gateway demos, documentation, security, support, and operations must be ready before any public token launch.

Non-negotiable claim boundary: Enigma can verify declared Enigma-mediated operations, signed receipts, receipt chains, checkpoints, relay records, witness checkpoints, gateway decisions, and policy evidence. Enigma must not claim provider deletion, model forgetting, semantic forgetting, complete side-channel absence, legal compliance status, token equity, token revenue rights, token profit rights, or guaranteed token compensation.

Hosted cloud boundary: hosted Enigma relay/gateway/cloud must not be described as live until deployment credentials, domains, TLS, durable storage, KMS/secrets, monitoring, backups, support, and incident response are in production.

Deployment-mode boundary: hosted, BYOC, and on-prem/air-gapped are different operating models. BYOC and on-prem commitments must follow `enigma/docs/enterprise-byoc-runbook.md`; provider-native memory is cache only, not canonical memory state.

## 1. Launch decision gates

Do not announce a full public launch until every applicable gate is signed off.

| Gate | Required owner | Pass condition |
| --- | --- | --- |
| Product readiness | Engineering lead | Local install, CLI, verifier, MCP, connector, browser scaffold, desktop scaffold, relay demo, and gateway demo are usable from documented commands. |
| Documentation readiness | Developer relations lead | User install guide, demo scripts, launch checklist, README, install docs, connector docs, and release checklist align with current CLI behavior. |
| Package readiness | Release lead | `@enigma-ai/enigma` package metadata, bins, exports, files, license, Node engine, and publish credentials are ready. |
| Security readiness | Security lead | Claim boundaries, plaintext-minimization, key handling, package contents, native messaging, gateway policy, relay plaintext rejection, incident process, and disclosure channel are reviewed. |
| Hosted/BYOC readiness | Infrastructure lead | Hosted, BYOC, and on-prem language is accurate; BYOC runbook acceptance tests are referenced; no hosted mode is marketed as live before infrastructure exists. |
| Token legal readiness | Counsel and board | Utility-only token materials, distribution mechanics, eligibility, risk disclosures, Solana mint/program/authority plan, governance powers, and marketing copy are approved before publication. |
| Community readiness | Community lead | Moderation rules, support channels, token speculation policy, code of conduct, and escalation path are active. |
| Support readiness | Support lead | Install-help process, known errors, triage macros, escalation owners, and response windows are documented. |
| Monitoring readiness | Operations lead | Package, website, community, relay/gateway if deployed, support, and security monitoring have owners and alert paths. |
| Incident response readiness | Incident commander | Severity matrix, on-call contacts, communication templates, token/security pause criteria, and postmortem process are approved. |

## 2. Product readiness

### Local CLI and verifier

- [ ] Node.js `>=24` requirement is stated everywhere Enigma can be installed.
- [ ] Local checkout install path is documented:

```sh
cd enigma
npm install -g .
enigma --help
enigma-verify --help
```

- [ ] Future npm install path is documented without implying publication has already occurred before release:

```sh
npm install -g @enigma-ai/enigma
enigma --help
enigma doctor
```

- [ ] First local vault workflow is documented:

```sh
mkdir -p .enigma
enigma init --bundle ./.enigma/bundle.json --subject local-user --display-name "Local user"
enigma remember --bundle ./.enigma/bundle.json --text "Prefers concise technical answers." --purpose user_memory --tags preference
enigma context --bundle ./.enigma/bundle.json --query "technical answers" --purpose local_context --out ./.enigma/context-pack.json
enigma export --bundle ./.enigma/bundle.json --out ./.enigma/export.json
enigma verify --bundle ./.enigma/export.json
```

- [ ] Verification docs say expected output includes `schema: "enigma.verification_report.v1"`, `ok: true`, non-zero `receipt_count`, and `errors: []` for a valid export.
- [ ] Docs explain that a signed memory receipt proves custody/lifecycle evidence, not factual truth.
- [ ] Docs explain that Enigma deletion/tombstone evidence covers Enigma-controlled state, not provider hidden copies or model weights.

### MCP server

- [ ] MCP startup is documented:

```sh
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma-mcp
ENIGMA_BUNDLE="$HOME/.enigma/bundle.json" enigma mcp serve
```

- [ ] Manual MCP handshake is documented:

```sh
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n{"jsonrpc":"2.0","id":3,"method":"resources/list","params":{}}\n{"jsonrpc":"2.0","id":4,"method":"prompts/list","params":{}}\n' | ENIGMA_BUNDLE="$PWD/.enigma/bundle.json" enigma-mcp
```

- [ ] MCP docs list tools: `enigma_init`, `enigma_remember`, `enigma_search`, `enigma_context_pack`, `enigma_delete`, `enigma_verify_receipts`.
- [ ] MCP docs list resource `enigma://passport/summary`.
- [ ] MCP docs list prompt `enigma_standard_memory_prompt`.
- [ ] MCP docs state local MCP verification does not prove hosted-provider deletion or model forgetting.

### Connectors

- [ ] `enigma doctor` is documented as the connector/package health check.
- [ ] `enigma install --bundle "$HOME/.enigma/bundle.json"` is documented for snippet generation.
- [ ] `enigma install --out ./enigma-mcp-snippets.json` is documented for review-before-write workflows.
- [ ] Connector commands are documented for every supported client:

```sh
enigma connect claude-desktop --bundle "$HOME/.enigma/bundle.json"
enigma connect cursor --bundle "$HOME/.enigma/bundle.json"
enigma connect kimi-code --bundle "$HOME/.enigma/bundle.json"
enigma connect vscode-cline --bundle "$HOME/.enigma/bundle.json"
enigma connect roo --bundle "$HOME/.enigma/bundle.json"
enigma connect opencode --bundle "$HOME/.enigma/bundle.json"
enigma connect generic-mcp --bundle "$HOME/.enigma/bundle.json"
```

- [ ] Disconnect commands are documented for every supported client.
- [ ] Manual MCP JSON shows `command: "enigma-mcp"`, `args: []`, and `env.ENIGMA_BUNDLE` set to an absolute path.
- [ ] Docs include Claude Desktop, Cursor, Kimi Code, VS Code/Cline, Roo Code, OpenCode, and generic MCP config paths.

### Browser extension scaffold

- [ ] Browser extension location is documented as `apps/browser-extension`.
- [ ] Native messaging host name is documented as `com.enigma.native_host`.
- [ ] Load-unpacked steps are documented.
- [ ] Docs say insertion requires explicit user approval.
- [ ] Docs say extension metadata and receipt metadata must not contain raw memory plaintext in browser sync storage.
- [ ] Docs do not claim the extension deletes provider memories or forces provider models to forget.

### Desktop scaffold

- [ ] Desktop scaffold location is documented as `apps/desktop/src/index.html`.
- [ ] Local static preview command is documented:

```sh
cd enigma
python -m http.server 4173
```

- [ ] Browser URL is documented as `http://127.0.0.1:4173/apps/desktop/src/index.html`.
- [ ] Docs say desktop UI state is operational evidence only; cryptographic proof comes from Enigma receipts and verifier output.

### Relay and gateway demos

- [ ] Relay demo command is documented:

```sh
enigma relay demo
```

- [ ] Relay expected output includes `ok: true`, `pushed_opaque_record: true`, `rejected_plaintext_record: true`, `witness_checkpoint_verification_ok: true`, `pairing_challenge_ok: true`, and `pairing_complete_ok: true`.
- [ ] Relay local server command is documented:

```sh
enigma relay serve --host 127.0.0.1 --port 8787
```

- [ ] Relay health and push examples are documented:

```sh
curl http://127.0.0.1:8787/health
curl -X POST http://127.0.0.1:8787/relay/push \
  -H 'content-type: application/json' \
  --data '{"capsule_id":"cap_launch_1","opaque_encrypted_record":"age1-example-ciphertext-only"}'
```

- [ ] Relay docs prohibit raw memory, plaintext, prompt, transcript, content, conversation, and completion fields in relay payloads.
- [ ] Gateway demo command is documented:

```sh
enigma gateway demo
```

- [ ] Gateway expected output includes `ok: true`, `allowed_retrieval: true`, `denied_disallowed_region: true`, `denied_legal_hold_delete: true`, `signed_decision_verification_ok: true`, and `siem_event_plaintext_minimized: true`.
- [ ] Gateway local server command is documented with the current launch port:

```sh
enigma gateway serve --host 127.0.0.1 --port 8797
```

- [ ] Gateway health, policy, decision, and SIEM export examples are documented:

```sh
curl http://127.0.0.1:8797/health
curl http://127.0.0.1:8797/policy
curl -X POST http://127.0.0.1:8797/gateway/decision \
  -H 'content-type: application/json' \
  --data '{"schema":"enigma.gateway_request.v1","operation":"retrieve","provider":"kimi","model":"kimi-k2","region":"us-east-1","purpose":"support_retrieval","sensitivity":"internal","memory_addr":"addr_committed_memory","memory_id":"mem_allowed","subject_id":"employee_123"}'
curl http://127.0.0.1:8797/siem/export
```

- [ ] Gateway docs say it evaluates Enigma policy and signs decisions; it does not call model providers.

## 3. Documentation readiness

Required launch docs:

- [ ] `enigma/README.md` describes current status, install, MCP, connectors, browser, desktop, relay/gateway, verification, and claim boundaries.
- [ ] `enigma/docs/install-anywhere.md` gives local checkout install, future npm install, local no-network path, MCP, connectors, browser, desktop, relay/gateway, Docker, enterprise hosted/BYOC, and verification commands.
- [ ] `enigma/docs/client-connectors.md` gives exact connector IDs, default config paths, CLI commands, and MCP JSON.
- [ ] `enigma/docs/production-release-checklist.md` remains the engineering release checklist.
- [ ] `enigma/docs/enterprise-byoc-runbook.md` defines customer-controlled deployment operations, responsibilities, and acceptance tests for BYOC/on-prem pilots.
- [ ] `enigma/launch/15_USER_INSTALL_GUIDE.md` is the user adoption install guide.
- [ ] `enigma/launch/16_DEMO_SCRIPTS.md` contains 5-minute, 15-minute, enterprise, and community token/network demos.
- [ ] `enigma/launch/17_LAUNCH_CHECKLIST.md` is this operational checklist.

Required claim language:

- [ ] Docs call Enigma provider-neutral AI memory/proof infrastructure.
- [ ] Docs say Enigma is local-first and supports customer-controlled deployment modes.
- [ ] Docs say Memory Passports are portable Enigma-controlled memory/capsule artifacts.
- [ ] Docs say receipts are offline-verifiable without trusting Enigma servers or AI providers.
- [ ] Docs say receipts prove declared Enigma-mediated operations were signed, ordered, and committed under stated boundaries.
- [ ] Docs say receipts do not prove factual truth, model intent, provider deletion, provider forgetting, imported-source completeness, or complete side-channel absence.
- [ ] Docs say hosted operation requires infrastructure before it can be described as live.
- [ ] Docs distinguish hosted, BYOC, and on-prem/air-gapped deployment responsibilities.
- [ ] Docs say provider-native memory is cache only and not the canonical durable memory system of record.
- [ ] Docs require legal/security review before SOC 2, HIPAA, GDPR, certification, regulatory, or compliance-status claims.

Required glossary coverage:

- [ ] Memory Passport
- [ ] Memory Capsule
- [ ] Receipt
- [ ] Verifier
- [ ] Vault
- [ ] Gateway
- [ ] Relay
- [ ] Witness
- [ ] Checkpoint
- [ ] Tombstone
- [ ] Scoped context
- [ ] Boundary receipt
- [ ] Enigma-mediated event

## 4. Package publish readiness

Package identity:

- [ ] Package name is `@enigma-ai/enigma`.
- [ ] Package version is approved for launch.
- [ ] License is approved for launch.
- [ ] Package description matches product positioning and does not overclaim.
- [ ] Repository URL is approved.
- [ ] `publishConfig.access` is `public`.
- [ ] `private` is not set for the publish artifact.
- [ ] Node engine is `>=24`.

Bins:

- [ ] `enigma` points to `./apps/cli/bin/enigma.mjs`.
- [ ] `enigma-verify` points to `./apps/verifier/bin/enigma-verify.mjs`.
- [ ] `enigma-mcp` points to `./packages/mcp-server/bin/enigma-mcp.mjs`.
- [ ] `enigma-relay` points to `./apps/relay/src/server.mjs`.
- [ ] `enigma-gateway` points to `./apps/gateway/src/server.mjs`.

Exports:

- [ ] Root export points to core.
- [ ] Boundary export exists.
- [ ] Connectors export exists.
- [ ] Desktop export exists.
- [ ] Enterprise export exists.
- [ ] Gateway export exists.
- [ ] Importers export exists.
- [ ] MCP server export exists.
- [ ] Mesh export exists.
- [ ] Passport export exists.
- [ ] Relay export exists.
- [ ] Vault export exists.
- [ ] Package JSON export exists.

Publish steps for release owner:

- [ ] Confirm npm organization and package permissions.
- [ ] Confirm npm 2FA/access policy.
- [ ] Confirm provenance/signing policy if used.
- [ ] Confirm package files include apps, packages, specs, and scripts needed by published bins.
- [ ] Confirm package excludes private keys, local bundles, credentials, logs, test exports with sensitive content, and customer data.
- [ ] Confirm publish notes say hosted cloud is not activated by package install.
- [ ] Publish from approved release credentials only.
- [ ] After publish, verify public install instructions on a clean machine or clean environment before broad announcement.

## 5. Token legal review readiness

No token page, token announcement, token allocation, token address, airdrop claim, operator compensation program, governance claim, or mainnet token launch may be published before counsel and board approval.

Required token posture:

- [ ] Token is framed as utility, governance participation, network access, operator bonding, anti-spam/job submission, and service settlement for optional relay/witness/gateway infrastructure.
- [ ] Token is not framed as equity, revenue share, profit right, dividend, ownership of Enigma, ownership of user data, guaranteed governance control, guaranteed access, or guaranteed compensation.
- [ ] No financial-upside, trading, secondary-market, scarcity-value, or guaranteed-compensation language appears in official materials.
- [ ] Local Enigma memory, MCP, and offline receipt verification are documented as useful without token ownership wherever technically true.
- [ ] Raw memories, prompts, transcripts, embeddings, ACL bodies, and personal data are prohibited from Solana/on-chain storage.
- [ ] Any operator compensation is described as payment or subsidy for verifiable relay/witness/gateway work under published network rules, not holder compensation.
- [ ] Jurisdiction, eligibility, sanctions, tax, transfer restriction, and consumer-protection review is complete.
- [ ] Token materials say legal review is required before publication if they are drafts.

Recommended draft token values for board/legal review:

| Item | Recommended draft value | Review status |
| --- | --- | --- |
| Token name | Enigma | Board/legal review required |
| Symbol | ENIGMA | Board/legal review required |
| Network | Solana | Board/legal/engineering review required |
| Token role | Utility, governance participation, network access, operator bonding, anti-spam/job submission, and service settlement for optional relay/witness/gateway infrastructure | Board/legal review required |
| Token program default | SPL Token for broad compatibility | Board/legal/engineering review required |
| Token-2022 fallback | Use Token-2022 only if metadata/extension requirements justify launch-time compatibility tradeoffs | Board/legal/engineering review required |
| Token-2022 extensions if used | MetadataPointer and TokenMetadata for canonical name, symbol, URI, update authority, and custom metadata | Board/legal/engineering review required |
| Supply posture | Fixed maximum supply after initial distribution setup; mint authority disabled or moved to transparent multisig/governance under published conditions | Board/legal review required |
| Freeze/admin posture | No surprise freeze/permanent-delegate controls; any emergency control must have public scope, controller, timelock or emergency policy, and sunset plan | Board/legal/security review required |
| Operator bonding | Active-service bonding for relays, witnesses, and gateways | Board/legal review required |
| Governance scope | Fee bands, operator registry thresholds, witness quorum parameters, grants/service budgets, schema upgrades, treasury policy for network operations, deprecation schedules | Board/legal review required |
| Governance exclusions | Company equity, dividends, company revenue, employees, private contracts, private memories, user custody, retroactive receipt modification, token-market outcomes | Board/legal review required |

Required token docs before launch:

- [ ] Token Utility & Non-Equity Notice.
- [ ] Network Services and Fee Schedule.
- [ ] Operator Bonding, Slashing, and Challenge Spec.
- [ ] Witness/Receipt Protocol Spec.
- [ ] Governance Charter.
- [ ] Supply, Allocation, Vesting, and Unlock Schedule.
- [ ] Treasury and Service-Subsidy Policy.
- [ ] Solana Mint/Program/Authority Map.
- [ ] Risk Disclosures.
- [ ] Terms of Use, Privacy Notice, and Sanctions/Eligibility Policy.
- [ ] Admin/Emergency Controls and Incident Response Policy.
- [ ] Marketing Claims Policy.

## 6. Solana devnet rehearsal

Solana facts to use accurately:

- [ ] SPL tokens use Mint Accounts and Token Accounts.
- [ ] Token-2022 adds optional extensions.
- [ ] Most Token-2022 extensions must be planned at mint creation.
- [ ] MetadataPointer points to metadata.
- [ ] TokenMetadata can store name, symbol, URI, update authority, and custom metadata on the mint.

Devnet rehearsal must be completed before mainnet launch claims:

- [ ] Choose SPL Token or Token-2022 for devnet rehearsal and document why.
- [ ] Create a devnet mint with launch-candidate decimals, supply, metadata plan, and authorities.
- [ ] If Token-2022 is used, allocate mint size/rent for MetadataPointer and TokenMetadata before mint creation.
- [ ] Create associated token accounts for test users/operators.
- [ ] Rehearse mint authority assignment, freeze authority policy, metadata update authority, treasury authority, operator registry authority, gateway registry authority, and governance authority.
- [ ] Rehearse disabling mint authority or transferring it to a named multisig/governance process if fixed-supply posture is approved.
- [ ] Rehearse service-unit accounting for relay writes, witness checkpoint jobs, gateway decisions, receipt anchoring batches, retrieval/egress, priority routing, and spam-resistant submissions.
- [ ] Rehearse operator bonding, unbonding delay, challenge period, evidence submission, and objective slashing cases on devnet.
- [ ] Rehearse witness checkpoint anchoring with opaque roots only.
- [ ] Rehearse that receipt verification remains possible from local export artifacts without requiring Solana RPC for every historical verification.
- [ ] Rehearse governance proposals or multisig transactions for fee bands, witness quorum, operator threshold, metadata update, and emergency pause if applicable.
- [ ] Rehearse incident scenarios: wrong metadata URI, wrong authority, stuck escrow, failed witness quorum, Solana congestion, bad operator signature, and accidental plaintext submission attempt.
- [ ] Publish devnet addresses only as devnet rehearsal addresses, not production addresses.
- [ ] Counsel approves any public devnet faucet, operator waitlist, points, credits, or token-like distribution language before publication.

Devnet rehearsal evidence to retain internally:

- [ ] Mint address.
- [ ] Token program id.
- [ ] Metadata URI and hash.
- [ ] Authority map.
- [ ] Multisig/governance addresses and thresholds.
- [ ] Program ids for service escrow, operator registry, bonding, slashing/challenges, witness receipt anchoring, treasury, and governance if deployed.
- [ ] Devnet transaction signatures.
- [ ] Service-unit fee schedule version.
- [ ] Operator registration records.
- [ ] Challenge/slashing test records.
- [ ] Incident rehearsal notes.
- [ ] Legal approval record for any public statement.

## 7. Mainnet token launch readiness

Mainnet launch is not approved until every item in this section is complete.

- [ ] Counsel approves token classification, distribution, eligibility, sanctions/geofencing, transfer restrictions if any, tax posture, marketing copy, risk disclosures, terms, privacy notice, and community moderation policy.
- [ ] Board approves token name, symbol, supply, allocations, vesting, lockups, treasury, governance scope, operator bonding, service fee model, and authority map.
- [ ] Engineering signs off the mint/program choice: SPL Token or Token-2022.
- [ ] If Token-2022 is used, engineering signs off all extensions at mint creation and documents wallet/exchange/composability tradeoffs.
- [ ] Mint account, token accounts, metadata, URI, update authority, mint authority, freeze authority, treasury, and governance/multisig addresses are recorded in the Solana Authority Map.
- [ ] Any mint/freeze/admin authority is controlled by a named multisig or governance process with published threshold, signer policy, timelock or emergency policy, rotation policy, and sunset/renunciation plan.
- [ ] Token docs say token ownership does not grant equity, revenue rights, profit rights, ownership of Enigma, ownership of company assets, ownership of user data, or guaranteed governance outcomes.
- [ ] Token docs say network services may fail, change, pause, or be discontinued.
- [ ] Token docs disclose Solana congestion, outages, wallet incompatibility, smart-contract risk, governance capture, slashing risk, custody/key risk, metadata leakage risk, and legal/regulatory risk.
- [ ] Operator compensation, if any, is tied to verified service work and published service budgets; no holder-based staking product is described.
- [ ] Enterprise access path supports fiat/invoiced or abstracted gateway credits where appropriate; enterprise customers are not forced into token custody unless legally and commercially approved.
- [ ] Explorer links for mainnet mint/program/authority addresses are ready before publication.
- [ ] Public materials do not publish any address until final address verification is complete.
- [ ] Emergency pause/communication process is approved for token/network incidents.

## 8. Website readiness

Homepage:

- [ ] Hero positions Enigma as provider-neutral AI memory/proof infrastructure.
- [ ] Primary CTA is product-first: install locally, connect MCP, create first verifiable memory, or verify a receipt.
- [ ] Token CTA, if present, is secondary and says utility/governance/network access only.
- [ ] Homepage states current status accurately: local production foundation and installable package scaffolding; hosted cloud only when infrastructure is deployed.
- [ ] Homepage includes proof boundary language.

Product pages:

- [ ] Install page links to `15_USER_INSTALL_GUIDE.md` content or equivalent public docs.
- [ ] MCP page includes supported clients and generic MCP JSON.
- [ ] Receipt verification page includes expected verifier report fields and failure boundaries.
- [ ] Trust page explains local-first custody, provider neutrality, receipts, relay/witness/gateway roles, and non-guarantees.
- [ ] Enterprise page says Enigma supports audits/governance with evidence but does not claim certification unless separately audited.
- [ ] Network/token page, if published, is utility-only and legal-approved.

Website safety:

- [ ] No financial-upside CTA.
- [ ] No trading, secondary-market, scarcity-value, or guaranteed-compensation language.
- [ ] No provider deletion or model forgetting claims.
- [ ] No raw-memory-on-chain implication.
- [ ] No hosted-cloud-live language without infrastructure.
- [ ] Security contact is visible.
- [ ] Terms, privacy notice, token risk disclosures, and support contact are linked where applicable.

## 9. Community readiness

Channels:

- [ ] Community hub exists.
- [ ] Install-help channel exists.
- [ ] Receipts/proof channel exists.
- [ ] Builders/MCP channel exists.
- [ ] Enterprise questions channel exists.
- [ ] Token utility/governance channel exists only with pinned boundaries and active moderation.
- [ ] Operator waitlist or operator discussion channel uses legal-approved language.

Pinned moderation copy:

```text
Enigma token materials are about utility, governance participation, and access/coordination for network roles such as relay, witness, and gateway. Token ownership is not equity and does not promise revenue, profit, guaranteed compensation, or financial upside. Local Enigma memory and offline receipt verification are product utilities independent of token speculation.
```

Community rules:

- [ ] Remove or correct financial-upside, trading, secondary-market, guaranteed-compensation, equity, dividend, and revenue-share framing.
- [ ] Redirect speculative token questions to utility, governance, network access, and legal-review status.
- [ ] Do not allow claims that token governance controls private user memories, company employees, company revenue, or customer contracts.
- [ ] Do not allow claims that Enigma proves provider deletion or model forgetting.
- [ ] Keep product-support and token-discussion channels separate.
- [ ] Escalate security reports privately through the security process.

Launch-week community plan:

- [ ] Day 1: category and product announcement.
- [ ] Day 2: local install walkthrough.
- [ ] Day 3: receipt verification challenge.
- [ ] Day 4: MCP/client connector office hours.
- [ ] Day 5: utility/governance/network education AMA with legal-approved token caution.
- [ ] Day 6: enterprise/security architecture session.
- [ ] Day 7: community demo showcase.

## 10. Security readiness

Product security:

- [ ] No docs instruct users to publish raw memory plaintext; receipts, relay/witness artifacts, SIEM events, and public proof artifacts remain plaintext-minimized.
- [ ] Relay docs and demos reject plaintext-looking memory fields.
- [ ] Gateway SIEM/export docs are plaintext-minimized.
- [ ] Browser extension docs prohibit raw memory in extension sync storage.
- [ ] Native messaging host setup explains local trust boundary.
- [ ] Desktop scaffold docs say UI state is operational evidence only.
- [ ] Package publish excludes secrets, local bundles, logs, credentials, private keys, and real customer data.
- [ ] MCP docs explain the client can send approved context into provider pages/tools; users must understand what they approve.
- [ ] Import docs preserve source limitations and do not imply imported provider exports are complete.

Operational security:

- [ ] Security contact and disclosure path are published.
- [ ] Vulnerability triage owner is assigned.
- [ ] Secrets live outside the repo.
- [ ] Release credentials use approved access controls.
- [ ] Hosted/BYOC/on-prem deployments use KMS/secrets, TLS, durable storage, backups, monitoring, least privilege, and the BYOC runbook acceptance tests before marketed availability.
- [ ] Admin authority changes require multisig/governance approval where applicable.
- [ ] Token/network admin keys have documented thresholds, rotation, revocation, and emergency process before public launch.

Security review topics:

- [ ] Receipt canonicalization and signature verification.
- [ ] Receipt-chain and checkpoint verification.
- [ ] MCP tool input/output boundaries.
- [ ] Connector config merge and backup behavior.
- [ ] Browser extension native messaging boundary.
- [ ] Relay plaintext-field rejection.
- [ ] Gateway policy default-deny behavior.
- [ ] SIEM plaintext minimization.
- [ ] Importer limitations/completeness preservation.
- [ ] Package side effects and bin behavior.
- [ ] Solana authority and token/program risks if token materials are published.

## 11. Support readiness

Support surfaces:

- [ ] Install support contact/channel.
- [ ] MCP connector support contact/channel.
- [ ] Receipt verification support path.
- [ ] Enterprise pilot support path.
- [ ] Security disclosure path.
- [ ] Community moderation escalation path.
- [ ] Token/network questions path with legal-approved responses only.

Support macros:

- [ ] Command not found: reinstall globally or use direct node bin path.
- [ ] MCP cannot find bundle: set `ENIGMA_BUNDLE` to an absolute path.
- [ ] MCP tools missing: run manual handshake and check client reload.
- [ ] Verify reports missing receipts: create a memory/context/export before verifying.
- [ ] Connector write failed: generate snippets with `--out` and apply manually.
- [ ] Browser extension disconnected: check native host `com.enigma.native_host` and explicit approval flow.
- [ ] Relay rejects payload: remove plaintext-looking fields and send only opaque encrypted record metadata.
- [ ] Gateway denies request: inspect provider, model, region, purpose, sensitivity, operation, legal hold, and policy.
- [ ] Token question: respond with utility/governance/network-access posture and legal-review status; do not discuss financial-upside topics.

Support metrics:

- [ ] Install success rate.
- [ ] MCP connection success rate.
- [ ] Verification success rate.
- [ ] Most common connector failures.
- [ ] Browser extension connection failures.
- [ ] Relay/gateway demo failures.
- [ ] Documentation confusion reports.
- [ ] Community moderation interventions.
- [ ] Security reports and response time.

## 12. Monitoring readiness

Product and package monitoring:

- [ ] Package publication status.
- [ ] Package install errors reported by users.
- [ ] Docs 404s and broken links.
- [ ] Website uptime.
- [ ] Download/install conversion.
- [ ] Support volume by category.
- [ ] Community moderation queues.

Hosted or BYOC monitoring before marketed availability:

- [ ] Relay health.
- [ ] Gateway health.
- [ ] Durable storage health.
- [ ] KMS/secrets access.
- [ ] TLS certificate expiry.
- [ ] Backup completion and restore rehearsal.
- [ ] Error rate and latency.
- [ ] Witness checkpoint failures.
- [ ] Gateway decision denial spikes.
- [ ] SIEM export failures.
- [ ] Plaintext rejection events.
- [ ] Admin authority changes.
- [ ] Incident alerts.

Token/network monitoring before mainnet claims:

- [ ] Mint/program authority transactions.
- [ ] Governance proposal creation and execution.
- [ ] Treasury movement.
- [ ] Operator registrations.
- [ ] Bond/unbond activity.
- [ ] Challenge/slashing events.
- [ ] Service escrow failures.
- [ ] Witness quorum failures.
- [ ] Solana congestion or RPC failures.
- [ ] Metadata URI availability and integrity.
- [ ] Community speculation/moderation spikes.

## 13. Incident response readiness

Severity matrix:

| Severity | Examples | Required response |
| --- | --- | --- |
| Sev 0 | Private key leak, release credential compromise, token mint/admin compromise, live customer data exposure, malicious package publication | Immediate incident commander, freeze/pause where approved, revoke credentials, public holding statement, forensic preservation, counsel notification, post-incident report. |
| Sev 1 | Verifier false positive/negative, receipt-chain integrity bug, relay accepting plaintext, gateway policy bypass, native messaging vulnerability | Stop affected launch claims, publish advisory if user action is needed, patch, document scope, update demos/docs. |
| Sev 2 | Package install failure, MCP connector config bug, docs causing user data exposure risk, hosted relay/gateway outage if marketed live | Support notice, workaround, patch, monitor recurrence. |
| Sev 3 | Website outage, broken docs link, community misinformation, demo script mismatch | Fix content, correct community messages, update support macros. |

Incident roles:

- [ ] Incident commander.
- [ ] Engineering owner.
- [ ] Security owner.
- [ ] Communications owner.
- [ ] Support owner.
- [ ] Legal/counsel contact.
- [ ] Community moderator lead.
- [ ] Token/network authority signer contacts if applicable.

Required incident materials:

- [ ] Private escalation channel.
- [ ] Public holding statement template.
- [ ] Customer/user advisory template.
- [ ] Token/network advisory template with no market commentary.
- [ ] Security advisory template.
- [ ] Postmortem template.
- [ ] Credential revocation checklist.
- [ ] Package unpublish/deprecate policy reviewed by counsel and release owner.
- [ ] Token/network pause or authority-change process if applicable.

Incident communication rules:

- [ ] State what is known, what is affected, and what users should do.
- [ ] Do not speculate about token markets or secondary-market impact.
- [ ] Do not overclaim remediation beyond observed facts.
- [ ] Preserve proof artifacts and logs needed for review.
- [ ] Publish correction if any official claim was inaccurate.

## 14. Final launch-day sequence

Product-first launch sequence:

- [ ] Freeze public docs and launch copy.
- [ ] Confirm package publish readiness.
- [ ] Publish package when release owner approves.
- [ ] Verify install guide commands on clean environment before broad announcement.
- [ ] Publish website with install/MCP/verify CTAs.
- [ ] Publish user install guide.
- [ ] Publish demo scripts or demo video.
- [ ] Open support/community channels.
- [ ] Announce local install and receipt verification challenge.
- [ ] Monitor install, support, website, community, and security channels.
- [ ] Correct claim-boundary mistakes immediately.

Enterprise sequence:

- [ ] Publish enterprise page only with accurate deployment availability.
- [ ] Offer private pilot or architecture review.
- [ ] Share security materials and proof-boundary language.
- [ ] Do not claim hosted production readiness until infrastructure gates pass.
- [ ] For BYOC or on-prem pilots, share `enigma/docs/enterprise-byoc-runbook.md`, confirm customer-controlled responsibilities, and require legal/security review before any compliance-status claim.

Token/network sequence:

- [ ] Keep token/network content unpublished until legal/board approval.
- [ ] Complete Solana devnet rehearsal before mainnet address publication.
- [ ] Publish utility/non-equity notice before any token address or distribution details.
- [ ] Publish network role docs, governance charter, authority map, risk disclosures, and terms before mainnet launch.
- [ ] Announce only utility/governance/network-access facts approved by counsel.
- [ ] Monitor and correct community speculation.

## 15. Launch approval record

Use this table in the launch war room. A typed name or ticket link is acceptable only if the organization treats it as an approval record.

| Area | Approver | Status | Evidence |
| --- | --- | --- | --- |
| Product readiness | Engineering lead | Not approved until signed | Local install, MCP, verifier, relay, gateway evidence |
| Documentation readiness | Developer relations lead | Not approved until signed | Docs reviewed against current CLI/docs |
| Package publish | Release lead | Not approved until signed | Package metadata, files, credentials, clean install |
| Security readiness | Security lead | Not approved until signed | Security review notes and disclosure process |
| Hosted/BYOC readiness | Infrastructure lead | Not approved until signed | Infrastructure readiness, BYOC runbook acceptance evidence, or public copy says not live |
| Support readiness | Support lead | Not approved until signed | Channels, macros, escalation owners |
| Community readiness | Community lead | Not approved until signed | Moderation rules and pinned token boundaries |
| Token legal review | Counsel and board | Not approved until signed | Legal memo, board approval, token docs, authority map |
| Solana devnet rehearsal | Engineering and counsel | Not approved until signed | Devnet evidence and public-language approval |
| Mainnet token launch | Counsel, board, engineering, security | Not approved until signed | Mainnet authority map, risk docs, terms, approvals |
| Incident response | Incident commander | Not approved until signed | Severity matrix, contacts, templates |

## 16. Final no-go triggers

Stop launch or pull the affected asset if any of these are true:

- [ ] A public asset says hosted Enigma cloud is live before infrastructure exists.
- [ ] A public asset claims provider deletion, model forgetting, semantic forgetting, complete side-channel absence, guaranteed compliance, or unapproved SOC 2, HIPAA, GDPR, certification, or regulatory status.
- [ ] A token asset contains financial-upside, trading, secondary-market, scarcity-value, guaranteed-compensation, equity, dividend, revenue-share, or ownership language.
- [ ] A token asset lacks legal-review status or required non-equity/no-financial-upside language.
- [ ] A Solana address, mint authority, freeze authority, metadata authority, treasury authority, or governance authority is published before final verification.
- [ ] A package artifact includes secrets, private keys, local bundles, credentials, logs with sensitive data, or customer data.
- [ ] A relay/gateway demo or doc instructs users to send raw memory plaintext to public/network endpoints.
- [ ] A verifier or receipt demo cannot produce an `ok: true` verification report for valid local exports.
- [ ] Security contact, support channel, or incident commander is missing.
