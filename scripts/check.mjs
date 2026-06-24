import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(root, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const productionRoots = [
  'packages/adapters/src/',
  'packages/core/src/',
  'packages/vault/src/',
  'packages/passport/src/',
  'packages/boundary/src/',
  'packages/connectors/src/',
  'packages/importers/src/',
  'packages/optimizer/src/',
  'packages/storage/src/',
  'packages/mcp-server/src/',
  'packages/mcp-server/bin/',
  'packages/mesh/src/',
  'packages/enterprise/src/',
  'apps/relay/bin/',
  'apps/relay/src/',
  'apps/gateway/src/',
  'apps/gateway/bin/',
  'apps/desktop/src/',
  'apps/cli/bin/',
  'apps/verifier/bin/',
  'apps/native-host/bin/'
];

function collectProductionModules(rel, out = []) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) throw new Error(`Missing production path: ${rel}`);
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(full).sort()) {
      collectProductionModules(path.join(rel, entry), out);
    }
  } else if (rel.endsWith('.js') || rel.endsWith('.mjs')) {
    out.push(rel);
  }
  return out;
}

const productionModules = [...new Set(productionRoots.flatMap((rel) => collectProductionModules(rel)))];

for (const rel of productionModules) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) throw new Error(`Missing production module: ${rel}`);
  await import(pathToFileURL(full).href);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const NODE_SHEBANG = '#!/usr/bin/env node';
const RAW_MEMORY = 'private launch-code phrase must not leave local memory';
const SOURCE_ONLY_REVIEW_DOCS = Object.freeze([
  'SECURITY.md',
  'docs/security-threat-model.md',
  'docs/public-api-reference.md',
  'docs/operator-acceptance-packet.md'
]);
const REVIEW_DOC_BOUNDARY_PATTERNS = Object.freeze({
  claimBoundary: /claim boundary|proof boundary|non-claims?|does not claim|does not prove/i,
  enigmaScope: /Enigma-(?:controlled|mediated)|Enigma controlled|Enigma mediated|declared boundary operations|vault state|receipts?/i,
  publicProofPrivacy: /raw memory plaintext|public proof artifacts?|public receipts?|proof examples/i,
  hostedByocPosture: /hosted|BYOC|cloud|deployment/i,
  hostedByocBlocked: /blocked|requires?|do not mark|do not market|before|only after|without/i
});
const HOSTED_BYOC_BLOCKERS = Object.freeze({
  credentials: /\b(?:credentials?|cloud account|VPC|cluster|private network|admin access)\b/i,
  domain: /\b(?:domain|DNS|ingress|private endpoints|approved customer networks)\b/i,
  TLS: /\bTLS\b|HTTPS|certificates?/i,
  KMS: /\bKMS\b|BYOK|secrets manager|KMS\/secrets/i,
  storage: /durable storage|\bstorage\b|persistence/i,
  monitoring: /\bmonitoring\b|observable services?|logging\/SIEM/i,
  backup: /\bbackups?\b|backup\/restore|restore rehearsal/i
});
const DANGEROUS_REVIEW_CLAIM_PATTERNS = Object.freeze({
  'provider deletion proof': /provider[- ](?:native|side)? deletion|provider deletion|provider[- ]native deletion proof|provider deletion proof|complete provider deletion|provider deletion certification|closed provider[^.\n]{0,80}deleted|external provider[^.\n]{0,80}deleted/i,
  'model forgetting': /model[- ]forgetting|model forgetting|model-weight forgetting|model weights?[^.\n]{0,80}(?:forgot|forget|deleted|erased)/i,
  'semantic forgetting': /semantic[- ]forgetting|semantic forgetting|semantic-paraphrase absence/i,
  'compliance status': /\b(?:SOC 2|ISO 27001|HIPAA|GDPR|PCI DSS)\b|compliance[- ]status|(?:certified|approved|validated)\s+(?:compliant|compliance)|compliance[- ](?:certified|approved|validated|ready)/i,
  'tamper-proof hardware': /tamper[- ]proof|tamperproof|hardware[^.\n]{0,80}(?:cannot be tampered|prevents tampering|prevents extraction)/i,
  'raw memory public proof': /raw[- ]memory[- ]on[- ]chain|raw memory in (?:public proof|receipts|relay|witness|SIEM)/i
});
const EXPLICIT_NEGATIVE_CONTEXT = /\b(?:do not|does not|cannot|can not|must not|should not|not|no|never|without|unless|before|subject to|avoid|decline|prohibited|non-claims?|Not approved|requires?|only after|should remain available without|must stay|trigger incident response|leakage|mitigation)\b/i;

