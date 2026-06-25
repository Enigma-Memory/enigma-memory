# Enigma Memory Ready conformance

`Enigma Memory Ready` is a conformance program for client apps, MCP connectors, local operators, hosted operators, and ecosystem tools that want to prove they can integrate with Enigma Memory without leaking private memory data or overstating proof guarantees.

The badge is not a security audit, cloud compliance certificate, benchmark ranking, or claim that an external model/provider deleted or forgot anything. It means the reviewed integration can run the required local commands, emit public-safe receipts, respect proof boundaries, and pass the applicable conformance tests.

## Program goals

1. Make memory integrations reproducible for users and reviewers.
2. Keep raw memory, prompts, transcripts, completions, embeddings, tenant names, secrets, provider responses, API keys, private keys, and seed phrases out of public artifacts.
3. Separate Enigma-controlled proof state from provider-side claims.
4. Give client and connector authors a concrete checklist before requesting review.
5. Give operators a safe path to publish roots, refs, counts, signatures, and benchmark attestations without publishing private payloads.

## Conformance tracks

| Track | For | Required outcome |
| --- | --- | --- |
| Client Ready | Desktop apps, IDEs, agent shells, MCP hosts | The client can start the Enigma MCP server, use the configured bundle, and verify receipt-backed memory operations without leaking local paths or private memory in shared examples. |
| Connector Ready | Connector packages, templates, setup helpers | The connector writes deterministic, reversible, narrowly scoped config changes and preserves unrelated client settings. |
| Operator Ready | Teams running Enigma for users or workspaces | The operator can produce public-safe proof packets, anchor batches, revocations, and benchmark attestations without submitting transactions by default. |
| Benchmark Ready | Benchmark runners and comparison reports | The runner can publish report hashes, dataset refs, package refs, runner refs, counts, and attestations while retaining raw scoring inputs privately. |

An integration may qualify for more than one track. Review notes must state the exact track, version, package/client version, operating system, and command transcript hashes used for the decision.

## Required command surface

Conformant integrations must expose or document these commands in a way a reviewer can run locally. Commands may be direct CLI calls, scripted wrappers, CI steps, or equivalent SDK/MCP calls, but the public evidence must map back to these behaviors.

### Baseline local memory commands

```sh
enigma test-drive --overwrite
enigma setup --overwrite
enigma doctor
enigma remember --text-file ./public-safe-memory.txt
enigma search --query "public-safe query"
enigma context --query "public-safe query" --optimize
enigma verify --export ./.enigma/export.json
```

Requirements:

- `test-drive` must be zero-credential and local-only.
- `setup` must not write third-party client configs unless an explicit write flag is used.
- `doctor` must not print secrets, local account names, provider tokens, or raw private memory.
- `remember`, `search`, and `context` examples must use public-safe sample text only.
- `verify` must check receipt-chain consistency and fail closed on malformed exports.

### Connector commands

```sh
enigma setup --client auto --overwrite
enigma setup --connect-installed --overwrite
enigma connect <connector-id> --dry-run
enigma connect <connector-id>
```

Requirements:

- `--client auto` must report selected and skipped clients with reasons.
- `--connect-installed` must target installed or already-configured clients only.
- `connect --dry-run` must show the planned change without writing.
- `connect` must preserve unrelated config keys and sibling MCP servers.
- Config examples must use placeholders or relative examples, not local usernames, tenant names, or account ids.
- Re-running an equivalent connector write must be idempotent and must not create duplicate MCP entries.

### Proof Network planning commands

These are local planning and verification commands. They must not submit transactions, create accounts, publish packages, deploy infrastructure, or call external providers during conformance review.

```sh
enigma chain anchor --root <sha256-or-merkle-root> --ref <public-ref> --out ./anchor-batch.json
enigma chain grant --subject <public-subject-ref> --scope <scope> --expires-at <iso-time> --out ./capability-grant.json
enigma chain revoke --grant-id <public-grant-id> --reason <public-reason-code> --out ./capability-revocation.json
enigma chain attest --report-hash <sha256> --dataset-ref <public-dataset-ref> --runner-ref <public-runner-ref> --package-ref <public-package-ref> --out ./benchmark-attestation.json
enigma chain verify --file ./anchor-batch.json
enigma chain verify --file ./capability-grant.json
enigma chain verify --file ./capability-revocation.json
enigma chain verify --file ./benchmark-attestation.json
```

