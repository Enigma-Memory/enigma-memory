import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  PUBLIC_SITE_SECURITY_RESULT_SCHEMA,
  validatePublicSiteSecurity,
} from '../scripts/validate-public-site-security.mjs';

const execFileAsync = promisify(execFile);

async function writeFixtureSite(options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-public-site-security-'));
  await mkdir(join(dir, 'assets'), { recursive: true });
  await writeFile(join(dir, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'\n`, 'utf8');
  await writeFile(join(dir, 'index.html'), `<!doctype html>\n<html><head><title>Enigma Memory</title><link rel="stylesheet" href="/styles.css"></head><body><main><a href="/about.html">About</a><script src="/app.js"></script></main></body></html>\n`, 'utf8');
  await writeFile(join(dir, 'about.html'), `<!doctype html>\n<html><body><a href="/">Home</a><img src="/assets/logo.svg" alt=""></body></html>\n`, 'utf8');
  await writeFile(join(dir, 'styles.css'), 'body{font-family:system-ui,sans-serif}\n', 'utf8');
  await writeFile(join(dir, 'app.js'), 'document.documentElement.dataset.enigma="ready";\n', 'utf8');
  await writeFile(join(dir, 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>\n', 'utf8');
  await writeFile(join(dir, 'docs.md'), 'Security docs may mention raw memory boundaries, localhost demo commands, and security@enigma.ai role contact without exposing actual values.\n', 'utf8');
  if (options.personalInfo) await writeFile(join(dir, 'contact.html'), `Email founder@example.ai or call 202-555-0100 at 123 Example Lane.\n`, 'utf8');
  if (options.sourceMap) await writeFile(join(dir, 'app.js.map'), '{}\n', 'utf8');
  if (options.badHeaders) await writeFile(join(dir, '_headers'), `/*\n  X-Frame-Options: SAMEORIGIN\n`, 'utf8');
  if (options.externalScript) await writeFile(join(dir, 'index.html'), `<!doctype html><script src="https://cdn.example.invalid/app.js"></script>\n`, 'utf8');
  if (options.privateFile) await writeFile(join(dir, 'private-token-plan.md'), 'do not publish\n', 'utf8');
  if (options.rawJson) await writeFile(join(dir, 'raw.json'), `${JSON.stringify({ [['raw', 'memory'].join('_')]: 'do not publish this private note' })}\n`, 'utf8');
  return dir;
}

test('public site security validator accepts clean static artifact', async () => {
  const site = await writeFixtureSite();
  const result = await validatePublicSiteSecurity({ site }, { generated_at: '2026-06-23T12:00:00.000Z' });
  assert.equal(result.schema, PUBLIC_SITE_SECURITY_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.equal(result.checked.has_index, true);
  assert.equal(result.checked.has_headers, true);
  assert.equal(result.blockers.length, 0);
});

test('public website source passes local security validator', async () => {
  const site = fileURLToPath(new URL('../website', import.meta.url));
  const result = await validatePublicSiteSecurity({ site }, { generated_at: '2026-06-23T12:00:00.000Z' });
  assert.equal(result.schema, PUBLIC_SITE_SECURITY_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.equal(result.blockers.length, 0);
  assert.equal(result.checked.has_index, true);
  assert.equal(result.checked.has_headers, true);
});

test('public site security validator blocks personal info, private files, and source maps', async () => {
  const site = await writeFixtureSite({ personalInfo: true, sourceMap: true, privateFile: true });
  const result = await validatePublicSiteSecurity({ site });
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => `${entry.path ?? ''} ${entry.message}`).join('\n');
  assert.match(messages, /email address/);
  assert.match(messages, /phone-number/);
  assert.match(messages, /street-address/);
  assert.match(messages, /forbidden private\/generated file path/);
});

test('public site security validator blocks raw-memory JSON values without banning boundary prose', async () => {
  const clean = await writeFixtureSite();
  const cleanResult = await validatePublicSiteSecurity({ site: clean });
  assert.equal(cleanResult.ok, true);

  const site = await writeFixtureSite({ rawJson: true });
  const result = await validatePublicSiteSecurity({ site });
  assert.equal(result.ok, false);
  assert.match(result.blockers.map((entry) => entry.message).join('\n'), /secret-looking content/);
});

test('public site security validator blocks weak headers and external scripts', async () => {
  const site = await writeFixtureSite({ badHeaders: true, externalScript: true });
  const result = await validatePublicSiteSecurity({ site });
  assert.equal(result.ok, false);
  const messages = result.blockers.map((entry) => entry.message).join('\n');
  assert.match(messages, /missing required security header|must be/);
  assert.match(messages, /external script|local link target is missing/);
});

test('public site security CLI returns blocked result for unsafe artifact', async () => {
  const site = await writeFixtureSite({ personalInfo: true });
  const result = await execFileAsync(process.execPath, [
    'scripts/validate-public-site-security.mjs',
    '--site',
    site,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, PUBLIC_SITE_SECURITY_RESULT_SCHEMA);
  assert.equal(output.ok, false);
  assert.match(JSON.stringify(output.blockers), /email address|phone-number/);
});
