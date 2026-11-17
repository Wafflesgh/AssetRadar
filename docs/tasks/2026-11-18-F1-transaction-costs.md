# Task: F1 — Recorded transaction costs

**Status:** done
**Written by:** Claude · **Date:** 2026-11-18 · **Plan:** `docs/plans/TRD.md` § F1

## Goal
Show the owner how much they paid in recorded fees: per month, per year, per asset, and as a % of
traded value. Uses fees already entered on transactions.

## Allowed files
- New `src/utils/txCosts.ts` + new `src/utils/txCosts.test.ts`
- New `src/components/PortfolioCosts.tsx`; `src/components/PortfolioView.tsx` (render it in the Positions tab, below transactions)
- `src/i18n/en.ts`, `src/i18n/id.ts` (new keys `costs.*` only)

## Logic
`txCosts(txs)` over `PortfolioTx[]` (`src/utils/portfolio.ts`): group by trade currency (from the asset,
see `tradeUnitOf`); per currency: total fees, traded value (quantity × price), fee % of traded value,
by month (YYYY-MM), by year, by asset (top 10). Never add different currencies. Year switcher in UI.
Text says "recorded fees"; note: zero may mean a fee was not entered. No tax rates in code.

## Tests
two currencies stay separate; % = fees / traded value; month/year grouping; no transactions → empty.

## Done when
- [ ] Only allowed files changed
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0
- [ ] Notes list what you could not check (browser, live data)

## Do not
- Anything in AGENTS.md section 3. No new data source, no Gemini, no buy/sell wording; missing data is
  shown as unavailable, never 0.

## Notes from Codex

- Added `src/utils/txCosts.ts` and `src/utils/txCosts.test.ts`: pure totals per trade currency,
  month, year and asset (top ten by fees), with fees / gross traded value percentages.
  Uses `tradeUnitOf`, including gold's IDR trade currency; never converts or mixes currencies.
  Invalid/missing amounts, dates and unknown assets are excluded and counted as unavailable.
  Explicit zero fees remain zero, with the required note about possibly unentered fees.
- Added `src/components/PortfolioCosts.tsx` and rendered it below transactions in the Positions
  tab in `src/components/PortfolioView.tsx`. Includes an all-years/year selector, per-currency
  totals and monthly/yearly/asset tables; updates from the existing transaction props.
  Added only `costs.*` keys in `src/i18n/en.ts` and `src/i18n/id.ts`.
- Checks passed: `npm run lint`; `npm test` (426 passed, including six new cost tests);
  `npm run build`; `node scripts/check-i18n.mjs --fail` (0 untranslated texts).
  Build retains the existing warning about chunks larger than 500 kB.
- Not checked: browser rendering at 375/1440 px, light/dark appearance and browser interaction,
  or live data. No live source is needed by this feature; it only reads entered transactions.
- No dependencies, storage, server, production or commits changed. Existing untracked
  `.agents/`, `.codex/`, and `PROMPT_Lanjutan_AssetRadar.md` were left untouched.

## Review (Claude)
PASS (2026-11-18), no changes needed. Checks: lint ok, 426/0 tests, build, i18n 0. Browser with a temporary
portfolio (restored after): IDR fees 25,375 on 13.75 M traded = 0.18% (Oct 0.15%, Nov 0.25%), USD kept
separate, card only in the Positions tab. Small polish for later: amounts show as plain numbers with the
currency in the heading rather than Rp/US$ formatting.
