# Enigma Cortex v3 — Consumer Webapp Design

## 1. Product identity

**App name:** Cortex Wallet  
**Tagline:** *Your memories. Your wallet. Every AI.*  
**Mental model:** a secure notes / memory wallet app, not a crypto dashboard. Blockchain exists only as plumbing.

---

## 2. File layout

All source lives under `enigma/cortex-v3/webapp/`.

```
cortex-v3/webapp/
├── README.md
├── package.json
├── next.config.js
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # root shell + Privy provider
│   │   ├── page.tsx                   # marketing / entry redirect
│   │   ├── (wallet)/                  # authenticated routes
│   │   │   ├── layout.tsx             # bottom nav + auth guard
│   │   │   ├── feed/
│   │   │   │   └── page.tsx
│   │   │   ├── memory/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── share/
│   │   │   │   └── page.tsx
│   │   │   ├── earnings/
│   │   │   │   └── page.tsx
│   │   │   ├── inheritance/
│   │   │   │   └── page.tsx
│   │   │   └── settings/
│   │   │       └── page.tsx
│   │   └── onboarding/
│   │       └── page.tsx
│   ├── components/
│   │   ├── primitives/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Avatar.tsx
│   │   │   ├── Switch.tsx
│   │   │   ├── SegmentedControl.tsx
│   │   │   └── Skeleton.tsx
│   │   ├── memory/
│   │   │   ├── MemoryList.tsx
│   │   │   ├── MemoryCard.tsx
│   │   │   ├── MemoryDetail.tsx
│   │   │   ├── MemoryReceipts.tsx
│   │   │   ├── MemoryActions.tsx
│   │   │   ├── ProvenanceChain.tsx
│   │   │   └── DeleteMemorySheet.tsx
│   │   ├── wallet/
│   │   │   ├── WalletButton.tsx
│   │   │   ├── EmbeddedWalletGate.tsx
│   │   │   ├── WalletSheet.tsx
│   │   │   └── GaslessNotice.tsx
│   │   ├── share/
│   │   │   ├── CapabilityCard.tsx
│   │   │   ├── ShareSheet.tsx
│   │   │   ├── RevokeCapabilitySheet.tsx
│   │   │   └── PermissionTag.tsx
│   │   ├── earnings/
│   │   │   ├── EarningsSummary.tsx
│   │   │   ├── RoyaltyList.tsx
│   │   │   ├── WithdrawSheet.tsx
│   │   │   └── BudgetChart.tsx
│   │   ├── inheritance/
│   │   │   ├── HeirCard.tsx
│   │   │   ├── AddHeirSheet.tsx
│   │   │   └── InheritanceStatus.tsx
│   │   ├── onboarding/
│   │   │   ├── OnboardingPager.tsx
│   │   │   ├── DelegationConsentSheet.tsx
│   │   │   ├── ModelConnectorGrid.tsx
│   │   │   └── ValuePropCard.tsx
│   │   └── navigation/
│   │       ├── BottomNav.tsx
│   │       ├── TopBar.tsx
│   │       ├── SearchHeader.tsx
│   │       └── FilterSheet.tsx
│   ├── hooks/
│   │   ├── usePrivy.ts
│   │   ├── useDelegatedSession.ts
│   │   ├── useMemories.ts
│   │   ├── useMemory.ts
│   │   ├── useCapabilities.ts
│   │   ├── useEarnings.ts
│   │   ├── useInheritance.ts
│   │   ├── useBudget.ts
│   │   ├── useConnectedModels.ts
│   │   └── useSearch.ts
│   ├── lib/
│   │   ├── privy/
│   │   │   ├── provider.tsx
│   │   │   ├── session.ts
│   │   │   └── auth.ts
│   │   ├── solana/
│   │   │   ├── connection.ts
│   │   │   ├── wallet.ts
│   │   │   ├── instructions/
│   │   │   │   ├── commitMemory.ts
│   │   │   │   ├── deleteMemory.ts
│   │   │   │   ├── issueCapability.ts
│   │   │   │   ├── revokeCapability.ts
│   │   │   │   ├── withdrawRoyalties.ts
│   │   │   │   ├── registerHeir.ts
│   │   │   │   └── updateBudget.ts
│   │   │   └── programs/
│   │   │       ├── cortexProgram.ts
│   │   │       └── idl.ts
│   │   ├── oauth/
│   │   │   ├── connectors.ts          # ChatGPT / Claude / Gemini OAuth config
│   │   │   └── mcp.ts
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   ├── memories.ts
│   │   │   ├── receipts.ts
│   │   │   └── indexer.ts
│   │   ├── utils/
│   │   │   ├── format.ts
│   │   │   ├── date.ts
│   │   │   └── currency.ts
│   │   └── constants.ts
│   ├── styles/
│   │   └── globals.css
│   └── types/
│       └── index.ts
├── public/
│   ├── icons/
│   └── illustrations/
└── tests/
    ├── unit/
    │   ├── components/
    │   │   ├── MemoryCard.test.tsx
    │   │   ├── CapabilityCard.test.tsx
    │   │   ├── EarningsSummary.test.tsx
    │   │   └── DeleteMemorySheet.test.tsx
    │   ├── hooks/
    │   │   ├── useSearch.test.ts
    │   │   ├── useBudget.test.ts
    │   │   └── useCapabilities.test.ts
    │   └── lib/
    │       ├── format.test.ts
    │       └── instructions.test.ts
    ├── e2e/
    │   ├── onboarding.spec.ts
    │   ├── memory-feed.spec.ts
    │   ├── memory-detail.spec.ts
    │   ├── sharing.spec.ts
    │   ├── earnings.spec.ts
    │   └── inheritance.spec.ts
    └── fixtures/
        ├── memories.ts
        ├── capabilities.ts
        ├── receipts.ts
        └── heirs.ts
```

