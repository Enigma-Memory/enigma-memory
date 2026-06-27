# Dependabot Alert Cleanup Notes

## Summary

- **Original target alerts (webapp `npm audit` based on stale `package-lock.json`): 23**
  - 22 Next.js advisories on `next@14.2.25`
  - 1 PostCSS advisory on `postcss@8.4.31` (transitive of `next`)
- **Root `npm audit` alerts before fix: 3**
  - `uuid` via `jayson` via optional `@solana/web3.js`
- **Status after fixes:**
  - Root `npm audit`: **0** alerts
  - Webapp `pnpm audit`: **1** low-severity alert remaining (`elliptic`, no patched version available)
  - Benchmark `npm audit`: **0** alerts

## Changes Applied

### `enigma/package.json` (root)

- Added `overrides` to force `jayson` to use `uuid@^11.1.1`, resolving the moderate `uuid` advisory chain.

### `enigma/cortex-v3/webapp/package.json`

- Bumped `next` from `14.2.25` to `15.5.18` (latest patched Next.js 15 release).
- Bumped `postcss` from `^8.4.38` to `^8.5.15`.
- Added `pnpm.overrides`:
  - `postcss >=8.5.10`
  - `uuid >=11.1.1`
  - `ws >=8.21.0`
  - `lodash >=4.18.1`
  - `protobufjs >=7.6.3`
- Removed the stale `package-lock.json` (the project is managed with `pnpm` and `pnpm-lock.yaml`).

### `enigma/.enigma/benchmarks/memory-benchmarks/package.json`

- Bumped `next` from `^15.2.0` to `^15.5.18`.
- Bumped `uuid` from `^11.0.0` to `^11.1.1`.
- Added `overrides` to force `postcss@^8.5.15` under `next`.

## Verification

- `npm run check` in `enigma/` passes.
- `pnpm run typecheck` in `enigma/cortex-v3/webapp/` passes.

## Remaining Unresolved Alert

| Package | CVE / GHSA | Severity | Why it remains |
|---------|------------|----------|----------------|
| `elliptic` | CVE-2025-14505 / GHSA-848j-6mx2-7j84 | Low | Transitive dependency of `@privy-io/react-auth > @privy-io/js-sdk-core > @ethersproject/transactions > @ethersproject/signing-key > elliptic`. The advisory lists `patched_versions: "<0.0.0"` — no patched release is currently available, so it cannot be resolved by a version bump or override. |

## Tooling Notes

- The webapp is a `pnpm` workspace package; the legacy `package-lock.json` was stale and was producing misleading `npm audit` results. Cleanup used `pnpm audit` and `pnpm install` for that package.
- Root and benchmark packages use `npm` and were cleaned with `npm audit` / `npm install`.
