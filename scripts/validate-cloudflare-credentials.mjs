#!/usr/bin/env node
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { applyCloudflareSecretEnvFile } from './cloudflare-secret-env.mjs';

export const CLOUDFLARE_CREDENTIALS_RESULT_SCHEMA = 'enigma.cloudflare_credentials_result.v1';

const REQUIRED_KEYS = Object.freeze(['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']);
const SECRET_OUTPUT_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}|https?:\/\/[^\s/@]+:[^\s/@]+@|AKIA[0-9A-Z]{16})/iu;

function parseArgs(argv = process.argv.slice(2)) {
  const out = { envFile: null, out: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) throw new Error(`${token} requires a value`);
      index += 1;
      return value;
    };
    if (token === '--cloudflare-env-file') out.envFile = readValue();
    else if (typeof token === 'string' && token.startsWith('--cloudflare-env-file=')) out.envFile = token.slice('--cloudflare-env-file='.length);
    else if (token === '--out') out.out = readValue();
    else if (token === '--help' || token === '-h') out.help = true;
    else throw new Error(`Unknown Cloudflare credential validator option: ${token}`);
  }
  return out;
}

function usage() {
  return 'Usage: node scripts/validate-cloudflare-credentials.mjs [--cloudflare-env-file <file>] [--out <file>]\n\nValidates Cloudflare credential presence without printing token values, account ids, or local paths.\n';
}

function assertPublicSafe(result) {
  const text = JSON.stringify(result);
  if (SECRET_OUTPUT_RE.test(text)) throw new Error('Cloudflare credential result contains secret-looking material');
  if (/[A-Za-z]:[\\/]/u.test(text)) throw new Error('Cloudflare credential result contains a local path');
  return true;
}

export async function validateCloudflareCredentials(options = {}) {
  let loaded;
  try {
    loaded = await applyCloudflareSecretEnvFile(options.env ?? process.env, {
      path: options.envFile ?? null,
      includePath: false,
    });
  } catch (error) {
    const result = {
      schema: CLOUDFLARE_CREDENTIALS_RESULT_SCHEMA,
      ok: false,
      credentials_present: false,
      source_loaded: false,
      present_keys: [],
      loaded_key_count: 0,
      missing_keys: REQUIRED_KEYS,
      blockers: ['Cloudflare secret env file could not be read or parsed'],
      token_value_printed: false,
      account_id_printed: false,
      claim_boundary: [
        'This validator checks credential presence only; it does not verify Cloudflare permissions or deploy resources.',
        'Credential values, account ids, env file paths, and contact data are intentionally omitted from output.',
      ],
    };
    assertPublicSafe(result);
    return result;
  }
  const present = new Set(loaded.present_keys ?? []);
  const missing = REQUIRED_KEYS.filter((key) => !present.has(key));
  const result = {
    schema: CLOUDFLARE_CREDENTIALS_RESULT_SCHEMA,
    ok: missing.length === 0,
    credentials_present: missing.length === 0,
    source_loaded: loaded.source !== null,
    present_keys: REQUIRED_KEYS.filter((key) => present.has(key)),
    loaded_key_count: Array.isArray(loaded.loaded_keys) ? loaded.loaded_keys.length : 0,
    missing_keys: missing,
    blockers: missing.map((key) => `${key} absent from current environment`),
    token_value_printed: false,
    account_id_printed: false,
    claim_boundary: [
      'This validator checks credential presence only; it does not verify Cloudflare permissions or deploy resources.',
      'Credential values, account ids, env file paths, and contact data are intentionally omitted from output.',
    ],
  };
  assertPublicSafe(result);
  return result;
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const args = parseArgs(argv);
  if (args.help) return { text: usage(), status: 0 };
  const result = await validateCloudflareCredentials({ ...options, envFile: args.envFile });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (SECRET_OUTPUT_RE.test(json)) throw new Error('Cloudflare credential validator output appears to contain a secret');
  if (args.out) {
    await mkdir(dirname(args.out), { recursive: true });
    await writeFile(args.out, json, 'utf8');
  }
  return { text: json, status: result.ok ? 0 : 1 };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(({ text, status }) => {
    process.stdout.write(text);
    process.exitCode = status;
  }).catch((error) => {
    process.stdout.write(`${JSON.stringify({ schema: CLOUDFLARE_CREDENTIALS_RESULT_SCHEMA, ok: false, credentials_present: false, blockers: [error.message], token_value_printed: false, account_id_printed: false }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