Every generated chain artifact must include or imply these flags:

```json
{
  "transaction_submitted": false,
  "raw_memory_on_chain": false
}
```

Supported Proof Network artifact types:

- `enigma.proof_network.anchor_batch.v1`
- `enigma.proof_network.capability_grant.v1`
- `enigma.proof_network.capability_revocation.v1`
- `enigma.proof_network.benchmark_attestation.v1`
- `enigma.proof_network.packet.v1`

## Required receipt and proof artifacts

A review packet should contain only public-safe JSON and hashes. Full private bundles, raw benchmark inputs, provider transcripts, and customer-specific configs stay private.

| Artifact | Required fields | Must not contain |
| --- | --- | --- |
| Setup summary | command, version, platform family, selected connector ids, skipped connector ids, receipt/root/hash refs | local usernames, absolute personal paths, tenant names, secrets |
| Memory receipt export | receipt ids, event types, bundle/export root, counts, timestamps, verification status | raw memory text, prompts, completions, embeddings |
| Connector plan | connector id, target config type, dry-run/write mode, changed boolean, backup-created boolean | unrelated app config values, local account ids, private paths |
| Anchor batch | schema id, batch id, roots, public refs, root count, intended chain/network label, `transaction_submitted:false`, `raw_memory_on_chain:false` | memory payloads, ACL bodies, tenant names, keys, seed phrases |
| Capability grant | schema id, grant id, issuer ref, subject ref, scope, expiry, nonce/nullifier commitment, signature/ref | private identities, authorization body text, private ACLs |
| Capability revocation | schema id, revocation id, grant id/ref, reason code, nullifier/ref, timestamp, signature/ref | private incident details, raw access logs, private identities |
| Benchmark attestation | schema id, report hash, dataset ref, runner ref, package ref, metric names, aggregate counts, signature/ref | raw dataset rows, scoring prompts, model outputs, provider responses |
| Proof packet | packet id, included artifact refs, roots, counts, verification summary, boundary statement | any raw memory or private operational data |

## Public-safe proof boundary

Conformance claims may say that Enigma verified Enigma-controlled or Enigma-mediated state:

- local vault event receipts;
- active and tombstoned memory address commitments;
- receipt-chain roots and exported bundle roots;
- context-pack retrieval/injection receipts;
- connector setup plans and idempotent config writes;
- relay, gateway, usage, settlement, and proof-network receipt refs;
- benchmark report hashes and aggregate benchmark attestations;
- Solana-ready anchor payloads that have not been submitted by the CLI.

Conformance claims must not say or imply that Enigma proves:

- an external hosted provider deleted memory;
- a model forgot information;
- a user, company, tenant, wallet, or provider account was verified unless a separate reviewed identity process exists;
- benchmark leadership from SDK mechanics alone;
- legal, SOC 2, HIPAA, GDPR, or financial compliance certification;
- token ROI, investment outcome, or provider invoice savings;
- Solana finality unless an independent transaction id and chain verification are supplied outside the local planning command.

## Conformance checklist

Reviewers should mark every applicable item `pass`, `fail`, or `not applicable` with the evidence file or command hash.

### Product and packaging

- [ ] Integration states its conformance track: Client Ready, Connector Ready, Operator Ready, Benchmark Ready, or a combination.
- [ ] Package/client version and Enigma version are recorded.
- [ ] Supported operating systems and connector ids are recorded.
- [ ] Public examples use generic ids, hashes, roots, counts, and placeholders only.
- [ ] The integration does not require external provider credentials for baseline local conformance.
- [ ] The integration does not deploy infrastructure, create cloud accounts, submit chain transactions, or publish packages during review.

### CLI and SDK behavior

