# Public GitHub repository setup

Use this runbook when preparing a public GitHub repository for Enigma source release. It does not create the remote repository, mutate GitHub settings, publish packages, or prove hosted/cloud readiness.

## Preconditions

- Work from the release checkout intended for public review.
- Keep private launch collateral, local `.enigma` state, raw memory examples, provider exports, credentials, tokens, logs, account IDs, and unpublished regulated or public-sensitive collateral out of the public repository.
- Confirm `package.json` still names the package `enigma-memory`, uses Node `>=24`, and is not marked `private` for the publish artifact.
- Confirm `SECURITY.md` is present and public-safe before linking it in GitHub repository settings.

## Repository creation settings

Create the repository under the approved organization/name only after the release owner approves public release posture.

Recommended settings:

- Visibility: public.
- Default branch: `main`.
- Features: issues and discussions only if an owner is assigned to triage them.
- Pull requests: require review before merge; disable direct pushes to `main` except for release administrators covered by branch rules.
- Actions: allow GitHub Actions for this repository; restrict third-party Actions by organization policy if required.
- Pages, packages, environments, and deployments: leave disabled unless a separate owner configures them for a documented release path.
- Secrets: do not add Cloudflare, website, provider, KMS, SIEM, personal, or hosted deployment credentials for source-only repository setup.

## Branch protection

Protect `main` before inviting broad collaborators.

Required checks:

- Require pull requests before merging.
- Require the CI workflow statuses from `.github/workflows/ci.yml`:
  - `Package gates (ubuntu-latest)`
  - `Package gates (windows-latest)`
- Seed or refresh those statuses with a push, pull request, or the manual `workflow_dispatch` trigger before marking branch protection complete.
- Require branches to be up to date before merging when the repository policy supports it.
- Require conversation resolution.
- Require signed commits only if the organization already enforces signing consistently; do not imply this repository has signed release provenance unless a separate signing process exists.
- Restrict force pushes and deletions on `main`.

CI green is package evidence only. It does not prove npm publication, live website deployment, hosted/BYOC readiness, provider deletion, model forgetting, legal approval, compliance certification, or customer deployment readiness.

## Secret-free public collateral check

Before making the repository public, inspect the release tree for public-safe collateral:

- `README.md`, `LICENSE`, `SECURITY.md`, `docs/`, package/app sources, scripts, tests, and specs are expected source collateral.
- `.env*`, local `.enigma/`, private launch packets, raw user/provider exports, generated logs, registry tokens, Cloudflare tokens, account IDs, API keys, personal data, and unpublished regulated or public-sensitive collateral must not be committed.
- Public docs may link to evidence-generation commands, but must not include live secrets, credential values, private account identifiers, or unreviewed claims.
- Website artifacts under separate deployment directories are not part of this runbook and require their own deployment review.

## Security policy linkage

- In GitHub repository settings, set the security policy to use `SECURITY.md` from the default branch.
- Enable private vulnerability reporting if the organization can monitor and respond to reports.
- Do not claim SOC 2, HIPAA, GDPR, SLSA, or other certification status unless separate approved evidence exists.

## Release tags

Use release tags only after the source tree, package metadata, and release notes agree on the version being released.

- Tag format: `v<package.json version>` such as `v0.1.0`.
- Create tags from the reviewed commit on `main` after required CI statuses are green.
- Release notes must preserve evidence boundaries: local provenance/SBOM is unsigned checksum evidence; CI is package gate evidence; npm registry provenance only describes the npm publish action when used; none of these prove hosted cloud readiness or third-party provider deletion.
- Do not attach private evidence bundles, secrets, or raw memory/provider exports to public releases.

## Claim boundaries for public repository copy

Allowed public positioning:

- Enigma provides local/package surfaces for AI memory receipts, offline verification, local vault workflows, MCP integration, importer/capsule tooling, and relay/gateway source/demo surfaces.
- Local no-network and checksum evidence apply to Enigma-controlled local state and package-surface files.
- Hosted cloud, customer BYOC, legal/compliance approval, support/SLA, monitoring, backup, SIEM, KMS, and operator acceptance remain separate release tracks unless their evidence is produced and approved.

Do not claim:

- proof that any provider deleted data or any model forgot data;
- unsupported financial-outcome claims;
- compliance certification, signed provenance, SLSA level, or hosted-live readiness without separate approved evidence;
- unsupported superiority claims without source-verifiable proof.
