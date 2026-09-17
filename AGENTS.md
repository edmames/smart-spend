<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SmartSpend Agent Instructions

## Project

SmartSpend is a mobile-first Indonesian personal finance PWA.

Stack (verify against `package.json`; do not assume):

- Next.js App Router (`src/app`), React
- TypeScript strict, plus `noUncheckedIndexedAccess` and `noImplicitOverride` — indexed access is `T | undefined`
- Tailwind CSS v4, CSS-first: no `tailwind.config.*`; tokens are `@theme inline` in `src/app/globals.css`
- Zustand store (`src/app/store.ts`) over application actions (`src/app/actions.ts`)
- React Hook Form + Zod
- Lucide icons, date-fns
- Vitest + React Testing Library (jsdom); Playwright is configured but has no specs yet

There is no charting library: bars and category visuals are hand-rolled from the palette in `src/components/ui/theme.ts`.

V1 is local-first with localStorage behind the existing repository abstraction (`src/repository/`). Do not introduce Supabase/Auth/Telegram unless a future task explicitly requests that phase.

UI language is Bahasa Indonesia. Money is IDR.

## Source of Truth

The transaction ledger/history is the financial source of truth. Do not introduce mutable stored current balances when balances can be derived from transactions. Reuse existing domain functions/selectors/repositories instead of duplicating financial calculations in UI components.

## Financial Invariants

Preserve these rules:

- Total Money = wallet balances + savings balances
- `income`: enters wealth, counts as monthly income
- `expense`: leaves wealth, counts as monthly expense
- `transfer`: wallet → wallet, internal movement; total money unchanged, not income, not expense
- `savings_deposit`: wallet → savings; total money unchanged, not expense
- `savings_withdrawal`: savings → wallet; total money unchanged, not income
- `opening_balance`: establishes existing wealth; affects wallet/total, excluded from monthly income
- Budget spending counts real expenses only
- QRIS is payment metadata, NOT a wallet
- Amounts are positive integer IDR values (`MIN_MONEY` 1, `MAX_MONEY` 9_999_999_999)
- Never double-count wallet and savings money

## Balance Derivation

Wallet balance = opening balance + income - expense - outgoing transfer + incoming transfer - savings deposits + savings withdrawals.

Savings balance = savings deposits - savings withdrawals.

Do not reimplement these formulas in presentation components. Use `src/domain/ledger.ts` and `src/domain/selectors.ts`, re-exported for UI through `src/app/derived.ts`.

## Historical Validation

Negative balances are not allowed. Create/edit/delete must keep respecting chronological ledger validation.

Same-day deterministic ordering (`compareTransactions`, 4 keys): `transaction.date` → `createdAt` → `id` → `type`. The final `type` key is a last-resort tiebreaker so malformed imports stay repeatable.

Do not bypass domain validation for easier UI behavior.

## Dates and Timezone

`transaction.date` is a calendar date, `YYYY-MM-DD` — NOT a UTC timestamp. Do not derive transaction financial dates from `createdAt`.

`createdAt` / `updatedAt` / `exportedAt` remain UTC ISO timestamps.

Financial grouping, reports, budgets, filters and historical validation use `transaction.date`.

The reference timezone for "Today", the current month, default transaction dates and calendar UI is `Asia/Jakarta` (`REFERENCE_TIME_ZONE` in `src/domain/calendar.ts`). Use the existing centralized date/time utilities; do not hardcode `+07:00`.

## Money Input

`AmountInput` behavior is protected. Formatted display and canonical numeric form state are intentionally separated, so never reparse formatted IDR display text as decimal input.

Do not casually modify `AmountInput`, `amountFromMoneyInput`, `digitsFromMoneyInput`, or the IDR formatter/parser. Large values such as `Rp9.999.999.999` must remain supported.

## Repository / Persistence

Keep persistence behind the existing repository abstraction (`src/repository/`). Do not access localStorage directly from presentation components when an existing repository/store abstraction should be used.

