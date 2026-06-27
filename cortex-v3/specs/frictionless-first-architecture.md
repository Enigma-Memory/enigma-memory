# Frictionless-First Product Architecture — Enigma Cortex v3

## TL;DR

**Winner: Privy** is the single embedded-wallet provider for Cortex v3 consumer login. Combine it with a Solana-native **Session PDA** so the off-chain node can anchor memory hashes and spend budget without per-action user prompts. User signs once during onboarding; afterwards the node signs with an Ed25519 session keypair whose authority is scoped, capped, and expiring on-chain. Defer institutional custody, TEE/STARK proofs, token launch, and advanced SPL settlement as requested.

This memo picks one path, not a menu. Every other option is evaluated only against whether it removes friction for a consumer installing a PWA and talking to ChatGPT/Claude/Gemini.

---

## 1. Design Principles

| #   | Principle                          | What it means for Cortex                                                                                                                             |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **One tap to wallet**              | Passkey, Face ID, Google, or Apple creates a non-custodial Solana wallet automatically. No seed phrase, no extension, no app store.                  |
| 2   | **One tap per model**              | MCP OAuth 2.1 + PKCE authorizes ChatGPT/Claude/Gemini once. The same identity flows to all three.                                                    |
| 3   | **No per-item approvals**          | Session PDA lets the node sign scoped memory/budget transactions. User is interrupted only for exceptions: over budget, blocked content, revocation. |
| 4   | **Fail closed**                    | No valid Session PDA or expired PDA = no memory access, no plaintext leakage.                                                                        |
| 5   | **Wallet is root identity**        | Solana pubkey is canonical owner; Privy is a convenience/login layer. Users can export keys.                                                         |
| 6   | **Defer everything non-essential** | Security audit, institutional custody, full TEE/STARK, token launch, and SPL settlement are explicitly out of v1.                                    |

---

## 2. Provider Comparison

### 2.1 Summary Matrix

| Provider              | Passkey                        | Social Login                         | Solana Session Delegation                              | Headless Signing                                      | Pricing (2025-2026)                                           | Developer Friction                                      |
| --------------------- | ------------------------------ | ------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| **Privy**             | ✅ Native                      | ✅ Google/Apple/Email/Farcaster      | ✅ Server sessions + delegated Solana signer           | ✅ Node SDK + REST API                                | Generous free tier; usage-based after scale                   | Low; single React/Node SDK                              |
| Dynamic               | ✅ Post-auth prompt            | ✅ X/Telegram/Farcaster/Google/Apple | ⚠️ MPC sessions, lighter Solana headless docs          | ⚠️ Headless auth, less explicit Solana server signing | Free tier + usage-based                                       | Low for UI, moderate for agent signing                  |
| Magic.link            | ✅ Supported                   | ✅ Email/SMS/Social                  | ❌ No native Solana session-key product                | ⚠️ TEE signing, not server-agent oriented             | 1,000 MAUs free, then usage                                   | Low for auth-only, high for autonomous signing          |
| Web3Auth              | ✅ Passkey unlocks MPC session | ✅ OAuth/biometric                   | ⚠️ MPC sessions exist, Solana headless less documented | ⚠️ Core SDK headless mode                             | Free 1,000 MAWs; $69/mo for 3,000 MAUs                        | Moderate; SDK surface is large                          |
| Turnkey               | ✅ Native                      | ✅ OAuth/Email/API keys              | ⚠️ Policy-scoped API keys, not user-session delegation | ✅ Excellent headless API + Solana policy engine      | 100 wallets / 25 tx/mo free; $0.10/signature PAYG; $99/mo Pro | Moderate; infrastructure-first, not consumer onboarding |
| Coinbase Smart Wallet | ✅ Passkey-first               | ✅ Google/Apple/X/Telegram           | ✅ Session keys, but EVM-first                         | ✅ Smart-wallet based                                 | Free; gas sponsored on Base                                   | High for Solana; Solana only via Base app/extension     |
| Standard OAuth + SIWS | ✅ Only if you add passkey/IDP | ✅ OIDC-native                       | ❌ None; must build delegation bridge                  | ❌ Must build                                         | Free if self-hosted, but engineering cost                     | Very high; you become the wallet                        |

### 2.2 Why the Others Lose

**Dynamic (acquired by Fireblocks, 2025)**

- Strongest pre-built consumer wallet UI on Solana and excellent multi-chain aggregation.
- Session keys and gas abstraction exist, but the Solana headless/server-signing documentation is thinner than Privy's.
- Roadmap risk: as part of Fireblocks, consumer onboarding may take a back seat to enterprise custody.
- Verdict: runner-up, but not the single best path for invisible consumer login today.

**Magic.link**

- Pioneer in passwordless embedded wallets and TEE key management.
- Covers authentication well but leaves the rest of the stack (session keys, smart accounts, gas sponsorship) for the developer to build.
- No native Solana session-key product as of mid-2026.
- Verdict: good for auth-only onboarding, insufficient for autonomous memory anchoring.

**Web3Auth (MetaMask/Consensys)**

- MPC-based social login with passkey unlocking of Ed25519 sessions.
- Acquisition creates strategic uncertainty; Solana support exists but is not the primary focus.
- Signing latency is slower (~500 ms) and the SDK surface is large.
- Verdict: acceptable for multi-chain, not the fastest path to Solana frictionlessness.

**Turnkey**

- Best-in-class headless signing infrastructure and Solana policy engine.
- 50–100 ms signing latency, excellent for agents and treasuries.
- Not a consumer onboarding product: it is wallet infrastructure, not a polished "tap to create wallet" PWA SDK.
- Verdict: ideal future backend for high-frequency/agent signing, but the wrong front door for consumers.

**Coinbase Smart Wallet**

- Passkey-first, free, gas-sponsored, strong session-key story.
- Solana support is secondary; Coinbase recommends the Base app/extension for Solana, not the smart wallet itself.
- Verdict: strongest if Cortex were Base/EVM-first. It is not.

**Standard OAuth (Auth0/Supabase + SIWS)**

- OIDC/social login is mature, and Sign In With Solana (SIWS) standardizes wallet-attestation messages.
- There is no embedded wallet, no key management, no session delegation, and no recovery. The team would build a wallet provider from scratch.
- Verdict: maximum control, maximum friction. Not viable for the stated user journey.

### 2.3 Why Privy Wins

Privy is the only provider that combines all five requirements in one SDK:

