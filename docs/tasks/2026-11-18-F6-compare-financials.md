# Task: F6 — Compare: two companies' financial trends side by side

**Status:** open (after F5; same view)
**Written by:** Claude · **Date:** 2026-11-18 · **Plan:** `docs/plans/TRD.md` § F6

## Goal
When exactly two stocks are selected in `#/compare`, show a panel with their last 3 annual periods.

## Allowed files
- New `src/utils/compareFinancials.ts` + new test; `src/components/CompareView.tsx` (render the panel)
- `src/i18n/en.ts`, `src/i18n/id.ts` (new keys only)

## Logic
Data from the existing client helper for `/api/fundamentals/statements?symbol=&period=annual` and the ratio
functions in `src/utils/statements.ts` (reuse; do not re-implement). Rows: revenue growth, net margin, ROE,
debt/equity, operating cash flow (each company's reporting currency, never converted). Financial-sector
companies (IDX-IC "Financials" or GICS "Financials"): hide debt/equity and gross margin, show a short note.
Each column labelled with its fiscal year end. Missing → "—". No ranking, no "better". Loads only when two
stocks are selected.

## Tests
3-period extraction; financial sector hides rows; missing values stay null.

## Done when
- [ ] Only allowed files changed
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0
- [ ] Notes list what you could not check (browser, live data)

## Do not
- Anything in AGENTS.md section 3. No new data source; no buy/sell or "better company" wording.

## Notes from Codex

## Review (Claude)
