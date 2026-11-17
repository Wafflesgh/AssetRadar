# Task: F5 — Compare: returns in Rupiah and the exchange-rate effect

**Status:** open
**Written by:** Claude · **Date:** 2026-11-18 · **Plan:** `docs/plans/TRD.md` § F5

## Goal
In `#/compare`, a "Show in Rupiah" toggle so assets in USD (and other currencies with a Rupiah pair in the
app) are compared on the same Rupiah basis, with the FX effect shown separately.

## Allowed files
- `src/utils/compare.ts` + its test; `src/components/CompareView.tsx`
- `src/i18n/en.ts`, `src/i18n/id.ts` (new keys only)

## Logic
- Currency pair history from `/api/market/daily?symbol=` of the app's Rupiah pair asset (find it in `ASSETS`
  by currency; do not hard-code tickers). Fetch once per currency.
- Convert each close with the same date's rate; a date without a rate is dropped and counted (shown as
  "n days skipped"). Never use today's rate for past dates.
- Per asset table: price return (own currency), FX return, combined return `(1+a)(1+f)−1`. IDR assets: FX 0.
- Toggle off = current behaviour unchanged.

## Tests
combined = (1+a)(1+f)−1; missing rate day dropped and counted; IDR asset unaffected.

## Done when
- [ ] Only allowed files changed
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0
- [ ] Notes list what you could not check (browser, live data)

## Do not
- Anything in AGENTS.md section 3. No new data source; missing data shown as unavailable, never 0.

## Notes from Codex

## Review (Claude)