1. **Invisible passkey/social consumer login** — Face ID / Touch ID / Google / Apple / email / Farcaster, with embedded Solana wallet created automatically.
2. **Native Solana embedded wallets** — `createOnLogin: 'all-users'` provisions a Solana EOA without the user noticing.
3. **Headless React hooks** — `useLoginWithOAuth`, `useLoginWithPasskey`, and full custom UI support.
4. **Server-side delegated Solana signing** — `walletApi.solana.signMessage`, `signTransaction`, and `signAndSendTransaction` from the Node SDK / REST API, with wallets flagged `delegated: true`.
5. **Wallet export + non-custodial guarantees** — users retain ownership; Privy is a convenience layer.

Additional points in Privy's favor:

- Stripe acquisition (June 2025) points toward stable, payment-rails-friendly infrastructure.
- Generous free tier lowers early-stage burn.
- 175 ms signing latency is acceptable for memory anchoring and budget operations.
- Existing starter repos and Solana guides reduce integration risk.

---

## 3. Solana Session-Key Delegation Pattern

### 3.1 The Problem

Solana transactions require Ed25519 signatures. WebAuthn passkeys produce P-256 signatures. A passkey alone cannot sign a Solana transaction. The SIMD-0075 precompile (live June 2025) lets programs verify P-256 signatures on-chain, but it does not eliminate the need for an Ed25519 signer.

The Cortex goal is: user taps once, then memory hashes anchor and budget spends happen automatically. That requires an Ed25519 signer that the off-chain node can use on the user's behalf, scoped narrowly in time and authority.

### 3.2 Authority flow

```
User device (PWA)
  └─ Passkey / social login ──▶ Privy
         └─ Embedded Solana wallet (root owner key)
                │
                │  one-time `create_session` tx
                ▼
           ┌─────────────┐
           │  Session PDA │  ◄── on-chain scope, caps, expiry, revocation
           └──────┬───────┘
                  │
                  │  delegates signing authority to
                  ▼
           ┌─────────────┐
           │ Session key │  ── held by Enigma node (TEE/HSM in production)
           │   (Ed25519) │
           └──────┬───────┘
                  │
                  │ signs memory / budget / royalty txs
                  ▼
           Solana programs
```

### 3.3 Session PDA design

Program: **`capability_registry`** (extended).

```rust
#[account]
pub struct Session {
    pub owner: Pubkey,              // user root wallet
    pub session_key: Pubkey,        // Ed25519 public key held by the node
    pub nonce: u64,                 // session instance nonce
    pub owner_nonce: u64,           // must match OwnerNonce.nonce; allows global kill
    pub scope: u32,                 // bitmap of allowed instructions
    pub categories_hash: [u8; 32],  // hash of off-chain category allowlist
    pub max_spend_per_tx: u64,      // lamports
    pub max_spend_per_day: u64,     // lamports
    pub spent_today: u64,           // lamports spent in current window
    pub max_ops_per_day: u32,       // total delegated instruction count per day
    pub ops_today: u32,             // count in current window
    pub window_start: i64,          // unix timestamp of current daily window
    pub expires_at: i64,            // unix timestamp
    pub revoked: bool,              // soft revocation flag
    pub bump: u8,
}
```

**Seeds:** `["session", owner.as_ref(), session_key.as_ref(), nonce.to_le_bytes()]`.

**Size:** `8 + 32 + 32 + 8 + 8 + 4 + 32 + 8 + 8 + 8 + 4 + 4 + 8 + 8 + 1 + 1 ≈ 178 bytes` (use `init_if_needed` with margin).

**Why a PDA?**

- **Verifiable:** any program can derive the address and load the delegation terms.
- **Self-revokable:** the session key can call `revoke_session` in an emergency.
- **Recoverable:** the owner can always create a new session with a new `nonce`.
- **Rent-refundable:** closing the PDA returns lamports to the owner.

### 3.4 Scope — which programs, which instructions

The `scope` field is a bitmap. Each bit authorizes one specific instruction across the Enigma program suite.

| Bit | Constant                 | Program               | Instruction                  | Risk           |
| --- | ------------------------ | --------------------- | ---------------------------- | -------------- |
| 0   | `MEMORY_CREATE`          | `memory_registry`     | `create_memory_with_session` | Medium         |
| 1   | `MEMORY_UPDATE`          | `memory_registry`     | `update_memory_with_session` | Medium         |
| 2   | `MEMORY_DELETE`          | `memory_registry`     | `delete_memory_with_session` | High           |
| 3   | `BUDGET_SPEND`           | `budget_escrow`       | `spend_with_session`         | High           |
| 4   | `ROYALTY_ROUTE`          | `royalty_router`      | `route_royalty_with_session` | High           |
| 5   | `CAPABILITY_REVOKE_SELF` | `capability_registry` | `revoke_session`             | Emergency only |

**Default v1 scope for auto-save:** `MEMORY_CREATE | BUDGET_SPEND | ROYALTY_ROUTE`.

- `MEMORY_UPDATE` and `MEMORY_DELETE` are **not** granted by default; the user must opt in after onboarding.
- `CAPABILITY_REVOKE_SELF` is never granted at creation; it is enabled only for high-trust sessions so a compromised node can kill its own session immediately.

Each delegated instruction validates:

1. The `Session` PDA exists and is owned by `capability_registry`.
2. `session.owner == owner` (the user wallet passed as an account).
3. `session.session_key == session_key` (the signer of the transaction).
4. The corresponding scope bit is set.
5. `!revoked` and `expires_at > now`.
6. For budget/royalty ops: `amount <= max_spend_per_tx` and daily caps are not exceeded.

### 3.5 Expiry and rotation

- `expires_at` is set at creation (default: **90 days**).
- After expiry, all delegated instructions fail closed.
- The node checks expiry before every batch and can prompt for re-authorization when within 7 days of expiry.

Two rotation mechanisms, both requiring one owner signature:

1. **`extend_session`** — owner updates `expires_at` and optionally caps/scope in-place. Same `session_key`, same PDA.
2. **`create_session`** with a new `nonce` — owner mints a fresh Session PDA with a new `session_key`. Old PDA should be revoked.

**Recommended UX:** the PWA shows a "renew auto-save" button 7 days before expiry. One tap signs `extend_session`.

### 3.6 Daily and spend caps

| Field               | Default v1 | Purpose                          |
| ------------------- | ---------- | -------------------------------- |
| `max_spend_per_tx`  | 0.005 SOL  | Prevents a single huge spend.    |
| `max_spend_per_day` | 0.05 SOL   | Bounds total daily blast radius. |
| `max_ops_per_day`   | 200        | Prevents spam / runaway loops.   |

Defaults are conservative and user-configurable in the PWA.

Window logic (rolling 24-hour window):

```rust
let now = Clock::get()?.unix_timestamp;
let day = 86_400i64;

if now >= session.window_start + day {
    session.window_start = now;
    session.spent_today = 0;
    session.ops_today = 0;
}
```

