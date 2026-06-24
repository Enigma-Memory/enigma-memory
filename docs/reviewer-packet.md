# Reviewer packet

The reviewer packet is a local handoff bundle for a human reviewer who needs the package, local-release, checksum, and optional public-site evidence in one directory. It exists so reviewers do not have to reconstruct the release-audit and provenance commands by hand.

It is **local evidence only**. It is not npm publication, signed provenance, registry attestation, source-control proof, SLSA/compliance status, legal approval, Docker image digest/runtime proof, live Cloudflare deployment proof, hosted-service availability, or hosted/BYOC readiness.

## Build the packet

Run from the repository package directory after dependencies are installed:

```sh
cd enigma
npm run review:packet -- --out ./.enigma-review-packet --public-site <path-to-_public_site>
```

Use `--public-site` only with a generated public-site artifact directory that has already been built and reviewed as public-safe. For example, if the public-site build produced `./_public_site`, pass `--public-site ./_public_site`. The review-packet command copies that existing artifact into `site/`; it does not build the public site and does not prove that the artifact is deployed to Cloudflare or reachable through DNS/TLS.

If the public-site artifact is not in scope for the review, omit `--public-site` and review the manifest as local/package evidence only. The command writes `REVIEW_PACKET_MANIFEST.json` even when it records blockers; a nonzero exit means the manifest's `blockers` array must be reviewed and resolved or preserved as an explicit release blocker.

When public pages are in scope, build the static public-site artifact first and pass that generated directory to the packet builder:

```sh
python scripts/build_public_site.py
npm run review:packet -- --out ./.enigma-review-packet --public-site ./_public_site
```

Before treating a generated public-site directory as Cloudflare-ready input, run the credential-free artifact preflight from the public-site package/artifact root:

```sh
python scripts/preflight_public_site.py --site _public_site
```

The preflight reads the local static artifact and prints JSON fields including `schema`, `ok`, `site`, `checked`, `checked_counts`, `warnings`, and `blockers`. It does not require Cloudflare credentials, does not deploy, does not mutate DNS/TLS/cache state, and exits nonzero when local blockers are present. A clean local preflight reduces operator error before handoff, but live Cloudflare deployment and domain verification remain external evidence.

## Packet contents

The output directory is disposable evidence. Recreate it from the checkout or artifact being reviewed instead of editing it by hand.

Expected files:

| Path | Purpose | Evidence boundary |
| --- | --- | --- |
| `REVIEW_PACKET_MANIFEST.json` | Machine-readable index for the packet, including schema `enigma.review_packet.v1`, claim boundary, command summaries, copied-doc/site metadata, blockers, and SHA-256 checksums for packet payload files. | Proves only what the local packet builder wrote and hashed. |
| `evidence/release-audit.json` | Captured `npm run release:audit` summary for the local package/demo gates. | Local package/demo audit only; not Docker, npm publish, hosted deployment, legal/compliance, or live website evidence. |
| `evidence/local-provenance.json` | Captured `npm run provenance:local` output for package-surface file inventory and SHA-256 values. | Unsigned local checksum/SBOM evidence only. |
| `package/npm-pack-dry-run.json` | Captured `npm pack --dry-run --json --ignore-scripts` preview. | Tarball preview only; it does not publish to npm or prove registry provenance. |
| `docs/` | Copied source review documents when present: `docs/README.md`, `docs/SECURITY.md`, `docs/docs/release-evidence-2026-06-23.md`, `docs/docs/security-threat-model.md`, `docs/docs/public-api-reference.md`, `docs/docs/operator-acceptance-packet.md`, `docs/docs/release-provenance-and-sbom.md`, `docs/launch/02_WHITEPAPER.md`, and `docs/docs/competitive-memory-analysis.md`. | Source-review collateral only; not hosted docs or legal/compliance approval. |
| `site/` | Optional copy of the directory passed with `--public-site`. | Local static artifact review only; not Cloudflare deployment, DNS, TLS, cache state, or live availability evidence. |

Treat `REVIEW_PACKET_MANIFEST.json` as the source of truth for the exact files present in a specific packet. The manifest's `files` array lists payload files, not the manifest itself. If an optional artifact is absent or the manifest records a blocker, do not infer that the corresponding release surface was verified.

The manifest also records `commands` for the provenance, release-audit, and package dry-run captures; `docs.copied` and `docs.skipped`; `site.copied` and `site.denied`; and a `blockers` array. A packet with blockers is not failed evidence to reinterpret as success: carry those blockers into the review notes.