function normalizePackageRel(rel) {
  return String(rel).replace(/\\/g, '/').replace(/^\.\//, '');
}

function packageFileExists(rel) {
  return fs.existsSync(path.join(root, normalizePackageRel(rel)));
}

function packageFilesCover(files, rel) {
  const normalizedRel = normalizePackageRel(rel);
  return files.some((entry) => {
    const normalizedEntry = normalizePackageRel(entry);
    if (normalizedEntry.endsWith('/')) return normalizedRel.startsWith(normalizedEntry);
    const fullEntry = path.join(root, normalizedEntry);
    return normalizedRel === normalizedEntry || (fs.existsSync(fullEntry) && fs.statSync(fullEntry).isDirectory() && normalizedRel.startsWith(`${normalizedEntry}/`));
  });
}

function readRequiredSourceDoc(rel) {
  const normalizedRel = normalizePackageRel(rel);
  const full = path.join(root, normalizedRel);
  if (!fs.existsSync(full)) throw new Error(`Missing production review doc: ${normalizedRel}`);
  return fs.readFileSync(full, 'utf8');
}

function assertNoDangerousReviewClaims(rel, text) {
  const lines = text.split(/\r?\n/);
  for (const [claim, pattern] of Object.entries(DANGEROUS_REVIEW_CLAIM_PATTERNS)) {
    lines.forEach((line, index) => {
      if (!pattern.test(line)) return;
      const context = lines.slice(Math.max(0, index - 12), Math.min(lines.length, index + 2)).join('\n');
      if (!EXPLICIT_NEGATIVE_CONTEXT.test(context)) {
        throw new Error(`${rel}:${index + 1} mentions ${claim} outside an explicit negative context`);
      }
    });
  }
}

function validateProductionReviewDocs(pkg) {
  const readme = readRequiredSourceDoc('README.md');
  const reviewTexts = [];
  for (const rel of SOURCE_ONLY_REVIEW_DOCS) {
    const text = readRequiredSourceDoc(rel);
    reviewTexts.push(text);
    if (!readme.includes(rel)) throw new Error(`${rel} must remain an explicit README reference`);
    if (packageFilesCover(pkg.files, rel)) throw new Error(`${rel} is a source-tree review doc, not packaged runtime code`);
    if (text.includes(RAW_MEMORY)) throw new Error(`${rel} must not include the raw memory sentinel in public examples`);
    for (const [requirement, pattern] of Object.entries(REVIEW_DOC_BOUNDARY_PATTERNS)) {
      if (!pattern.test(text)) throw new Error(`${rel} production review doc is missing ${requirement} boundary language`);
    }
    assertNoDangerousReviewClaims(rel, text);
  }

  const reviewText = reviewTexts.join('\n');
  for (const [blocker, pattern] of Object.entries(HOSTED_BYOC_BLOCKERS)) {
    if (!pattern.test(reviewText)) throw new Error(`production review docs hosted/BYOC posture is missing ${blocker} blocker language`);
  }
}

function assertNodeShebang(name, rel) {
  const firstLine = fs.readFileSync(path.join(root, normalizePackageRel(rel)), 'utf8').split(/\r?\n/, 1)[0];
  if (firstLine !== NODE_SHEBANG) throw new Error(`package.json bin ${name} must start with ${NODE_SHEBANG}`);
}

async function validateCloudflareOpsScript(pkg) {
  if (!isPlainObject(pkg.scripts) || pkg.scripts['cloudflare:ops'] !== 'node scripts/cloudflare-ops.mjs') {
    throw new Error('package.json must expose cloudflare:ops as node scripts/cloudflare-ops.mjs');
  }
  if (!packageFileExists('scripts/cloudflare-ops.mjs')) throw new Error('Missing scripts/cloudflare-ops.mjs');
  if (!packageFilesCover(pkg.files, 'scripts/cloudflare-ops.mjs')) {
    throw new Error('scripts/cloudflare-ops.mjs must be covered by files allowlist');
  }

  const ops = await import(pathToFileURL(path.join(root, 'scripts/cloudflare-ops.mjs')).href);
  const requiredHelpers = [
    'isValidDomainName',
    'parseUsdAmount',
    'assertRegistrationPriceGuard',
    'buildCloudflareRequestPlan',
    'buildWranglerPagesDeployPlan',
    'parseCloudflareOpsCommand',
  ];
  for (const name of requiredHelpers) {
    if (typeof ops[name] !== 'function') throw new Error(`scripts/cloudflare-ops.mjs missing exported helper ${name}`);
  }

  const parsedRegister = ops.parseCloudflareOpsCommand([
    'registrar',
    'register',
    '--domain',
    'example.dev',
    '--max-price-usd',
    '10.11',
    '--confirm-domain',
    'example.dev',
    '--confirm-registration-cost',
    '10.11',
    '--i-understand-this-charges-my-payment-method',
  ], { CLOUDFLARE_ACCOUNT_ID: 'acct-check' });
  if (parsedRegister.kind !== 'registrar.register' || parsedRegister.execute !== false) {
    throw new Error('cloudflare registrar register must default to a non-executing dry-run command');
  }

  const registerPlan = ops.buildCloudflareRequestPlan({
    operation: 'registrar.register',
    accountId: 'acct-check',
    domain: 'example.dev',
  });
  if (registerPlan.billable !== true || registerPlan.method !== 'POST' || registerPlan.body?.domain_name !== 'example.dev') {
    throw new Error('cloudflare registrar register plan must remain an explicit billable POST plan');
  }

  const deployPlan = ops.buildWranglerPagesDeployPlan({
    site: '_public_site',
    projectName: 'enigma-memory',
  });
  if (deployPlan.execute !== false || deployPlan.dryRun !== true || deployPlan.usesShell !== false) {
    throw new Error('cloudflare pages deploy plan must default to dry-run without shell execution');
  }

  const guard = ops.assertRegistrationPriceGuard({
    domain: 'example.dev',
    maxPriceUsd: '10.11',
    confirmationDomain: 'example.dev',
    confirmationCostUsd: '10.11',
    iUnderstandThisChargesMyPaymentMethod: true,
    availability: {
      name: 'example.dev',
      registrable: true,
      pricing: { currency: 'USD', registration_cost: '10.11' },
    },
  });
  if (guard.registrationCostUsd !== '10.11') throw new Error('cloudflare registrar price guard must preserve exact USD confirmation');
}

function validatePackageMetadata(pkg) {
  if (pkg.private === true) throw new Error('package.json must be publishable, not private');
  if (typeof pkg.name !== 'string' || !pkg.name.startsWith('@enigma-ai/')) {
    throw new Error('package.json name must be scoped for public publishing');
  }
  if (typeof pkg.license !== 'string' || pkg.license.length === 0) throw new Error('package.json missing license');
  if (!isPlainObject(pkg.repository) || typeof pkg.repository.url !== 'string') throw new Error('package.json missing repository placeholder');
  if (!Array.isArray(pkg.files) || pkg.files.length === 0) throw new Error('package.json missing files allowlist');
  if (!Array.isArray(pkg.keywords) || pkg.keywords.length === 0) throw new Error('package.json missing keywords');

  if (!isPlainObject(pkg.scripts) || pkg.scripts['provenance:local'] !== 'node scripts/release-provenance.mjs') {
    throw new Error('package.json must expose provenance:local as node scripts/release-provenance.mjs');
  }
  if (pkg.scripts['review:packet'] !== 'node scripts/build-review-packet.mjs') {
    throw new Error('package.json must expose review:packet as node scripts/build-review-packet.mjs');
  }
  if (!packageFileExists('scripts/release-provenance.mjs')) throw new Error('Missing scripts/release-provenance.mjs');
  if (!packageFilesCover(pkg.files, 'scripts/release-provenance.mjs')) throw new Error('scripts/release-provenance.mjs must be covered by files allowlist');
  if (!packageFileExists('scripts/build-review-packet.mjs')) throw new Error('Missing scripts/build-review-packet.mjs');
  if (!packageFilesCover(pkg.files, 'scripts/build-review-packet.mjs')) throw new Error('scripts/build-review-packet.mjs must be covered by files allowlist');

  const requiredExports = [
    '.',
    './adapters',
    './core',
    './vault',
    './passport',
    './boundary',
    './mcp-server',
    './mesh',
    './enterprise',
    './connectors',
    './importers',
    './optimizer',
    './storage',
    './relay',
    './gateway',
    './desktop'
  ];
  if (!isPlainObject(pkg.exports)) throw new Error('package.json missing exports');
  for (const key of requiredExports) {
    const target = pkg.exports[key];
    if (typeof target !== 'string') throw new Error(`package.json missing export ${key}`);
    if (!packageFileExists(target)) throw new Error(`package.json export ${key} points to a missing file`);
  }
  for (const [key, target] of Object.entries(pkg.exports)) {
    if (typeof target === 'string' && !packageFileExists(target)) throw new Error(`package.json export ${key} points to a missing file`);
  }

  const requiredBins = ['enigma', 'enigma-verify', 'enigma-mcp', 'enigma-relay', 'enigma-gateway', 'enigma-native-host'];
  if (!isPlainObject(pkg.bin)) throw new Error('package.json missing bin map');
  for (const key of requiredBins) {
    if (typeof pkg.bin[key] !== 'string') throw new Error(`package.json missing bin ${key}`);
  }
  for (const [name, target] of Object.entries(pkg.bin)) {
    if (typeof target !== 'string' || !packageFileExists(target)) {
      throw new Error(`package.json bin ${name} points to a missing file`);
    }
    if (!packageFilesCover(pkg.files, target)) throw new Error(`package.json bin ${name} target is not covered by files allowlist`);
    assertNodeShebang(name, target);
  }
}

validatePackageMetadata(packageJson);
await validateCloudflareOpsScript(packageJson);
validateProductionReviewDocs(packageJson);

function requirePlainObject(name, value) {
  if (!isPlainObject(value)) throw new Error(`${name} must be an object`);
}

function requireFailClosedObjectSchema(name, schema) {
  requirePlainObject(name, schema);
  if (schema.type !== 'object') throw new Error(`${name} type must be object`);
  if (schema.additionalProperties !== false) throw new Error(`${name} must fail closed on unknown properties`);
}

function decodeJsonPointerToken(token) {
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

function localDefName(ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/$defs/')) return undefined;
  return decodeJsonPointerToken(ref.slice('#/$defs/'.length));
}

function resolveLocalRef(name, rootSchema, ref) {
  const defName = localDefName(ref);
  if (defName === undefined) throw new Error(`${name} uses non-local $ref ${String(ref)}`);
  if (!isPlainObject(rootSchema.$defs) || !Object.hasOwn(rootSchema.$defs, defName)) {
    throw new Error(`${name} references unknown $defs schema ${ref}`);
  }
  return rootSchema.$defs[defName];
}

function schemaDeclaresObject(schema) {
  if (schema.type === 'object') return true;
  return Array.isArray(schema.type) && schema.type.includes('object');
}

function schemaHasStructuredObjectShape(schema) {
  return Object.hasOwn(schema, 'properties') || Object.hasOwn(schema, 'required');
}

function validateOneOfSchema(name, rootSchema, schema, seen) {
  if (Object.hasOwn(schema, 'type') && !schemaDeclaresObject(schema)) {
    throw new Error(`${name} oneOf container type must include object`);
  }
  if (!Array.isArray(schema.oneOf) || schema.oneOf.length === 0) {
    throw new Error(`${name} oneOf must list schema alternatives`);
  }
  if (!isPlainObject(rootSchema.$defs)) throw new Error(`${name} oneOf schemas must define $defs`);

  for (const [index, branch] of schema.oneOf.entries()) {
    requirePlainObject(`${name} oneOf[${index}]`, branch);
    if (Object.hasOwn(branch, '$ref')) {
      const ref = branch.$ref;
      const target = resolveLocalRef(`${name} oneOf[${index}]`, rootSchema, ref);
      requireFailClosedObjectSchema(`${name} ${ref}`, target);
      validateSchemaNode(`${name} ${ref}`, rootSchema, target, seen);
    } else {
      requireFailClosedObjectSchema(`${name} oneOf[${index}]`, branch);
      validateSchemaNode(`${name} oneOf[${index}]`, rootSchema, branch, seen);
    }
  }
}

function validateSchemaNode(name, rootSchema, schema, seen = new WeakSet()) {
  requirePlainObject(name, schema);
  if (seen.has(schema)) return;
  seen.add(schema);

  if (Object.hasOwn(schema, '$ref')) {
    validateSchemaNode(`${name} ${schema.$ref}`, rootSchema, resolveLocalRef(name, rootSchema, schema.$ref), seen);
    return;
  }

  if (schemaDeclaresObject(schema) && schemaHasStructuredObjectShape(schema) && schema.additionalProperties !== false) {
    throw new Error(`${name} must fail closed on unknown properties`);
  }

  if (Object.hasOwn(schema, 'oneOf')) validateOneOfSchema(name, rootSchema, schema, seen);

  if (Object.hasOwn(schema, '$defs')) {
    requirePlainObject(`${name} $defs`, schema.$defs);
    for (const [defName, defSchema] of Object.entries(schema.$defs)) {
      validateSchemaNode(`${name} $defs.${defName}`, rootSchema, defSchema, seen);
    }
  }

  if (Object.hasOwn(schema, 'properties')) {
    requirePlainObject(`${name} properties`, schema.properties);
    for (const [propertyName, propertySchema] of Object.entries(schema.properties)) {
      validateSchemaNode(`${name} properties.${propertyName}`, rootSchema, propertySchema, seen);
    }
  }

  if (Object.hasOwn(schema, 'items')) {
    validateSchemaNode(`${name} items`, rootSchema, schema.items, seen);
  }

  for (const combinator of ['allOf', 'anyOf']) {
    if (!Object.hasOwn(schema, combinator)) continue;
    if (!Array.isArray(schema[combinator]) || schema[combinator].length === 0) {
      throw new Error(`${name} ${combinator} must list schemas`);
    }
    for (const [index, nested] of schema[combinator].entries()) {
      validateSchemaNode(`${name} ${combinator}[${index}]`, rootSchema, nested, seen);
    }
  }

  if (isPlainObject(schema.additionalProperties)) {
    validateSchemaNode(`${name} additionalProperties`, rootSchema, schema.additionalProperties, seen);
  }
}

const specsDir = path.join(root, 'specs');
for (const name of fs.readdirSync(specsDir)) {
  if (!name.endsWith('.json')) continue;
  const full = path.join(specsDir, name);
  const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
  for (const key of ['$schema', '$id', 'title']) {
    if (!(key in parsed)) throw new Error(`${name} missing ${key}`);
  }
  if (Object.hasOwn(parsed, 'oneOf')) {
    validateOneOfSchema(name, parsed, parsed, new WeakSet());
  } else {
    requireFailClosedObjectSchema(name, parsed);
  }
  validateSchemaNode(name, parsed, parsed);
}

console.log('enigma check ok');