---

## 3. Stack recommendation

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 15** (App Router) | Server data fetching, static export option, strong mobile PWA support. |
| Language | **TypeScript 5** | Type safety across wallet + program interactions. |
| Styling | **Tailwind CSS 4** + **CSS variables** | Token-first theming, mobile-first breakpoints. |
| Primitives | **Radix UI** | Accessible sheets, dialogs, switches, tabs. |
| State | **Zustand** + **TanStack Query (React Query)** | Wallet/session state; server-state sync with optimistic updates. |
| Wallet / auth | **Privy** (`@privy-io/react-auth`) | Passkey / Face ID / Google / Apple login + embedded Solana wallet + delegated server sessions. |
| Session signing | **Privy server sessions** (`@privy-io/server-auth`) | Headless delegated actions scoped to Enigma programs, spend cap, expiry. |
| Solana client | **@solana/web3.js** + **Anchor** | Matches existing monorepo dependency; program IDL integration. |
| Icons | **Lucide React** | Clean, consistent iconography. |
| Charts | **Recharts** or **Tremor** | Lightweight earnings/budget visualizations. |
| Testing | **Vitest** + **@testing-library/react** + **Playwright** | Unit, component, and E2E mobile-first tests. |

> **Why not Svelte / React Native?**  
> Svelte is great but the monorepo already uses React patterns and React Native would slow the Phase 1 devnet MVP. Next.js gives us a mobile-first PWA today and a path to native via Capacitor later.

---

## 4. Route map

| Route | Screen | Auth | Key actions |
|---|---|---|---|
| `/` | Landing / redirect to onboarding or feed | None | Explain value, CTA to create wallet |
| `/onboarding` | Embedded wallet creation + delegation consent | None | Passkey / Google / Apple signup, one-tap allow |
| `/feed` | Memory feed | Required | Search, filter, scroll memories, manual add |
| `/memory/[id]` | Memory detail | Required | View content, provenance, receipts, delete |
| `/share` | Sharing & permissions | Required | Issue/revoke Capability NFTs, view grants |
| `/earnings` | Earnings dashboard | Required | Royalty feed, budget, top-up |
| `/inheritance` | Inheritance setup | Required | Add/remove heirs, set unlock delay |
| `/settings` | Settings, connected models, budget | Required | Recovery, top-up, model toggles, panic pause |

---

## 5. Component list

### Primitives
- `Button` — primary, secondary, ghost, danger, loading states.
- `Input` — search, text, number, with inline validation.
- `Card` — memory card, stat card, setting row.
- `Badge` — memory type, capability scope, immunology status.
- `Avatar` — AI/agent identity, user, heir.
- `Switch` — opt-in / public / shareable toggles.
- `SegmentedControl` — feed filters (All / Recent / Shared / Earning).
- `Skeleton` — loading placeholders.

### Memory domain
- `MemoryList` — virtualized list of memory cards.
- `MemoryCard` — preview, date, source AI, sharing status, immunology badge.
- `MemoryDetail` — full content + metadata.
- `MemoryReceipts` — list of retrieval receipts with proof links.
- `MemoryActions` — delete, share, edit visibility.
- `ProvenanceChain` — visual DAG / anchor timeline.
- `DeleteMemorySheet` — confirmation + cryptographic deletion receipt.