**Enforcement points:**

- **`budget_escrow::spend_with_session`** checks `amount <= max_spend_per_tx` and `spent_today + amount <= max_spend_per_day`.
- **`royalty_router::route_royalty_with_session`** checks the same caps because it ultimately calls `budget_escrow::spend`.
- **All delegated instructions** increment `ops_today` and fail if `ops_today >= max_ops_per_day`.

**Budget vs. session caps:** `budget_escrow::Budget.balance` is the user's deposited balance; `Session.max_spend_per_day` is a rate limit independent of the balance. A user with 1 SOL in budget can still only spend 0.05 SOL/day via session delegation.

### 3.7 Revocation

Revocation must work even if the model, the node, or the IDP is uncooperative.

| Action                 | Who         | On-chain effect                                          | Speed        |
| ---------------------- | ----------- | -------------------------------------------------------- | ------------ |
| **Revoke session**     | Owner       | Closes Session PDA; all future delegated txs fail.       | Instant      |
| **Self-revoke**        | Session key | Closes Session PDA; emergency kill switch.               | Instant      |
| **Pause all sessions** | Owner       | Increments global owner nonce; all old sessions invalid. | Instant      |
| **Revoke at IDP**      | Owner       | Kills OAuth refresh tokens + Privy server session.       | Instant      |
| **Disconnect in PWA**  | Owner       | Best-effort removal of MCP config + IDP grant.           | Near-instant |

**`pause_all_sessions`** uses a global `OwnerNonce` PDA per user:

```rust
#[account]
pub struct OwnerNonce {
    pub owner: Pubkey,
    pub nonce: u64,
    pub bump: u8,
}
```

Seeds: `["owner_nonce", owner.as_ref()]`.

`pause_all_sessions` increments `nonce`. Every Session PDA stores the nonce it was created with; delegated instructions fail if `session.owner_nonce != owner_nonce.nonce`. This lets the owner kill **all** sessions in a single transaction without iterating over them.

**Soft vs. hard revocation:**

- **Soft (`revoked = true`):** fast, leaves audit trail, PDA remains until owner closes it.
- **Hard (close PDA):** returns rent; requires recomputing the address to check status.

Recommended: `revoke_session` closes the PDA and emits a `SessionRevoked` event; explorers/indexers watch the event.

### 3.8 Recovery

**Compromised or lost session key:**

1. User opens PWA.
2. Passkey/social login recovers the root wallet via Privy.
3. User taps "Revoke all sessions" → `pause_all_sessions` tx.
4. User taps "Re-enable auto-save" → `create_session` tx with a new session key.

Total user action: **two taps + one biometric/pin prompt** per transaction.

**Node outage:**

- Session keypair is stored encrypted in the node's database.
- If a single node fails, a standby node decrypts the same keypair (production: via KMS/TEE).
- If the keypair is lost entirely, the user re-authorizes a new session; root wallet and on-chain memory ownership are unaffected.

**Root wallet recovery:**

- Privy supports passkey recovery and social-login recovery.
- Users with an external Solana wallet can always recover via seed phrase.
- Session PDAs are owned by the root wallet, so recovery of the root wallet is recovery of the memory vault.

---

## 4. Product Architecture

### 4.1 Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CONSUMER CLIENTS                                      │
│  Next.js PWA ── Privy embedded wallet ── passkey / Google / Apple / email    │
│  ChatGPT / Claude / Gemini ── MCP OAuth 2.1 + PKCE ── Cortex MCP server      │
├─────────────────────────────────────────────────────────────────────────────┤
│                        OFF-CHAIN MEMORY NODE                                 │
│  HTTP API  ── ingest, retrieve, health                                       │
│  MCP server ── tools: add_memory, search_memory, spend_budget                │
│  Session key vault ── Ed25519 keypair per user (future: TEE-backed)          │
│  Encrypted vault ── AES-256-GCM blobs (future: TEE-backed)                   │
│  Immunology sentinel ── contradiction / prompt-injection filtering           │
├─────────────────────────────────────────────────────────────────────────────┤
│                        SOLANA PROGRAMS                                       │
│  memory_registry  ── Memory PDA: hash, owner, shareable, royalty_bps         │
│  budget_escrow    ── Budget PDA: balance, spent                              │
│  capability_registry ── Capability PDA + Session PDA: grants + delegation    │
│  royalty_router   ── Receipt PDA: anchored payment record                    │
│  cortex_treasury  ── Treasury PDA: protocol fees                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                        DATA STORES                                           │
│  Encrypted memory blobs ── IPFS / Arweave / private storage                  │
│  On-chain hashes + receipts ── Solana                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 User Journey — Every Screen and Tap

**User story:** A person installs Enigma Cortex as a PWA, logs in with Face ID / Touch ID / Google / Apple, connects ChatGPT, Claude, and Gemini in one tap each, then talks normally. Anything the models learn is saved automatically and shows up in every other model, without any further action.

#### Screen 0 — Install / open

| Step | What the user sees                                            | What happens                                    | Hoops eliminated       |
| ---- | ------------------------------------------------------------- | ----------------------------------------------- | ---------------------- |
| 0a   | "Add to Home Screen" prompt (browser) or open `app.enigma.io` | PWA installs; no app-store review, no download. | Native app store gate. |
| 0b   | Splash: "One memory. Every model."                            | Loads the frontend; pre-fetches config.         | None.                  |

**Gesture count:** 1 tap to install/open.

#### Screen 1 — Welcome / login

| Step | What the user sees                                                                                   | What happens                                               | Hoops eliminated             |
| ---- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------- |
| 1a   | Large buttons: **Continue with Google**, **Continue with Apple**, **Continue with Passkey / Email**. | Privy SDK initializes in the background.                   | No email/password form.      |
| 1b   | User taps one method.                                                                                | Privy starts OIDC or WebAuthn flow.                        | No separate wallet app.      |
| 1c   | System biometric / passkey / OAuth sheet appears.                                                    | User authenticates with Face ID, fingerprint, or OS OAuth. | No seed phrase, no password. |

**Gesture count:** 2 taps + 1 biometric.

#### Screen 2 — Wallet creation (invisible)

| Step | What the user sees                                                      | What happens                                                             | Hoops eliminated           |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------- |
| 2a   | Brief spinner: "Creating your memory wallet…"                           | Privy creates/loads a Solana embedded wallet for the authenticated user. | User never sees a keypair. |
| 2b   | (Only if Passkey/Email) "Add a recovery method" — Google or Apple link. | Social login acts as recovery factor.                                    | No seed-phrase backup.     |

