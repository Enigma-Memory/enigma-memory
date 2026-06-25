#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateOperatorAcceptancePacket } from './validate-operator-acceptance.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
      flags.set(arg.slice(2), true);
    } else {
      flags.set(arg.slice(2), argv[index + 1]);
      index += 1;
    }
  }
  return flags;
}

function getFlag(flags, names, fallback = undefined) {
  for (const name of names) if (flags.has(name)) return flags.get(name);
  return fallback;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target, source) {
  if (!isPlainObject(target) || !isPlainObject(source)) return source;
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    if (isPlainObject(sourceValue) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], sourceValue);
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue;
    }
  }
  return result;
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(resolve(String(path)), 'utf8'));
}

function usage() {
  return [
    'Usage: node scripts/fill-operator-acceptance-packet.mjs --template <template.json> --overrides <overrides.json> [--out <packet.json>] [--validate]',
    '',
    'Reads an operator acceptance packet template and a JSON override file, deeply merges',
    'the overrides into the template, and writes the filled packet. Use --validate to run',
    'validate-operator-acceptance.mjs against the result and include the validation result',
    'in the output summary.',
    '',
    'The override file may contain any top-level packet field (metadata, owners, evidence,',
    'readiness, manifest, storage, release_audit, production_manifests, claim_boundary).',
    'Nested objects are merged; replace an entire object by supplying the complete object.',
  ].join('\n');
}

async function main() {
  const flags = parseArgs();

  if (flags.has('help') || flags.has('h')) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const templatePath = getFlag(flags, ['template']);
  const overridesPath = getFlag(flags, ['overrides']);
  const out = getFlag(flags, ['out']);
  const validate = flags.has('validate');

  if (!templatePath || templatePath === true) {
    throw new Error('--template is required');
  }
  if (!overridesPath || overridesPath === true) {
    throw new Error('--overrides is required');
  }

  const template = await readJsonFile(templatePath);
  const overrides = await readJsonFile(overridesPath);
  const filled = deepMerge(template, overrides);

  const result = validate ? validateOperatorAcceptancePacket(filled) : null;

  const packetText = `${JSON.stringify(filled, null, 2)}\n`;
  if (out && out !== true) {
    const outPath = resolve(String(out));
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, packetText, 'utf8');
  }

  const summary = {
    ok: true,
    template: resolve(String(templatePath)),
    overrides: resolve(String(overridesPath)),
    out: out && out !== true ? resolve(String(out)) : null,
    schema: filled.schema,
    decision: filled.metadata?.decision ?? null,
    validation: result
      ? {
          ok: result.ok,
          decision: result.decision,
          blocker_count: result.blockers.length,
        }
      : null,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (validate && result && !result.ok) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
