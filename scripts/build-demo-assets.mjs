#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEMO_ASSETS_MANIFEST_SCHEMA = 'enigma.demo_assets_manifest.v1';
export const DEMO_ASSET_VERSION = '2026-06-24.demo-assets.v1';

const DEFAULT_OUT_DIR = 'docs/demo-assets';
const SVG_FILE = 'receipt-flow-demo.svg';
const MANIFEST_FILE = 'demo-assets-manifest.json';

const FLOW_STEPS = Object.freeze([
  {
    id: 'vault',
    label: 'Vault',
    subtitle: 'Committed local memory address',
    x: 46,
    y: 98,
    width: 142,
    height: 74,
    color: '#7dd3fc',
  },
  {
    id: 'policy',
    label: 'Policy',
    subtitle: 'Purpose + boundary checks',
    x: 226,
    y: 98,
    width: 142,
    height: 74,
    color: '#c4b5fd',
  },
  {
    id: 'context-pack',
    label: 'Context Pack',
    subtitle: 'Plaintext-minimized payload',
    x: 406,
    y: 98,
    width: 160,
    height: 74,
    color: '#fde68a',
  },
  {
    id: 'model-boundary',
    label: 'Model Boundary',
    subtitle: 'Provider memory treated as cache',
    x: 604,
    y: 98,
    width: 180,
    height: 74,
    color: '#fca5a5',
  },
  {
    id: 'receipt',
    label: 'Receipt',
    subtitle: 'Signed Enigma lifecycle event',
    x: 824,
    y: 98,
    width: 150,
    height: 74,
    color: '#86efac',
  },
  {
    id: 'verifier',
    label: 'Verifier',
    subtitle: 'Offline proof check',
    x: 1014,
    y: 98,
    width: 150,
    height: 74,
    color: '#f9a8d4',
  },
]);

const CLAIM_BOUNDARY = Object.freeze([
  'Demo assets are public-safe source artifacts for storyboard and explainer use.',
  'They illustrate Enigma-controlled vault, policy, context-pack, receipt, and verifier flow only.',
  'They do not prove provider deletion, model forgetting, compliance certification, hosted readiness, or customer deployment status.',
]);

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = { outDir: DEFAULT_OUT_DIR, help: false };
  for (let index = 0; index < argv.length;) {
    const token = argv[index];
    if (token === '--help') return { ...out, help: true };
    if (token === '--out-dir') {
      if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) throw new UsageError('--out-dir requires a value');
      out.outDir = argv[index + 1];
      index += 2;
      continue;
    }
    throw new UsageError(`unknown option ${token}`);
  }
  return out;
}