- [ ] Baseline local memory commands run with public-safe sample inputs.
- [ ] Receipt verification succeeds for a valid export.
- [ ] Receipt verification fails for malformed or tampered exports.
- [ ] Command output avoids raw memory, prompts, transcripts, completions, embeddings, secrets, private keys, seed phrases, tenant names, and provider responses.
- [ ] Error messages identify the failing boundary without printing private payloads.
- [ ] SDK/MCP equivalents, if used, produce the same public-safe receipt semantics as the CLI.

### Connector behavior

- [ ] Dry run shows planned connector changes without writing files.
- [ ] Write mode only runs after an explicit write command or flag.
- [ ] Existing unrelated client settings are preserved.
- [ ] Existing sibling MCP servers are preserved.
- [ ] Equivalent repeated writes are idempotent.
- [ ] Missing clients are skipped with a reason instead of forcing default config creation.
- [ ] Backup behavior is documented and only occurs when an existing config changes.

### Proof Network behavior

- [ ] Anchor batches contain roots/refs/counts only.
- [ ] Capability grants contain scoped public refs, expiry, and replay-resistant ids/nullifiers.
- [ ] Revocations invalidate grants by public grant/ref/nullifier, not by exposing private ACL bodies.
- [ ] Benchmark attestations contain report hashes, dataset refs, runner refs, package refs, metrics, and aggregate counts only.
- [ ] `enigma chain verify --file <json>` accepts every valid supported artifact type.
- [ ] `enigma chain verify --file <json>` rejects unsupported schemas, missing roots, malformed hashes, invalid expiry, duplicate ids, and private payload keys/values.
- [ ] Chain artifacts clearly state `transaction_submitted:false` and `raw_memory_on_chain:false`.

### Operator evidence

- [ ] Operators keep private bundles, raw reports, provider responses, and customer configs out of public packets.
- [ ] Public packets include enough refs and hashes for independent integrity checks.
- [ ] Rotation, revocation, and incident examples use reason codes and public refs, not private incident narratives.
- [ ] Operators document who can issue grants, revoke grants, and sign attestations.
- [ ] Operators document retention boundaries for raw benchmark and support evidence.

## Test categories

A conformance test suite should cover behavior, boundaries, and negative cases. The suite may be implemented in the consumer repository, but the review packet must summarize the result and include public-safe evidence.

### 1. Install and command discovery

- CLI binary is discoverable.
- Version command reports the expected package version.
- Help output lists the required baseline and chain planning commands.
- No command discovery path requires provider credentials.

### 2. Local memory proof loop

- Public-safe memory can be remembered.
- Search and context commands can retrieve by public-safe query.
- Exported receipts verify successfully.
- Tampering with a receipt id, root, count, or signature causes verification failure.
- Empty or malformed exports fail with structured errors.

### 3. Connector dry-run and write safety

- Dry-run output includes target connector id, intended command, intended env keys, and changed status.
- Dry-run does not modify the target config.
- Write mode modifies only the Enigma MCP entry.
- Re-run write mode is idempotent.
- Invalid connector id fails without writing.
- Missing config path under `--connect-installed` is skipped, not created by surprise.

### 4. Proof Network artifact validation

- Valid anchor batch passes.
- Valid grant passes.
- Valid revocation passes.
- Valid benchmark attestation passes.
- Valid packet containing supported artifact refs passes.
- Private keys such as `memory`, `prompt`, `transcript`, `completion`, `embedding`, `tenant`, `apiKey`, `privateKey`, `seedPhrase`, `providerResponse`, and `aclBody` are rejected anywhere in proof payloads.
- Private-looking values such as bearer tokens, seed phrases, PEM blocks, raw prompt text, local personal paths, and provider response blobs are rejected.
- Unsupported schema names are rejected.
- Chain artifacts never claim transaction submission unless a separate chain-verification process is explicitly reviewed.

### 5. Benchmark attestation boundaries

- Report file hash is computed from the private report and only the hash is public.
- Dataset refs are public refs or hashes, not raw dataset rows.
- Runner refs identify code/package versions without embedding source blobs.
- Package refs identify package name/version/integrity without npm tokens.
- Aggregate metric names and counts are public-safe.
- Raw scoring prompts, model outputs, provider responses, and licensed dataset rows are excluded.

