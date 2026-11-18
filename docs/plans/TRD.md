# TRD — AssetRadar reliability and features, Nov 2026 – Feb 2027

Technical requirements for the tasks in `ROADMAP.md`. Decisions and reasons: `DECISIONS.md`.
Each task becomes a `docs/tasks/` file for Codex; that file narrows the allowed files further.
All tasks obey `CLAUDE.md` (i18n EN+ID, no dummy prices, disclaimers, secrets never logged,
timers via `everyMs`, localStorage via `storage.ts`, new files start with an English header comment).

## Current system (baseline)
- Cloud Run asia-southeast1, 1 max instance, request billing, deployed by Cloud Build from `main`
  using `Dockerfile` (`npm ci` → `npm run build` → `tsx server.ts`, `SERVERLESS=1`).
- Hourly Cloud Scheduler → `POST /api/cron/tick` (300 s budget, result saved as `tick:last`);
  GitHub Actions `daily-jobs.yml` → `POST /api/cron/daily` 07:35 and 16:20 WIB; job state `jobs:state`.
- Supabase KV via `server/store.ts` (`get/set/keys/remove`, `getPacked/setPacked` gzip).
- Diagnostics: `GET /api/diagnostics` (`server/diagnostics.ts`), Settings card `DiagnosticsCard`.

---

## T1 — Deploy gate (S)
**Requirement:** a commit with failing lint or tests must not become the live revision.
**Design:** in `Dockerfile`, after `COPY . .`, run `RUN npm run lint && npm test && node scripts/check-i18n.mjs`
before `RUN npm run build`. Cloud Build fails → Cloud Run keeps the previous revision.
**Acceptance:** local `docker build` passes; with a deliberately failing test (not committed) it fails.
**Risk:** longer builds (~1–2 min). Tests must not need network or secrets (check none do).

## T2 — Paginated `keys()` (S)
**Requirement:** `SupabaseStore.keys(prefix)` returns every matching key, not only the first max-rows.
**Design:** loop with header `Range: <from>-<to>` (page 1000) and `order=key.asc` until a page is
shorter than the page size. `MemoryStore` unchanged.
**Acceptance:** unit test with a fake `fetch` returning 1000 + 5 rows → 1005 keys; existing tests pass.
**Allowed:** `server/store.ts` + its test only.

## T3 — Data freshness (M)
**Requirement:** the owner sees, per dataset, when it last updated successfully, how old it is
against its own expected cadence, and whether the age is explained by a closed market. An overdue
dataset produces a warning in the app and can be alerted on by Cloud Monitoring.
**Design:**
- Pure module `src/utils/freshness.ts` (+ test): `assessFreshness(items, now, marketOpen)` →
  `{ id, ageMs, expectedMs, status: 'ok' | 'late' | 'stale' | 'closed', lastOk }` per dataset.
  Cadences: prices 15 min while open; news 10 min; tick 2 h; daily jobs 26 h; macro 7 d; staples 12 h;
  cross-section scans per their TTL. Late = >1.5× expected, stale = >3×.
- Server: new `server/freshness.ts` registers `GET /api/freshness` reading only stored timestamps
  (`tick:last`, `jobs:state`, cache timestamps already in memory/DB). No upstream fetches. Cache 60 s.
  Response has `overall: 'ok' | 'late' | 'stale'`. Never includes secret names or values.
- UI: section in Settings next to `DiagnosticsCard` (table: dataset, last update, status badge).
  All text via i18n keys `fresh.*` in `en.ts` and `id.ts`.
- Monitoring (Phase 0 follow-up, owner clicks): uptime check on `/api/freshness` with content match
  `"overall":"ok"` OR `"overall":"late"`; failure → email.
**Acceptance:** fixture with a 3-day-old tick → `stale`; US stocks at 03:00 WIB → `closed`, not stale;
lint/test/build/i18n pass.
**Not in scope:** auto-repair, new data sources.

