# Security policy

This source-tree review document covers the Enigma source tree and package artifacts for the provider-agnostic memory custody and proof layer. It is a security operations document, not a compliance certification.

## Supported versions

| Version / branch | Support status | Notes |
| --- | --- | --- |
| `main` / source checkout | Security review target | Active development branch for local CLI, verifier, vault, MCP, connectors, importer/capsule, relay, gateway, browser, desktop, Docker demo, and hardware collateral. |
| `0.1.x` package line | Security fixes when published | Pre-1.0 APIs may change. Security fixes are published only after release credentials and release approval are available. |
| Older snapshots, forks, unpublished archives | Not supported | Upgrade to the active branch or supported package line before requesting a fix. |

Hosted, BYOC, on-prem, and hardware deployments are supported only within the written scope of the applicable customer/operator agreement and deployment evidence packet.

Do not market hosted, BYOC, cloud, on-prem, or hardware production operation as available unless the deployment evidence includes required credentials, approved domain/DNS or private ingress, HTTPS/TLS certificates, durable storage or persistence, KMS/BYOK or secrets-manager controls, monitoring/logging/SIEM routing, backups/restore ownership, support ownership, and incident-response ownership.

## Reporting a vulnerability

Report suspected vulnerabilities through the approved private intake channel for the project:

- Security contact: `security@REPLACE-WITH-APPROVED-DOMAIN`
- Backup contact: `REPLACE-WITH-SECURITY-CONTACT`
- PGP / secure portal: `REPLACE-WITH-APPROVED-SECURE-INTAKE`

Until those placeholders are replaced by an approved channel, do not send secrets, customer data, raw memory plaintext, exploit payloads, or private keys in an initial report. Send a minimal description, affected component, version/commit, reproduction outline, and your preferred secure contact path.

We aim to acknowledge valid reports within two business days after receipt by an approved channel. Response timing may vary for third-party dependencies, customer-controlled BYOC/on-prem environments, or reports that require legal/customer coordination.

## No bug bounty by default

Enigma does not operate a public bug bounty program unless a separate written announcement explicitly says so. Reports are welcome, but rewards, bounty eligibility, scope, and payment terms are not implied by this policy.

## Safe harbor caveat

Security research is authorized only when it stays within a written authorization scope issued by Enigma or the affected customer/operator. Do not test hosted, BYOC, customer, third-party provider, browser-store, package-registry, cloud, or hardware environments without written authorization from the owner of that environment.

Do not access, modify, delete, exfiltrate, publish, or retain raw memory plaintext, customer data, secrets, keys, tokens, prompts, completions, transcripts, embeddings, logs, backups, private capsules, provider accounts, or non-public proof bundles. Stop testing and report immediately if you encounter sensitive data.

## Secret handling

Never commit or publish:

- private signing keys, KMS/BYOK key material, seed phrases, API tokens, OAuth tokens, browser native-host secrets, package-registry credentials, cloud credentials, TLS private keys, SSH keys, or deployment credentials;
- local vault bundles, decrypted capsules, private context packs, raw memory plaintext, prompts, completions, transcripts, embeddings, or customer exports;
- hosted/BYOC tenant policies, SIEM endpoints, incident artifacts, support bundles, or backup metadata unless they are explicitly approved for the release evidence repository and plaintext-minimized.

If a secret may be exposed, revoke or rotate it first, preserve plaintext-minimized evidence, identify affected artifacts and tenants, and coordinate disclosure through the incident process below.

## Plaintext minimization requirements

Enigma's public and network-facing evidence should carry commitments, roots, hashes, receipt ids, policy references, counts, timestamps, signer metadata, and encrypted/opaque payload references. It should not carry raw memory plaintext.

Raw memory plaintext must stay out of:

- receipts and public receipt verification output;
- exported public proof bundles and public roots;
- relay records and witness checkpoints;
- gateway decisions and SIEM/eDiscovery exports;
- browser insertion records and extension storage;
- connector configuration backups;
- support tickets, incident reports, public examples, demos, screenshots, and website collateral;
- Docker images, environment defaults, hardware demos, and deployment manifests.

Customer-approved content review, legal hold, eDiscovery, or support access must use the approved vault/eDiscovery path for that environment, not generic proof, relay, witness, SIEM, or public documentation artifacts.

## Incident handling

Treat these events as security incidents:

- private key, package credential, cloud credential, browser native-host secret, or KMS/BYOK reference compromise;
- raw memory plaintext appearing in receipts, relay records, witness checkpoints, SIEM exports, public proof artifacts, public docs, support artifacts, Docker images, browser records, or connector backups;
- verifier false positive/false negative, receipt chain bypass, gateway policy bypass, unauthorized relay/witness access, or MCP/tool validation bypass;
- unauthorized operator access, customer data exposure, data residency breach, backup/restore failure, or hosted/BYOC deployment misconfiguration;
- hardware device loss, suspected key extraction, or physical compromise for a device that signs Enigma evidence.

Minimum incident steps:

1. Contain the affected component and stop the unsafe data path.
2. Preserve relevant receipts, policy versions, gateway decisions, logs, proof bundles, release artifacts, and deployment evidence with restricted access.
3. Revoke or rotate affected credentials, keys, tokens, certificates, and package/deployment secrets.
4. Identify affected versions, tenants, deployment modes, and artifact classes without expanding access to raw memory plaintext.
5. Patch the source of the issue and verify the fix with component-specific evidence.
6. Notify maintainers, customers, operators, legal/security contacts, and public users according to contract and disclosure requirements.
7. Publish only verified facts inside Enigma's proof boundary.

## Coordinated disclosure process

Security fixes should be developed privately when public issue details would increase user risk. The release owner coordinates severity, impacted versions, mitigations, customer notice, publication timing, and credit language.

Public advisories should include:

- affected component and supported version range;
- impact stated in Enigma-controlled terms;
- whether raw memory plaintext, keys, credentials, proof validity, gateway decisions, relay/witness authorization, or hosted/BYOC operations were affected;
- mitigation, upgrade, and verification steps;
- explicit non-claims where relevant.

Do not include exploit details, customer identifiers, raw memory plaintext, secrets, provider account data, or unapproved compliance language in advisories.

## Proof-boundary non-claims

Enigma security evidence can support claims about Enigma-controlled vault state, receipts, proof bundles, context packs, relay records, witness checkpoints, gateway policy decisions, and declared boundary operations.

It does not prove:

- that a closed provider deleted internal copies, logs, backups, caches, embeddings, summaries, hidden personalization, or provider-native memory;
- that model weights forgot, semantic behavior changed globally, or third-party systems stopped serving similar information;
- that imported provider exports are complete unless the source proves completeness;
- that a signed memory statement is factually true in the real world;
- SOC 2, HIPAA, GDPR, regulatory, certification, or other compliance status without separate legal/security approval and scoped evidence;
- tamper-proof hardware, physical-compromise resistance, raw compute superiority, investment return, token ROI, profit, equity, revenue share, or token price expectations.
