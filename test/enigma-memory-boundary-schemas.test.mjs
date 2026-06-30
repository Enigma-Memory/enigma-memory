import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SCHEMA_FILES = Object.freeze([
  'claim-ledger-v1.schema.json',
  'memory-atom-v1.schema.json',
  'lifecycle-receipt-log-v1.schema.json',
  'context-passport-v1.schema.json',
  'proof-of-non-use-v1.schema.json',
  'antigen-envelope-v1.schema.json',
  'immune-scan-report-v1.schema.json',
  'quarantine-record-v1.schema.json',
  'antibody-pack-v1.schema.json',
  'trust-card-v1.schema.json',
  'evidence-packet-v1.schema.json',
  'memory-controller-grant-v1.schema.json',
  'recall-veto-decision-v1.schema.json',
  'scoped-memory-bubble-v1.schema.json',
  'memory-weather-report-v1.schema.json',
]);

const SHA256_REF = `sha256:${'a'.repeat(64)}`;
const ISO_NOW = '2026-06-27T00:00:00.000Z';
const FORBIDDEN_PUBLIC_FIELDS = new Set([
  'api_key',
  'authorization',
  'body',
  'credential',
  'credentials',
  'embedding',
  'embeddings',
  'evidence',
  'evidence_body',
  'key_material',
  'local_path',
  'password',
  'plaintext',
  'private_key',
  'prompt',
  'provider_response',
  'raw_evidence',
  'raw_memory',
  'secret',
  'text',
  'token',
  'transcript',
]);

async function readSchema(file) {
  return JSON.parse(await readFile(new URL(`../specs/${file}`, import.meta.url), 'utf8'));
}

function resolveRef(root, ref) {
  assert.equal(ref.startsWith('#/$defs/'), true, `unexpected non-local ref ${ref}`);
  const name = ref.slice('#/$defs/'.length).replaceAll('~1', '/').replaceAll('~0', '~');
  assert.ok(root.$defs?.[name], `missing $defs entry ${ref}`);
  return root.$defs[name];
}

function validateValue(schema, root, value, path = '$') {
  if (schema.$ref) return validateValue(resolveRef(root, schema.$ref), root, value, path);
  if (Object.hasOwn(schema, 'const')) {
    assert.deepEqual(value, schema.const, `${path} const mismatch`);
    return;
  }
  if (schema.enum) assert.ok(schema.enum.includes(value), `${path} enum mismatch`);
  if (Array.isArray(schema.type)) {
    if (value === null && schema.type.includes('null')) return;
    return validateValue({ ...schema, type: schema.type.find((type) => type !== 'null') }, root, value, path);
  }

  if (schema.type === 'object') {
    assert.equal(value !== null && typeof value === 'object' && !Array.isArray(value), true, `${path} object expected`);
    for (const field of schema.required ?? []) {
      assert.ok(Object.hasOwn(value, field), `${path}.${field} missing`);
    }
    if (schema.additionalProperties === false) {
      for (const field of Object.keys(value)) {
        assert.ok(Object.hasOwn(schema.properties ?? {}, field), `${path}.${field} is not declared`);
      }
    }
    for (const [field, fieldSchema] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, field)) validateValue(fieldSchema, root, value[field], `${path}.${field}`);
    }
    return;
  }

  if (schema.type === 'array') {
    assert.equal(Array.isArray(value), true, `${path} array expected`);
    if (schema.minItems !== undefined) assert.ok(value.length >= schema.minItems, `${path} minItems mismatch`);
    if (schema.uniqueItems === true) assert.equal(new Set(value.map((item) => JSON.stringify(item))).size, value.length, `${path} uniqueItems mismatch`);
    for (let index = 0; index < value.length; index += 1) {
      validateValue(schema.items, root, value[index], `${path}[${index}]`);
    }
    return;
  }

  if (schema.type === 'integer') {
    assert.equal(Number.isInteger(value), true, `${path} integer expected`);
    if (schema.minimum !== undefined) assert.ok(value >= schema.minimum, `${path} minimum mismatch`);
    return;
  }

  if (schema.type === 'number') {
    assert.equal(typeof value, 'number', `${path} number expected`);
    assert.equal(Number.isFinite(value), true, `${path} finite number expected`);
    if (schema.minimum !== undefined) assert.ok(value >= schema.minimum, `${path} minimum mismatch`);
    return;
  }

  if (schema.type === 'boolean') {
    assert.equal(typeof value, 'boolean', `${path} boolean expected`);
    return;
  }

  if (schema.type === 'string') {
    assert.equal(typeof value, 'string', `${path} string expected`);
    if (schema.minLength !== undefined) assert.ok(value.length >= schema.minLength, `${path} minLength mismatch`);
    if (schema.pattern) assert.match(value, new RegExp(schema.pattern), `${path} pattern mismatch`);
  }
}

