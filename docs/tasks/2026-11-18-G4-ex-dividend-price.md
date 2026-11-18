# Task: G4 — Stock Story: price around ex-dividend dates

**Status:** todo
**Written by:** Claude · **Date:** 2026-11-18 · **Plan:** `docs/plans/TRD.md` § G4

## Goal
In `#/story/<id>`, show what the price did around each recent ex-dividend date.

## Allowed files
- `src/utils/dividendYield.ts` + its test (add a new exported function; do not change existing outputs).
  If the existing tests for this file live in `src/utils/newFeatures.test.ts`, add the tests there.
- `src/components/StockStoryView.tsx`
- `src/i18n/en.ts`, `src/i18n/id.ts` (new keys only)

## Logic
- Input: daily bars and calendar events already loaded in StockStoryView (no new request).
- Dividends = past events of the dividend type that have `amount`; the last up to 8, newest first.
- For each: cum close = last bar before the ex-date; ex close = bar on the ex-date (or first bar after it);
  +5 close = 5 sessions after the ex bar (null if not there yet).
- Drop = cum close − ex close; show next to the dividend per share (same currency).
- Recovered = a close ≥ cum close within 20 sessions after the ex bar (true / false / null when fewer
  than 20 sessions exist yet).
- Missing bars around a date → skip that dividend; show nothing when none remain.
- Note in the UI: prices are not adjusted for dividends; history only.

## Tests
Known series: drop vs dividend; ex-date on a non-trading day uses the next bar; +5 null at the end of
data; recovered true/false/null; a dividend without bars is skipped.

## Done when
- [ ] Only allowed files changed
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0
- [ ] Notes list what you could not check (browser, live data)

## Do not
- Anything in AGENTS.md section 3. No "dividend capture" or buy/sell wording.

## Notes from Codex

## Review (Claude)
