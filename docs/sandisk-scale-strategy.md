# Sandisk-scale Enigma strategy

## Thesis

Enigma becomes a hundred-billion-dollar category only if it stops being an app and becomes the trusted memory substrate for AI. The winning company does not own every model, chat app, IDE, enterprise copilot, or agent harness. It owns the portable memory and proof layer that all of them can use.

The analogy is SanDisk:

- SanDisk did not need to own every camera or laptop.
- It made storage portable, standardized, affordable, and trusted.
- Enigma should not need to own every AI assistant.
- It should make AI memory portable, standardized, encrypted, verifiable, and trusted.

## Category name

**Verifiable AI Memory Infrastructure**

Consumer phrase:

> Your AI memory card.

Developer phrase:

> Provider-neutral memory and proof for every AI runtime.

Enterprise phrase:

> Customer-owned AI memory control plane with offline-verifiable lifecycle, Enigma-controlled deletion receipts, residency, and boundary receipts.

## What must be true for Enigma to matter

Enigma must become the place where durable AI memory lives by default.

That means:

1. every AI client can connect through MCP or a browser/desktop bridge,
2. every developer can add Enigma memory with one SDK call or MCP config,
3. every enterprise can keep memory outside model providers,
4. every memory operation can produce a receipt,
5. every proof bundle can verify offline,
6. every vendor can adopt the format without surrendering its own product.

The standard is the moat.

## Strategic control points

### 1. Portable Memory Passport

This is the consumer wedge. Users should be able to leave ChatGPT, Claude, Kimi, Cursor, or any new AI product without losing their accumulated AI relationship.

Enigma wins if users start asking:

> Does this AI support my Enigma Passport?

### 2. MCP as the universal insertion point

MCP is the shortest path to distribution across AI tools and harnesses. Enigma should be the default MCP memory server.

The install promise:

```bash
npx --yes --package enigma-memory enigma install
npx --yes --package enigma-memory enigma claude-mcpb package --plain
npx --yes --package enigma-memory enigma connect cursor
npx --yes --package enigma-memory enigma connect kimi-code
```

### 3. Browser extension for subscription AI

MCP does not cover every web subscription. The browser extension covers ChatGPT, Claude, Kimi, Perplexity, and future web apps through explicit user-approved context injection.

This makes Enigma usable before providers officially integrate.

### 4. Desktop app for normal people

CLI is not enough for a mass-market memory company. Enigma Desktop should manage vaults, receipts, clients, imports, Enigma-controlled deletion receipts, and sync without terminal work.

The desktop app is the consumer trust surface.

### 5. Encrypted relay and witness network

The network should sync encrypted capsules and witness roots, not plaintext memory. This creates decentralized trust without turning user memory into blockchain data.

Enigma Cloud should be a convenience layer, not a plaintext custody dependency.

### 6. Enterprise gateway

Enterprise buyers need policy before memory leaves their boundary. The gateway must sit in front of model providers and prove decisions.

Enterprise wedge:

- BYOK/KMS evidence,
- residency denial,
- legal hold,
- SIEM events,
- provider/model allowlists,
- offline verification.

### 7. Physical memory ladder

The hardware should make the memory layer tangible without overclaiming compute, external deletion, external forgetting, or resistance to physical compromise.

Product ladder:

- **Witness Vault V1** — $50-$100 proof/custody object: local receipts, offline verification, device identity sidecar, visible status, and optional encrypted proof/export handoff.
- **Memory Vault One / Memory Node** — Pi 5/NVMe locality-cache prototype for encrypted memory bundles, vector/index locality, local verification, and home/small-office witness work.
- **Enterprise Memory Gateway** — N100/N150/edge/rack appliance with TPM, NVMe, governed policy boundary, minimized SIEM export, KMS/BYOK hooks, and witness checkpoints.

Approved line:

> Witness Vault is the AI memory card people can see. Memory Node is the local AI memory cache people can feel. Gateway is the enterprise boundary people can audit.

Boundary:

- hardware does not prove events inside closed providers,
- hardware does not prove changes to model weights,
- hardware does not claim accelerator-class compute advantage,
- secure elements/TPMs support identity and key workflows but do not make the appliance resistant to physical compromise.

## Business model

### Free

- local vault,
- CLI,
- MCP server,
- verifier,
- limited connectors.

### Pro

- desktop app,
- encrypted sync,
- browser extension premium features,
- multi-device backup,
- advanced imports,
- receipt explorer.

### Developer

- SDKs,
- hosted relay quotas,
- team capsules,
- app integration keys,
- verification API.

### Enterprise

- gateway,
- BYOC/VPC/on-prem,
- SSO/SCIM,
- KMS/BYOK,
- SIEM/eDiscovery,
- legal hold,
- admin policy,
- support/SLA.

### Ecosystem

- certification program: “Enigma Passport Compatible”,
- vendor verification suite,
- partner marketplace for importers/connectors,
- witness network participation.

## Network effects

Enigma becomes stronger when:

- users bring Passports to more AI products,
- developers support Enigma to avoid building memory from scratch,
- enterprises require Enigma receipts in procurement,
- auditors learn Enigma proof bundles,
- vendors advertise Enigma compatibility.

The flywheel:

```text
more users -> more clients support Enigma -> more memory value -> more enterprise demand -> more proof standard adoption -> more users
```

## Standards strategy

Keep the protocol open enough to become a standard while monetizing convenience, enterprise control, sync, verification services, and hosted infrastructure.

Open:

- receipt schemas,
- verifier,
- MCP server,
- Passport/Capsule format,
- basic SDKs.

Paid:

- managed encrypted sync,
- enterprise gateway,
- hosted witness logs,
- admin controls,
- compliance exports,
- desktop Pro,
- priority connectors.

## Acquisition-grade moat

A large AI platform, security company, cloud provider, or data infrastructure company would care if Enigma owns:

- cross-provider memory graph,
- user trust and custody brand,
- open proof standard,
- MCP distribution,
- enterprise gateway footprint,
- receipt/audit data model,
- importer ecosystem,
- browser/desktop presence.

Do not sell as “memory search.” Sell as the memory custody layer for AI.

## Product priority

### Now

- publishable package,
- MCP connectors,
- local verifier,
- desktop shell,
- browser bridge,
- importers,
- relay/gateway dev servers.

### Next

- real desktop wrapper,
- signed installers,
- hosted encrypted relay,
- account/device pairing,
- cloud witness logs,
- full browser extension packaging,
- SDK docs,
- enterprise gateway deployment template.

### Then

- mobile app,
- passkey identity,
- hardware-backed vault keys,
- vendor certification suite,
- paid hosted sync,
- marketplace connectors,
- external audit.

## Non-negotiable honesty

The company only becomes trusted if it refuses impossible claims.

Never claim:

- model weights changed because an app requested removal,
- closed providers physically erased everything,
- signed memory is true,
- semantic paraphrases are absent,
- uninstrumented side channels are covered.

Always claim:

- Enigma-owned memory state is verifiable,
- Enigma context injection is receipted,
- Enigma deletion removes memory from active serving state,
- Enigma proof bundles verify offline,
- declared boundaries are explicit.

## The billion-user UX

The winning UX is not cryptographic terminology. It is this:

```text
Install Enigma.
Connect your AI apps.
Import your memories.
Use any model.
Remove Enigma-served memory once.
Verify what happened.
Take it with you.
```

That is the SanDisk move for AI.
