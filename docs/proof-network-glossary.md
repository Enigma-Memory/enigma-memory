# Proof Network glossary

Concise definitions for Enigma's privacy-preserving proof layer. Proof Network artifacts carry public-safe hashes, Merkle roots, references, counts, timestamps, scopes, and signatures; they must not contain raw memory, prompts, transcripts, completions, embeddings, tenant names, private keys, API keys, seed phrases, or provider responses.

## Terms

- **Memory Passport** — A portable, user- or customer-controlled memory container that can move across supported assistants and tools while preserving Enigma receipt references for custody, lifecycle, and boundary events.

- **Active root** — The current public-safe commitment to the memory state Enigma is willing to serve. It is a hash or Merkle root over eligible memory records or derived references, not the memory contents themselves.

- **Receipt log root** — A public-safe commitment to an ordered receipt log. It lets verifiers detect whether a lifecycle or boundary receipt belongs to a declared log without exposing receipt bodies that may contain sensitive operational detail.

- **Anchor batch** — A Solana-ready local planning artifact that groups one or more public roots and references into a single opaque payload for future anchoring. It records that no transaction was submitted and that raw memory is not placed on chain.

- **Capability grant** — A signed or signable artifact that gives a subject a narrow permission over a defined scope, time window, action set, or proof reference. It grants capability by public-safe identifiers and constraints, never by embedding private memory.

- **Nullifier** — A public-safe revocation or one-time-use marker derived from a grant, scope, or proof reference. Verifiers use it to recognize that a capability has been revoked or consumed without learning the underlying private material.

- **Benchmark attestation** — A proof artifact binding a benchmark result to public-safe inputs such as report hashes, dataset references, runner references, package references, metric summaries, and signatures. It proves what was attested, not that private benchmark data is public.

- **Context pack** — A minimized, task-specific bundle of approved memory references and retrieval evidence prepared for a model, tool, or agent. The proof layer commits to hashes and receipt references; raw context should stay outside public artifacts.

- **Derived artifact root** — A hash or Merkle root for an output derived from memory, such as an index, summary set, context pack, benchmark report, or export manifest. It proves integrity of the derived artifact while keeping source memory private.

- **Enigma Memory Drive** — The local-first Enigma workspace that acts like a durable drive for AI memory: it stores the canonical private memory state and emits public-safe proof artifacts for supported operations.

- **Proof rail** — The end-to-end path that carries public-safe proof data from local memory operations through verification artifacts and optional root anchoring. It is a proof and audit lane, not a raw-data replication lane.
