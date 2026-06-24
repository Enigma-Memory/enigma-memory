import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const WHITEPAPER_PATH = new URL('../docs/enigma-memory-technical-whitepaper.md', import.meta.url);

function section(text, heading) {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing section ${heading}`);
  const next = text.indexOf('\n## ', start + heading.length);
  return next === -1 ? text.slice(start) : text.slice(start, next);
}

test('technical memory whitepaper has math diagrams and claim boundaries', async () => {
  const text = await readFile(WHITEPAPER_PATH, 'utf8');
  assert.match(text, /^# Enigma Memory technical whitepaper/m);
  for (const required of [
    '$$\nM_t =',
    '$$\nA_t =',
    '$$\nT_{base}',
    '$$\nT_{opt}',
    '$$\n\\Delta_T',
    '$$\nC(T,r)',
    '```mermaid',
    'npm run memory:benchmark',
    'enigma.memory_optimization_benchmark.v1',
    'hosted_live_ready',
    '$$\nD_E(X)=',
    'V(P) = (C, L, \\Pi, O, E, S)',
    'Memory-layer evaluation framework',
  ]) {
    assert.ok(text.includes(required), `whitepaper missing ${required}`);
  }
  assert.ok((text.match(/```mermaid/g) ?? []).length >= 3, 'whitepaper must include at least three diagrams');
  assert.match(section(text, '## 8. Claim boundary'), /must not claim/i);
  assert.match(section(text, '## 7. Production readiness boundary'), /no external blockers/i);
});

test('technical memory whitepaper keeps competitive claims evidence-bounded', async () => {
  const text = await readFile(WHITEPAPER_PATH, 'utf8');
  const riskyClaims = [
    /guaranteed\s+(?:savings|discount|roi)/i,
    /\b\d{1,2}(?:\.\d+)?%\s+(?:cheaper|discount|cost\s+reduction)\b/i,
    /provider-side deletion\s+is\s+proven/i,
    /model forgetting\s+is\s+proven/i,
    /compliance\s+certified/i,
  ];
  for (const pattern of riskyClaims) assert.doesNotMatch(text, pattern);
  assert.match(text, /not a public invoice benchmark or universal discount claim/i);
  assert.match(text, /Permissionless systems can be useful at the edge: access, settlement/i);
  assert.match(text, /They should not own raw memory by default/i);
  assert.match(text, /bundle of custody, lifecycle state, policy-scoped serving, context efficiency, verifier evidence, and settlement separation/i);
  assert.match(section(text, '### 5.6 Memory-layer evaluation framework'), /not a theorem of universal superiority/i);
  assert.match(section(text, '### 5.6 Memory-layer evaluation framework'), /fixed weights, records measured scores/i);
  assert.doesNotMatch(section(text, '### 5.6 Memory-layer evaluation framework'), /\\exists W[\s\S]*D_E\(X\) > 0/);
});
