#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_REF_KEYS } from './validate-hosted-backend-live.mjs';
import { groupHostedRefsByWorkstream } from './hosted-ref-workstreams.mjs';

export const HOSTED_REF_DRAFT_SCHEMA = 'enigma.hosted_ref_draft.v1';

const SECRET_LOOKING_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/iu;
const NON_PUBLIC_KEY_RE = /(?:token|password|secret|cookie|account[_-]?id|raw[_-]?memory|private[_-]?key)/iu;
const EDGE_TO_PARTIAL_REFS = Object.freeze({
  backend_host: 'Cloudflare Worker custom-domain hosts are live for relay/gateway bootstrap, but not the full hosted data plane.',
  dns_tls: 'Cloudflare public DNS/TLS routes the relay/gateway bootstrap hosts, but full hosted readiness still needs completed /readyz refs.',
  relay_deployment: 'Relay bootstrap Worker is live and fail-closed; production relay deployment evidence is still required.',
  gateway_deployment: 'Gateway bootstrap Worker is live and fail-closed; production gateway deployment evidence is still required.',
});

function assertPublicSafe(value, path = 'value', seen = new WeakSet()) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (SECRET_LOOKING_RE.test(value)) throw new Error(`${path} contains secret-looking material`);
    return;
  }
  if (typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPublicSafe(item, `${path}[${index}]`, seen));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (NON_PUBLIC_KEY_RE.test(key)) throw new Error(`${path}.${key} is not allowed in public hosted-ref drafts`);
    if (key === 'claim_boundary') continue;
    assertPublicSafe(nested, `${path}.${key}`, seen);
  }
}

function requireObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  assertPublicSafe(value, label);
  return value;
}

function edgeServiceReady(edgeLive, kind, expectedService) {
  const service = edgeLive.services?.[kind];
  return service?.service === expectedService
    && service?.dns?.ok === true
    && service?.probes?.livez?.status_code === 200
    && service?.probes?.livez?.body?.service === expectedService
    && service?.probes?.readyz?.status_code === 503
    && service?.probes?.readyz?.body?.missing_evidence_ref_count === REQUIRED_REF_KEYS.length;
}

function partialRefValue(key, edgeLive) {
  switch (key) {
    case 'backend_host': return `edge-bootstrap://${edgeLive.domain}/relay+gateway`;
    case 'dns_tls': return `cloudflare-custom-domain://${edgeLive.domain}/relay+gateway`;
    case 'relay_deployment': return `cloudflare-worker-custom-domain://relay.${edgeLive.domain}`;
    case 'gateway_deployment': return `cloudflare-worker-custom-domain://gateway.${edgeLive.domain}`;
    default: return null;
  }
}

export function buildHostedRefDraft(inputs, options = {}) {
  const edgeLive = requireObject(inputs.edgeLive, 'edge_live');
  if (edgeLive.schema !== 'enigma.edge_backend_bootstrap_live_evidence.v1') throw new Error('edge live schema mismatch');
  const relayReady = edgeServiceReady(edgeLive, 'relay', 'enigma-relay');
  const gatewayReady = edgeServiceReady(edgeLive, 'gateway', 'enigma-gateway');
  const partialRefs = {};
  if (edgeLive.ok === true && relayReady && gatewayReady) {
    for (const [key, reason] of Object.entries(EDGE_TO_PARTIAL_REFS)) {
      partialRefs[key] = {
        ref: partialRefValue(key, edgeLive),
        status: 'partial_edge_bootstrap_only',
        complete: false,
        reason,
        required_next_evidence: 'Replace this draft with a complete hosted readiness ref before operator acceptance go.',
      };
    }
  }
  const partialKeys = Object.keys(partialRefs);
  const remainingRefs = REQUIRED_REF_KEYS.filter((key) => !partialKeys.includes(key));
  const stillIncompleteRefs = REQUIRED_REF_KEYS.filter((key) => !partialRefs[key]?.complete);
  return {
    schema: HOSTED_REF_DRAFT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date().toISOString(),
    status: partialKeys.length > 0 ? 'partial_edge_bootstrap_only' : 'blocked_no_edge_bootstrap_evidence',
    complete: false,
    launch_ready: false,
    hosted_backend_live_ready: false,
    domain: edgeLive.domain,
    required_ref_count: REQUIRED_REF_KEYS.length,
    complete_ref_count: 0,
    partial_ref_count: partialKeys.length,
    partial_refs: partialRefs,
    remaining_refs: remainingRefs,
    still_incomplete_refs: stillIncompleteRefs,
    missing_ref_groups: groupHostedRefsByWorkstream(stillIncompleteRefs),
    acceptance_rule: 'Do not feed partial_refs directly into production:hosted-live or operator acceptance as complete refs.',
    claim_boundary: [
      'This draft converts live edge bootstrap evidence into operator-friendly partial refs only.',
      'Partial refs do not satisfy hosted_backend_live, /readyz production readiness, storage, KMS, SIEM/log sink, backup/restore, support, legal/compliance, or operator acceptance.',
      'complete stays false until all 25 hosted refs are real complete evidence and hosted-live/operator validators pass.',
    ],
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = { edgeLive: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--edge-live') out.edgeLive = argv[++index];
    else if (arg === '--out') out.output = argv[++index];
    else if (arg === '--help') out.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  return out;
}

function usage() {
  return 'Usage: node scripts/build-hosted-ref-draft.mjs --edge-live <edge-backend-bootstrap-live.json> [--out hosted-ref-draft.json]\n\nBuilds public-safe partial hosted-ref draft evidence from live edge bootstrap probes. It does not certify hosted production readiness.\n';
}

async function readJson(path, label) {
  const parsed = JSON.parse(await readFile(resolve(path), 'utf8'));
  return requireObject(parsed, label);
}

async function main() {
  const args = parseArgs();
  if (args.help || !args.edgeLive) {
    process.stdout.write(usage());
    process.exitCode = args.help ? 0 : 1;
    return;
  }
  const draft = buildHostedRefDraft({ edgeLive: await readJson(args.edgeLive, 'edge_live') });
  if (args.output) await writeFile(resolve(args.output), `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ ok: true, schema: draft.schema, status: draft.status, complete: draft.complete, partial_ref_count: draft.partial_ref_count, complete_ref_count: draft.complete_ref_count, out: args.output ? '<hosted-ref-draft-output>' : null }, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  });
}