function usage() {
  return `Usage: node scripts/build-demo-assets.mjs [--out-dir docs/demo-assets]\n\nGenerates deterministic, public-safe source demo assets: ${SVG_FILE} and ${MANIFEST_FILE}.\nNo external tools, credentials, network access, or video binaries are required.\n`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function connectorPath(from, to) {
  const startX = from.x + from.width;
  const startY = from.y + (from.height / 2);
  const endX = to.x;
  const endY = to.y + (to.height / 2);
  const midX = startX + ((endX - startX) / 2);
  return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
}

function renderStep(step, index) {
  const textX = step.x + 18;
  const titleY = step.y + 32;
  const subtitleY = step.y + 54;
  const delay = `${(index * 0.55).toFixed(2)}s`;
  return `  <g id="step-${escapeXml(step.id)}" class="step" style="--step-color:${step.color}; animation-delay:${delay}">
    <rect x="${step.x}" y="${step.y}" width="${step.width}" height="${step.height}" rx="18" />
    <circle cx="${step.x + 18}" cy="${step.y + 18}" r="5" />
    <text class="label" x="${textX}" y="${titleY}">${escapeXml(step.label)}</text>
    <text class="subtitle" x="${textX}" y="${subtitleY}">${escapeXml(step.subtitle)}</text>
  </g>`;
}

export function buildReceiptFlowSvg() {
  const connectors = FLOW_STEPS.slice(0, -1).map((step, index) => {
    const next = FLOW_STEPS[index + 1];
    return `  <path class="connector connector-${index + 1}" d="${connectorPath(step, next)}" pathLength="1" />`;
  }).join('\n');
  const steps = FLOW_STEPS.map(renderStep).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" viewBox="0 0 1210 300">
  <title id="title">Enigma receipt flow demo storyboard</title>
  <desc id="desc">Animated source SVG showing Vault to Policy to Context Pack to Model Boundary to Receipt to Verifier.</desc>
  <style>
    :root { color-scheme: light dark; }
    svg { background: #07111f; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .frame { fill: #0b1424; stroke: #22304a; stroke-width: 1; }
    .eyebrow { fill: #93a4bd; font-size: 12px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; }
    .headline { fill: #f8fafc; font-size: 28px; font-weight: 760; letter-spacing: -0.03em; }
    .boundary { fill: #111827; stroke: #fca5a5; stroke-dasharray: 7 8; stroke-width: 1.5; opacity: 0.72; }
    .boundary-label { fill: #fecaca; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    .connector { fill: none; stroke: #64748b; stroke-width: 3; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 4.8s ease-in-out infinite; }
    .connector-1 { animation-delay: 0.15s; }
    .connector-2 { animation-delay: 0.70s; }
    .connector-3 { animation-delay: 1.25s; }
    .connector-4 { animation-delay: 1.80s; }
    .connector-5 { animation-delay: 2.35s; }
    .step rect { fill: #0f172a; stroke: var(--step-color); stroke-width: 1.7; filter: drop-shadow(0 16px 22px rgb(0 0 0 / 0.24)); }
    .step circle { fill: var(--step-color); }
    .step { opacity: 0.45; transform-origin: center; animation: pulse 4.8s ease-in-out infinite; }
    .label { fill: #f8fafc; font-size: 17px; font-weight: 760; letter-spacing: -0.015em; }
    .subtitle { fill: #a7b4c7; font-size: 12px; font-weight: 550; }
    .claim { fill: #8ea0b8; font-size: 12px; font-weight: 560; }
    @keyframes draw { 0%, 10% { stroke-dashoffset: 1; stroke: #475569; } 38%, 78% { stroke-dashoffset: 0; stroke: #e2e8f0; } 100% { stroke-dashoffset: 0; stroke: #64748b; } }
    @keyframes pulse { 0%, 12% { opacity: 0.45; transform: translateY(0); } 28%, 68% { opacity: 1; transform: translateY(-4px); } 100% { opacity: 0.55; transform: translateY(0); } }
    @media (prefers-reduced-motion: reduce) { .connector, .step { animation: none; opacity: 1; } .connector { stroke-dashoffset: 0; } }
  </style>
  <rect class="frame" x="18" y="18" width="1174" height="264" rx="28" />
  <text class="eyebrow" x="46" y="54">Public-safe demo asset</text>
  <text class="headline" x="46" y="84">Enigma receipt flow: controlled state in, offline proof out</text>
  <rect class="boundary" x="586" y="86" width="216" height="100" rx="22" />
  <text class="boundary-label" x="616" y="204">No provider deletion or model-forgetting claim</text>
${connectors}
${steps}
  <text class="claim" x="46" y="246">Receipts prove Enigma lifecycle events and verifier checks for Enigma-controlled state only.</text>
</svg>
`;
}

function manifestFor(files) {
  const entries = files.map((file) => ({
    path: file.path,
    media_type: file.mediaType,
    bytes: Buffer.byteLength(file.contents, 'utf8'),
    sha256: sha256Hex(file.contents),
    role: file.role,
  })).sort((a, b) => a.path.localeCompare(b.path));
  const rootHash = createHash('sha256');
  for (const entry of entries) {
    rootHash.update(entry.path);
    rootHash.update('\0');
    rootHash.update(String(entry.bytes));
    rootHash.update('\0');
    rootHash.update(entry.sha256);
    rootHash.update('\n');
  }
  return {
    schema: DEMO_ASSETS_MANIFEST_SCHEMA,
    version: DEMO_ASSET_VERSION,
    deterministic: true,
    generated_by: 'scripts/build-demo-assets.mjs',
    output_files: entries,
    storyboard_flow: FLOW_STEPS.map((step, index) => ({
      order: index + 1,
      id: step.id,
      label: step.label,
      subtitle: step.subtitle,
    })),
    root_sha256: rootHash.digest('hex'),
    claim_boundary: CLAIM_BOUNDARY,
  };
}

export async function buildDemoAssets(options = {}) {
  const outDir = resolve(options.outDir ?? DEFAULT_OUT_DIR);
  const svg = buildReceiptFlowSvg();
  const manifest = manifestFor([
    {
      path: SVG_FILE,
      mediaType: 'image/svg+xml',
      contents: svg,
      role: 'animated storyboard source',
    },
  ]);
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, SVG_FILE), svg, 'utf8');
  await writeFile(resolve(outDir, MANIFEST_FILE), manifestJson, 'utf8');
  return {
    ok: true,
    schema: manifest.schema,
    version: manifest.version,
    out_dir: relative(process.cwd(), outDir).split(sep).join('/') || '.',
    files: [SVG_FILE, MANIFEST_FILE],
    root_sha256: manifest.root_sha256,
  };
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const result = await buildDemoAssets({ outDir: args.outDir });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  });
}
