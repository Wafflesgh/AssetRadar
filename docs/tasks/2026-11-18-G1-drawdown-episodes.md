# Task: G1 — Stock Story: deepest drawdowns and recovery time

**Status:** todo
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

## Review (Claude)
