# Production storage contract

`@enigma-ai/enigma/storage` defines the production storage schema contract for relay/gateway deployments. It is pure local code: no sockets, no provider SDKs, no environment loading, and no secret handling.

## Purpose

The package emits a PostgreSQL migration for durable backend state:

- relay records with encrypted payload hashes and opaque storage refs,
- relay witness checkpoints,
- relay pairings with hashed client public keys,
- gateway policy versions,
- gateway decisions with decision hashes,
- gateway SIEM events with event hashes,
- public-safe readiness evidence refs.

The package also emits parameterized SQL operation objects for the same tables. Operation builders return SQL text plus `$n` values only; they do not connect to a database, load credentials, or execute mutations.

## Boundary

The schema intentionally excludes raw prompts, transcripts, decrypted memory, provider response bodies, embeddings, API keys, tokens, passwords, and private keys.

The storage contract is not a live database and does not make `hosted_live_ready` true. Operators still need provisioned database infrastructure, credentials in a secret manager, KMS/secret custody, backups, restore checks, monitoring, SIEM/log routing, private ingress, auth, and operator acceptance.
