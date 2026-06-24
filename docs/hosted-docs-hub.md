# Hosted docs hub runbook

This runbook describes how to expose Enigma documentation as a static docs hub without changing product claims or the existing public website/homepage. It is source-only guidance for an operator; it does not deploy anything and does not require Cloudflare, GitHub, npm, or other credentials.

## Claim boundary

A hosted docs hub may say that Enigma has source documentation, local/package demos, and public-safe runbooks. It must not say that hosted Enigma cloud, customer BYOC, compliance status, provider deletion, or model forgetting are live or proven.

Keep the docs hub separate from product readiness claims:

- Static docs availability is not backend deployment evidence.
- Static docs availability is not legal/compliance approval.
- Static docs availability is not provider deletion or model-forgetting proof.
- Static docs availability is not npm publication, registry attestation, signed provenance, or customer deployment acceptance.

## Source docs to include

Include public-safe docs that explain local/package operation, verification boundaries, and deployment requirements:

- `README.md`
- `SECURITY.md`
- `docs/public-api-reference.md`
- `docs/deployment-runbook.md`
- `docs/install-anywhere.md`
- `docs/demo-video-assets.md`
- `docs/hosted-docs-hub.md`
- `docs/reviewer-packet.md`
- `docs/release-provenance-and-sbom.md`
- `docs/production-release-checklist.md`
- `docs/production-readiness.md`
- `docs/production-backend-architecture.md`
- `docs/cloudflare-token-and-domain-runbook.md`
- `docs/operator-acceptance-packet.md`
- `docs/security-threat-model.md`
- `docs/enterprise-byoc-runbook.md`
- `docs/client-connectors.md`
- `docs/fixtures.md`
- `docs/demo-assets/receipt-flow-demo.svg`
- `docs/demo-assets/demo-assets-manifest.json`

For any generated hub index, link to source docs by title and short boundary copy. Avoid rewriting claim language into stronger marketing copy.

## Legal-review-gated docs and topics

Do not expose or promote these topics as public claims until legal/release approval records say they are approved for the exact publication channel:

- Regulated launch, fundraising, business-outcome, or revenue-related claims.
- SOC 2, HIPAA, GDPR, security certification, audit completion, or regulated compliance claims.
- Customer logos, customer deployments, case studies, production tenants, or private pilots.
- Provider deletion, provider-side erasure, model forgetting, hidden cache deletion, telemetry deletion, or semantic forgetting claims.
- Any doc or packet containing credentials, account IDs, raw memory, private tenant details, private keys, provider exports, incident records, SIEM destinations, unreleased legal text, or personal information.

If a gated topic is necessary for an internal review, publish it only to the approved private review location, not the public docs hub.

## Deployment boundaries

A docs hub should be a static artifact assembled from reviewed source files. It should not share a build directory with the existing public website unless the release owner intentionally changes that website in a separate task.

Allowed static-hub boundaries:

- Build into a new local directory such as `.enigma/docs-hub/` or an operator-owned external static-site project.
- Serve only static files: HTML, Markdown, CSS, SVG, JSON, and PDFs that have passed review.
- Keep generated binary video/GIF files outside the repo unless explicitly approved.
- Use public-safe URLs and relative links; do not embed credentials, local absolute paths, private account identifiers, or dashboard deep links with account IDs.
- Treat any live URL check as point-in-time static availability only.

Disallowed boundaries:

- Do not mutate `github-upload/enigma-memory-site/**`, `enigma-deploy/**`, live Cloudflare Pages projects, DNS, npm, or GitHub releases from this runbook.
- Do not add analytics, tracking pixels, external scripts, customer data capture, auth bypasses, or hosted backend probes to the static docs hub.
- Do not present docs hub publication as hosted relay/gateway readiness or BYOC acceptance.

## Minimal static hub plan

1. Regenerate source demo assets:

   ```sh
   cd enigma
   npm run demo:assets
   ```

2. Copy only reviewed source docs and demo source assets into a local hub staging directory.
3. Generate a plain `index.html` or `index.md` that links each included source doc and repeats the claim boundary above.
4. Review the staged hub for secrets, personal information, local absolute paths, and claim escalation.
5. Deploy the staged static directory only through an approved static-site process owned by the release operator.
6. Record the exact source revision, included file list, and SHA-256 hashes as release evidence. Do not treat that record as signed provenance unless a separate signing process exists.

## Hub landing copy

Safe landing copy:

```text
Enigma docs explain local package usage, receipt verification, connector setup, public-safe demo assets, and the deployment evidence required before hosted or BYOC claims change. Provider-native memory is treated as cache only; Enigma proofs cover Enigma-controlled state.
```

Avoid landing copy that presents the docs hub as a live hosted service, provider-side deletion proof, model-forgetting proof, compliance certification, or customer deployment acceptance.