**Gesture count:** 2 taps + 1 biometric (+ optional recovery link).

#### Screen 3 — One-tap delegation consent

| Step | What the user sees                                                                                                                                                                     | What happens                                                                                                            | Hoops eliminated                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 3a   | Full-screen card: "Allow Enigma to save and recall memories automatically?" with plain-language bullets: only Enigma programs, capped spend, revocable anytime. One button: **Allow**. | The only consent screen for auto-save. Tapping triggers Privy `delegateWallet` and signs `create_session` once.         | No per-item approvals ever again.   |
| 3b   | Spinner: "Enabling automatic memory…"                                                                                                                                                  | Auth service mints the root Capability PDA, seeds `budget_escrow`, and stores the delegated session signer in the node. | No gas settings, no manual signing. |

**Gesture count:** 3 taps + 1 biometric.

#### Screen 4 — Home / model connection hub

| Step | What the user sees                                                                                   | What happens                                                                                                                       | Hoops eliminated                           |
| ---- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 4a   | Model cards: **ChatGPT**, **Claude**, **Gemini**, each showing "Connect".                            | PWA lists supported MCP clients.                                                                                                   | No manual config files.                    |
| 4b   | User taps **Connect** on Claude.                                                                     | Native host writes `claude_desktop_config.json` and deeplinks to restart Claude Desktop.                                           | No manual JSON editing.                    |
| 4c   | User taps **Connect** on ChatGPT or Gemini.                                                          | Browser extension package is installed/enabled for `chat.openai.com` or `gemini.google.com`; content script handles OAuth consent. | One extension covers both web models.      |
| 4d   | Model-specific consent sheet: "[Model] can read and update your Enigma memory." User taps **Allow**. | Enigma issues an OAuth access token bound to a model-specific Capability PDA (`aud=model_id`).                                     | No copy-pasting tokens.                    |
| 4e   | User repeats for remaining models.                                                                   | Separate Capability PDAs minted per model, each with read+write scope and shared budget.                                           | One global permission does not over-grant. |

**Gesture count:** 6–8 taps + 1 biometric for three models (varies by extension install prompt).

#### Screen 5 — First chat (auto-save and recall begin)

| Step | What the user sees                                                               | What happens                                                                                                                            | Hoops eliminated                      |
| ---- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 5a   | User opens ChatGPT and says, "I'm flying to Berlin on July 10 for a conference." | The Enigma connector (browser extension for ChatGPT/Gemini, native MCP for Claude) calls `add_memory(candidate)` after the model reply. | User does not ask Enigma to remember. |
| 5b   | ChatGPT replies normally.                                                        | Cortex node runs guardrails; the trip fact passes, is encrypted, stored, anchored on-chain with the session key.                        | No "Save this?" prompt.               |
| 5c   | Later, user opens Claude and asks, "What do I have coming up?"                   | Claude calls `search_memory("upcoming travel")`; Cortex returns the Berlin trip.                                                        | User does not re-tell Claude.         |

**Gesture count:** still 6 taps + 1 biometric. Everything after this is conversation.

#### Screen 6 — Exception handling (rare)

| Step | What the user sees                                                                                       | What happens                                                                           | Hoops eliminated                        |
| ---- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------- |
| 6a   | Push notification or badge: "A memory was held for your review" or "Memory budget is low."               | User opens PWA → Review queue. Only shown for guardrail failures or budget exhaustion. | No interruption for safe saves.         |
| 6b   | Review queue shows the held memory, why it was held, **Approve** / **Delete** buttons.                   | User can correct false positives.                                                      | Full audit is available but not forced. |
| 6c   | "Top up budget" sheet if SOL balance is low. One tap to buy/transfer SOL via Privy on-ramp or Apple Pay. | Budget is refilled; auto-save resumes.                                                 | No manual RPC/gas management.           |

#### Screen 7 — Settings / revoke

| Step | What the user sees                                                        | What happens                                                                             | Hoops eliminated                        |
| ---- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------- |
| 7a   | Settings → "Connected Models" lists ChatGPT, Claude, Gemini with toggles. | Tapping a toggle burns that model's Capability PDA on-chain and revokes its OAuth grant. | No need to visit each model's settings. |
| 7b   | "Pause All Models" panic button.                                          | Calls `capability_registry::pause_all_sessions(owner)`.                                  | Instant kill switch.                    |

### 4.3 Auto-Save Without Per-Item Approval

- Models call `add_memory` via MCP tools.
- Node applies server-side policy before anchoring:
  - Salience score threshold.
  - Category allow/block lists.
  - Budget cap checks.
  - Immunology scan (prompt injection, contradiction, toxicity).
- Allowed memories are written off-chain and anchored on-chain via the session key.
- Blocked memories are quarantined; user is notified only if action is required.

### 4.4 Cross-Model Memory Recall

- Each model session holds a Capability token scoped to `memory:read`.
- Model calls `search_memory`; result is injected into context automatically.
- Where MCP clients support `resources/subscribe`, the node pushes change notifications and the client pulls the updated memory index.
- Clients without subscriptions fall back to the model calling `search_memory` each turn.

### 4.5 Hoop Inventory and Elimination Decisions

Every step that could require a user decision has been either removed, hidden, or reduced to a single tap.

