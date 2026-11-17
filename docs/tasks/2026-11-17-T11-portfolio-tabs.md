# Task: T11 — "My Portfolio" with five tabs

**Status:** done
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

- Implemented five hash-linked sections, default Summary; old portfolio/portofolio links still
  work. Added router coverage for all five sections and invalid-section fallback. Back/Forward
  updates the selected section without changes to App.tsx.
- Changed PortfolioView.tsx, PortfolioAnalytics.tsx, router.ts and router.test.ts; added
  PortfolioSummary.tsx; added EN/ID pft.* keys. Existing holdings, transactions, allocation/profile,
  add/edit, import/export, concentration and journal controls remain reachable. Transaction Add
  note switches to Journal. Positions and Journal remain mounted when hidden to retain drafts.
- Reused existing performance analytics on Summary and the risk/dividend/calendar sections on
  Income & Risk, preserving lazy loading. The portfolio footer remains outside section switching.
- Owner explicitly authorized new portfolioChange.ts and portfolioChange.test.ts. The pure
  function uses valueIdr * c / (100 + c), counts excluded positions, and returns null without
  usable data. Tests cover +10% at Rp110, missing data, and all missing/invalid data. The label
  is 24-hour change, with the crypto/stock-session distinction and excluded count.
- Summary uses existing valuations for value and realized/unrealized totals, existing concentration
  results, and top three positive/negative holding quote percentages. Stale-price note uses missing,
  failed, snapshot or older-than-15-minute quotes and explicitly mentions closed markets.
- Final checks: lint PASS; npm test PASS (418); build PASS (existing >500 kB warning);
  check-i18n --fail PASS (0). Whitespace diff check PASS. No commit or production changes.
- The tab navigation uses a bounded horizontal scrolling flex container and nonshrinking links.
  Browser interaction and 375 px / 1440 px light/dark visual verification were not performed;
  the viewport acceptance checkbox remains unchecked. Existing untracked owner files untouched.

## Review (Claude)
PASS (2026-11-17), no changes needed. Checks: lint ok, 418/0 tests, build, i18n 0. Browser with a
temporary 3-holding portfolio (restored after): all five tabs show their own sections, Summary shows
value / 24-hour change / P/L / concentration / stale-quote note, Back button returns the previous tab,
375 px has no horizontal page scroll. Light mode not viewed.
