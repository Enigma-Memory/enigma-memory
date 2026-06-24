# Local release provenance and SBOM evidence

Enigma's local provenance/SBOM evidence is generated from the package-surface files on the reviewer's workstation. It is intentionally local and unsigned: it records a package file inventory and SHA-256 values so another reviewer can compare the same checkout or artifact directory later without depending on git, npm registry attestations, cloud signing, Docker, or deployment credentials.

## Generate the evidence

Run from a source checkout:

```sh
cd enigma
npm run provenance:local -- --out ./.enigma/release-provenance.json
```

With `--out`, the command writes `./.enigma/release-provenance.json` and prints a summary shaped like `{ ok, path, file_count, root_hash }`. Without `--out`, it prints the full `enigma.release_provenance.v1` JSON to stdout. Treat the JSON as release evidence for the exact package-surface files the command inventoried. If source files, generated public-site manifests, or package contents change, rerun the command and review the checksum changes before relying on the evidence.

Current JSON uses `schema: "enigma.release_provenance.v1"`, `evidence.kind: "local_checksum_provenance"`, package metadata, `counts`, optional `ci_workflow`, optional `public_site_manifest`, `root_hash`, and a `files` array of `{ path, bytes, sha256 }` records. Hash values are SHA-256 values in `sha256:<hex>` form. The `root_hash` is derived from the recorded file checksums and paths.

## What this proves

The local provenance/SBOM file supports these limited reviewer checks:

- The command recorded the package-surface files available in that checkout or artifact directory at generation time.
- The evidence file lists local release inputs and/or package artifact entries discovered by the command.
- Each listed file path is bound to a SHA-256 value for the bytes read locally at generation time.
- The generated JSON can be retained and later compared with a fresh run to detect local file drift.
- The evidence can be used beside `npm pack --dry-run` output, CI logs, and the public-site artifact build log to explain which local files were reviewed.

## What this does not prove

Do not describe this evidence as any of the following:

- signed provenance or a signed attestation;
- registry provenance from npm or any other package registry;
- source-control commit identity, branch identity, or git clean-state evidence;
- SLSA level, SOC 2, HIPAA, GDPR, or other compliance status;
- Docker image digest, container runtime evidence, or Docker daemon verification;
- Cloudflare, hosted cloud, customer BYOC, domain, TLS, KMS/secrets, SIEM, backup, monitoring, or deployment evidence;
- proof that a third-party provider deleted data, a model forgot data, or external systems removed hidden state.

Those claims require separate infrastructure, credentials, signing systems, registry metadata, source-control evidence, legal/security review, or operator acceptance.

## Reviewer interpretation steps

1. Start from the release checkout or artifact directory being reviewed.
2. Run:

   ```sh
   npm run provenance:local -- --out ./.enigma/release-provenance.json
   ```

3. Open `./.enigma/release-provenance.json` and confirm `schema` is `enigma.release_provenance.v1`, `evidence.kind` is `local_checksum_provenance`, the claim boundary says the evidence is local/unsigned, and the file entries include `path`, `bytes`, and `sha256`.
4. For any file under review, compute a fresh SHA-256 hash from disk and compare it with the recorded checksum value. A portable Node command is:

   ```sh
   node --input-type=module -e "import { createHash } from 'node:crypto'; import { readFile } from 'node:fs/promises'; const file = process.argv[1]; const hash = createHash('sha256').update(await readFile(file)).digest('hex'); console.log('sha256:' + hash + '  ' + file);" README.md
   ```

   To compare the computed value against the JSON in one step:

   ```sh
   node --input-type=module -e "import { createHash } from 'node:crypto'; import { readFile } from 'node:fs/promises'; const evidence = JSON.parse(await readFile('./.enigma/release-provenance.json', 'utf8')); const file = process.argv[1]; const expected = evidence.files.find((entry) => entry.path === file)?.sha256; if (!expected) throw new Error('missing ' + file); const actual = 'sha256:' + createHash('sha256').update(await readFile(file)).digest('hex'); if (actual !== expected) throw new Error(file + ' checksum mismatch: ' + actual + ' !== ' + expected); console.log(file + ' checksum matches ' + actual);" README.md
   ```

5. If two provenance files need to be compared, compare their recorded `(path, sha256)` pairs. Any changed hash means the local bytes changed; any added or removed path means the reviewed local inventory changed.
6. If the review also uses `npm pack --dry-run`, compare the dry-run package file list with the provenance `files` inventory. `npm pack --dry-run` explains what would enter the npm tarball; local provenance records checksums for the package-surface files the command inventories. They are complementary, not substitutes.
7. If the public site artifact is part of the release review, run the public-site artifact build first, then rerun local provenance and check `public_site_manifest`. That optional record hashes the local public-site manifest when present; it is not a full Cloudflare deployment proof and does not by itself prove DNS, TLS, cache state, or live availability.
8. Store the JSON with release notes or CI artifacts if desired. Without an external signer, registry attestation, or source-control commit reference, store it as local checksum evidence only.

## Relationship to other release gates

- `npm run release:audit` remains the package/demo gate for checks, tests, package dry-run, direct-bin smokes, and MCP stdio smoke.
- `npm pack --dry-run` remains the package-content preview. Local provenance can hash files associated with that review, but it does not create a package tarball and does not prove registry publication.
- CI may run `npm run provenance:local -- --out ./.enigma/release-provenance.json` and upload the JSON as a build artifact. A CI artifact is still local/build-run evidence unless the workflow also adds a separate signing or registry attestation step.
- The public-site artifact build proves a local generated static artifact exists and can be reviewed. Local provenance records `public_site_manifest` as `null` or as the local manifest checksum when a recognized manifest exists; it does not prove hosted availability, DNS, TLS, Cloudflare configuration, cache state, or deployment success.

## External blockers preserved

Local provenance/SBOM evidence does not close existing blockers for npm publication credentials, Docker daemon/runtime smoke, hosted cloud/BYOC deployment, Cloudflare custom domain, browser native-host registration, token/legal review, or compliance certification. Keep those blockers explicit in release notes and evidence summaries.