function sampleFor(schema, root, key = 'value') {
  if (schema.$ref) return sampleFor(resolveRef(root, schema.$ref), root, key);
  if (Object.hasOwn(schema, 'const')) return schema.const;
  if (schema.enum) return schema.enum[0];
  if (schema.type === 'object') {
    const out = {};
    for (const field of schema.required ?? Object.keys(schema.properties ?? {})) {
      out[field] = sampleFor(schema.properties[field], root, field);
    }
    return normalizeFixtureForConditionals(out);
  }
  if (schema.type === 'array') {
    const count = Math.max(schema.minItems ?? 0, schema.maxItems === 0 ? 0 : 1);
    return Array.from({ length: count }, (_unused, index) => sampleFor(schema.items, root, `${key}_${index}`));
  }
  if (Array.isArray(schema.type)) return schema.type.includes('null') ? null : sampleFor({ ...schema, type: schema.type[0] }, root, key);
  if (schema.type === 'integer') return schema.minimum ?? 0;
  if (schema.type === 'number') return schema.minimum ?? 0;
  if (schema.type === 'boolean') return true;
  if (schema.type === 'string') {
    if (schema.format === 'date-time') return ISO_NOW;
    if (schema.pattern) return sampleStringForPattern(schema.pattern, key);
    return `${publicToken(key)}_fixture`;
  }
  throw new Error(`unsupported schema node for ${key}`);
}

function normalizeFixtureForConditionals(out) {
  if (out.schema === 'enigma.private_memory_bubble.v1' && out.status === 'open') out.closed_at = null;
  if (out.schema === 'enigma.memory_weather_report.v1' && out.status === 'sunny') {
    out.issue_codes = [];
    out.next_action = 'none';
  }
  return out;
}

function sampleStringForPattern(pattern, key) {
  if (pattern.includes('sha256:')) return SHA256_REF;
  if (pattern.startsWith('^[0-9]+')) return '1.0.0';
  if (pattern.startsWith('^ref:')) return `ref:${publicToken(key)}_fixture`;
  if (pattern.startsWith('^detector:')) return `detector:${publicToken(key)}_fixture`;
  if (pattern.startsWith('^policy:')) return `policy:${publicToken(key)}_fixture`;
  if (pattern.startsWith('^signer:')) return `signer:${publicToken(key)}_fixture`;
  if (pattern.startsWith('^sigref:')) return `sigref:${publicToken(key)}_fixture`;
  if (pattern.startsWith('^claim:')) return `claim:${publicToken(key)}`;
  if ((pattern.includes('enigma.') || pattern.includes('enigma\\.')) && pattern.includes('v1')) return 'enigma.fixture.v1';
  if (pattern.includes('[a-z0-9]')) return `${publicToken(key)}_fixture`;
  return `${publicToken(key)}:fixture`;
}

function publicToken(key) {
  const token = String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9_.:-]+/g, '_').replace(/^_+|_+$/g, '');
  const safe = token.length > 0 ? token : 'public_ref';
  return safe.length >= 8 ? safe : `${safe}_ref`;
}

function collectPropertyNames(schema, root, out = new Set(), seen = new WeakSet()) {
  if (schema.$ref) return collectPropertyNames(resolveRef(root, schema.$ref), root, out, seen);
  if (schema === null || typeof schema !== 'object' || seen.has(schema)) return out;
  seen.add(schema);
  for (const field of Object.keys(schema.properties ?? {})) out.add(field);
  for (const child of Object.values(schema.properties ?? {})) collectPropertyNames(child, root, out, seen);
  if (schema.items) collectPropertyNames(schema.items, root, out, seen);
  for (const child of Object.values(schema.$defs ?? {})) collectPropertyNames(child, root, out, seen);
  return out;
}

test('memory-boundary schemas validate public-safe fixtures and reject raw-memory extras', async () => {
  for (const file of SCHEMA_FILES) {
    const schema = await readSchema(file);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema', `${file} draft mismatch`);
    assert.equal(schema.type, 'object', `${file} top-level type mismatch`);
    assert.equal(schema.additionalProperties, false, `${file} must fail closed`);

    const fixture = sampleFor(schema, schema, file);
    validateValue(schema, schema, fixture, file);
    assert.equal(JSON.stringify(fixture).includes('private launch-code phrase'), false, `${file} fixture leaked private sentinel`);

    assert.throws(() => validateValue(schema, schema, { ...fixture, raw_memory: 'private launch-code phrase' }, file), /raw_memory is not declared/);
  }
});

test('memory-boundary schemas do not declare raw payload or credential fields', async () => {
  for (const file of SCHEMA_FILES) {
    const schema = await readSchema(file);
    const propertyNames = collectPropertyNames(schema, schema);
    for (const field of propertyNames) {
      assert.equal(FORBIDDEN_PUBLIC_FIELDS.has(field), false, `${file} declares forbidden public field ${field}`);
    }
  }
});
