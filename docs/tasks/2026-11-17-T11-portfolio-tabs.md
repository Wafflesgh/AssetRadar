# Task: T11 — "My Portfolio" with five tabs

**Status:** open (do after T8 and T9)
**Written by:** Claude · **Date:** 2026-11-17 · **Plan:** `PLAN_MyPortfolio.md`, `TRD.md` § T11

## Goal
Reorganize `#/portfolio` into tabs: **Summary · Positions · Concentration · Journal · Income & Risk**.
Move existing pieces; do not rewrite them.

## Allowed files
- `src/components/PortfolioView.tsx`, `src/components/PortfolioAnalytics.tsx` (only split/move into tabs)
- New `src/components/PortfolioSummary.tsx`
- `src/utils/router.ts` + its test: accept `#/portfolio/<tab>` (`summary|positions|concentration|journal|income`),
  default `summary`; old `#/portfolio` and `#/portofolio` keep working
- `src/i18n/en.ts`, `src/i18n/id.ts` (new keys only)

## Tabs
- **Summary**: total value, today's and total P/L, performance vs IHSG (reuse the existing chart/number),
  top 3 up and down today among holdings, short notes: concentration level (T8) and stale prices
  (holdings whose tick is a snapshot/old). No new calculations beyond picking from existing results.
- **Positions**: holdings + transactions + add/edit (as today).
- **Concentration**: T8 component. **Journal**: T9 component.
- **Income & Risk**: dividends, calendar, volatility, drawdown, correlation (existing analytics).
Disclaimer stays visible on every tab. Lazy parts stay lazy.

## Done when
- [ ] Only allowed files changed; no behaviour lost (every existing control still reachable)
- [ ] Router test covers the new hashes and the old ones
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0
- [ ] 375 px: tab bar scrolls horizontally inside itself, the page does not

## Do not
- Anything in AGENTS.md section 3. Plus: no change to portfolio math or stored data.

## Notes from Codex

## Review (Claude)
