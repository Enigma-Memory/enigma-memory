# Developer ecosystem

Enigma Memory is a local-first SDK, CLI, MCP server, and service-contract package. The developer surfaces are designed to be copied without secrets, cloud credentials, hidden local paths, or account identifiers.

## Public test-drive loop

For most developers, start with the installed CLI before reading the SDK internals or service contracts:

```sh
npm install -g enigma-memory
enigma test-drive --overwrite
```

`enigma test-drive --overwrite` is zero-credential, local-only, and public-safe by default. It writes an isolated demo under `.enigma/test-drive`, keeps the default bundle inside that directory, emits one JSON summary, and does not print raw private memory plaintext. Use `--dry-run` to preview without writing or `--out-dir <path>` to choose another isolated demo directory.

The test drive runs the local proof/demo path only: setup artifacts, search/status output, a cross-model demo report, and benchmark pointers. It does not call external providers, contact hosted Enigma SaaS, require OpenAI/Anthropic/Cloudflare credentials, create accounts, or write third-party client configs. Keep public claims bounded to local Enigma-controlled vault state, receipts, checkpoints, committed roots, exported bundle shape, and declared boundary operations.

To explicitly connect real local clients that are already installed or already configured:

```sh
enigma setup --connect-installed --overwrite
```

`--connect-installed` implies auto selection, writes only for installed/config-present clients, and skips missing configs instead of creating every default client config. Only explicit write flags mutate client configs; `enigma connect <client>` without `--dry-run` remains the single-client write path, and existing `enigma setup --write-connectors` behavior for explicit/default clients is unchanged. Treat provider-native memory as non-canonical cache only; the local Enigma vault is canonical.

## CLI memory passport loop

After the public test drive, create a regular local workspace when you want day-to-day CLI usage:

```sh
npm install -g enigma-memory
enigma setup --overwrite
```

`enigma setup --overwrite` is the safe default for a regular local workspace. It writes local Enigma artifacts under the workspace `.enigma` path and emits deterministic, public-safe JSON without printing raw memory plaintext. It does not write third-party app configs.

After setup, use the same local vault from the CLI or connected clients:

```sh
enigma remember --text-file ./memory.txt
enigma search --query "..."
enigma context --query "..." --optimize
enigma verify --export ./.enigma/export.json
enigma connect claude-desktop --dry-run
```

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

The CI example installs Node 24, installs the published `enigma-memory@0.1.11` package, runs:

```sh
npx --yes --package enigma-memory enigma test-drive --overwrite
npx --yes --package enigma-memory enigma setup --overwrite
npx --yes --package enigma-memory enigma doctor
npm run benchmark:memory-suite -- --out benchmark-report.json
```

and then runs a small ESM import smoke. It does not require GitHub secrets, cloud provider credentials, npm tokens, private bundles, local path assumptions, hosted Enigma SaaS, external memory-provider calls, or official dataset network downloads in normal CI. The test-drive and benchmark steps write public-safe local JSON reports; see the benchmark reproducibility guide for claim boundaries and the requirements for any future live third-party comparison.

The workflow also includes optional official-dataset benchmark preparation steps gated behind the manual `workflow_dispatch` input `run_standard_benchmark: true`. Normal `push` and `pull_request` runs skip them, so official dataset downloads are not required in normal CI. Enable the manual path only after the repository has reviewed network use and dataset-license handling:

```sh
node ./node_modules/enigma-memory/scripts/download-standard-benchmarks.mjs --dry-run
node ./node_modules/enigma-memory/scripts/download-standard-benchmarks.mjs --execute --dataset all --out-dir .enigma/benchmarks/datasets --manifest .enigma/benchmarks/dataset-manifest.json
node ./node_modules/enigma-memory/scripts/run-standard-memory-benchmarks.mjs --locomo .enigma/benchmarks/datasets/locomo10.json --longmemeval .enigma/benchmarks/datasets/longmemeval_s_cleaned.json --max-locomo-qa 25 --max-longmemeval-items 25 --top-k 5 --out .enigma/standard-memory-benchmark-sample.json
```

Those commands produce a dataset manifest with source URLs, byte sizes, and SHA-256 hashes plus a standard benchmark report using schema `enigma.standard_memory_benchmark_suite.v1`. The standard runner is retrieval/evidence proxy scoring only: it does not call providers, grade generated answers, or produce competitor scores.

Use the workflow as a template in a consumer repository. It is intentionally limited to install/import/doctor smoke coverage, local proof generation, and deterministic local benchmark evidence by default; it does not publish packages, deploy infrastructure, contact hosted Enigma cloud, call external memory providers, or download official benchmark datasets unless you intentionally enable `run_standard_benchmark` for a manual workflow run.

## MCP client loop

The same installed package can be used by Claude Desktop, Cursor, Kimi Code, or any generic MCP client. Run `enigma test-drive --overwrite` first if you want a zero-credential local proof before touching real client configs. The smooth setup path is `enigma setup --client auto --overwrite` to plan detected clients, then `enigma setup --connect-installed --overwrite` only when you explicitly want setup to write installed/config-present client configs. Manual snippets remain useful when a client needs a copied entry; replace the bundle path with the local path from your setup output, and restart the client.

Claude Desktop:

```json
{
  "mcpServers": {
    "enigma": {
      "command": "enigma-mcp",
      "args": [],
      "env": {
        "ENIGMA_BUNDLE": "/absolute/path/to/.enigma/bundle.json"
      }
    }
  }
}
```

Cursor:

```json
{
  "mcpServers": {
    "enigma": {
      "command": "enigma-mcp",
      "args": [],
      "env": {
        "ENIGMA_BUNDLE": "/absolute/path/to/.enigma/bundle.json"
      }
    }
  }
}
```

Kimi Code:

```json
{
  "mcpServers": {
    "enigma": {
      "command": "enigma-mcp",
      "args": [],
      "env": {
        "ENIGMA_BUNDLE": "/absolute/path/to/.enigma/bundle.json"
      }
    }
  }
}
```

Generic MCP:

```json
{
  "mcpServers": {
    "enigma": {
      "command": "enigma-mcp",
      "args": [],
      "env": {
        "ENIGMA_BUNDLE": "/absolute/path/to/.enigma/bundle.json"
      }
    }
  }
}
```

Do not commit private bundle paths if they reveal local usernames, workspace names, account ids, or other personal details.

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
