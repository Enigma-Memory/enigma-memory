# npm publishing runbook

Use this runbook to publish the public `enigma-memory` package to npm from the public source repository. It does not publish by itself, create npm accounts, mutate GitHub settings, or prove hosted/cloud readiness.

## Preconditions

- The public repository setup runbook has been completed for the source repository.
- `package.json` has the intended `name`, `version`, `license`, `files`, `bin`, `exports`, `engines`, and `publishConfig.access` values.
- The release owner has approved the package version and release notes.
- The authorized npm account can configure the public `enigma-memory` package settings on npm.
- The npm package has a GitHub Actions trusted publisher configured for this repository, workflow filename `npm-publish.yml`, the workflow's `publish` job using environment `npm-publish`, and allowed action `npm publish`.
- No repository, organization, or environment secret stores a long-lived npm publish token for this workflow.
- No Cloudflare, website, provider, KMS, SIEM, personal, or hosted deployment credential is needed for npm publication.

## Package preflight

Run from the package root before triggering publication. If starting from the current monorepo parent, enter `enigma` first:

```sh
cd enigma
npm run check
npm test
npm pack --dry-run
npm run package:install-smoke
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

## Trusted publishing and manual approval

The manual publish workflow uses npm trusted publishing through GitHub Actions OIDC. It must not use `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or any other long-lived npm publish token from repository, organization, or environment secrets.

Configure npm and GitHub before first use:

1. In the npm package settings for `enigma-memory`, add a GitHub Actions trusted publisher for the public source repository.
2. Set the trusted publisher fields exactly for this repository:
   - **Organization or user**: the GitHub owner of the public source repository.
   - **Repository**: the public source repository name.
   - **Workflow filename**: `npm-publish.yml` only, not `.github/workflows/npm-publish.yml`.
   - **Environment name**: `npm-publish`.
   - **Allowed actions**: `npm publish`.
3. Keep `.github/workflows/npm-publish.yml` on GitHub-hosted runners with `permissions.id-token: write`, and keep the job id `publish` bound to the `npm-publish` environment.
4. Create the GitHub environment named `npm-publish` and add required reviewers so the workflow pauses for manual approval before the publish job can proceed.
5. Confirm repository, organization, and environment secrets do not contain `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or another npm publish token. Do not create a new npm automation token or long-lived publish token for this workflow. If a publish token was already exposed, revoke it manually in npm and replace that release path with trusted publishing; do not recreate the token.
6. Do not add Cloudflare, website, provider, account, KMS, SIEM, hosted deployment credentials, or npm publish tokens to this workflow or environment.

The workflow requests `id-token: write` so npm can exchange the GitHub Actions OIDC identity for trusted publishing and attach provenance to the registry publish. That provenance describes the package publish action from GitHub Actions; it does not prove the package is free of all vulnerabilities, prove source-control intent beyond the workflow context, certify compliance, or prove hosted/BYOC/cloud deployment readiness.

## Manual workflow path

Trigger `.github/workflows/npm-publish.yml` manually with the exact `package.json` version.

The workflow performs these Node 24 steps before publishing:

1. The `preflight` job checks out the repository.
2. It sets up Node.js 24 for the npm registry.
3. It verifies the workflow `package_version` input exactly matches `package.json`.
4. It runs `npm run check`.
5. It runs `npm test`.
6. It runs `npm pack --dry-run`.
7. It runs `npm run package:install-smoke` to install the local tarball into a temporary npm prefix and run selected entrypoints plus npm bin shims without publishing, tokens, global install, signing, hosted services, or network claims.
8. After `preflight` passes, the `publish` job waits on the `npm-publish` environment approval.
9. The `publish` job checks out the same workflow ref, sets up Node.js 24, re-verifies the version input, reruns `npm run check`, `npm test`, `npm pack --dry-run`, and `npm run package:install-smoke`, then publishes with:

   ```sh
   npm publish --access public --provenance
   ```

If the input version differs from `package.json`, the workflow fails before the OIDC trusted-publish attempt.

## Provenance and SBOM boundaries

- `npm publish --provenance` asks npm to attach registry provenance for the publish event when supported by npm and GitHub Actions OIDC.
- `npm pack --dry-run` previews package contents; it does not publish and does not attest the tarball.
- `npm run package:install-smoke` installs the locally packed tarball into a temporary npm prefix and runs selected entrypoints plus npm bin shims; it does not publish, use npm tokens, install globally, sign desktop artifacts, or prove registry availability.
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
