# Task: G1 — Stock Story: deepest drawdowns and recovery time

**Status:** done
**Written by:** Claude · **Date:** 2026-11-18 · **Plan:** `docs/plans/TRD.md` § G1

## Goal
In `#/story/<id>`, show the 3 deepest price drops in the stock's history, how long each took to fall
and how long it took to get back to the old peak.

## Allowed files
- `src/utils/stockStory.ts` + its test (add a new exported function; do not change `priceFacts` output)
- `src/components/StockStoryView.tsx`
- `src/i18n/en.ts`, `src/i18n/id.ts` (new keys only)

## Logic
- Input: daily closes already loaded by StockStoryView (`/api/market/daily`).
- Episodes do not overlap: an episode ends when the price recovers its peak; the next one starts after.
- Keep the 3 deepest with depth ≥ 10%. Each: depth %, peak date, trough date, sessions to trough,
  sessions trough→recovery or `null` (= "not recovered yet").
- Fewer than 60 closes → nothing shown.

## Tests
Known series with 2 recovered drops + 1 open drop; drops under 10% skipped; order by depth; empty input.

## Done when
- [ ] Only allowed files changed
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0
- [ ] Notes list what you could not check (browser, live data)

## Do not
- Anything in AGENTS.md section 3. No forecast wording ("will recover"); history only.

## Notes from Codex

- Added drawdownEpisodes in stockStory.ts without changing priceFacts. Uses non-overlapping
  peak/recovery episodes, reports observed-session counts, retains an open episode with null
  recovery, and returns up to three declines >=10% only when at least 60 usable closes exist.
- StockStoryView renders the history panel from already loaded bars; added EN/ID labels and
  historical-only caveat. Extended the existing Stock Story tests in newFeatures.test.ts
  (the repository has no separate stockStory.test.ts).
- PASS: lint, 438 tests, build, check-i18n --fail (0). Existing >500 kB warning remains.
- Not checked: browser appearance or live history quality/split adjustments. No extra data
  request, forecast, production change or commit.

## Review (Claude)
PASS (2026-11-18). Browser BBCA: 3 episodes, open one marked not recovered; no forecast wording.