### Wallet domain
- `WalletButton` — shows wallet status, opens sheet.
- `EmbeddedWalletGate` — blocks routes until authenticated.
- `WalletSheet` — balance, backup status, sign-out.
- `GaslessNotice` — small pill explaining memory budget covers fees.

### Sharing domain
- `CapabilityCard` — who has access, to what, until when.
- `ShareSheet` — issue a new Capability NFT.
- `RevokeCapabilitySheet` — revoke access.
- `PermissionTag` — read / summarize / monetize scopes.

### Earnings domain
- `EarningsSummary` — total earned, pending, this period.
- `RoyaltyList` — per-memory royalty feed.
- `WithdrawSheet` — withdraw SOL (USDC deferred).
- `BudgetChart` — spend vs budget over time.

### Inheritance domain
- `HeirCard` — heir wallet, unlock conditions.
- `AddHeirSheet` — add heir + waiting period.
- `InheritanceStatus` — active / paused / not set.

### Onboarding domain
- `OnboardingPager` — value props.
- `DelegationConsentSheet` — one-tap server-session consent.
- `ModelConnectorGrid` — ChatGPT / Claude / Gemini one-tap OAuth cards.
- `ValuePropCard` — plain-language benefit card.

### Navigation
- `BottomNav` — Feed / Share / Earnings / Inheritance / Settings.
- `TopBar` — screen title, context action.
- `SearchHeader` — sticky search with filter chip.
- `FilterSheet` — source AI, date range, type, sharing status.

---

## 6. Wallet integration approach

### Goal
Sign-up should feel like Apple Wallet or a password manager: **passkeys / Face ID / Google / Apple**, no seed phrase, no gas token purchase.

### Primary provider: Privy
Use **Privy** (`@privy-io/react-auth`) for embedded Solana wallet creation and authentication, and `@privy-io/server-auth` for headless delegated server sessions.

### Authentication priority
1. Passkey (Face ID / Touch ID / Windows Hello)
2. Google One Tap
3. Sign in with Apple
4. Email magic link (fallback only)

### Session delegation
After login, the user sees a single **"Allow"** consent screen. Tapping it triggers Privy `useHeadlessDelegatedActions` / server delegation with policy:
- `contractWhitelist`: Enigma program IDs only (`memory_registry`, `capability_registry`, `budget_escrow`).
- `maxSpend`: daily SOL cap (e.g., 0.01 SOL).
- `expiry`: 30 days, auto-refresh if user is active.
- `chainType`: `solana`.

The delegated session signer lives in the Cortex off-chain node, enabling automatic memory anchors while the user is away.

### Capability and budget
- **Capability PDA** per model, seeds: `["capability", owner_wallet, audience, granted_to]`.
- Default scope: `memory:read`, `memory:write:low-sensitivity`, `budget:spend`.
- **Budget escrow**: node-sponsored SOL on devnet; session signer spends against it.
- **Revocation**: instant on-chain via `revoke_capability` or `pause_all`.

### Cross-model connection
Each model (ChatGPT, Claude, Gemini) connects via OAuth 2.1 + PKCE through the Enigma auth service, backed by the same Privy identity. One tap per model mints a model-specific Capability PDA.

### Implementation
1. `src/lib/privy/provider.tsx` wraps the app with `PrivyProvider`.
2. `src/lib/privy/session.ts` requests and refreshes delegated sessions.
3. `src/lib/oauth/connectors.ts` configures model OAuth clients.
4. Program interactions via Anchor IDL; no raw `web3.js` in components.

---

