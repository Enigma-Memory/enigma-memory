#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLOUDFLARE_WORKER_INSPECTION_RESULT_SCHEMA = 'enigma.cloudflare_worker_inspection_result.v1';

const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|cf-[A-Za-z0-9_-]{12,}|raw memory|private prompt|full transcript|decrypted capsule)/iu;
const ACCOUNT_ID_RE = /\b[0-9a-f]{32}\b/iu;
const LOCAL_PATH_RE = /(?:[A-Z]:\\Users\\[^\r\n"']+|[A-Z]:\\tmp\\[^\r\n"']+|\/Users\/[^\r\n"']+|\/home\/[^\r\n"']+|\/tmp\/[^\r\n"']+|\/private\/tmp\/[^\r\n"']+|\/var\/folders\/[^\r\n"']+)/iu;
const FORBIDDEN_KEY_RE = /(?:password|passwd|pwd|api[_-]?key|private[_-]?key|secret|raw[_-]?memory|plaintext|plain[_-]?text|prompt|completion|transcript|provider[_-]?response|cookie|session)/iu;
const SAFE_KEY_RE = /^(?:tokenPrinted|token_printed|requiresToken|tokenScope|claimBoundary)$/u;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function blocker(message, path) {
  return { message, path };
}

function assertPublicSafe(value, path = 'worker_inspection') {
  if (typeof value === 'string') {
    if (SECRET_VALUE_RE.test(value) || ACCOUNT_ID_RE.test(value) || LOCAL_PATH_RE.test(value)) throw new Error(`${path} contains non-public diagnostic material`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPublicSafe(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_KEY_RE.test(key) && !SAFE_KEY_RE.test(key)) throw new Error(`${childPath} is not allowed in Worker inspection evidence`);
    assertPublicSafe(child, childPath);
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function numericStatus(value) {
  return Number.isSafeInteger(value) && value >= 100 && value <= 599;
}

function cloudflareErrorCode(evidence) {
  const errors = evidence?.response?.payload?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const code = errors[0]?.code;
  return Number.isSafeInteger(code) ? code : null;
}

export function validateCloudflareWorkerInspection(evidence, options = {}) {
  if (!isPlainObject(evidence)) throw new Error('Cloudflare Worker inspection evidence must be an object');
  assertPublicSafe(evidence);
  const blockers = [];
  const permissionBlockers = [];

  if (evidence.schema !== 'enigma.cloudflare_ops.v1') blockers.push(blocker('schema must be enigma.cloudflare_ops.v1', 'schema'));
  if (evidence.operation !== 'workers.inspect-probe') blockers.push(blocker('operation must be workers.inspect-probe', 'operation'));
  if (evidence.mutates_cloudflare !== false) blockers.push(blocker('mutates_cloudflare must be false', 'mutates_cloudflare'));
  if (evidence.execute !== true) blockers.push(blocker('execute must be true for an observed API inspection', 'execute'));
  if (evidence.tokenPrinted !== false) blockers.push(blocker('tokenPrinted must be false', 'tokenPrinted'));
  if (!nonEmptyString(evidence.service_name)) blockers.push(blocker('service_name is required', 'service_name'));
  if (typeof evidence.service_observed !== 'boolean') blockers.push(blocker('service_observed must be boolean', 'service_observed'));
  if (!numericStatus(evidence.status)) blockers.push(blocker('status must be HTTP status integer', 'status'));
  if (!isPlainObject(evidence.plan)) blockers.push(blocker('plan object is required', 'plan'));
  else {
    if (evidence.plan.operation !== 'workers.service') blockers.push(blocker('plan.operation must be workers.service', 'plan.operation'));
    if (evidence.plan.method !== 'GET') blockers.push(blocker('plan.method must be GET', 'plan.method'));
    if (evidence.plan.requiresToken !== true) blockers.push(blocker('plan.requiresToken must be true', 'plan.requiresToken'));
    if (evidence.plan.tokenPrinted !== false) blockers.push(blocker('plan.tokenPrinted must be false', 'plan.tokenPrinted'));
    if (evidence.plan.tokenScope !== 'account') blockers.push(blocker('plan.tokenScope must be account', 'plan.tokenScope'));
    if (!nonEmptyString(evidence.plan.url) || !String(evidence.plan.url).includes('/accounts/<account-id>/workers/services/')) blockers.push(blocker('plan.url must be account-redacted Worker service URL', 'plan.url'));
  }
  if (!isPlainObject(evidence.response)) blockers.push(blocker('response object is required', 'response'));
  else if (!numericStatus(evidence.response.status) || evidence.response.status !== evidence.status) blockers.push(blocker('response.status must match status', 'response.status'));

  const code = cloudflareErrorCode(evidence);
  const visibleServiceReady = evidence.ok === true && evidence.status >= 200 && evidence.status < 300 && evidence.service_observed === true && Array.isArray(evidence.blockers) && evidence.blockers.length === 0;
  const missingServicePermissionReady = evidence.ok === false && evidence.status === 404 && code === 10090 && evidence.service_observed === false;
  const workerPermissionReady = visibleServiceReady || missingServicePermissionReady;
  if (evidence.ok === true && !visibleServiceReady) blockers.push(blocker('ok:true requires 2xx status, service_observed:true, and zero blockers', 'ok'));
  if (evidence.ok === false) {
    if (!Array.isArray(evidence.blockers) || evidence.blockers.length === 0) blockers.push(blocker('blocked inspection must include blockers', 'blockers'));
    if (evidence.status === 403 || code === 10000) permissionBlockers.push('Cloudflare Worker service visibility is blocked by token/account permission');
    else if (!missingServicePermissionReady) permissionBlockers.push('Cloudflare Worker service visibility is not ready');
  }
  if (visibleServiceReady && code !== null) blockers.push(blocker('ready inspection must not include Cloudflare error codes', 'response.payload.errors'));

  const result = {
    schema: CLOUDFLARE_WORKER_INSPECTION_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    worker_permission_ready: blockers.length === 0 && workerPermissionReady,
    service_observed: evidence.service_observed === true,
    service_missing: missingServicePermissionReady,
    service_name: nonEmptyString(evidence.service_name) ? evidence.service_name : null,
    observed_status: numericStatus(evidence.status) ? evidence.status : null,
    cloudflare_error_code: code,
    permission_blockers: blockers.length === 0 ? permissionBlockers : [],
    blockers,
    checked: {
      operation: evidence.operation ?? null,
      mutates_cloudflare: evidence.mutates_cloudflare ?? null,
      token_printed: evidence.tokenPrinted ?? null,
      account_id_redacted: typeof evidence.plan?.url === 'string' && evidence.plan.url.includes('/accounts/<account-id>/'),
      local_paths_redacted: true,
    },
    claim_boundary: [
      'This validator checks public-safe Cloudflare Worker inspection evidence only; it never deploys a Worker or changes Cloudflare state.',
      'worker_permission_ready:true means the account-scoped Worker service endpoint was visible; it does not prove the hosted relay/gateway infrastructure is live.',
      'A redacted 403/code-10000 result remains a token/account permission blocker; a redacted 404/code-10090 result means permission is sufficient but the probe Worker still needs deployment if that evidence is required.',
    ],
  };

  assertPublicSafe(result, 'result');
  return result;
}

function redactDiagnosticMessage(value) {
  return String(value)
    .replace(SECRET_VALUE_RE, '[redacted]')
    .replace(ACCOUNT_ID_RE, '<hex32>')
    .replace(LOCAL_PATH_RE, '<local-path>');
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = { evidence: null, out: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      out.help = true;
      continue;
    }
    const readValue = () => {
      const value = argv[index + 1];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) throw new Error(`${token} requires a value`);
      index += 1;
      return value;
    };
    if (token === '--evidence') out.evidence = readValue();
    else if (token === '--out') out.out = readValue();
    else throw new Error(`unknown option ${token}`);
  }
  return out;
}

function usage() {
  return 'Usage: node scripts/validate-cloudflare-worker-inspect.mjs --evidence <worker-inspect.json> [--out <file>]\n\nValidates public-safe output from `npm run cloudflare:ops -- workers inspect-probe --out <file>`. A redacted 403/code-10000 packet is accepted permission-blocked evidence; a redacted 404/code-10090 packet is accepted permission-ready missing-service evidence.\n';
}

async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) return { text: usage(), code: 0 };
  if (!args.evidence) throw new Error('--evidence is required');
  const evidence = JSON.parse(await readFile(resolve(args.evidence), 'utf8'));
  const result = validateCloudflareWorkerInspection(evidence, { generated_at: new Date().toISOString() });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (args.out) {
    const outPath = resolve(args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, json, 'utf8');
  }
  return { text: json, code: result.ok ? 0 : 1 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const { text, code } = await runCli();
    process.stdout.write(text);
    process.exitCode = code;
  } catch (error) {
    process.stderr.write(`${redactDiagnosticMessage(error instanceof Error ? error.message : String(error))}\n`);
    process.exitCode = 2;
  }
}
