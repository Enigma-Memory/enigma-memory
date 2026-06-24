# GPT-5.5 advisor + Kimi implementation operating plan

## Goal

Build Enigma into a world-class, broadly installable AI memory and proof layer: MCP-first, provider-neutral, decentralized where it improves custody, and enterprise-ready where buyers need policy, audit, residency, and key control.

Use the [overnight build master plan](overnight-build-master-plan.md) as the overnight command-center plan for phase order, parallel workstreams, review cadence, acceptance gates, and hosted/BYOC blockers through the 9:00 AM CST handoff.

## Role split

### GPT-5.5 architecture/design/review owner

GPT-5.5 is the architecture, design, review, and release-acceptance owner. GPT-5.5 owns:

- product thesis and claim boundaries,
- architecture decisions,
- protocol design,
- implementation briefs,
- test strategy,
- code review,
- release acceptance.

GPT-5.5 does not accept vague claims. Every feature needs proof, tests, or explicit out-of-scope language.

### Kimi Code implementation owner

Kimi Code is the implementation owner. Kimi Code owns:

- repository edits,
- package implementation,
- CLI/MCP/server wiring,
- tests and fixtures,
- bug fixes from GPT review.

Kimi Code must not invent new claims, weaken tests, add mocks for proof behavior, or make provider-native memory canonical.

## Build loop

1. GPT-5.5 writes an implementation brief for one slice.
2. Kimi implements only that slice.
3. Kimi runs targeted checks for that slice.
4. GPT-5.5 reviews code, tests, claims, and proof artifacts.
5. Kimi fixes review findings at the source.
6. GPT-5.5 accepts or rejects the slice.
7. Repeat until release gates pass.

## Production slices

### Slice 1 — Publishable universal installer

Goal: anyone can install Enigma locally.

Kimi builds:

- publish-ready package metadata,
- `enigma doctor`,
- `enigma install`,
- platform path handling for Windows/macOS/Linux,
- global binary validation,
- `npx` usage path,
- no-network local startup path.

Acceptance:

- `node apps/cli/bin/enigma.mjs doctor` passes on a clean checkout,
- package exports and bins are import-safe,
- no private package flag remains for the publishable package profile,
- install docs are generated from actual commands.

### Slice 2 — MCP client connectors

Goal: one command writes MCP config for common AI tools.

Kimi builds:

- `enigma connect claude-desktop`,
- `enigma connect cursor`,
- `enigma connect kimi-code`,
- `enigma connect vscode-cline`,
- `enigma connect roo`,
- `enigma connect opencode`,
- config backup/restore,
- `enigma disconnect <client>`.

Acceptance:

- generated config points at `enigma-mcp`,
- existing config is backed up before modification,
- Windows/macOS/Linux paths work,
- generated config validates as JSON,
- tests cover backup and idempotent reconnect.

### Slice 3 — Real MCP compatibility hardening

Goal: Enigma works with any MCP-speaking harness.

Kimi builds:

- JSON-RPC batch handling,
- MCP error shapes,
- protocol version reporting,
- resource/list support for Passport metadata,
- prompts/list support for standard memory prompts,
- stderr logging without corrupting stdout,
- stdio integration tests.

Acceptance:

- stdin/stdout smoke test passes,
- notifications do not emit responses,
- tool failures return MCP-compatible errors,
- no logs are written to stdout except JSON-RPC responses.

### Slice 4 — Browser extension bridge

Goal: Enigma works with web AI subscriptions.

Kimi builds:

- browser extension manifest,
- local native host bridge spec,
- ChatGPT/Claude/Kimi/Perplexity injection adapters,
- explicit user approval before prompt injection,
- injection receipts,
- extension-side no-provider-custody language.

Acceptance:

- extension can request a context pack from local Enigma,
- extension injects scoped context only after approval,
- injection receipt records target site and timestamp,
- extension never stores raw memory in browser sync storage.

### Slice 5 — Desktop app shell

Goal: normal users can run Enigma without terminal work.

Kimi builds:

- desktop shell scaffold,
- local daemon manager,
- vault status page,
- MCP server status page,
- client connection buttons,
- import/export UI,
- receipt viewer,
- delete-and-prove flow.

Acceptance:

- desktop can start/stop MCP server,
- user can create a vault,
- user can remember/delete/search memory,
- receipt viewer uses verifier output, not trust-me UI state.

### Slice 6 — Hosted relay and witness service

Goal: Enigma Cloud syncs encrypted state without plaintext custody.

Kimi builds:

- relay API for opaque encrypted capsule records,
- witness checkpoint endpoint,
- root anchoring log,
- account/device pairing protocol,
- replay/fork detection fixtures,
- local relay dev server.

Acceptance:

- relay rejects plaintext-looking records,
- witness signs roots only,
- verifier can validate witness signatures offline,
- relay cannot decrypt memory payloads.

### Slice 7 — Enterprise gateway

Goal: enterprise can enforce memory policy before model/provider egress.

Kimi builds:

- gateway HTTP service,
- policy admin file/API,
- BYOK/KMS metadata hooks,
- residency enforcement,
- legal hold enforcement,
- SIEM export stream,
- model/provider allowlists,
- egress decision receipts.

Acceptance:

- disallowed region denies memory injection,
- legal hold denies deletion,
- SIEM event contains hashes/ids/reason codes only,
- gateway decision verifies offline.

### Slice 8 — Import/export ecosystem

Goal: Enigma becomes the portable AI memory card.

Kimi builds:

- ChatGPT export importer,
- Claude memory importer,
- Mem0 importer/exporter,
- Letta AgentFile importer,
- LangGraph store importer,
- Zep/Graphiti episode importer,
- Enigma Capsule export/import.

Acceptance:

- imports preserve source limitations,
- import receipts are emitted,
- Capsule export verifies offline,
- no importer claims completeness unless the source proves completeness.

## GPT-5.5 review gates

For every slice, GPT-5.5 checks:

- Does this advance the SanDisk-for-AI thesis?
- Is the source of truth still Enigma-owned memory, not provider-native memory?
- Are receipts plaintext-minimized?
- Does offline verification work?
- Are failures fail-closed?
- Are tests adversarial, not only happy path?
- Are claims honest and narrow?
- Does the user-facing install path require the least possible technical knowledge?

## Kimi master instruction

Use this at the top of every Kimi task:

```text
You are implementing Enigma. GPT-5.5 owns architecture and claim boundaries. Do not change product claims, weaken proof semantics, or make provider-native memory canonical. Build the assigned slice completely with tests. Use Node builtins unless the slice explicitly allows a dependency. Do not add mocks for proof behavior. Fail closed on unknown paths. Raw memory plaintext must not appear in receipts, public roots, relay records, SIEM events, or witness artifacts.
```

## GPT-5.5 review instruction

Use this after every Kimi patch:

```text
Review this Enigma patch as advisor. Check architecture, security, proof integrity, portability, installability, and claim honesty. Reject any code that weakens offline verification, stores plaintext in proof artifacts, trusts provider-native memory as canonical, silently ignores unknown boundary paths, or ships happy-path-only tests. Return: ACCEPT, ACCEPT_WITH_FIXES, or REJECT, with exact files and fixes.
```
