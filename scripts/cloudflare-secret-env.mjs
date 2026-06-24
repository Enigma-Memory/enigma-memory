import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const CLOUDFLARE_SECRET_ENV_SCHEMA = 'enigma.cloudflare_secret_env.v1';

export const CLOUDFLARE_SECRET_ENV_KEYS = Object.freeze([
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_PROJECT_NAME',
]);

const ALLOWED = new Set(CLOUDFLARE_SECRET_ENV_KEYS);
const SECRET_VALUE_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@]+:[^\s/@]+@|AKIA[0-9A-Z]{16})/iu;

export class CloudflareSecretEnvError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CloudflareSecretEnvError';
  }
}

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  return trimmed;
}

export function parseCloudflareSecretEnvText(text) {
  const parsed = {};
  const ignored = [];
  const lines = String(text ?? '').split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) return;
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) throw new CloudflareSecretEnvError(`invalid env-file line ${index + 1}`);
    const key = match[1];
    if (!ALLOWED.has(key)) {
      ignored.push(key);
      return;
    }
    const value = unquote(match[2]);
    if (value.length === 0) throw new CloudflareSecretEnvError(`${key} must not be empty`);
    if (key !== 'CLOUDFLARE_API_TOKEN' && SECRET_VALUE_RE.test(value)) throw new CloudflareSecretEnvError(`${key} contains secret-looking data`);
    parsed[key] = value;
  });
  return {
    schema: CLOUDFLARE_SECRET_ENV_SCHEMA,
    values: parsed,
    present_keys: Object.keys(parsed).sort(),
    ignored_keys: [...new Set(ignored)].sort(),
  };
}

export async function loadCloudflareSecretEnvFile(path, options = {}) {
  if (typeof path !== 'string' || path.trim().length === 0) throw new CloudflareSecretEnvError('Cloudflare secret env file path is required');
  const file = resolve(path);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    throw new CloudflareSecretEnvError('Cloudflare secret env file could not be read');
  }
  const parsed = parseCloudflareSecretEnvText(text);
  return {
    ...parsed,
    path: options.includePath === false ? null : file,
    byte_count: Buffer.byteLength(text),
  };
}

export async function applyCloudflareSecretEnvFile(env = process.env, options = {}) {
  const envFile = options.path ?? env.CLOUDFLARE_ENV_FILE ?? env.ENIGMA_CLOUDFLARE_ENV_FILE ?? null;
  if (typeof envFile !== 'string' || envFile.trim().length === 0) {
    return {
      env,
      source: null,
      present_keys: CLOUDFLARE_SECRET_ENV_KEYS.filter((key) => typeof env[key] === 'string' && env[key].length > 0),
      loaded_keys: [],
    };
  }
  const loaded = await loadCloudflareSecretEnvFile(envFile, { includePath: options.includePath });
  return {
    env: { ...env, ...loaded.values },
    source: {
      schema: loaded.schema,
      path: loaded.path,
      byte_count: loaded.byte_count,
      present_keys: loaded.present_keys,
      ignored_keys: loaded.ignored_keys,
    },
    present_keys: CLOUDFLARE_SECRET_ENV_KEYS.filter((key) => typeof (loaded.values[key] ?? env[key]) === 'string' && (loaded.values[key] ?? env[key]).length > 0),
    loaded_keys: loaded.present_keys,
  };
}

function readValue(argv, index, name) {
  if (index + 1 >= argv.length || String(argv[index + 1]).startsWith('--')) throw new CloudflareSecretEnvError(`${name} requires a value`);
  return [argv[index + 1], index + 2];
}

export async function applyCloudflareSecretEnvFileFromArgv(argv = [], env = process.env, options = {}) {
  const tokens = Array.from(argv ?? []);
  const stripped = [];
  let envFile = null;
  for (let index = 0; index < tokens.length;) {
    const token = tokens[index];
    if (token === '--cloudflare-env-file') {
      const [value, next] = readValue(tokens, index, token);
      envFile = value;
      index = next;
      continue;
    }
    if (typeof token === 'string' && token.startsWith('--cloudflare-env-file=')) {
      envFile = token.slice('--cloudflare-env-file='.length);
      if (envFile.length === 0) throw new CloudflareSecretEnvError('--cloudflare-env-file requires a value');
      index += 1;
      continue;
    }
    stripped.push(token);
    index += 1;
  }
  const applied = await applyCloudflareSecretEnvFile(env, { ...options, path: envFile ?? undefined });
  return {
    argv: stripped,
    ...applied,
  };
}