### 6. Failure and abuse cases

- Secret-like values in inputs are rejected before artifact creation.
- Unknown connector ids do not fall back to unsafe defaults.
- Malformed JSON exits non-zero and prints no private data.
- Expired grants fail validation.
- Revoking an unknown grant produces a public-safe error.
- Duplicate artifact ids in a packet fail validation.
- Missing `transaction_submitted:false` or `raw_memory_on_chain:false` fails chain artifact validation.
- Attempting to include raw memory in an anchor, grant, revocation, attestation, or packet fails validation.

## Badge levels

Badges are scoped to the reviewed track and version. A badge must link to a public-safe review packet or a signed review summary.

| Badge | Meaning | Minimum evidence |
| --- | --- | --- |
| Enigma Memory Ready: Client | Client can use Enigma MCP/CLI memory proofs safely. | Baseline local proof loop, MCP startup evidence, receipt verification, boundary checklist. |
| Enigma Memory Ready: Connector | Connector can plan and write safe config changes. | Dry-run/write/idempotency evidence, skipped-client behavior, config preservation test. |
| Enigma Memory Ready: Operator | Operator can produce safe proof packets and manage grants/revocations. | Anchor, grant, revoke, packet, and verify evidence with proof-boundary checklist. |
| Enigma Memory Ready: Benchmark | Benchmark runner can attest reports without leaking raw inputs. | Report hash, dataset refs, runner refs, package refs, aggregate metrics, attestation verification. |
| Enigma Memory Ready: Full | Integration satisfies all applicable tracks. | All above evidence plus a consolidated proof packet. |

Badge copy must include the reviewed versions, for example:

```text
Enigma Memory Ready: Connector
Reviewed for <client-or-package> <version> with enigma-memory <version>.
Scope: local MCP connector setup and receipt verification only.
```

## Common failure cases

A review should fail if any of these appear in public artifacts, examples, tests, logs, or badge claims:

- Raw memory text, prompts, transcripts, completions, embeddings, provider responses, raw dataset rows, or private benchmark scoring inputs.
- API keys, bearer tokens, SSH keys, PEM blocks, private keys, seed phrases, 2FA codes, cookies, local account names, or tenant names.
- Absolute local paths that reveal a person, tenant, workspace, customer, or account.
- Chain artifacts that omit `transaction_submitted:false` or imply a transaction was submitted by local planning commands.
- Proof artifacts that include ACL bodies instead of public scope refs and commitments.
- Connector writes that overwrite unrelated client settings.
- Claims that Enigma proves provider-side deletion, model forgetting, legal compliance, benchmark leadership, or financial outcomes.
- Benchmarks that publish raw licensed dataset rows or provider outputs instead of hashes, refs, aggregates, and attestations.
- Tests that pass by suppressing verification errors or accepting malformed proof artifacts.

## Review process

1. **Application**: submit the track, package/client/operator name, version, supported operating systems, connector ids, and public-safe review packet location.
2. **Boundary screen**: reviewer checks examples, logs, artifacts, docs, and tests for private data and unsupported claims before running commands.
3. **Command replay**: reviewer runs the required command set for the requested track using public-safe sample inputs.
4. **Artifact validation**: reviewer verifies receipts and proof-network JSON with `enigma verify` and `enigma chain verify --file <json>` as applicable.
5. **Negative tests**: reviewer runs malformed, tampered, expired, duplicate, unsupported-schema, and private-payload cases.
6. **Connector inspection**: for connector tracks, reviewer compares config before/after write mode and confirms dry-run and idempotency behavior.
7. **Badge decision**: reviewer records pass/fail/not-applicable checklist items, reviewed versions, evidence hashes, known limitations, and badge scope.
8. **Publication**: only the public-safe summary, hashes, roots, refs, counts, and signatures are published. Private bundles and raw reports stay private.
9. **Renewal**: badge holders renew when changing connector write behavior, proof artifact schemas, chain-planning semantics, benchmark methodology, or major package versions.
10. **Revocation**: Enigma may revoke or narrow a badge if published artifacts leak private data, claims exceed reviewed boundaries, or later versions remove required safety behavior.

