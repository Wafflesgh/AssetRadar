# Task: T7 — Weekly watchlist digest in the morning brief

**Status:** open
**Written by:** Claude · **Date:** 2026-11-17 · **Plan:** `docs/plans/TRD.md` § T7

## Goal
On Mondays (WIB) the morning brief gets a "This week" section: per watchlist asset the 1-week change,
known events in the next 7 days, and which assets have stale data. Deterministic text, no new source.

## Allowed files
- New `src/utils/weeklyDigest.ts` + new `src/utils/weeklyDigest.test.ts`
- `src/utils/morningBrief.ts` + its test (add an optional `weekly` section to `BriefInput`/`MorningBrief`)
- `server.ts`: **only** where the brief input is assembled, pass the weekly data on Mondays
  (watchlist from the synced data the server already loads; 1-week change from `snap:` of today vs 7 days
  earlier; events from the IDX calendar / dividends / SBN data already cached). No new fetches.
- `src/components/BriefView.tsx` (render the section) · `src/i18n/en.ts`, `src/i18n/id.ts` (new keys only)

## Logic
`weeklyDigest({ watchlist, snapToday, snapWeekAgo, events, now })` → `{ moves: [{symbol, chg|null}],
events: [{symbol, kind, date}], missing: [symbol] }` sorted by |chg|; assets without both snapshots go
to `missing`, never 0. Text through i18n keys; the brief keeps its disclaimer. No buy/sell wording.

## Tests
Monday → section present; Tuesday → absent; missing snapshot → `missing`; events outside 7 days dropped.

## Done when
- [ ] Only allowed files changed; server.ts diff is the brief-input lines only
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0

## Do not
- Anything in AGENTS.md section 3. Plus: no Telegram/push changes, no Gemini use.

## Notes from Codex

## Review (Claude)
