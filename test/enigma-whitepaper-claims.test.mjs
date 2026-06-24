import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  WHITEPAPER_CLAIMS_RESULT_SCHEMA,
  validateWhitepaperClaims,
} from '../scripts/validate-whitepaper-claims.mjs';

const execFileAsync = promisify(execFile);
const WHITEPAPER_PATH = 'docs/enigma-memory-technical-whitepaper.md';

test('whitepaper claims validator accepts current technical whitepaper', async () => {
  const markdown = await readFile(WHITEPAPER_PATH, 'utf8');
  const result = validateWhitepaperClaims(markdown, { generated_at: '2026-06-24T00:00:00.000Z', path: WHITEPAPER_PATH });
  assert.equal(result.schema, WHITEPAPER_CLAIMS_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.ok(result.counts.displayed_equation_blocks >= 10);
  assert.ok(result.counts.mermaid_diagrams >= 4);
  assert.equal(result.counts.unsupported_absolute_claims, 0);
  assert.match(result.claim_boundary.join('\n'), /does not prove market leadership/);
});

test('whitepaper claims validator rejects unsupported superlatives and missing proof structure', () => {
  const invalid = '# Enigma Memory technical whitepaper\n\nEnigma is the best in the world and guaranteed to produce universal invoice savings.\n';
  const result = validateWhitepaperClaims(invalid, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(result.ok, false);
  assert.match(result.blockers.join('\n'), /unsupported absolute claim|missing heading|equation/);
});

test('whitepaper claims validator allows explicit negative claim boundaries', () => {
  const markdown = [
    '# Enigma Memory technical whitepaper',
    '## Abstract',
    'Enigma does not claim provider-side deletion, model forgetting, universal invoice savings, token ROI, compliance certification, tamper-proof hardware, or live hosted backend readiness without separate evidence.',
    '## 2. System model',
    '## 3. Commitment and receipt chain',
    '## 4. Context selection and optimization',
    '## 5. How Enigma differs from adjacent systems',
    '### 5.6 Memory-layer evaluation framework',
    'This is an evaluation framework, not a theorem of universal superiority.',
    'This is deliberately not a provider invoice guarantee.',
    'A hosted deployment is not ready because code exists.',
    'Raw memory is excluded:',
    '## 6. Privacy and leakage model',
    '## 7. Production readiness boundary',
    '## 8. Claim boundary',
    'provider-neutral memory custody local/BYOC active_set_root T_{base} T_{opt} D_E(X) RawMemory \\notin PublicEvidence hosted_live_ready npm run memory:benchmark',
    '```mermaid\nflowchart TD\nA-->B\n```',
    '```mermaid\nflowchart TD\nA-->B\n```',
    '```mermaid\nflowchart TD\nA-->B\n```',
    '```mermaid\nflowchart TD\nA-->B\n```',
    ...Array.from({ length: 10 }, (_, index) => `$$\nx_${index}=x_${index - 1}+1\n$$`),
    'T_{base} T_{opt} Delta D_E(X) MerkleSetRoot PublicEvidence RawMemory',
  ].join('\n\n');
  const result = validateWhitepaperClaims(markdown, { generated_at: '2026-06-24T00:00:00.000Z' });
  assert.equal(result.counts.unsupported_absolute_claims, 0);
});

test('whitepaper claims validator CLI writes public-safe JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enigma-whitepaper-claims-'));
  const outPath = join(dir, 'whitepaper-result.json');
  const run = await execFileAsync(process.execPath, [
    'scripts/validate-whitepaper-claims.mjs',
    '--file', WHITEPAPER_PATH,
    '--out', outPath,
  ], { cwd: process.cwd(), timeout: 10000, windowsHide: true });
  assert.equal(run.stderr, '');
  const stdoutResult = JSON.parse(run.stdout);
  const fileResult = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(stdoutResult.schema, WHITEPAPER_CLAIMS_RESULT_SCHEMA);
  assert.deepEqual(fileResult, stdoutResult);
  assert.equal(stdoutResult.ok, true);
  assert.doesNotMatch(run.stdout, /Bearer|PRIVATE KEY|sk-[A-Za-z0-9_-]{16,}|100\s*billion/i);
});
