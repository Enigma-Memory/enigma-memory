# Importers package contract

This package implements Enigma's provider-neutral import/export surface for AI memory migrations without treating provider-native memory as canonical custody.

Required named exports:

- `importChatGptExport(input, options)`
- `importClaudeMemory(input, options)`
- `importMem0Export(input, options)`
- `importLettaAgentFile(input, options)`
- `importLangGraphStore(input, options)`
- `importZepGraphitiExport(input, options)`
- `exportEnigmaCapsule(options)`
- `importEnigmaCapsule(capsule, options)`
- `createImportPreview(reportOrReports, options)`
- `runImporterDemo(options)`

Invariants:

- Importers accept already-parsed JSON objects, arrays, or text strings; they never call external provider services.
- Import reports use `schema: enigma.import_report.v1`, return `memory_candidates`, `source_refs`, `limitations`, `confidence`, and a source fingerprint.
- Import previews use `schema: enigma.import_preview.v1` and expose only counts, refs, commitments, limitations, recommended review/import actions, a public-safe `primary_action`, and an `enigma.import_preview_receipt.v1`. They never return `memory_candidates.content`.
- Import reports preserve source limitations and add an explicit completeness limitation unless the source includes a positive completeness flag. `complete: true` is emitted only from explicit source completeness.
- Provider-native memory remains a cache. Imported candidates become canonical only when written through an Enigma vault.
- When `options.vault` is supplied, importers call the local vault `remember` API and return only safe `vault_writes` metadata: candidate id, memory address, receipt hash, and event id.
- Capsule manifests follow mesh capsule-manifest style: signed manifest, encrypted/payload hash commitment, receipt-log root, active-set root, owner-scope commitment, holder, issuer, and expiry.
- Capsule verifier metadata is offline-verifier friendly and contains hashes, roots, counts, report hashes, limitations root, completeness summary, and public trust descriptor; it does not contain raw memory plaintext.
- `importEnigmaCapsule` verifies the mesh manifest, verifier metadata payload hash, and manifest payload commitment before reporting `ok: true`.
- `runImporterDemo()` returns `ok: true` only when every importer emits at least one candidate, preserves limitations, refuses to claim completeness for incomplete demo sources, and capsule export/import verifies.
