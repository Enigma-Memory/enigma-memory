# Developer ecosystem

Enigma Memory is a local-first SDK, CLI, MCP server, and service-contract package. The developer surfaces are designed to be copied without secrets, cloud credentials, hidden local paths, or account identifiers.

## Copyable starting points

- SDK/API guide: [`docs/sdk-api.md`](./sdk-api.md)
- Node example app: [`examples/node-basic-memory.mjs`](../examples/node-basic-memory.mjs)
- GitHub Actions example: [`examples/ci/github-actions.yml`](../examples/ci/github-actions.yml)
- Benchmark reproducibility guide: [`docs/benchmark-reproducibility.md`](./benchmark-reproducibility.md)
- Generic MCP client template: [`templates/mcp-client-config.json`](../templates/mcp-client-config.json)

## Local SDK loop

Use the SDK when you want an app-owned vault and receipt-backed proof loop:

1. Create a local vault with `createVault`.
2. Add a generic, non-private memory with `remember`.
3. Create a passport with `createPassport`.
4. Compile a receipt-backed context pack with `compileContextPack`.
5. Export a proof-carrying bundle with `exportBundle`; keep full bundles private unless local import key material has been reviewed and removed.
6. Verify receipts with `verifyReceiptChain`, `enigma verify`, `enigma-verify`, or MCP `enigma_verify_receipts`.

The example app prints ids, counts, roots, and verification status only. It does not print raw memory text, generated key material, credentials, provider transcripts, or local absolute paths.

## CLI and CI loop

The CI example installs Node 24, installs the published `enigma-memory@0.1.4` package, runs:

```sh
npx enigma quickstart --overwrite
npx enigma doctor
npm run benchmark:memory-suite -- --out benchmark-report.json
```

and then runs a small ESM import smoke. It does not require GitHub secrets, cloud provider credentials, npm tokens, private bundles, or local path assumptions. The benchmark step writes a public-safe local JSON report using schema `enigma.memory_benchmark_suite.v1`; see the benchmark reproducibility guide for claim boundaries and the requirements for any future live third-party comparison.

Use the workflow as a template in a consumer repository. It is intentionally limited to install/import/doctor smoke coverage, local proof generation, and deterministic local benchmark evidence; it does not publish packages, deploy infrastructure, contact hosted Enigma cloud, or call external memory providers.

## MCP client loop

The generic MCP template uses the installed `enigma-mcp` command and exactly one environment placeholder:

```json
{
  "mcpServers": {
    "enigma": {
      "command": "enigma-mcp",
      "env": {
        "ENIGMA_BUNDLE": "<ENIGMA_BUNDLE>"
      }
    }
  }
}
```

Replace `<ENIGMA_BUNDLE>` with the bundle file you control, or with the client-specific environment expansion syntax if your MCP client supports it. Do not commit private bundle paths if they reveal local usernames, workspace names, account ids, or other personal details.

## Claim boundaries for developers

Enigma proof artifacts cover Enigma-controlled or Enigma-mediated state: local vault events, receipts, active/tombstoned memory addresses, context-pack retrieval/injection receipts, relay/gateway records, usage events, and settlement receipts.

They do not prove:

- provider-side deletion;
- model forgetting;
- compliance certification;
- token ROI, investment outcome, or provider invoice savings;
- hosted-cloud readiness from a local demo;
- benchmark leadership from SDK mechanics alone.

Benchmark claims require benchmark-specific evidence. LoCoMo covers long-term conversational memory QA, event summarization, and multimodal generation across long conversations. LongMemEval covers extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention. Agent-memory benchmark results can depend heavily on the agent/framework/tool loop, not only on the memory store. Keep those distinctions when writing integrations or public copy.

## What to keep out of examples

Do not add secrets, tokens, 2FA codes, cloud account ids, personal data, provider transcripts, raw private memory, absolute local paths, or unreviewed hosted endpoints to examples/templates. Public-safe examples should use generic ids, relative paths, placeholders, hashes, commitments, counts, receipt ids, and roots.