## 7. Dependencies

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@solana/web3.js": "^1.98.2",
    "@coral-xyz/anchor": "^0.30.0",
    "@privy-io/react-auth": "^2.0.0",
    "@privy-io/server-auth": "^1.0.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^5.0.0",
    "tailwindcss": "^4.0.0",
    "@radix-ui/react-dialog": "^1.0.0",
    "@radix-ui/react-switch": "^1.0.0",
    "@radix-ui/react-tabs": "^1.0.0",
    "@radix-ui/react-tooltip": "^1.0.0",
    "lucide-react": "^0.460.0",
    "recharts": "^2.13.0",
    "date-fns": "^4.0.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "vitest": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "playwright": "^1.48.0",
    "@vitejs/plugin-react": "^4.3.0"
  }
}
```

---

## 8. Consumer UX principles

1. **No crypto jargon.** Use "Memory Wallet," "receipts," "earnings," "permissions," "connected models" — never "seed phrase," "gas," "PDA," "NFT" unless explained in plain language.
2. **Mobile-first.** Bottom navigation, thumb-friendly actions, full-width sheets, swipe gestures where native-feeling.
3. **Trust through receipts.** Every memory has a visible "receipt" icon showing what AI retrieved it and when.
4. **Progressive disclosure.** Advanced settings (BDI commitments, schema market, skill memes) hidden behind "Advanced."
5. **Calm palette.** Warm neutrals, soft semantic colors (blue = memory, green = earning, amber = warning, red = danger). Avoid gradients and crypto-purple.
6. **Immediate feedback.** Optimistic UI for delete/share, toast confirmations, skeleton loaders.
7. **Frictionless onboarding.** Four gestures to first model: open → login → biometric → allow.

---

## 9. Key screens (wireframe intent)

### Onboarding
- Full-screen pager: "One memory across ChatGPT, Claude, Gemini."
- Large buttons: **Continue with Google**, **Continue with Apple**, **Continue with Passkey**.
- Brief spinner: "Creating your memory wallet…"
- Optional recovery link for passkey/email users.
- Single **"Allow"** consent card for automatic save/recall, with plain-language bullets.
- Model connector grid: ChatGPT / Claude / Gemini cards, each one tap to OAuth connect.

### Memory feed
- Sticky search bar + segmented filter.
- Infinite scroll of memory cards.
- Each card: source AI avatar, date, snippet, privacy badge, earning indicator.
- Floating "+" to manually commit a memory note.

### Memory detail
- Header with source, date, memory type.
- Content body.
- Provenance / receipts section.
- Actions: share (issue Capability), delete with receipt.

### Sharing / permissions
- List of active Capability grants.
- "Share memory" flow: pick memory → choose recipient / scope / expiry → confirm.
- Revoke any grant with swipe or menu.

### Earnings dashboard
- Top summary cards: earned, pending, budget remaining.
- Bar chart of earnings by memory / week.
- Royalty feed with memory names and amounts.
- Top-up button (Apple Pay / Google Pay / Privy on-ramp on mainnet).

### Inheritance
- Status banner: not set / active.
- Heir list with wallet addresses and unlock dates.
- "Add heir" sheet: paste wallet / scan QR, choose delay, confirm.

### Settings
- Wallet recovery / backup status.
- Memory budget: add funds, view spend breakdown.
- Connected Models list with toggles; "Pause All Models" panic button.
- Preferences: default sharing, notification toggles.
- Danger zone: delete all memories.

---

## 10. Test file paths

```
cortex-v3/webapp/tests/
├── unit/
│   ├── components/
│   │   ├── MemoryCard.test.tsx
│   │   ├── CapabilityCard.test.tsx
│   │   ├── EarningsSummary.test.tsx
│   │   └── DeleteMemorySheet.test.tsx
│   ├── hooks/
│   │   ├── useSearch.test.ts
│   │   ├── useBudget.test.ts
│   │   └── useCapabilities.test.ts
│   └── lib/
│       ├── format.test.ts
│       └── instructions.test.ts
├── e2e/
│   ├── onboarding.spec.ts
│   ├── memory-feed.spec.ts
│   ├── memory-detail.spec.ts
│   ├── sharing.spec.ts
│   ├── earnings.spec.ts
│   └── inheritance.spec.ts
└── fixtures/
    ├── memories.ts
    ├── capabilities.ts
    ├── receipts.ts
    └── heirs.ts
```

---

## 11. Acceptance criteria

- [ ] Onboarding creates an embedded Solana wallet via Privy without exposing a seed phrase.
- [ ] One-tap "Allow" consent grants a server session with Enigma program whitelist and daily SOL spend cap.
- [ ] ChatGPT, Claude, and Gemini connect via OAuth MCP with one tap each.
- [ ] Authenticated users land on `/feed` and see their memory list.
- [ ] Each memory card shows source, date, snippet, and privacy/earning status.
- [ ] Memory detail displays content, provenance, receipts, and delete action.
- [ ] Sharing flow issues a Capability PDA and lists active grants.
- [ ] Earnings dashboard shows SOL royalties and budget usage.
- [ ] Inheritance screen allows adding/removing heirs with an unlock delay.
- [ ] Settings supports backup status, budget top-up, connected model toggles, and panic pause.
- [ ] All primary flows pass mobile viewport E2E tests (375px width).
- [ ] No raw crypto jargon appears on primary consumer screens.

---

*Design updated to align with the locked frictionless-first architecture: Privy embedded wallet, server session delegation, Capability PDA, OAuth MCP connectors, SOL default on devnet.*