## Required evidence bundle

A reviewer should be able to inspect the bundle without access to a private vault, customer workspace, provider account, cloud console, wallet, or hosted service.

| File | Required for | Contents |
| --- | --- | --- |
| `memory-ready-manifest.json` | all tracks | subject ref, version, Enigma version, requested tracks, platform family, connector ids, public evidence file refs, reviewer key/signature refs |
| `command-results.json` | all tracks | command refs, exit status, artifact hash, started/ended timestamps, redaction status, and boundary result for each required command |
| `receipt-verification.json` | Client, Connector, Operator | export ref, receipt count, root refs, verification status, tamper-test status, and failure-case status |
| `connector-safety.json` | Client, Connector | dry-run hash, write hash when applicable, idempotency result, skipped-client list, config-preservation result |
| `proof-network-packet.json` | Operator, Benchmark, Full | supported proof-network artifact refs, roots, counts, signatures/refs, and boundary statement |
| `benchmark-attestation.json` | Benchmark, Full | report hash, dataset refs, runner ref, package ref, metric names, aggregate counts, and attestation verification result |
| `claim-boundaries.txt` | all tracks | short human-readable statement of what the badge proves and does not prove |

Every evidence bundle must be reproducible from a clean local review directory using public-safe fixtures. If a reviewer cannot replay the command sequence without private data, the bundle is not sufficient for a public badge.

## Decision rules

Use these rules consistently so the badge is meaningful across connectors and operators.

- **Pass**: all required commands for the requested track run locally; all required artifacts validate; all negative cases fail closed; no private payloads or unsupported claims appear in public evidence.
- **Conditional pass**: only allowed for documentation wording defects or missing optional evidence. Conditional pass must name the fix and must not be used for privacy, receipt, proof-network, or connector-write failures.
- **Fail**: any required command cannot be replayed, any proof artifact leaks private data, any verifier accepts tampered evidence, any connector overwrites unrelated settings, or any badge claim exceeds the reviewed proof boundary.
- **Not applicable**: allowed only when a checklist item belongs to a track the subject did not request.

Privacy and proof-boundary failures are release-blocking. They cannot be waived by adding a warning label after the artifact has been generated.

## Public-safe fixture policy

Conformance tests should use small fixtures that are intentionally boring and non-identifying:

- memory fixture text: generic project notes with no people, customers, secrets, internal codenames, or provider output;
- query fixture: short generic strings such as `public-safe query`;
- subject refs: opaque refs such as `client:example-desktop` or hashes, not account names;
- dataset refs: public dataset/version refs or hashes, not raw rows;
- runner/package refs: package name, version, integrity hash, and source ref when public;
- key/signature refs: public verification-key refs or detached signature refs, never private keys.

The negative fixture set should include intentionally unsafe keys and values so reviewers can prove rejection behavior without publishing real secrets.

## Public review packet template

```json
{
  "schema": "enigma.memory_ready.review_packet.v1",
  "track": ["Connector Ready"],
  "subject": {
    "name_ref": "public-package-or-client-ref",
    "version": "0.0.0",
    "enigma_version": "0.1.13"
  },
  "commands": [
    {
      "command_ref": "sha256:...",
      "purpose": "connector-dry-run",
      "status": "pass"
    }
  ],
  "artifacts": [
    {
      "type": "enigma.proof_network.anchor_batch.v1",
      "file_ref": "anchor-batch.json",
      "sha256": "...",
      "transaction_submitted": false,
      "raw_memory_on_chain": false
    }
  ],
  "checklist_summary": {
    "pass": 0,
    "fail": 0,
    "not_applicable": 0
  },
  "boundaries": [
    "No provider-side deletion claim.",
    "No model-forgetting claim.",
    "No compliance-certification claim."
  ],
  "reviewer_signature_ref": "public-signature-or-key-ref"
}
```

The template intentionally uses refs and hashes. Do not replace them with private command transcripts, raw memory, provider responses, customer identifiers, or local absolute paths.
