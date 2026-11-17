# Task: T8 — Portfolio concentration

**Status:** open
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

## Review (Claude)
