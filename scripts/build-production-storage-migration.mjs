#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertProductionStorageSqlSafe,
  buildPostgresMigration,
  productionStorageContract,
} from '../packages/storage/src/index.js';

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

function outputFormat(flags) {
  const format = String(getFlag(flags, ['format'], 'json')).toLowerCase();
  if (!['json', 'sql'].includes(format)) throw new Error('--format must be json or sql');
  return format;
}

export function buildProductionStorageMigrationArtifact(options = {}) {
  const flags = options.flags instanceof Map ? options.flags : parseArgs(options.argv ?? []);
  const schema = getFlag(flags, ['schema'], options.schema ?? 'enigma');
  const migrationId = getFlag(flags, ['migration-id', 'migrationId'], options.migration_id ?? options.migrationId ?? '001_enigma_production_storage');
  const migration = buildPostgresMigration({ schema, migration_id: migrationId });
  assertProductionStorageSqlSafe(migration.sql);
  const contract = productionStorageContract({ schema, migration_id: migrationId });
  return {
    ok: true,
    schema: 'enigma.production_storage_migration_artifact.v1',
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    format: outputFormat(flags),
    contract,
    migration,
    claim_boundary: [
      'This artifact is local SQL/migration material only; it does not connect to or mutate a database.',
      'Operators must run it in controlled database change management and verify backups/restore before hosted_live_ready can be true.',
      'The SQL schema stores hashes, opaque encrypted payload references, minimized decisions, SIEM events, and public-safe refs rather than raw memory or secrets.',
    ],
  };
}

async function main() {
  const flags = parseArgs();
  const artifact = buildProductionStorageMigrationArtifact({ flags });
  const format = artifact.format;
  const out = getFlag(flags, ['out']);
  const content = format === 'sql'
    ? `${artifact.migration.sql}\n`
    : `${JSON.stringify(artifact, null, 2)}\n`;
  if (out && out !== true) {
    const path = resolve(String(out));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
    process.stdout.write(`${JSON.stringify({ ok: true, out: path, schema: artifact.schema, format, table_count: artifact.contract.tables.length }, null, 2)}\n`);
    return;
  }
  process.stdout.write(content);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
