# Task: T8 — Portfolio concentration

**Status:** done
**Written by:** Claude · **Date:** 2026-11-17 · **Plan:** `docs/plans/TRD.md` § T8, `PLAN_MyPortfolio.md`

## Goal
Show the owner how concentrated the portfolio is: by asset, sector, currency, country and asset class,
with one plain-language score. Information only — no target weights, no buy/sell wording.

## Allowed files
- New `src/utils/concentration.ts` + new `src/utils/concentration.test.ts`
- New `src/components/PortfolioConcentration.tsx`
- `src/components/PortfolioView.tsx` (render the new component below the existing allocation block only)
- `src/i18n/en.ts`, `src/i18n/id.ts` (new keys `conc.*` only)

## Logic (`concentration.ts`)
- Input: the valued positions the page already builds (`valuePosition` in `src/utils/portfolio.ts`),
  value in IDR. Positions with no value (no price) are excluded and counted in `unpriced`.
- `concentration(positions)` → for each dimension `asset | sector | currency | country | assetClass`:
  sorted `[{ key, label, weight }]`, plus `hhi = Σ weight²`, `effectiveN = 1 / hhi`,
  `level: 'diversified' (<0.15) | 'moderate' (0.15–0.25) | 'concentrated' (>0.25)`, `top` (largest item).
- Sector: IDX stocks → IDX-IC `sector` from `src/config/idxStocks.json`; US stocks → `gicsSector` from
  `src/config/sp500.json` (owner decision: GICS sector, not sub-industry); others → their asset group;
  anything not found → `unclassified` (never guessed).
- Country/currency: from the asset config (`currency`, exchange). Crypto country = `global`.
- Empty portfolio → all dimensions empty, `hhi` null.

## UI
Card "Concentration" with a dimension switch (5 buttons), a horizontal bar list (top 8 + "others"),
the score sentence (e.g. "Largest holding: BBCA, 42% of the portfolio · Concentrated"), and a short
explanation of HHI in plain words. Follow existing card style (tokens, `rounded-xl border`, `useT()`).
375 px no horizontal scroll; light and dark readable.

## Tests
one holding → hhi 1, concentrated; two equal → 0.5; ten equal → 0.1 diversified; unknown sector →
`unclassified`; unpriced position excluded and counted.

## Done when
- [ ] Only allowed files changed
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0

## Do not
- Anything in AGENTS.md section 3. Plus: no change to `portfolio.ts` or stored data; no new endpoint.

## Notes from Codex

- Added `src/utils/concentration.ts` and its tests; added `PortfolioConcentration.tsx`; PortfolioView changes are only its import and rendering immediately below the existing allocation block. Added only `conc.*` keys in EN/ID. No stored data, valuation logic, endpoint or dependency changed.
- Uses the page's `{ asset, v }` valued open positions and marketValueIdr. Missing/nonfinite/negative values are excluded and counted as unpriced; closed positions and zero-value positions do not contribute. Duplicate assets aggregate before weights/HHI are calculated. Each dimension returns sorted items, HHI, effective count, level and largest item; empty dimensions return null metrics.
- IDX sector comes from idxStocks code/sector; US sector comes from sp500 yahooTicker/gicsSector, not sub-industry. Other assets use their configured group. All current dataset sector labels have EN/ID translations. Country follows an explicit exchange mapping, crypto is global; multi-country EURONEXT, FX/futures and unmapped exchanges remain unclassified. Currency follows asset.currency, even when the transaction/valuation unit differs; UI explains the distinction. Asset classes reuse assetClassOf.
- Card provides five wrapping buttons, top eight bars plus others, a dimension-specific largest-share sentence, HHI/effective count, plain-language thresholds and informational disclaimer. Unclassified weights remain in the denominator. The level describes only the selected dimension, not total portfolio risk.
- PASS: lint; all 388 tests; build; i18n --fail (0 untranslated); diff whitespace check with CRLF accounted for. Tests cover single/two/ten holdings, the 0.25 boundary, unknown sectors, GICS/IDX mapping, crypto country, unpriced/closed/empty positions and duplicate aggregation. Existing build >500 kB warning remains.
- No production or browser visual checks were run. Layout uses wrapping controls/labels, theme tokens and 44px buttons, but 375px/light/dark appearance still needs visual review. The Portfolio page bundle now includes the S&P classification data (build: about 65.4 kB / 18.5 kB gzip). No commit.

## Review (Claude)
PASS (2026-11-17), no changes needed. PortfolioView diff = import + one render line. Re-ran: lint ok,
388/0 tests, build, i18n 0. Browser with a temporary 4-holding test portfolio (restored after):
asset and sector views correct (IDX-IC Financials, GICS Information Technology, Crypto); 375 px no
horizontal scroll. Light mode not viewed.
