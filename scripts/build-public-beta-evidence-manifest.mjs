#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PUBLIC_BETA_EVIDENCE_MANIFEST_SCHEMA = 'enigma.public_beta_evidence_manifest.v1';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULTS = Object.freeze({
  cleanMachineSmoke: '.enigma/public-beta/clean-machine-smoke.json',
  cleanMachineSmokePlan: '.enigma/public-beta/clean-machine-smoke-plan.json',
  supportDryRun: [
    '.enigma/public-beta/support-dry-run-diagnostics.json',
    '.enigma/public-beta/support-dry-run-crash.json',
  ],
  registryInstall: '.enigma/public-beta/registry-install.json',
  desktopReleaseEvidence: '.enigma/public-beta/desktop-release-evidence.json',
  productionHandoffPacket: '.enigma/public-beta/production-handoff-packet.json',
});

function usage() {
  return `Usage: node scripts/build-public-beta-evidence-manifest.mjs [--out <path>] [--plain] [evidence path overrides]\n\nBuilds a path-only ${PUBLIC_BETA_EVIDENCE_MANIFEST_SCHEMA} input manifest for npm run public-beta-qa -- --evidence-manifest <manifest.json>.\n\nEvidence path overrides:\n  --clean-machine-smoke <relative-json>\n  --clean-machine-smoke-plan <relative-json>\n  --support-dry-run <relative-json>     Repeatable.\n  --registry-install <relative-json>\n  --desktop-release-evidence <relative-json>\n  --production-handoff-packet <relative-json>\n\nPaths must be relative repository-local labels. The manifest embeds no artifact contents and performs no release action.\n`;
}

function readArg(argv, index, flag) {
  if (index >= argv.length || argv[index].startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return argv[index];
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    out: null,
    plain: false,
    help: false,
    cleanMachineSmoke: null,
    cleanMachineSmokePlan: null,
    supportDryRun: [],
    registryInstall: null,
    desktopReleaseEvidence: null,
    productionHandoffPacket: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--plain' || arg === '--text' || arg === '--format=text' || (arg === '--format' && argv[i + 1] === 'text')) {
      options.plain = true;
      if (arg === '--format') i += 1;
    } else if (arg === '--out') {
      options.out = readArg(argv, i + 1, '--out');
      i += 1;
    } else if (arg === '--clean-machine-smoke') {
      options.cleanMachineSmoke = readArg(argv, i + 1, arg);
      i += 1;
    } else if (arg === '--clean-machine-smoke-plan') {
      options.cleanMachineSmokePlan = readArg(argv, i + 1, arg);
      i += 1;
    } else if (arg === '--support-dry-run') {
      options.supportDryRun.push(readArg(argv, i + 1, arg));
      i += 1;
    } else if (arg === '--registry-install') {
      options.registryInstall = readArg(argv, i + 1, arg);
      i += 1;
    } else if (arg === '--desktop-release-evidence') {
      options.desktopReleaseEvidence = readArg(argv, i + 1, arg);
      i += 1;
    } else if (arg === '--production-handoff-packet') {
      options.productionHandoffPacket = readArg(argv, i + 1, arg);
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function publicRelativePath(value, label) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error(`${label} is required.`);
  if (isAbsolute(raw) || /^[A-Za-z]:[\\/]/u.test(raw)) throw new Error(`${label} must be a relative repository-local path.`);
  const normalized = normalize(raw).replace(/\\/g, '/');
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) throw new Error(`${label} must not escape the repository.`);
  if (/\0|\r|\n/u.test(normalized)) throw new Error(`${label} contains a control character.`);
  if (/(?:bearer\s+|token\s*[=:]|password\s*[=:]|api[_-]?key\s*[=:]|npm_|ghp_|sk-)/iu.test(normalized)) throw new Error(`${label} must not contain credential-shaped text.`);
  return normalized;
}

function pathList(values, fallback, label) {
  const list = Array.isArray(values) && values.length > 0 ? values : fallback;
  return list.map((value, index) => publicRelativePath(value, `${label}[${index}]`));
}

function buildEvidenceCollection({ cleanMachineSmoke, supportDryRun, registryInstall, desktopReleaseEvidence, productionHandoffPacket }) {
  return [
    {
      evidence_item_id: 'EV-P10-CLEAN-MACHINE-SMOKE',
      manifest_field: 'clean_machine_smoke',
      target_file: cleanMachineSmoke,
      collect: 'clean-machine smoke JSON after fresh install, first-run, connector, proof, offline, diagnostics, and uninstall checks',
    },
    {
      evidence_item_id: 'EV-P10-SUPPORT-DRY-RUN-SUMMARY',
      manifest_field: 'support_dry_run',
      target_file: supportDryRun,
      collect: 'support dry-run summaries with scenario id, issue code, triage result, privacy-check status, and support owner ref',
    },
    {
      evidence_item_id: 'EV-P10-REGISTRY-INSTALL',
      manifest_field: 'registry_install',
      target_file: registryInstall,
      collect: 'npm package version, registry package ref, install command used, and public-safe install result',
    },
    {
      evidence_item_id: 'EV-P10-DESKTOP-RELEASE-EVIDENCE',
      manifest_field: 'desktop_release_evidence',
      target_file: desktopReleaseEvidence,
      collect: 'signed desktop artifact refs, public checksums, signature or notarization results, update rehearsal, and download refs',
    },
    {
      evidence_item_id: 'EV-P10-PRODUCTION-HANDOFF-PACKET',
      manifest_field: 'production_handoff_packet',
      target_file: productionHandoffPacket,
      collect: 'release PR ref or URL, reviewer approval ref, merge ref, public-safe release packet approval, and handoff status',
    },
  ];
}

