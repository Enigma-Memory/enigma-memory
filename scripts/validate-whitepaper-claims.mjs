#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WHITEPAPER_CLAIMS_RESULT_SCHEMA = 'enigma.whitepaper_claims_result.v1';

const REQUIRED_HEADINGS = Object.freeze([
  '# Enigma Memory technical whitepaper',
  '## Abstract',
  '## 2. System model',
  '## 3. Commitment and receipt chain',
  '## 4. Context selection and optimization',
  '## 5. How Enigma differs from adjacent systems',
  '### 5.6 Memory-layer evaluation framework',
  '## 6. Privacy and leakage model',
  '## 7. Production readiness boundary',
  '## 8. Claim boundary',
]);

const REQUIRED_TERMS = Object.freeze([
  'provider-neutral memory custody',
  'local/BYOC',
  'active_set_root',
  'T_{base}',
  'T_{opt}',
  'D_E(X)',
  'RawMemory \\notin PublicEvidence',
  'hosted_live_ready',
  'npm run memory:benchmark',
]);

const ABSOLUTE_CLAIM_RE = /(?:\$\s*100\s*billion|100\s*billion|best\s+in\s+the\s+world|guaranteed|guarantee|universal\s+(?:invoice\s+)?savings|provider[-\s]?side\s+deletion|model\s+forgetting|token\s+ROI|compliance\s+certification|tamper-proof|live\s+hosted\s+backend\s+readiness)/iu;
const DENY_CONTEXT_RE = /(?:does\s+\W*not\s+\W*claim|must\s+\W*not\s+\W*claim|must\s+not\s+infer|not\s+a|not\s+provider|not\s+hosted|not\s+ready|without\s+separate\s+evidence|before\s+production\s+dependencies|is\s+not\s+a|should\s+not)/iu;
const SECRET_RE = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}|https?:\/\/[^\s/@]+:[^\s/@]+@)/iu;
const LOCAL_PATH_RE = /(?:[A-Z]:\\Users\\|\/Users\/|\/home\/)/u;

function countRegex(text, regex) {
  return [...text.matchAll(regex)].length;
}

function lineNumberedFindings(text, regex, allowedContext) {
  const findings = [];
  const lines = text.split(/\r?\n/u);
  let denyBlock = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalizedLine = line.replace(/[*_`]/gu, '');
    const normalizedWindow = [lines[index - 2] ?? '', lines[index - 1] ?? '', line]
      .join(' ')
      .replace(/[*_`]/gu, '');
    if (/^##\s+/u.test(line) && !/claim boundary/iu.test(line)) denyBlock = false;
    if (allowedContext?.test(normalizedWindow)) denyBlock = true;
    if (!regex.test(line)) continue;
    if (allowedContext?.test(normalizedLine) || allowedContext?.test(normalizedWindow) || denyBlock) continue;
    findings.push({ line: index + 1, text: line.trim().slice(0, 160) });
  }
  return findings;
}