New users start empty: never add fake production transactions, wallets, balances or savings goals. Import/export semantics are protected unless explicitly in scope.

## UI System

Continue the approved visual system: mobile-first, premium minimalist finance UI, teal/cyan accent, strong light mode, near-black/deep dark mode, compact information density, restrained borders and shadows, existing app shell and safe-area handling.

Avoid decorative gradients, glassmorphism, 3D finance illustrations, excessive pills, giant cards, excessive whitespace, and generic admin-dashboard styling. Do not create a second design system.

## Navigation

Bottom navigation is exactly: Beranda, Transaksi, Dompet, Budget, Pengaturan. Do not add a global center FAB, and do not change global navigation unless explicitly requested.

Phase 2F: Dompet is the unified Money Hub.

- Money Hub exposes segmented control: [ Dompet ] [ Tabungan ]
- /wallets defaults to Dompet, /wallets?tab=savings opens Tabungan
- /savings remains functional for backward compatibility and opens Tabungan experience
- Wallets and savings remain separate domain concepts; consolidation is UI/navigation only
- Wallet routes (/wallets, /wallets/*) and savings routes (/savings, /savings/*) both activate Dompet in bottom nav
- Budget routes (/budgets, /budgets/*) activate Budget
- Pengaturan activates Settings (/settings); /more remains as a contextual hub for quick actions
- URL state uses standard Next.js App Router primitives (useRouter, useSearchParams, router.replace) — no manual history.replaceState/popstate unless required

## Accessibility

Maintain semantic controls/headings, keyboard and focus behavior, sufficient contrast, approximately 44px touch targets, `aria-label`s for icon-only controls, reduced-motion support, and financial meaning that is not conveyed through color alone.

## Responsive Targets

Primary mobile target: 390px. Also check 375px and 430px.

Prevent horizontal overflow. Content must clear the fixed bottom navigation and safe areas. Desktop/tablet should preserve the contained app shell.

## Scope Discipline

Before editing: inspect the relevant implementation, understand the existing architecture, then prefer the smallest correct change.

Do not refactor unrelated code. Do not install dependencies unless the task genuinely requires it.

If a requested UI change appears to require changing protected financial behavior, STOP and report the conflict instead of silently changing domain architecture.

## Testing Workflow

While iterating, prefer targeted tests for affected features (`npm run test:components`, `npm run test:domain`) rather than repeatedly running the whole suite.

Before completion run once:

    npm run typecheck
    npm run lint
    npm run test
    npm run build

Never weaken or delete tests merely to obtain a pass. Add behavioral tests rather than brittle class-string snapshots. Tests involving financial dates must stay safe under both UTC and Asia/Jakarta process timezones.

## Visual QA

For UI work, automated tests do not replace real visual review. When browser tooling is available, inspect the relevant screens at 375px, 390px and 430px, in light and dark when applicable.

If browser tooling is unavailable, state that clearly. Do not claim visual QA that was not actually performed.

## Git Safety

At task start verify the expected branch, the expected baseline when supplied, and a clean working tree.

Do not discard unexpected user changes. Do not force push. Do not rewrite history unless explicitly requested. Do not automatically commit, push or merge unless the task explicitly asks for it.

When implementation is awaiting visual review, leave changes uncommitted unless instructed otherwise.

## Existing Stash

There may currently be `stash@{0}: pre-phase-2c local UI/theme changes (9 files)`.

Do NOT apply, pop, drop, merge or include this stash unless explicitly instructed. Treat it as unrelated preserved work.

## Token / Tool Efficiency

Be concise. Do not repeatedly print full git logs, full diffs, large unchanged files, or full successful test output.

Inspect only relevant files. Use targeted tests while iterating and run full verification once after implementation stabilizes.

Final reports should summarize files changed, behavior changed, tests, verification results, and unresolved issues. Do not narrate routine tool usage.