The packet must not contain private/internal launch collateral, local `.enigma` vault state, raw memory examples, provider exports, credentials, secrets, tokens, logs, or unpublished legal/token/investment-sensitive collateral.

## Inspect checksums

Open `REVIEW_PACKET_MANIFEST.json` first and confirm the manifest schema, claim boundary, output path, command summaries, blockers, and file list match the packet under review. Each manifest `files` entry should include a relative `path`, byte count, and `sha256:<hex>` checksum for a payload file.

Spot-check a payload file from the packet with Node:

```sh
cd enigma
node --input-type=module -e "import { createHash } from 'node:crypto'; import { readFile } from 'node:fs/promises'; const file = process.argv[1]; const hash = createHash('sha256').update(await readFile(file)).digest('hex'); console.log('sha256:' + hash + '  ' + file);" ./.enigma-review-packet/evidence/local-provenance.json
```

Compare the printed value with the manifest entry for `evidence/local-provenance.json`. To compare two packets, compare their manifest `(path, sha256)` pairs; added paths, removed paths, and changed hashes are local packet drift.

For package-surface checksums, inspect `evidence/local-provenance.json` separately. Its `files` array records package-surface paths and SHA-256 values for the checkout/artifact that generated it, and its `root_hash` summarizes those recorded entries. Those checksums remain unsigned local evidence unless a separate signing or registry attestation system is added.

## Relationship to release gates

- `npm run review:packet` is the hand-review bundle command. It gathers evidence for a human to inspect, records command results, and records blockers in the manifest.
- `npm run release:audit` remains the repeatable local package/demo gate. The packet includes `evidence/release-audit.json` for convenience, but the audit still proves only the local gates it runs.
- `npm run provenance:local -- --out ./.enigma/release-provenance.json` remains the local package-surface checksum/SBOM command. The packet includes equivalent local provenance evidence at `evidence/local-provenance.json`.
- The public-site build remains a separate local artifact build. Build it first, for example with `python scripts/build_public_site.py`, then pass the generated `_public_site` directory through `--public-site` so the packet copies it into `site/`. The packet does not build or deploy the site by itself.
- `python scripts/preflight_public_site.py --site _public_site` is the credential-free public-site preflight for a generated artifact. It checks local artifact shape and claim-boundary inputs before Cloudflare handoff, but it does not upload, deploy, change DNS/TLS, warm caches, or prove live availability.
- Docker image build/runtime evidence remains separate unless a reviewer also runs the Docker commands in the production release checklist. A packet is not a Docker image digest or runtime smoke.
- CI can produce a packet as a build artifact if configured to do so, but CI artifact storage is still local/build-run evidence unless separate signing, registry provenance, or deployment attestation is added.

## What the packet does not prove

Do not use a review packet as evidence of:

- npm publication or package availability from `@enigma-ai/enigma`.
- signed provenance, registry attestation, source-control commit identity, clean git state, SLSA level, or compliance certification.
- Docker image digest, container runtime behavior, hosted relay/gateway deployment, Cloudflare Pages deployment, DNS/TLS, cache state, or live website availability.
- hosted Enigma cloud or customer BYOC readiness; those require deployment credentials, domain/TLS, durable storage, KMS/secrets, monitoring, backups, incident ownership, tenant/operator policy, SIEM/log routing, support/SLA approval, legal/compliance status, and a completed operator acceptance packet.
- provider-side deletion, model forgetting, semantic forgetting, factual truth of memory contents, or completeness of imported provider exports.
- legal approval, token approval, investment claims, ROI, revenue share, equity, or compliance claims.

## Reviewer flow

1. Build or obtain the checkout/artifact to review.
2. Run `npm run release:audit` directly if you want to see the local gate output live.
3. Build the public-site artifact with `python scripts/build_public_site.py` if public pages are in scope.
4. Run `python scripts/preflight_public_site.py --site _public_site` from the public-site package/artifact root and resolve or explicitly carry any reported local blockers.
5. Run `npm run review:packet -- --out ./.enigma-review-packet --public-site ./_public_site`, or replace `./_public_site` with the generated artifact path being reviewed.
6. Open `REVIEW_PACKET_MANIFEST.json` and inspect the claim boundary, command summaries, blockers, listed files, and checksums.
7. Inspect `evidence/release-audit.json`, `evidence/local-provenance.json`, `package/npm-pack-dry-run.json`, copied `docs/`, and `site/` when present.
8. Record any missing external evidence as a blocker instead of treating the packet or preflight as proof of deployment, publication, legal/compliance approval, Docker runtime, Cloudflare live availability, or hosted/BYOC readiness.