## T4 — Backups to Cloud Storage (M)
**Requirement:** a daily private copy of data that cannot be rebuilt, kept 7 daily + 4 weekly, and a
proven restore into a local memory store.
**What to back up (prefixes):** `sync:` data (synced collections), `idxtrace:`, `sentcalls:`,
`forward:`, `arena:`, `fundarena:`, `analysis:`, `snap:`, `brief:`, `staples:data`, `jobs:state`.
Not: caches that are refetched (`xs:`, `screener:`, `macro:`, `sbn:`). Verify exact prefixes in code.
**Design:**
- Pure `src/utils/backup.ts` (+ test): build manifest `{ version, createdAt, keys: [{ key, sha256, bytes }] }`
  and validate a restore (counts and hashes match).
- `server/backup.ts`: step `backup` in the cron tick, once per WIB day after 02:00. Uses paginated
  `keys()` (T2 first). Writes one gzip JSON object `backups/YYYY-MM-DD.json.gz` to bucket
  `GCS_BACKUP_BUCKET` (env, optional; feature off when unset) through the GCS JSON API with an access
  token from the metadata server (`/computeMetadata/v1/instance/service-accounts/default/token`).
  No new npm dependency.
- Retention: GCS lifecycle rule set by the owner in console (delete after 35 days) plus the code
  keeps weekly copies under `backups/weekly/` (Sunday) with lifecycle 120 days.
- Restore: `scripts/restore-backup.mjs <file>` loads into a memory store and prints counts only
  (never values); writing to the live DB requires a separate, explicit owner decision.
**Security:** bucket private, uniform access, only the Cloud Run service account may write. Values
never logged.
**Acceptance:** local run with a fake GCS writes a valid file; restore of that file matches counts and
hashes; feature is a no-op without `GCS_BACKUP_BUCKET`.
**Cost:** <1 GiB → well under Rp5.000/month (estimate).

## T5 — Gemini with a hard daily cap (M)
**Requirement:** enable AI summaries already coded, with a guaranteed upper bound on calls.
**Design:** in `server/geminiPolicy.ts` add a daily call budget (`GEMINI_DAILY_LIMIT`, default 200),
counted in memory and persisted in `gemini:usage:YYYY-MM-DD`; over budget → `null` → existing non-AI
text. Expose count in `/api/diagnostics` (`gemini.usedToday`). Never send portfolio, alerts or notes.
Owner then adds `GEMINI_API_KEY` as a Secret Manager secret.
**Acceptance:** test: call 201 with limit 200 returns null without calling the model.

## T6 — Full owner export/import (M)
**Requirement:** one JSON download of all synced collections (`src/utils/sync.ts` list), and an import
with a preview (counts per collection) and a choice: merge (newest edit wins, existing sync rules) or
replace. Never includes the sync token or passphrase.
**Design:** reuse the sync adapters (`listAdapter`) and `PortfolioView` export pattern; UI in Settings.
**Acceptance:** round-trip test export → import into empty storage gives identical collections.

## T7 — Weekly watchlist digest (M)
**Requirement:** on Mondays the Brief shows a "This week" block for watchlist assets: 1-week change,
known events next 7 days (IDX calendar, dividends, SBN), and assets whose data is stale (from T3).
Deterministic text via i18n; Gemini only rewrites if T5 is on.
**Design:** pure `src/utils/weeklyDigest.ts` (+ test) fed by existing `snap:` and calendar data;
added to `morningBrief.ts`. No new data source, no buy/sell wording.
**Acceptance:** fixture week → expected items; disclaimer present.

---

## Non-functional requirements (all tasks)
- Cost: no task may add an always-on resource. Monthly total target < Rp50.000.
- Security: no secret in code, logs, responses or task files. New endpoints read-only unless guarded
  by the existing owner token or `CRON_TOKEN`.
- Performance: new tick steps respect the remaining tick budget (`no time left` pattern).
- UX: 375 px without horizontal scroll, light and dark readable, EN + ID.
- Testing: every new pure module has a test; `npm run lint && npm test && npm run build` and
  `check-i18n` = 0.

---

# Addendum 2026-11-17 — My Portfolio and sector 1M (plan: `PLAN_MyPortfolio.md`)