export function buildPublicBetaEvidenceManifest(options = {}, generatedAt = new Date().toISOString()) {
  const cleanMachineSmoke = publicRelativePath(options.cleanMachineSmoke ?? DEFAULTS.cleanMachineSmoke, 'clean_machine_smoke');
  const cleanMachineSmokePlan = publicRelativePath(options.cleanMachineSmokePlan ?? DEFAULTS.cleanMachineSmokePlan, 'clean_machine_smoke_plan');
  const supportDryRun = pathList(options.supportDryRun, DEFAULTS.supportDryRun, 'support_dry_run');
  const registryInstall = publicRelativePath(options.registryInstall ?? DEFAULTS.registryInstall, 'registry_install');
  const desktopReleaseEvidence = publicRelativePath(options.desktopReleaseEvidence ?? DEFAULTS.desktopReleaseEvidence, 'desktop_release_evidence');
  const productionHandoffPacket = publicRelativePath(options.productionHandoffPacket ?? DEFAULTS.productionHandoffPacket, 'production_handoff_packet');
  const manifest = {
    schema: PUBLIC_BETA_EVIDENCE_MANIFEST_SCHEMA,
    generated_at: generatedAt,
    public_safe: true,
    clean_machine_smoke: cleanMachineSmoke,
    clean_machine_smoke_plan: cleanMachineSmokePlan,
    support_dry_run: supportDryRun,
    registry_install: registryInstall,
    desktop_release_evidence: desktopReleaseEvidence,
    production_handoff_packet: productionHandoffPacket,
    evidence_collection: buildEvidenceCollection({ cleanMachineSmoke, supportDryRun, registryInstall, desktopReleaseEvidence, productionHandoffPacket }),
    next_command: 'npm run public-beta-qa -- --evidence-manifest <manifest.json>',
    safety: {
      embeds_artifact_contents: false,
      performs_release_action: false,
      paths_are_relative: true,
      absolute_paths_denied: true,
      credentials_denied: true,
    },
    claim_boundary: 'Path-only public beta evidence input manifest. It does not prove artifacts exist, pass QA, publish npm, sign installers, merge PRs, launch hosted services, or approve release gates.',
  };
  return manifest;
}

export function renderPublicBetaEvidenceManifestPlain(manifest, wrote = false) {
  const supportCount = Array.isArray(manifest.support_dry_run) ? manifest.support_dry_run.length : 0;
  const lines = [
    'Enigma public beta evidence manifest',
    'Status: Path manifest ready; evidence still must be collected',
    `Clean-machine smoke: ${manifest.clean_machine_smoke ?? '<path>'}`,
    `Clean-machine smoke plan: ${manifest.clean_machine_smoke_plan ?? '<path>'}`,
    `Support dry-runs: ${supportCount}`,
    `Registry install: ${manifest.registry_install ?? '<path>'}`,
    `Desktop release evidence: ${manifest.desktop_release_evidence ?? '<path>'}`,
    `Production handoff packet: ${manifest.production_handoff_packet ?? '<path>'}`,
    `Next: ${manifest.next_command ?? 'npm run public-beta-qa -- --evidence-manifest <manifest.json>'}`,
  ];
  for (const item of Array.isArray(manifest.evidence_collection) ? manifest.evidence_collection : []) {
    const target = Array.isArray(item.target_file) ? item.target_file.join(', ') : item.target_file;
    lines.push(`Collect next: ${item.evidence_item_id} into ${target}: ${item.collect}`);
  }
  if (wrote) lines.push('Manifest: written to <out>');
  lines.push('Boundary: path-only manifest; no artifact contents, credentials, local absolute paths, release action, signing claim, npm publish claim, PR approval claim, hosted-service claim, or public-beta readiness claim.');
  return `${lines.join('\n')}\n`;
}

export async function runCli(argv = process.argv.slice(2), io = { stdout: process.stdout }) {
  const options = parseArgs(argv);
  if (options.help) {
    io.stdout.write(usage());
    return 0;
  }
  const manifest = buildPublicBetaEvidenceManifest(options);
  if (options.out) {
    const outPath = resolve(options.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  if (options.plain) io.stdout.write(renderPublicBetaEvidenceManifestPlain(manifest, Boolean(options.out)));
  else io.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