export function validateWhitepaperClaims(markdown, options = {}) {
  if (typeof markdown !== 'string' || markdown.trim().length === 0) throw new Error('whitepaper markdown is required');
  const blockers = [];
  const warnings = [];
  const headingMissing = REQUIRED_HEADINGS.filter((heading) => !markdown.includes(heading));
  const termMissing = REQUIRED_TERMS.filter((term) => !markdown.includes(term));
  for (const heading of headingMissing) blockers.push(`missing heading: ${heading}`);
  for (const term of termMissing) blockers.push(`missing required technical term: ${term}`);

  const equationBlockCount = countRegex(markdown, /^\$\$/gmu) / 2;
  const mermaidCount = countRegex(markdown, /```mermaid/gmu);
  const mathSymbolCount = countRegex(markdown, /(?:T_\{base\}|T_\{opt\}|\Delta_\{|D_E\(X\)|MerkleSetRoot|PublicEvidence|RawMemory)/gu);
  if (equationBlockCount < 10) blockers.push(`expected at least 10 displayed equation blocks; found ${equationBlockCount}`);
  if (mermaidCount < 4) blockers.push(`expected at least 4 Mermaid diagrams; found ${mermaidCount}`);
  if (mathSymbolCount < 8) blockers.push(`expected at least 8 math/evaluation symbols; found ${mathSymbolCount}`);

  const absoluteFindings = lineNumberedFindings(markdown, ABSOLUTE_CLAIM_RE, DENY_CONTEXT_RE);
  for (const finding of absoluteFindings) blockers.push(`unsupported absolute claim on line ${finding.line}: ${finding.text}`);
  const secretFindings = lineNumberedFindings(markdown, SECRET_RE);
  for (const finding of secretFindings) blockers.push(`secret-looking content on line ${finding.line}`);
  const pathFindings = lineNumberedFindings(markdown, LOCAL_PATH_RE);
  for (const finding of pathFindings) blockers.push(`local path content on line ${finding.line}`);

  if (!/This is an evaluation framework, not a theorem of universal superiority\./u.test(markdown)) blockers.push('missing explicit evaluation-framework claim boundary');
  if (!/This is deliberately not a provider invoice guarantee\./u.test(markdown)) blockers.push('missing provider-invoice savings boundary');
  if (!/A hosted deployment is not ready because code exists\./u.test(markdown)) blockers.push('missing hosted readiness boundary');
  if (!/Raw memory is excluded:/u.test(markdown)) blockers.push('missing raw-memory public evidence exclusion');
  if (/better than anything else out there/iu.test(markdown)) warnings.push('marketing superlative phrase should stay out of technical whitepaper');

  return {
    schema: WHITEPAPER_CLAIMS_RESULT_SCHEMA,
    generated_at: options.generated_at ?? options.generatedAt ?? new Date(0).toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'accepted' : 'blocked',
    path: options.path ?? null,
    counts: {
      headings_required: REQUIRED_HEADINGS.length,
      headings_missing: headingMissing.length,
      required_terms: REQUIRED_TERMS.length,
      required_terms_missing: termMissing.length,
      displayed_equation_blocks: equationBlockCount,
      mermaid_diagrams: mermaidCount,
      math_symbol_mentions: mathSymbolCount,
      unsupported_absolute_claims: absoluteFindings.length,
      secret_findings: secretFindings.length,
      local_path_findings: pathFindings.length,
    },
    warnings,
    blockers,
    claim_boundary: [
      'This validator checks that the whitepaper contains math, diagrams, and explicit claim boundaries; it does not prove market leadership or $100B value.',
      'Passing validation means the document is evidence-bounded and structurally complete, not that hosted infrastructure is live.',
    ],
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = { file: 'docs/enigma-memory-technical-whitepaper.md', out: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      out.help = true;
      continue;
    }
    const readValue = () => {
      const value = argv[index + 1];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) throw new Error(`${token} requires a value`);
      index += 1;
      return value;
    };
    if (token === '--file') out.file = readValue();
    else if (token === '--out') out.out = readValue();
    else throw new Error(`unknown option ${token}`);
  }
  return out;
}

function usage() {
  return 'Usage: node scripts/validate-whitepaper-claims.mjs [--file docs/enigma-memory-technical-whitepaper.md] [--out <file>]\n\nValidates math/diagram coverage and claim boundaries for the Enigma Memory technical whitepaper.\n';
}

async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) return { text: usage(), code: 0 };
  const file = resolve(args.file);
  const markdown = await readFile(file, 'utf8');
  const result = validateWhitepaperClaims(markdown, { path: args.file, generated_at: new Date().toISOString() });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (args.out) {
    const outPath = resolve(args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, json, 'utf8');
  }
  return { text: json, code: result.ok ? 0 : 1 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const { text, code } = await runCli();
    process.stdout.write(text);
    process.exitCode = code;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
