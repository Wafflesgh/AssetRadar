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