| Hoop                                  | Why it exists                         | How we eliminate it                                                                                                                         |
| ------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Seed phrase backup                    | Crypto wallets require self-custody   | Embedded wallet via Privy; social/passkey is the recovery path.                                                                             |
| Password + 2FA                        | Legacy account security               | Passkey / WebAuthn + biometric replaces both.                                                                                               |
| Install a wallet app                  | External signer model                 | Wallet is embedded in the PWA.                                                                                                              |
| Choose between many login methods     | Options create cognitive load         | Default to device-native method; hide others behind "More ways."                                                                            |
| Prove humanity / CAPTCHA              | Fraud prevention                      | Privy/IDP handles risk signals; we do not add our own.                                                                                      |
| Manually approve each transaction     | Self-custody requires consent         | Session PDA scoped to Enigma programs with spend/ops caps.                                                                                  |
| Fund wallet with SOL before first use | On-chain writes cost gas              | v1 seeds a small budget from a node-sponsored faucet on devnet; mainnet top-up bundled with Apple Pay/Google Pay.                           |
| Switch network (devnet/mainnet)       | Multiple Solana clusters              | PWA auto-selects devnet for v1; consumer never sees the selector.                                                                           |
| Export private key                    | Power-user feature                    | Hidden in advanced settings; not shown during onboarding.                                                                                   |
| Edit `mcpServers` JSON manually       | MCP config is file-driven             | OAuth-based connector; one tap launches model consent.                                                                                      |
| Create API keys                       | Service authentication                | OAuth tokens issued by Enigma auth service.                                                                                                 |
| Re-authenticate for every model       | Each vendor runs its own OAuth client | Shared Enigma OAuth AS with SSO session cookie; subsequent models reuse the session.                                                        |
| Copy-paste redirect URLs              | OAuth redirect setup                  | Fixed redirect URIs registered per model; PWA handles the callback.                                                                         |
| Install extensions for each model     | Client-specific shims                 | Use native MCP OAuth support in ChatGPT/Claude/Gemini where available; browser extension is a single package with multiple content scripts. |
| "Save this memory?" per item          | User control                          | Server-side policy engine decides; user audits later.                                                                                       |
| Tag every memory                      | Organization                          | Auto-classification by category + sensitivity.                                                                                              |
| Manually sync across models           | No open cross-model standard          | MCP + shared encrypted vault + model-specific Capability PDAs.                                                                              |
| Remember which model knows what       | Fragmented state                      | All models query the same `cortex://memory/index` resource.                                                                                 |
| "Approve this recall?"                | Privacy control                       | Capability scope and budget cap are set at connection time; recalls are reads and do not spend.                                             |
| Choose USDC vs SOL vs SPL             | Multiple settlement options           | SOL default only; advanced users can toggle later.                                                                                          |
| Enter token mint addresses            | SPL complexity                        | Hidden; only exposed if user explicitly enables SPL settlement.                                                                             |
| Confirm royalty splits                | Data-dignity economics                | Owner-set royalty defaults to 0 for consumer v1; revenue-share layer deferred.                                                              |
| Gas fee estimation                    | On-chain cost uncertainty             | Session key + fixed compute-unit budget; user sees only "memory budget remaining."                                                          |
| Run a security audit before launch    | Best practice                         | Deferred per user constraint; document "pre-audit" status clearly.                                                                          |
| TEE/STARK proofs for every retrieval  | Verifiable memory                     | Deferred; signed receipts provide a weaker but immediate guarantee.                                                                         |
| Institutional custody setup           | High-value keys                       | Not needed for consumer embedded wallets; defer.                                                                                            |

---

## 5. Minimum On-Chain Program Changes

### 5.1 `capability_registry` (extended)

Additions:

```rust
pub fn create_session(
    ctx: Context<CreateSession>,
    session_key: Pubkey,
    nonce: u64,
    scope: u32,
    categories_hash: [u8; 32],
    max_spend_per_tx: u64,
    max_spend_per_day: u64,
    max_ops_per_day: u32,
    expires_at: i64,
) -> Result<()>

pub fn revoke_session(ctx: Context<RevokeSession>) -> Result<()>
pub fn extend_session(ctx: Context<ExtendSession>, expires_at: i64) -> Result<()>
pub fn pause_all_sessions(ctx: Context<PauseAllSessions>) -> Result<()>
```

New accounts: `Session`, `OwnerNonce`.

**No changes to existing `Capability` account or `grant`/`revoke` instructions.** The `Capability` PDA remains the OAuth/MCP audience-binding layer; `Session` PDA is the transaction-signing layer.

### 5.2 `memory_registry`

Add three session variants:

```rust
pub fn create_memory_with_session(
    ctx: Context<CreateMemoryWithSession>,
    content_hash: [u8; 32],
) -> Result<()>

pub fn update_memory_with_session(
    ctx: Context<UpdateMemoryWithSession>,
    new_hash: [u8; 32],
) -> Result<()>

pub fn delete_memory_with_session(
    ctx: Context<DeleteMemoryWithSession>,
) -> Result<()>
```

Each instruction receives `owner: AccountInfo<'info>` (not signer), `session_key: Signer<'info>`, and `session: Account<'info, capability_registry::Session>`, validates the Session PDA via seeds and scope bit, and sets `memory.owner = session.owner` so ownership remains the user's root wallet.

### 5.3 `budget_escrow`

Add:

```rust
pub fn spend_with_session(
    ctx: Context<SpendWithSession>,
    amount: u64,
) -> Result<()>
```

Validates session scope, expiry, caps, and `Budget.owner == session.owner`. Updates `session.spent_today` and `session.ops_today`.

### 5.4 `royalty_router`

Add:

```rust
pub fn route_royalty_with_session(
    ctx: Context<RouteRoyaltyWithSession>,
    amount: u64,
    content_hash: [u8; 32],
) -> Result<()>
```

Validates session scope and caps, then CPIs to `budget_escrow::spend_with_session` and writes the receipt.

### 5.5 What is NOT changed

- `Capability` PDA and existing grant/revoke flow remain untouched.
- `cortex_treasury` needs no changes; it receives protocol fees the same way.
- Token settlement (SPL) is deferred; only native SOL caps are enforced in v1.

### 5.6 Dependency map after changes

```
capability_registry
    ├── memory_registry  (depends on Session account definition)
    ├── budget_escrow    (depends on Session account definition)
    └── royalty_router   (depends on budget_escrow + Session)
```

The dependency from `memory_registry`/`budget_escrow` to `capability_registry` is new but lightweight: only the `Session` struct and program ID.

---

## 6. Off-Chain Node Changes

### 6.1 Session key lifecycle

```
onboarding
    ├─ generate Ed25519 session keypair
    ├─ store in encrypted vault (production: TEE-sealed)
    ├─ construct create_session tx
    └─ ask user to sign once with Privy embedded wallet

per auto-save / auto-recall
    ├─ load Session PDA from Solana
    ├─ verify !revoked && not expired && caps OK
    ├─ build tx with session key as signer
    └─ submit via RPC (Helius/QuickNode)

revocation / rotation
    ├─ listen for SessionRevoked events
    ├─ delete local keypair on revocation
    └─ generate new keypair on rotation
```

### 6.2 MCP server binding

- `initialize`: validate OAuth access token → lookup `Capability` PDA (audience=model) + `Session` PDA.
- Expose scoped tools based on `Capability.scope` (off-chain) **and** `Session.scope` (on-chain).
- On every tool call, re-read the Session PDA; fail closed if revoked/expired/capped.

### 6.3 Fail-closed rules

The node MUST NOT sign if:

- Session PDA does not exist.
- `revoked == true`.
- `expires_at <= now`.
- `owner_nonce` mismatch.
- Requested instruction bit not set in `scope`.
- `amount > max_spend_per_tx`.
- `spent_today + amount > max_spend_per_day`.
- `ops_today >= max_ops_per_day`.

Any failure is logged and surfaced to the user as "Auto-save paused — tap to review."

---

## 7. Implementation Roadmap

