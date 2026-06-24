import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  CLOUDFLARE_PAGES_RELEASE_PACKET_SCHEMA,
  buildCloudflarePagesReleasePacket,
} from '../scripts/build-cloudflare-pages-release-packet.mjs';

const execFileAsync = promisify(execFile);

async function writeSite(options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-pages-release-packet-'));
  await mkdir(join(dir, 'assets'), { recursive: true });
  await writeFile(join(dir, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'\n`, 'utf8');
  await writeFile(join(dir, 'index.html'), `<!doctype html><html><head><title>Enigma — Verifiable AI memory plane</title><link rel="stylesheet" href="/styles.css"></head><body><script src="/app.js"></script></body></html>\n`, 'utf8');
  await writeFile(join(dir, 'styles.css'), 'body{font-family:system-ui,sans-serif}\n', 'utf8');
  await writeFile(join(dir, 'app.js'), 'document.documentElement.dataset.enigma="ready";\n', 'utf8');
  await writeFile(join(dir, 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>\n', 'utf8');
  if (options.personalInfo) await writeFile(join(dir, 'contact.html'), 'Call 555-123-4567 before launch.\n', 'utf8');
  return dir;
}

function fakeFetch({ title = 'Enigma — Verifiable AI memory plane', status = 200 } = {}) {
  return async function fetchImpl(url, init) {
    assert.equal(init?.headers?.authorization, undefined);
    return {
      status,
      url,
      headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null },
      text: async () => `<!doctype html><html><head><title>${title}</title></head><body>Launch</body></html>`,
    };
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('Cloudflare Pages release packet accepts secure local artifact and records deploy blockers', async () => {
  const site = await writeSite();
  const packet = await buildCloudflarePagesReleasePacket({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
    liveUrl: 'https://enigmamemory.com/',
    expectTitle: 'Enigma',
  }, {
    env: {},
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch({ title: 'Engram — The old page' }),
  });
  assert.equal(packet.schema, CLOUDFLARE_PAGES_RELEASE_PACKET_SCHEMA);
  assert.equal(packet.local_artifact_ready, true);
  assert.equal(packet.automated_deploy_ready, false);
  assert.equal(packet.credential_present, false);
  assert.equal(packet.deploy_plan.tokenPrinted, false);
  assert.equal(packet.deploy_plan.dryRun, true);
  assert.equal(packet.security.ok, true);
  assert.match(packet.artifact.root_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(packet.live_observation.title, 'Engram — The old page');
  assert.equal(packet.live_observation.title_matched, false);
  assert.match(packet.deployment_blockers.join('\n'), /CLOUDFLARE_API_TOKEN is absent/);
  assert.match(packet.deployment_blockers.join('\n'), /live title did not include/);
  assert.equal(packet.site, '<public-site>');
  assert.equal(packet.deploy_plan.args.includes('<public-site>'), true);
  assert.doesNotMatch(JSON.stringify(packet), new RegExp(escapeRegExp(site)));
  assert.doesNotMatch(JSON.stringify(packet), /Bearer|PRIVATE KEY|sk-/i);
});

test('Cloudflare Pages release packet blocks unsafe static artifacts before deploy', async () => {
  const site = await writeSite({ personalInfo: true });
  const packet = await buildCloudflarePagesReleasePacket({
    site,
    projectName: 'enigma-memory',
    domain: 'enigmamemory.com',
  }, {
    env: { CLOUDFLARE_API_TOKEN: 'cf-token-present-but-not-printed' },
    generated_at: '2026-06-24T00:00:00.000Z',
    fetchImpl: fakeFetch(),
  });
  assert.equal(packet.local_artifact_ready, false);
  assert.equal(packet.automated_deploy_ready, false);
  assert.equal(packet.credential_present, true);
  assert.match(packet.blockers.join('\n'), /phone-number/);
  assert.doesNotMatch(JSON.stringify(packet), new RegExp(escapeRegExp(site)));
  assert.doesNotMatch(JSON.stringify(packet), /cf-token-present-but-not-printed/);
});

test('Cloudflare Pages release packet CLI writes public-safe JSON', async () => {
  const site = await writeSite();
  const outPath = join(await mkdtemp(join(tmpdir(), 'enigma-pages-packet-out-')), 'packet.json');
  const result = await execFileAsync(process.execPath, [
    'scripts/build-cloudflare-pages-release-packet.mjs',
    '--site',
    site,
    '--project-name',
    'enigma-memory',
    '--domain',
    'enigmamemory.com',
    '--out',
    outPath,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, CLOUDFLARE_API_TOKEN: 'cf-token-present-but-not-printed' },
    timeout: 10000,
    windowsHide: true,
  });
  assert.equal(result.stderr, '');
  const stdoutPacket = JSON.parse(result.stdout);
  const filePacket = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(stdoutPacket.schema, CLOUDFLARE_PAGES_RELEASE_PACKET_SCHEMA);
  assert.equal(filePacket.artifact.root_hash, stdoutPacket.artifact.root_hash);
  assert.equal(stdoutPacket.local_artifact_ready, true);
  assert.equal(stdoutPacket.credential_present, true);
  assert.equal(stdoutPacket.automated_deploy_ready, true);
  assert.equal(stdoutPacket.site, '<public-site>');
  assert.equal(stdoutPacket.deploy_plan.args.includes('<public-site>'), true);
  assert.doesNotMatch(result.stdout, new RegExp(escapeRegExp(site)));
  assert.doesNotMatch(result.stdout, /cf-token-present-but-not-printed|Bearer|PRIVATE KEY|sk-/i);
});

test('Cloudflare Pages release packet CLI redacts local paths on errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-pages-packet-missing-'));
  const missingSite = join(dir, 'missing-site');
  const result = await execFileAsync(process.execPath, [
    'scripts/build-cloudflare-pages-release-packet.mjs',
    '--site',
    missingSite,
    '--project-name',
    'enigma-memory',
  ], {
    cwd: process.cwd(),
    timeout: 10000,
    windowsHide: true,
  }).catch((error) => error);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, '');
  const packet = JSON.parse(result.stdout);
  assert.equal(packet.schema, CLOUDFLARE_PAGES_RELEASE_PACKET_SCHEMA);
  assert.equal(packet.ok, false);
  assert.doesNotMatch(result.stdout, new RegExp(escapeRegExp(missingSite)));
  assert.doesNotMatch(result.stdout, /enigma-pages-packet-missing-/);
});
