# Task: F1 — Recorded transaction costs

**Status:** open
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

## Review (Claude)
