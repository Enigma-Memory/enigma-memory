# npm publishing runbook

Use this runbook to publish the public `enigma-memory` package to npm from the public source repository. It does not publish by itself, create npm accounts, mutate GitHub settings, or prove hosted/cloud readiness.

## Preconditions

- The public repository setup runbook has been completed for the source repository.
- `package.json` has the intended `name`, `version`, `license`, `files`, `bin`, `exports`, `engines`, and `publishConfig.access` values.
- The release owner has approved the package version and release notes.
- The authorized npm account already has permission to publish the public `enigma-memory` package.
- No Cloudflare, website, provider, KMS, SIEM, personal, or hosted deployment credential is needed for npm publication.

## Package preflight

Run from the package root before triggering publication. If starting from the current monorepo parent, enter `enigma` first:

```sh
cd enigma
npm run check
npm test
npm pack --dry-run
```

Review the dry-run output before publishing:

- Confirm the tarball contains `package.json`, `README.md`, `LICENSE` or approved license artifact, bin targets, package/app sources, scripts needed by package commands, and specs.
- Confirm private launch collateral, local `.enigma` state, raw memory examples, provider exports, credentials, secrets, logs, and unpublished regulated or public-sensitive collateral are absent.
- Confirm docs describe source-only and hosted/BYOC boundaries without claiming provider deletion, model forgetting, guaranteed financial outcomes, compliance certification, or hosted-live readiness.

Optional local checksum evidence:

```sh
npm run provenance:local -- --out ./.enigma/release-provenance.json
```

This file is local unsigned checksum/SBOM evidence only. It is not npm registry provenance, signed attestation, source-control proof, SLSA, compliance certification, Docker image evidence, or cloud deployment evidence.

## GitHub secret and manual approval

The manual publish workflow uses only the `NPM_TOKEN` GitHub secret for registry authentication.

Configure GitHub before first use:

1. Create an npm automation token or equivalent token approved for the authorized npm account.
2. Add it as repository or environment secret `NPM_TOKEN`.
3. Create a GitHub environment named `npm-publish`.
4. Add required reviewers to the `npm-publish` environment so the workflow pauses for manual approval before the publish job can proceed.
5. Do not add Cloudflare, website, provider, account, KMS, SIEM, or hosted deployment credentials to this workflow or environment.

The workflow also requests `id-token: write` so npm provenance can attach GitHub Actions identity to the registry publish when npm supports it. That provenance describes the package publish action from GitHub Actions; it does not prove the package is free of all vulnerabilities, prove source-control intent beyond the workflow context, certify compliance, or prove hosted/BYOC/cloud deployment readiness.

## Manual workflow path

Trigger `.github/workflows/npm-publish.yml` manually with the exact `package.json` version.

The workflow performs these Node 24 steps before publishing:

1. The `preflight` job checks out the repository.
2. It sets up Node.js 24 for the npm registry.
3. It verifies the workflow `package_version` input exactly matches `package.json`.
4. It runs `npm run check`.
5. It runs `npm test`.
6. It runs `npm pack --dry-run`.
7. After `preflight` passes, the `publish` job waits on the `npm-publish` environment approval.
8. The `publish` job checks out the same workflow ref, sets up Node.js 24, re-verifies the version input, reruns `npm run check`, `npm test`, and `npm pack --dry-run`, then publishes with:

   ```sh
   npm publish --access public --provenance
   ```

If the input version differs from `package.json`, the workflow fails before registry authentication is used for publish.

## Provenance and SBOM boundaries

- `npm publish --provenance` asks npm to attach registry provenance for the publish event when supported by npm and GitHub Actions OIDC.
- `npm pack --dry-run` previews package contents; it does not publish and does not attest the tarball.
- `npm run provenance:local` records local checksum/SBOM evidence for package-surface files; it is unsigned local evidence only.
- CI and publish logs are operational evidence for the commands run in that workflow. They do not prove provider deletion, model forgetting, compliance certification, legal approval, hosted cloud readiness, customer BYOC readiness, support/SLA readiness, or website deployment state.

## Rollback and deprecation notes

npm versions are immutable once published. If a bad version is published:

1. Stop any release announcement that has not already gone out.
2. Open an incident or release note with the exact version and observed issue, avoiding secrets and private customer data.
3. If the package should not be used, deprecate the affected version with a factual message:

   ```sh
   npm deprecate enigma-memory@<version> "Deprecated: use <fixed-version>; see release notes."
   ```

4. Publish a fixed patch version after the full preflight and manual workflow approval path passes.
5. Do not republish the same version, claim registry deletion as user protection, or imply deprecation removes already-downloaded packages.