## T8 — Portfolio concentration (M)
**Requirement:** show how concentrated holdings are, by asset, sector, currency, country and asset class.
**Design:** pure `src/utils/concentration.ts` (+ test) on the existing valued positions (`valuePosition`):
weights in IDR; HHI = Σw², effective number of holdings = 1/HHI; labels: <0.15 diversified,
0.15–0.25 moderate, >0.25 concentrated. Sector: IDX-IC from `idxStocks.json`, GICS sub-industry from
`sp500.json`, otherwise group name; anything unknown stays "Unclassified" (never guessed).
UI: section in `PortfolioView` (later its own tab, T11). No buy/sell wording, no target weights.
**Acceptance:** one holding → HHI 1; two equal → 0.5; unknown sector counted as Unclassified.

## T9 — Decision journal (M)
**Requirement:** a dated note per asset/transaction with an automatic evidence snapshot, reviewed later.
**Design:** new synced collection `journal` (add to the collection list in `src/utils/sync.ts` and wrap
the saver with `tracked()` in `storage.ts`). Entry `{ id, symbol, txId?, createdAt, note (≤1000 chars),
snapshot: { price, currency, sentiment: {short, medium, long}, evidenceScore } }`. Snapshot read from
data the page already has; missing parts stored as null. Review view: change since the note at
1W/1M/3M from `/api/market/daily`. Pure logic `src/utils/journal.ts` (+ test). Notes never leave the
browser except through the owner's own sync.
**Acceptance:** add → sync round trip in memory; review returns null (not 0) when history is missing.

## T10 — Sector rotation 1-month change (S–M)
**Requirement:** fill the 1M column in `#/sectors` from real closes.
**Design:** at the end of `idxTraceStep`, keep one compact store key `idx:closes` =
`{ dates: string[≤30], closes: Record<symbol, Array<number|null>> }` updated with the day's closes
(packed with `setPacked`). `/api/sectors/idx` passes 1M % per stock (latest vs 21 trading days back;
null if not available) into the existing pure `sectorRotation.ts`, which already supports 1M.
Before 21 days exist the UI says "not enough history yet".
**Acceptance:** fixture with 22 dates → correct 1M; 10 dates → null; no extra upstream fetches.

## T11 — My Portfolio tabs (M)
**Requirement:** reorganize `#/portfolio` into tabs: Summary, Positions, Concentration, Journal,
Income & Risk. Existing components move, not rewritten. Tab kept in the hash (`#/portfolio/journal`)
via `router.ts` (+ test). 375 px, light/dark, EN + ID.

---

# Addendum 2026-11-18 — Waves 1 and 2 (list: `FEATURES_2026-11-18.md`, queue: `docs/tasks/2026-11-18-QUEUE.md`)

Shared rules: information only, EN + ID, 375 px, light/dark, missing data shown as unavailable (never 0
or estimated), no new paid source, no Gemini. New alert kinds follow the existing pattern in
`src/utils/alerts.ts` (`AlertKind`, `evaluateAlert`, labels, `AlertEditor`) and are evaluated both in the
browser (`alertService.checkLocalAlerts`) and on the server (`checkServerAlerts`, server.ts ~5001).

## F1 (X1) Recorded transaction costs — S
Pure `src/utils/txCosts.ts` (+ test) over `PortfolioTx[]`: fees per month and per year, per asset, per
trade currency (never summed across currencies), and fees as % of traded value. UI card in the
Positions tab. Labels say "recorded fees"; a note explains zero fees may mean not entered. No tax rates
in code.

## F2 (C1) Since your last visit — S–M
Device-only (not synced) key `assetradar_last_visit_v1` = `{ at, prices: { symbol: price } }` for
watchlist + portfolio symbols, saved when the Radar page is left or every 10 min while open. On the
next visit (gap ≥ 1 h) a dismissible card at the top of Radar shows: each tracked asset's change
since last visit (current tick vs stored price), headlines tagged to those assets since `at`
(`useLiveNews`), and alert history entries since `at` (existing history source). Pure logic
`src/utils/sinceLastVisit.ts` (+ test).

