# Task: F5 — Compare: returns in Rupiah and the exchange-rate effect

**Status:** done
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

- Added exact-date conversion and compounded return helpers/tests in compare.ts/compare.test.ts.
  CompareView now offers Show in Rupiah, resolves pairs from ASSETS, fetches once per distinct
  currency per load/retry, shows skipped rate dates and separate price/FX/combined returns.
  Rupiah chart uses shared dates only, without forward-filling missing rates. USX cents normalize
  to USD; IDR needs no rate. Toggle off retains the existing chart behavior. Added EN/ID keys.
- PASS: lint, 433 tests, build, check-i18n --fail (0). Existing >500 kB warning remains.
- Not checked: browser toggling/layout or live history/FX coverage. No new data sources,
  server changes or commits.

## Review (Claude)
PASS (2026-11-18). Browser AAPL vs BBCA 1Y: price +31.58%, FX +5.12%, combined +38.32% = (1.3158×1.0512)−1; 27 USD dates without an IDR rate skipped and shown.