### Phase 1 — Foundation (weeks 1–2)

- [ ] Create Privy app; configure Solana network and embedded wallets (`createOnLogin: 'all-users'`).
- [ ] Integrate `@privy-io/react-auth` and `@privy-io/react-auth/solana` into Next.js PWA.
- [ ] Implement one-tap login with passkey / Google / Apple / email.
- [ ] Add `WalletButton` component and key export UI.

### Phase 2 — Session PDA Programs (weeks 2–3)

- [ ] Extend `capability_registry` with `Session` + `OwnerNonce` accounts and instructions.
- [ ] Add `*_with_session` variants to `memory_registry`, `budget_escrow`, and `royalty_router`.
- [ ] Add cross-program dependency on `capability_registry` for `Session` definition.
- [ ] Write Anchor tests covering scope, expiry, caps, revocation, and `pause_all_sessions`.

### Phase 3 — Node Session Vault (weeks 3–4)

- [ ] Generate and encrypt Ed25519 session keypairs per user.
- [ ] Implement `create_session` transaction builder; ask user to sign once.
- [ ] Implement session-aware transaction signing for memory anchors and budget spends.
- [ ] Add revocation/rotation event listener.

### Phase 4 — MCP + Auto-Save (weeks 4–6)

- [ ] Expose Cortex MCP tools: `add_memory`, `search_memory`, `update_memory`, `delete_memory`, `spend_budget`.
- [ ] Implement MCP OAuth 2.1 + PKCE authorization server.
- [ ] Map OAuth identity to Solana wallet via Privy ID token.
- [ ] Implement auto-save policy in off-chain node:
  - Salience scoring.
  - Immunology sentinel.
  - Budget checks.
- [ ] Use session key to anchor approved memory hashes and spend budget.

### Phase 5 — Model Connectors (weeks 6–7)

- [ ] One-tap ChatGPT connection via MCP.
- [ ] One-tap Claude connection via MCP.
- [ ] One-tap Gemini connection via MCP.
- [ ] Session/Capability revocation per model in PWA settings.

### Phase 6 — Hardening (weeks 7–8)

- [ ] Add revocation flows: close Session PDA + `pause_all_sessions` + kill Privy server session.
- [ ] Implement budget alerts and over-budget interception.
- [ ] Add telemetry for signing latency, delegation expiry, and error rates.
- [ ] Write runbook for rotating Privy app credentials and node authorization keys.

---

## 8. On-Chain Footprint

The absolute minimum viable on-chain footprint:

| Action             | On-chain effect                                                      | Why                                                      |
| ------------------ | -------------------------------------------------------------------- | -------------------------------------------------------- |
| Create wallet      | None (off-chain via Privy)                                           | Wallet is created in TEE; pubkey is canonical owner.     |
| Create session     | `capability_registry::create_session` → Session PDA + OwnerNonce PDA | One-time delegation with scope/caps/expiry.              |
| Store memory       | `memory_registry::create_memory_with_session` → Memory PDA           | Hash + owner + metadata. Blob stays off-chain encrypted. |
| Grant model access | `capability_registry::grant_capability` → Capability PDA             | Scoped, expiring OAuth/MCP audience permission.          |
| Spend budget       | `budget_escrow::spend_with_session` → Budget PDA                     | Tracks balance/spent. SOL default; USDC/SPL deferred.    |
| Pay royalty        | `royalty_router::route_royalty_with_session` → Receipt PDA           | Anchored payment record.                                 |
| Protocol fee       | `cortex_treasury` deposit                                            | Optional v1; can be zero-fee until token/legal ready.    |

Reads and semantic search are off-chain. Only ownership, session delegation, budget, capability, and royalty events hit Solana.

---

## 9. Pricing & Cost Model

### Provider Costs

| Provider                | Free Tier                                                                 | Paid Entry                       | Notes                                          |
| ----------------------- | ------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------- |
| Privy                   | 50K signatures + $1M tx volume / mo (or ~499–2,500 MAU depending on plan) | Usage-based after thresholds     | Cheapest at consumer scale.                    |
| Dynamic                 | Free tier available                                                       | Usage-based                      | Similar, but Solana headless less proven.      |
| Magic.link              | 1,000 MAUs                                                                | Usage-based                      | Auth-only; missing session-key stack.          |
| Web3Auth                | 1,000 MAWs                                                                | $69/mo for 3,000 MAUs            | MPC overhead and strategic uncertainty.        |
| Turnkey                 | 100 wallets / 25 tx/mo                                                    | $0.10/signature PAYG; $99/mo Pro | Best for agent infra, not consumer onboarding. |
| Coinbase Smart Wallet   | Free                                                                      | Free                             | Solana support is weak.                        |
| Self-built OAuth + SIWS | Free infrastructure                                                       | Engineering cost                 | Highest build/maintenance burden.              |

### On-Chain Costs (Solana)

- `create_session`: ~0.000005 SOL + rent (refundable on revoke).
- `create_memory_with_session`: ~0.000005–0.00005 SOL per transaction depending on priority fee.
- `spend_with_session`: ~0.000005 SOL.
- `route_royalty_with_session`: ~0.000005 SOL.
- Account rent: minimal for small PDAs; refundable on close.

Budget assumption: subsidize user gas for v1. Reclaim costs later from protocol fees or optional token launch.

---

## 10. Risks & Mitigations

| Risk                                            | Impact                                           | Mitigation                                                                                             |
| ----------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Privy/Stripe roadmap shifts                     | Provider becomes less consumer-friendly          | Wallet export is supported; migration path is key export + new provider.                               |
| Session keypair compromise                      | Node/session key could sign within Session scope | Short expiry, narrow program/instruction scope, on-chain revocation, daily caps, `pause_all_sessions`. |
| MCP client does not support auto-tool execution | Memories not saved/recalled automatically        | Fallback to explicit `add_memory`/`search_memory` tool calls; educate users.                           |
| Passkey not available on device                 | Falls back to email/social OTP                   | Privy supports email and social login as fallback.                                                     |
| Solana network congestion                       | Transactions fail or get expensive               | Use Helius priority-fee estimator; batch non-urgent anchors; sponsor gas.                              |
| Regulatory pressure before token launch         | Token deferred anyway; wallet is non-custodial   | No token at v1; user owns keys; legal review before any launch.                                        |

---

## 11. Deferred Items

Per the context brief, these are explicitly not part of the frictionless-first v1 architecture:

- **Security audit** — scheduled before mainnet public launch.
- **Institutional custody** — Squads multisig / HSM deferred until treasury scale.
- **Full TEE/STARK proofs** — research track; node encryption in place for v1.
- **Token launch** — deferred until legal is ready.
- **USDC/SPL settlement** — SOL default; token settlement optional/advanced.