## F3 (C6) SBN offer alert — S
New `AlertKind` `sbnOffer` (no symbol): fires when a retail SBN series' offer opens (`offerStart` =
today WIB) and 2 days before `offerEnd`, once per series per event (`seen` keys). Data: `sbn:series`
on the server, `/api/sbn/retail` in the browser. URL `#/macro`.

## F4 (C4) Journal review reminder — S
New `AlertKind` `journalReview` (no symbol): fires once per entry when its 7/30/91-day review date is
reached (WIB), using the synced `journal` collection (server: synced data; browser: `getJournal()`).
`seen` keys `entryId:w1|m1|m3`. URL `#/portfolio/journal`. Notification text shows asset + days only,
never the note text.

## F5 (X2) Compare in Rupiah — M
Extend Compare (`CompareView.tsx`, `compare.ts`) with a "Show in Rupiah" toggle for non-IDR assets:
convert each daily close with the same day's USD/IDR (or the asset currency pair) from
`/api/market/daily`; per asset show price return, FX return and combined return
`(1+a)(1+f)−1`. Missing FX day → that day dropped and counted; never today's rate for past days.

## F6 (X3) Compare company financials — M
In Compare, when exactly two stocks are selected: a panel with the last 3 annual periods per company
(revenue growth, net margin, ROE, debt/equity, operating cash flow) from
`/api/fundamentals/statements?period=annual` via existing `statements.ts` ratios. Banks/financials:
hide debt/equity and gross margin, show a note. Each period labelled with its fiscal year end. No
ranking or "better" wording.

## F7 (C3) Unusual move alert — M
New `AlertKind` `unusualMove` (symbol + sigma threshold, default 3, min 2): fires when |today's change|
≥ k × σ, σ = stdev of the asset's daily % changes over the last 60 sessions (exclude today). Server:
σ from `dailyOhlcFor` (cached), computed only for symbols with this alert, cached per day. Browser:
same via `/api/market/daily`. Pure `src/utils/unusualMove.ts` (+ test). Re-arms after the move falls
under the threshold (same as `dailyMove`).

---
# Addendum — Wave 3a (18 Nov 2026): G1–G3
Same shared rules as F1–F7. All three are browser-only: no server.ts change, no new data source.

## G1 (X4) Stock Story: deepest drawdowns and recovery time — S–M
Pure function in `src/utils/stockStory.ts` (+ test): from daily closes, the 3 deepest non-overlapping
peak→trough episodes. Each gives depth %, peak date, trough date, sessions to trough and sessions from
trough back to the old peak, or "not recovered yet". Shown in `StockStoryView` under the existing
drawdown sentence. Episodes under 10% are skipped.

## G2 (X5) IDX stock: volume vs the last 20 sessions — S–M
On an IDX stock's detail page, a small line: today's volume vs the median of the last 20 completed
sessions (ratio, e.g. "2.4× usual"), from `/api/market/daily` (`OhlcCandle.volume`). Today's
unfinished bar is excluded from the median. Volume in shares; show lots (÷100) as well. Fewer than 10
sessions with volume → hidden. Pure `src/utils/volumeContext.ts` (+ test). Neutral wording only
("busier / quieter than usual"), never a buy/sell hint.

## G3 Cost card in its own currency — XS
`PortfolioCosts.tsx` shows amounts with `formatPrice(value, currency)` from `format.ts` (Rp for IDR,
$ for USD) instead of a bare number. Percentages unchanged.

## G4 (X6) Price around ex-dividend dates — S–M
In Stock Story, a panel for the last up to 8 past dividends (calendar events with `amount`): close on
the last session before the ex-date (cum), close on the ex-date, and close 5 sessions later; price drop
on ex-date vs dividend per share (e.g. "fell Rp95 vs Rp100 dividend"), and whether the cum close was
reached again within 20 sessions. Uses bars and events StockStoryView already loads. Closes are
split-adjusted, not dividend-adjusted. Pure function in `src/utils/dividendYield.ts` (+ test).
