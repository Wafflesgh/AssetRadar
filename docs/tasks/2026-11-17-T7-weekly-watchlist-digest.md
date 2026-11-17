# Task: T7 — Weekly watchlist digest in the morning brief

**Status:** done
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
- [x] Only allowed files changed; server.ts diff is the brief-input lines only
- [x] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0

## Do not
- Anything in AGENTS.md section 3. Plus: no Telegram/push changes, no Gemini use.

## Notes from Codex

- Added weeklyDigest.ts and weeklyDigest.test.ts; updated morningBrief.ts, BriefView.tsx,
  EN/ID dictionaries and only the brief-input assembly in server.ts. No commit.
- Monday briefs carry optional `weekly` data. Changes compare exact dated `snap:` prices
  seven calendar days apart, sorted by absolute percentage change with deterministic ties.
  Missing/invalid prices remain null and appear in `missing`; duplicate watchlist symbols
  and duplicate events are removed.
- Reused the sync data already loaded for the watchlist. Read two stored snapshots and cached
  `sbn:series`; calendar-cache events include dividends. No new upstream fetches. Events are
  limited to watchlist symbols and seven WIB calendar dates: today through today + 6 inclusive.
  SBN events use series codes, so they only appear when such a code is in the synced watchlist.
- The optional property is rendered separately in BriefView with translated labels. It is not
  appended to `sections`, keeping it out of the existing Gemini facts and Telegram formatter.
  No Gemini, Telegram or push logic changed. Disclaimer remains visible.
- Exact Monday snapshots may not exist at the morning generation time; these assets honestly
  show unavailable/stale coverage. No substitution with Friday or live prices. Snapshot records
  do not contain per-asset quote ages, so freshness here means snapshot availability, not a
  guarantee that each stored quote was refreshed that day. Existing saved briefs are not backfilled.
- Final checks: lint PASS; npm test PASS (420 tests); build PASS (existing >500 kB warning);
  check-i18n --fail PASS (0 untranslated); whitespace diff check PASS. Tests cover Monday vs
  Tuesday, null/missing snapshots, magnitude ordering and event boundaries at WIB midnight.
- Browser rendering and live production/cache contents were not verified. No production reads,
  writes, new dependencies or changes to unrelated owner files.

## Review (Claude)
PASS with one fix by Claude (2026-11-17). The Monday brief runs at 07:30, before that day's 16:15
snapshot, so `snap:<today>` never exists and every asset would show as missing. Now compares
yesterday's snapshot (daily, incl. weekends) with the one 8 days back. Checks: lint ok, 420/0 tests,
build, i18n 0. Not verified: rendering with live data (needs the first Monday brief, 23 Nov 2026).