---

## 12. Decision

**Use Privy for invisible consumer login and a Solana-native Session PDA for node-side transaction signing. Enforce scope, expiry, and spend/ops caps on-chain. Keep all non-essential custody, proof, and settlement layers deferred.**

This gives Cortex v3 the shortest path to: tap → wallet → talk → automatic memory ownership.

---

## 13. Solana Implementation Safeguards

These constraints were reviewed by the Solana architect and must be enforced in the `capability_registry` program and node signer client.

### Compute budget and transaction control

- The node must set `SetComputeUnitLimit` to the measured CU count, `SetComputeUnitPrice` from Helius priority-fee estimator, and `setLoadedAccountsDataSizeLimit` instead of relying on the default 64 MB assumption, which burns 16 k CU unnecessarily.
- Measure CU in tests with `solana program run --compute-unit-limit` and simulate every delegated transaction before broadcast.

### Versioned transactions and address lookup tables

- Verify Privy embedded Solana wallets and the node signer client support `VersionedTransaction` and Address Lookup Tables (ALTs) before any batch memory-shard operation.
- Use `VersionedTransaction` by default and fall back to legacy `Transaction` only when unsupported.
- ALTs are rent-exempt but require deactivate/close lifecycle management as shard sets grow.

### Narrow scope: memory-spend PDA, not main token accounts

- The delegated session signer is never authorized to move funds from the user's main SOL or token accounts.
- `budget_escrow` holds user deposits in a dedicated PDA owned by the program. The delegate can only move funds according to the pre-approved spend logic inside `budget_escrow`.
- For optional SPL settlements (deferred), use Token-2022 `PermanentDelegate` set to the `budget_escrow` program PDA so a session-key compromise cannot drain user-held tokens.

### Latency budget and signer performance

- Target: cold-start-to-submitted-transaction under 1,000 ms on a fast connection.
- Budget: ~175 ms Privy signer + 200–400 ms RPC blockhash/simulation + 200–400 ms broadcast/confirmation.
- Implement telemetry on every delegated signing path. If p95 exceeds 1,200 ms, investigate batching, priority-fee tuning, or a Turnkey fallback for high-frequency operations.

### Retrieval payment separation

- Retrieval payments (e.g. x402-style micropayments) are not signed directly by the broad memory/session delegate.
- Use a separate, smaller retrieval allowance PDA or facilitator token account that the user tops up explicitly.
- If the facilitator uses Token-2022 with transfer hooks, verify the hook program's CU cost fits the per-instruction budget and does not conflict with `ConfidentialTransfer` if privacy is added later.

### Revocation race: on-chain + off-chain

- When the user revokes, the PWA must: (1) close/revoke the Session PDA on-chain, (2) call Privy to invalidate the server session/token, and (3) emit a revocation event that the node consumes to drop cached session tokens immediately.
- The node must verify the Session PDA on every delegated sign; a stale JWT alone is insufficient.

### Session PDA hot-path performance

- Keep the `Session` account small and read-cheap. Every retrieval path may read it.
- Store large metadata (allowed instruction bitmaps, long scope strings) off-chain or in a separate config PDA to avoid account-lock contention with memory shards.

### Session/account hygiene

- Delete the local Ed25519 session keypair on `SessionRevoked` events.
- Rotate session keypairs on a schedule (e.g. every 30 days or on user request) and close the old Session PDA.
- Maintain an `OwnerNonce` PDA to prevent replay of old sessions after rotation.

---

## 14. Model Connectors — One Tap per Model

The user journey in §4.2 assumes ChatGPT, Claude, and Gemini each connect with one tap. The reality is that each platform exposes a different integration surface. This section picks the minimum viable integration for each model and maps the exact connection flow.

### 14.1 Decision: minimum viable integration per model

| Model                              | Minimum viable integration                                                                                             | Why                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude**                         | Native MCP stdio via an Enigma native-host installer (Claude Desktop first; web/mobile via browser extension fallback) | Claude Desktop has first-class, shipped MCP support. We can write its config and restart it automatically.                                  |
| **ChatGPT**                        | Browser extension for `chat.openai.com`                                                                                | OpenAI consumer ChatGPT has no public MCP/API for third-party memory. A content-script extension is the only persistent, automatic surface. |
| **Gemini**                         | Browser extension for `gemini.google.com`                                                                              | Google consumer Gemini has no public MCP. The web UI is the only reachable surface. Same extension package, separate content script.        |
| **Mobile native apps (all three)** | PWA share target on Android; iOS native share extension or manual copy-paste fallback                                  | iOS does not allow PWAs as share targets. This is per-conversation ingestion, not live sync.                                                |

Every connection starts from one primary action in the Enigma PWA and completes inside the model's normal install/permission flow.

### 14.2 Connection components

- **Enigma PWA** — initiates OAuth, dispatches deeplinks, displays QR codes, manages revocation.
- **Enigma Authorization Server** — OAuth 2.1 + PKCE AS; federates login to Privy; issues Cortex Capability Tokens scoped per model.
- **Enigma MCP Gateway** — HTTP/SSE MCP server plus stdio bridge. Validates tokens, checks `Capability` PDA + `Session` PDA + `budget_escrow`, proxies to the off-chain node.
- **Enigma Browser Extension** — one package, content scripts for `chat.openai.com` and `gemini.google.com`. Holds OAuth token, observes conversation turns, calls the Gateway for `search_memory`/`add_memory`.
- **Enigma Native Host** — small OS installer that writes `claude_desktop_config.json`, registers a machine credential, and deeplinks to restart Claude Desktop.

### 14.3 OAuth 2.1 + PKCE flow

MCP mandates OAuth 2.1 for HTTP transports and PKCE for public clients. Cortex uses one authorization server for all models.

```
PWA / Extension / Native Host          Enigma Auth Server          Privy IdP
        │                                    │                          │
        │  (1) GET /.well-known/...          │                          │
        │◄───────────────────────────────────┤                          │
        │  (2) generate code_verifier        │                          │
        │  code_challenge = S256(verifier)   │                          │
        │  (3) /authorize?client_id=...      │                          │
        │     &code_challenge=...            │                          │
        │     &redirect_uri=...              │                          │
        │     &scope=memory:read+memory:write│                          │
        │───────────────────────────────────►│                          │
        │                                    │  (4) OIDC / passkey flow │
        │                                    │─────────────────────────►│
        │                                    │◄─────────────────────────│
        │                                    │  (5) create Capability PDA
        │                                    │  (6) issue auth code     │
        │  (7) redirect with code            │                          │
        │◄───────────────────────────────────┤                          │
        │  (8) POST /token                   │                          │
        │     code + code_verifier           │                          │
        │───────────────────────────────────►│                          │
        │  (9) Cortex Capability Token       │                          │
        │     (access_token)                 │                          │
        │◄───────────────────────────────────┤                          │
```

