# Task: T3 — Data freshness view and endpoint

**Status:** done
**Written by:** Claude · **Date:** 2026-11-17 · **Plan:** `docs/plans/TRD.md` § T3

## Goal
The owner cannot tell whether data in the app is fresh or quietly stuck. Add one read-only endpoint
`GET /api/freshness` and a Settings card that show, per dataset, when it last updated, how old that is
against its normal cadence, and a status: `ok | late | stale | closed`. A Cloud Monitoring uptime check
will later match the response text, so the response has one `overall` field.

## Allowed files
- New `src/utils/freshness.ts` + new `src/utils/freshness.test.ts` (pure logic, no I/O)
- New `server/freshness.ts` (route registration only, same pattern as `server/diagnostics.ts`)
- `server.ts`: **only** (a) one import, (b) one `registerFreshnessRoute(app, freshnessLive)` line next
  to `registerDiagnosticsRoute` (around line 5072), (c) one small `freshnessLive()` function next to
  `diagnosticsLive()` (around line 4782) that returns timestamps already in memory or in the store.
- New `src/components/FreshnessCard.tsx`; `src/components/SettingsView.tsx` (render it right after
  `<DiagnosticsCard />`, line ~64)
- `src/i18n/en.ts`, `src/i18n/id.ts` (new keys `fresh.*` only)

## Data sources (read only — no upstream fetches, no new store keys)
- `tick:last` in the store: `finishedAt` (ms) and per-step results; a step whose value is a string
  starting with `failed` or equal to `no time left` counts as a problem for that step.
- `jobs:state` in the store: job name → last done date `YYYY-MM-DD` (WIB). Read how `runDueJobs`
  (server.ts ~4689) decides each job is due to know which jobs are daily and which are weekdays only.
- Latest price time: the newest `updatedAt` (epoch ms, `PriceTick` in `src/config/assets.ts`) among the
  ticks the server already holds — look at how `collectAllTicks()` gets them, but do **not** trigger a
  refresh. Split by market if simple (IDX, US, crypto); market open/closed via `src/utils/marketHours.ts`.
- Latest news time from the news hub already in memory, if exposed; skip it if not.

## Logic (`src/utils/freshness.ts`)
- `assessFreshness(items, now)` → per item `{ id, lastOk, ageMs, expectedMs, status }` and `overall`.
- `late` when age > 1.5 × expected, `stale` when > 3 ×; `closed` when the market of a price item is
  closed (never late/stale then). `overall` = worst status ignoring `closed`; no items → `ok`.
- Expected cadence: prices 15 min (open market), news 15 min, tick 2 h, daily jobs 26 h (weekday-only
  jobs: next weekday rule), tick steps 2 h.
- Tests: fresh → ok; 3-day-old tick → stale; US prices at 03:00 WIB → closed; weekday job on Monday
  morning with Friday date → ok; a step `failed: …` → late.

## Endpoint (`server/freshness.ts`)
`GET /api/freshness` → `{ overall, checkedAt, items: [...] }`, cache 60 s. No secret names or values,
no error messages longer than 120 chars. Store errors → that item `stale` with `lastOk: null`, never 500.

## UI (`FreshnessCard`)
Follow `DiagnosticsCard` style (tokens, `rounded-xl border`, `useT()`): a table of dataset, last update
(relative time, existing format helpers), status badge (green ok, gold late, red stale, grey closed).
Load on open + "Refresh" button. Readable at 375 px and in light/dark. All text through i18n (EN + ID).

## Done when
- [ ] Only the allowed files changed; the `server.ts` diff is the three small parts above
- [ ] New tests pass; `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0
- [ ] Notes list every dataset you included and the ones you skipped and why

## Do not
- Anything in AGENTS.md section 3. Plus: no fetch to outside sources from this route, no change to
  `runDueJobs`, the tick, or diagnostics; no new store keys; no automatic repair.

## Notes from Codex

- Added pure assessment and tests in `src/utils/freshness.ts` / `freshness.test.ts`, cached route registration in `server/freshness.ts`, and `FreshnessCard.tsx` after Diagnostics in Settings. Added only `fresh.*` translations in EN/ID. `server.ts` has only the import, registration and small read-only `freshnessLive()` adapter requested.
- Included: tick completion; tick steps alerts, jobs, idxTrace, scanIdx, scanUs, screener, calendar, staples, results_idx/us/crypto; daily forward, analyst, fundArena, brief and arenaLog completion dates; newest valid cached IDX, US and crypto prices; newest successful news-source fetch time (`lastFetchedAt`, not `lastPollAt`, which also advances after failed fetches).
- Skipped separate gold, forex and other global exchanges to keep the requested market split small. Crypto reflects the existing Yahoo/Indodax cached ticks, not every Binance/CoinGecko quote; it is not a completeness check. Conditional tick `arena` is represented by the persisted arenaLog job instead of a permanently missing step. No upstream fetch, new storage key, job execution or automatic repair was added by the new adapter/route.
- Tick step timestamps use the current tick completion time; failed/no-time steps are at least late, not claimed to have a separate historical success timestamp (none is available in tick:last). Recognizes actual `{ error: ... }` results and nested job errors as well as the task's failure strings. No error text, secret names or values are returned. Missing/unreadable stored records produce stale items with null lastOk.
- Daily lastOk timestamps are schedule-time estimates from stored WIB dates: 07:30 for brief, 16:15 for the others. Forward/arenaLog skip the weekend before applying the 26-hour cadence grace. UI explains the estimate, 60-second cache, market coverage and lack of holiday modeling.
- US session tests use 03:00 WIB in July (closed); a November test verifies that 03:00 WIB is still open in standard time. This follows the existing DST-aware market-hours helper rather than incorrectly forcing year-round closure.
- PASS: lint; all 374 tests; build; `node scripts/check-i18n.mjs --fail` (0 untranslated); git diff whitespace check. Build retains the >500 kB chunk warning. An additional in-process fake-app smoke check confirmed callback failure returns stale/null without leaking the exception, and repeated requests reuse the 60-second cache.
- UI uses fixed-layout wrapping table columns, theme tokens, text labels as well as badge colors, a 44px refresh button, loading/error feedback and cancellation on unmount. Browser visual verification at 375px/light/dark was not performed; no live server, Supabase or production checks were run. No commit.
- Existing `/api` middleware is unchanged: on Cloud Run it skips due-job triggering; on non-Cloud-Run hosts it can trigger existing due-job behavior for any API request. Altering it is outside the allowed server.ts edits.

## Review (Claude)
PASS with one fix by Claude (2026-11-17). Prices and news are filled only while someone views the app,
so on an idle Cloud Run instance they are empty and made `overall` stale; that would fire the uptime
alert all night. Added `viewerDriven` (shown in the table, excluded from `overall`) + a test.
server.ts diff stays the three allowed parts. Checks: lint ok, 375/0 tests, build, i18n 0.
Browser: card renders in Settings; 375 px has no horizontal scroll (dark theme checked).