Token claims:

- `sub` — Solana wallet pubkey
- `aud` — model client ID (`chatgpt-web`, `gemini-web`, `claude-desktop`)
- `scope` — `memory:read`, `memory:write`, `budget:spend`
- `capability_pda` — on-chain Capability PDA address
- `session_pda` — on-chain Session PDA address
- `budget_cap` — max lamports per interval
- `exp`, `iat`, `jti`

`redirect_uri` per client:

- Browser extension: `https://<extension-id>.chromiumapp.org/` (Chrome) or `moz-extension://<uuid>` (Firefox).
- PWA: `https://enigma.memory/connect/callback`.
- Native host: local loopback or custom `enigma://connect/callback` handled by the installer.

Refresh tokens rotate on use. Long-lived refresh tokens for desktop stdio are stored in the OS keychain by the native host.

### 14.4 Claude — native MCP stdio

**Why this is the gold path:** Claude Desktop implements MCP natively. No browser extension or DOM scraping is needed.

**One-tap flow:**

1. User taps "Connect Claude" in the PWA.
2. PWA obtains a short-lived setup token from Enigma Auth Server.
3. PWA triggers download of the Enigma native-host installer for the user's OS.
4. User runs the installer (one OS click; browsers cannot silently execute binaries).
5. Installer:
   - Writes `claude_desktop_config.json` with `"command": "enigma-mcp"` and env containing the setup token.
   - Registers the machine credential with Enigma Auth Server.
   - Installs `enigma-mcp` globally if it is missing.
6. Installer invokes `claude://restart` or prompts the user to relaunch Claude Desktop.
7. Claude Desktop launches `enigma-mcp` over stdio.
8. `enigma-mcp` exchanges the setup token for a long-lived credential and opens a session to the MCP Gateway.
9. Claude sees `search_memory`, `add_memory`, `update_memory`, `delete_memory`, `spend_budget` as native tools.

**Fallback:** Claude web and mobile do not support MCP. Fall back to the Enigma browser extension with a Claude content script, or to PWA share targets on mobile.

### 14.5 ChatGPT — browser extension

**Why this is the minimum viable path:** Consumer ChatGPT has no public MCP, plugin, or API surface that lets a third party read/write memory automatically. A content-script extension is the only persistent surface.

**One-tap flow:**

1. User taps "Connect ChatGPT" in the PWA.
2. PWA opens the Chrome Web Store / Firefox Add-ons page for the Enigma extension.
3. User taps "Add to Chrome" / "Add extension" (standard browser flow).
4. Extension popup opens and initiates OAuth 2.1 + PKCE to Enigma Auth Server.
5. User authenticates (skipped if SSO session exists) and approves ChatGPT scope.
6. Auth server returns Cortex Capability Token to the extension.
7. Extension content script activates on `chat.openai.com`, observes conversation turns, and calls the Gateway for `search_memory` before the model response and `add_memory` after.
8. Toolbar shows Enigma status: memory saved, budget remaining, connection health.

**Mobile fallback:** Android PWA share target; iOS native share extension or manual copy-paste.

### 14.6 Gemini — browser extension

**Why this is the minimum viable path:** Same as ChatGPT. Consumer Gemini has no public MCP for third-party memory.

**One-tap flow:** identical to ChatGPT, but the content script targets `gemini.google.com`. Same extension package, different content-script manifest.

**Mobile fallback:** same as ChatGPT.

### 14.7 Mobile native apps — share targets and QR codes

Persistent, automatic memory sync inside the ChatGPT/Claude/Gemini iOS/Android apps is not possible without platform support. The minimum viable fallback is per-conversation ingestion.

**Android:**

- Enigma PWA declares `share_target` in its web app manifest.
- User taps the system share button in the model app and selects "Enigma Memory".
- PWA receives shared text/images and runs `add_memory`.

**iOS:**

- PWAs cannot register as share targets.
- Ship a thin native share extension, or document the copy-paste fallback.
- User taps share → Enigma extension → text is ingested.

**Cross-device handoff with QR codes:** If the user creates a wallet on desktop and wants to connect mobile, the PWA displays a QR containing a temporary setup JWT. Mobile scans it, opens the PWA, and resumes the OAuth flow without re-entering credentials.

### 14.8 MCP Gateway transport and tool surface

| Client             | Transport                                                                | Auth                                            |
| ------------------ | ------------------------------------------------------------------------ | ----------------------------------------------- |
| Claude Desktop     | stdio to local `enigma-mcp`; `enigma-mcp` opens SSE/WebSocket to Gateway | Local machine credential + OAuth token exchange |
| ChatGPT/Gemini web | Extension background → HTTPS to Gateway                                  | Bearer Cortex Capability Token                  |
| PWA                | Direct HTTPS/SSE to Gateway                                              | Bearer Cortex Capability Token                  |
| Mobile share       | PWA → HTTPS to Gateway                                                   | Same-session cookie or token                    |

Gateway tools exposed to MCP clients:

```json
{
  "tools": [
    {
      "name": "search_memory",
      "description": "Recall relevant user memories before answering personal questions."
    },
    {
      "name": "add_memory",
      "description": "Persist a high-salience fact, preference, or context."
    },
    {
      "name": "update_memory",
      "description": "Replace an outdated memory with a corrected version."
    },
    { "name": "delete_memory", "description": "Remove a memory by ID." },
    {
      "name": "spend_budget",
      "description": "Record an operation against the user's budget escrow."
    }
  ]
}
```

Resources:

- `cortex://memory/index` — memory index/metadata (no plaintext).
- `cortex://budget/status` — budget balance and spend rate.
- `cortex://capabilities/grants` — active capability grants.
- `cortex://immunology/recent` — latest sentinel report.

The Gateway advertises `resources.subscribe` so clients that support it pull updates after server notifications.

### 14.9 Per-model revocation

1. **Disconnect one model:** user taps "Disconnect [Model]" in the PWA. The PWA burns that model's Capability PDA on-chain and invalidates tokens by `jti` at the Auth Server.
2. **Pause all memory:** user taps "Pause all memory". All Capability PDAs are frozen; OAuth refresh tokens are invalidated.
3. **Device lost:** user revokes the Privy session; Auth Server rejects refresh tokens; native host/browser tokens expire and cannot refresh.

---

_Frictionless-first architecture memo — Enigma Cortex v3 — 2026-06-27_
