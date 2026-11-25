# AssetRadar — Codebase Review & Audit

**What this repo does:** AssetRadar is a bilingual (English + Indonesian) personal market research, portfolio notebook, and traditional-market food price tracker for one non-programmer owner in Indonesia. It runs as a single Node/Express + React container on Google Cloud Run (`asia-southeast1`, max 1 instance, request-based billing, budget target < Rp50.000/month) backed by a single Supabase key-value table (`assetradar_kv`) and hourly Cloud Scheduler + twice-daily GitHub Actions cron triggers.

**Assumed load:** One authenticated owner on 1–2 personal devices (desktop + 375px phone), plus unauthenticated public internet traffic (bots, scanners, crawlers) able to reach the public `.run.app` URL.

---

## Must fix

1. **Hourly cron `tick` time-slice math starves `scanIdx`, `scanUs`, `backup`, and `deriveIfDue` every weeknight** (`server.ts:5083`, `server.ts:5144-5160`, `server/backup.ts:25-64`)
   - **What happens:** After `TICK_BUDGET_MS` was cut from `300_000` ms to `120_000` ms (`server.ts:5083`) and `steps` grew to 7 items, step 0 (`idxTrace`) takes `left() / 2` (~59s) throughout its 16:15–08:45 WIB window. The remaining ~59s is divided by `steps.length - i + 1` (`7` for `scanIdx` = `8.4s`, `6` for `scanUs` = `9.8s`), both under the `10_000` ms floor on line 5156—so both are skipped immediately with `'no time left'`. By step 6 (`backup`, after 02:00 WIB inside that same overnight window), only ~11.8s remain to list and read 1,000+ Supabase keys and upload to Cloud Storage, and `left() > 40_000` on line 5159 is never true so `deriveIfDue` is skipped too.
   - **Concrete example:** At 02:05 WIB on a Wednesday, `idxTrace` runs for 58s; `scanIdx` (`8.4s < 10s`) and `scanUs` (`9.8s < 10s`) both skip with `'no time left'`, `screener`/`calendar`/`staples` consume ~35s, `backup` aborts mid-read with `'no time left'`, and `results_idx`, `results_us`, and `results_crypto` all return `'no time left'`.
   - **Smallest fix:** Cap `idxTrace`'s share at `Math.min(left() / 3, 35_000)`, run `backupStep` right after `runDueJobs` (it only runs once per day after 02:00 WIB and exits in 1 DB read otherwise), and lower the `deriveIfDue` guard on `server.ts:5159` from `40_000` to `20_000` (`deadline - 5_000`).
   - **If we skip it:** Cross-section market scans, derived sentiment rankings, and daily Cloud Storage backups repeatedly miss their nightly window whenever `idxTrace` still has stocks to process.

2. **Idle desktop tab drops SSE only to poll Cloud Run every 10 seconds all night** (`src/services/marketDataService.ts:172-183`, `src/services/marketDataService.ts:626-648`, `src/services/newsStream.ts:94-98`, `src/services/binanceLive.ts:32-38`)
   - **What happens:** After 30 minutes without input (`idle.ts`), `MarketDataManager` closes `/api/market/price-stream` (`this.streaming = false`) to stop Cloud Run request billing—but its `10_000` ms `yahooPollTimer`, `quotesPollTimer`, `30_000` ms `goldPollTimer`, and `60_000` ms `newsStream` poll have no `isIdle()` check and immediately take over. Because Cloud Run keeps a container warm ~15 minutes after each HTTP request, 6+ requests per minute keep the instance awake 24/7 while `binanceLive` keeps re-rendering React every second.
   - **Concrete example:** Owner leaves AssetRadar open on a PC monitor from 22:00 to 07:00 WIB; at 22:30 SSE disconnects, and the idle tab sends ~3,200 `/api/market/yahoo`, `/api/market/gold`, and `/api/market/news-feed` requests overnight, burning Cloud Run CPU/instance time toward the Rp50.000 monthly budget alert.
   - **Smallest fix:** On `onIdleChange(true)`, call `this.clearPollingTimers()` in `MarketDataManager`, `this.stopPolling()` in `NewsStore`, and disconnect `binanceLive` sockets; restart them on `onIdleChange(false)`.
   - **If we skip it:** Leaving one visible desktop tab open overnight prevents Cloud Run from ever scaling to zero and risks exceeding the Rp50.000/month budget once promotional credits expire.

3. **Unauthenticated `GET /api/brief` exposes synced watchlist & portfolio symbols and triggers delivery** (`server.ts:4607-4611`, `server.ts:4664`, `server.ts:5231-5261`, `src/utils/morningBrief.ts:185-197`)
   - **What happens:** `generateBrief()` loads the owner's private `sync:data` from Supabase, puts `weeklyWatchlist` into Monday's `brief.weekly`, and prefixes watchlist + portfolio holdings with `★` in the `calendar` section. However, `GET /api/brief` requires no login—and after 07:30 WIB (`server.ts:5252`) an unauthenticated `GET` can even trigger `runMorningBrief()`, firing Telegram and web push notifications.
   - **Concrete example:** Anyone visiting `https://<cloud-run-url>/api/brief?date=2026-11-23` (Monday) without logging in receives JSON listing every symbol in Dilan's private synced watchlist and `★`-marked portfolio stocks with corporate events.
   - **Smallest fix:** Strip `weekly` and `★` markers from `GET /api/brief` responses unless `ownerAuth.isOwner(req)` is true, and leave automatic Telegram/push delivery to `POST /api/cron/daily` and `runDueJobs('tick')` (never an unauthenticated `GET`).
   - **If we skip it:** Synced personal watchlist and portfolio tickers are publicly readable by anyone who finds the Cloud Run URL.

4. **Server push alerts stay inactive after Cloud Run cold starts and ignore alert edits for up to 59 minutes** (`server.ts:4944-4945`, `server/runtime.ts:19-34`, `server/sync.ts:132-151`)
   - **What happens:** `refreshServerAlerts()` is scheduled via `everyMs(..., 60_000)` and `afterMs(..., 5_000)`, which do nothing at all when `SERVERLESS=1` (`Dockerfile:11`). Yet `STREAMS` is enabled on Cloud Run (`server/runtime.ts:19`), so `streamTick()` runs every second while `serverAlerts` only reloads inside `POST /api/cron/tick` once an hour.
   - **Concrete example:** Cloud Run cold-starts at 09:08 WIB when the owner opens the app; at 09:10 WIB he creates (or disables) a repeating price alert on his phone (`POST /api/sync/merge`). `serverAlerts` does not load the new alert (or keeps firing a disabled alert every 15s while a stream is open) until the 10:05 WIB cron tick.
   - **Smallest fix:** Trigger `refreshServerAlerts()` after `POST /api/sync/merge` writes `alerts` or `settings` (via an `onMerged` callback) and inside `streamTick()` when `Date.now() - lastRefreshAt > 60_000`.
   - **If we skip it:** Push alerts silently miss crossings for up to an hour after cold starts, and turned-off repeating alerts keep firing until `:05`.

5. **Asset Detail page shows `"Loading…"` forever instead of `"Data unavailable" + Retry` when a price feed fails** (`src/components/AssetDetailView.tsx:277`, `299`, `328`, `src/App.tsx:524-538`)
   - **What happens:** `AssetDetailView` checks `isLoaded = tick !== undefined && tick.status !== 'error' && Number.isFinite(tick.price)` (`L97`), then renders `{isLoaded && tick ? ... : t('common.loading')}` on lines 277, 299, and 328. `App.tsx` does not pass `onRetrySymbol` to `AssetDetailView`.
   - **Concrete example:** `gold-api.com` or Indodax returns HTTP 502; `#/radar` correctly shows `"Data unavailable"` + `"Try again"`, but clicking `#/asset/xau-usd` or `#/asset/btc-idr` shows `"Loading…"` forever with no retry button, violating `CLAUDE.md:95`.
   - **Smallest fix:** Pass `onRetry={handleRetrySymbol}` to `AssetDetailView` in `App.tsx`, and branch on `tick?.status === 'error'` in `AssetDetailView` to render `t('common.dataUnavailable')` + a retry button before falling back to `t('common.loading')`.
   - **If we skip it:** Feed errors look like an endlessly stuck loading state on the detail page with no recovery button.

6. **Service worker caches authenticated `/api/*` responses forever, surviving logout** (`public/sw.js:41-54`, `public/sw.js:83-85`, `src/services/syncService.ts:109-112`)
   - **What happens:** `networkFirstApi()` writes every `200 OK` `GET /api/*` response into `assetradar-api-v1` regardless of `Authorization` headers, and neither `logout()` nor service-worker `activate` clears `assetradar-api-v1`.
   - **Concrete example:** Owner logs in, views `#/alerts` (`GET /api/alerts/history` with Bearer token) and `#/settings` (`GET /api/sync/status`), then clicks Log out; `assetradar-api-v1` still holds the plaintext alert history and logged-in status on disk and serves it when offline.
   - **Smallest fix:** In `public/sw.js:83`, bypass `networkFirstApi` when `request.headers.has('authorization')` or `url.pathname` starts with `/api/sync/`, `/api/push/`, or `/api/alerts/`, and call `caches?.delete('assetradar-api-v1')` inside `logout()` (`src/services/syncService.ts:109`).
   - **If we skip it:** Sensitive alert history and account status remain stored in browser Cache Storage after logging out.

7. **Hardcoded FOMC schedule ends on `2026-12-09` (14 days away), breaking FOMC countdowns and 2027 AI Advisor features** (`src/ai/events.ts:40-43`, `src/ai/events.ts:95-106`)
   - **What happens:** `FOMC_MEETINGS` stops at `2026-12-09`. Starting December 10, 2026, `nextMeeting(today)` returns `null` everywhere, and 180 days after the last 2026 rate change, `fedStanceSeries()` outputs `0` for every bar in 2027+ regardless of actual Federal Reserve hikes or cuts.
   - **Concrete example:** On December 10, 2026, `#/advisor` and `#/macro` show no upcoming Fed meeting even though the Federal Reserve's 2027 schedule is already public; by mid-2027 one of the AI Advisor's 13 input features silently freezes at `0`.
   - **Smallest fix:** Add the published 2027 FOMC decision dates (`2027-01-27`, `2027-03-17`, `2027-05-05`, `2027-06-16`, `2027-07-28`, `2027-09-15`, `2027-10-27`, `2027-12-08`) to `FOMC_MEETINGS` in `src/ai/events.ts:42` and add a test checking `nextMeeting` is non-null.
   - **If we skip it:** In two weeks the FOMC calendar breaks, and next year's AI Advisor model loses policy-stance signal.

---

## Should fix

8. **`SinceLastVisit` wipes out its saved price baseline with `{}` on quick tab switches or offline opens** (`src/components/SinceLastVisit.tsx:22-28`, `src/utils/sinceLastVisit.ts:10-15`)
   - **What happens:** Unmounting `SinceLastVisit` (or hiding the tab) immediately calls `saveLastVisit(visitSnapshot(..., latest.current, Date.now()))`. Because `visitSnapshot` drops `fromSnapshot` ticks and unloaded universe ticks, leaving `#/radar` before live quotes finish loading overwrites the stored baseline with `{ at: now, prices: {} }`.
   - **Concrete example:** Owner opens the app after 10 hours, clicks `#/portfolio` 1 second later while ticks are still `fromSnapshot: true`; unmount saves `prices: {}` at `now`, erasing the 10-hour comparison and showing `"unavailable"` next time.
   - **Smallest fix:** Do not call `saveLastVisit` when `Object.keys(snap.prices).length === 0`, and merge `{ ...getLastVisit()?.prices, ...snap.prices }` so temporarily unloaded symbols keep their prior live price.
   - **If we skip it:** Fast navigation off Radar or brief offline visits repeatedly erase the "Since your last visit" baseline.

9. **Public `?refresh=1` cache bypasses and unvalidated `/api/staples/region?name=` allow upstream rate-limiting and slow DB loops** (`server/diagnostics.ts:93-105`, `server/sbn.ts:85-88`, `server/staples.ts:309-325`)
   - **What happens:** Unauthenticated callers can pass `?refresh=1` to `/api/diagnostics` (firing 18 upstream probes per wave) and `/api/sbn/retail` (re-fetching 5 DJPPR pages), while `/api/staples/region?name=<anything>` accepts arbitrary strings, runs 21 sequential gzipped Supabase reads (`for (const def of STAPLES)`), and caches empty objects forever in an unbounded `regionCache` Map.
   - **Concrete example:** A scanner requesting `/api/diagnostics?refresh=1` every few seconds gets the single Cloud Run egress IP rate-limited (HTTP 418/429) on Binance, Yahoo, and OECD; meanwhile even legitimate province clicks on Kitchen Radar wait for 21 sequential DB calls (~2–4s) instead of parallel reads, and random `?name=` queries leak memory.
   - **Smallest fix:** Ignore `refresh === '1'` unless `ownerAuth.isOwner(req)` on `/api/diagnostics` and `/api/sbn/retail`; in `server/staples.ts:310`, validate `name` against known provinces from `load(store)` and read the 21 detail keys in 3–4 parallel batches.
   - **If we skip it:** Bots can get the server IP temporarily banned by data providers, and switching provinces on Kitchen Radar stays sluggish on cold caches.

10. **Daily GCS backups are missing from `/api/freshness` and wedge on Sunday partial uploads (`HTTP 412`)** (`server.ts:4859`, `server/backup.ts:47-60`)
    - **What happens:** `freshnessLive()` checks 11 tick steps (`alerts`, `jobs`, `idxTrace`, etc.) but never checks `tick.backup` or `backup:last`. In addition, on Sundays `backupStep` uploads `daily` (`ifGenerationMatch=0`), then `weekly`, then writes `backup:last`; if `weekly` or `backup:last` fails, every retry that Sunday gets `HTTP 412` on `daily` and exits on line 56 before finishing `weekly` or saving the marker.
    - **Concrete example:** Bucket permissions break (or Sunday's second upload times out); Settings → Data Freshness and the `/api/freshness` uptime monitor keep reporting `"overall": "ok"` while zero backups succeed.
    - **Smallest fix:** Treat `response.status === 412` in `server/backup.ts:56` as "already uploaded today, continue", and push `{ id: 'backup', lastOk: ..., expectedMs: 26 * 3600_000 }` in `freshnessLive()` (`server.ts:4859`) whenever `process.env.GCS_BACKUP_BUCKET` is set.
    - **If we skip it:** Backup failures stay invisible to both the Settings page and Cloud Monitoring uptime alerts.

11. **Global `LoginLimiter` lets strangers lock the owner out of sync login, and future client clocks poison `newestWins`** (`src/utils/syncAuth.ts:75-89`, `server/sync.ts:108-115`, `src/utils/sync.ts:217-220`)
    - **What happens:** `LoginLimiter` blocks *all* logins globally for 15 minutes after 30 failed requests from *any* IP before checking the passphrase, and `parseSyncData` trusts any finite client `item.t` without clamping to server time.
    - **Concrete example:** A bot sends 30 wrong passwords to `/api/sync/login` → Dilan gets HTTP `429` even with his real passphrase; or a device with its clock accidentally set 1 month ahead edits an alert → no normal-clock device can edit or delete that alert for a month.
    - **Smallest fix:** Keep the per-IP lockout (`5` per `15m`) and remove `wait(this.all, this.global)` (or apply it only to unknown IPs), and clamp incoming `item.t` in `server/sync.ts:130` to `Math.min(item.t, Date.now() + 5 * 60_000)`.
    - **If we skip it:** Random scanners can deny owner login, and a single clock-skewed edit makes synced records uneditable.

12. **Manual dividend form cannot submit when holding a single stock or after sync populates holdings** (`src/components/PortfolioAnalytics.tsx:437`, `457`)
    - **What happens:** `DividendForm` initializes `symbol` once with `useState(symbols[0] ?? '')`. If `symbols` is empty on first render and later populated by sync (or edited), `symbol` remains `''` even though `<select>` visually displays `symbols[0]`; with only one stock in `symbols`, `onChange` can never fire to fix it.
    - **Concrete example:** Owner holds only `BBCA.JK`, opens `#/portfolio/income` after sync loads, clicks `+ Record dividend`, enters date and amount, clicks Save, and hits `pfa.formErr` with `BBCA` already showing in the dropdown.
    - **Smallest fix:** Replace raw `symbol` reads in `DividendForm` with `const chosen = symbols.includes(symbol) ? symbol : (symbols[0] ?? '');`.
    - **If we skip it:** Single-stock portfolios or freshly synced sessions hit a broken manual dividend form.

13. **Market table rows are mouse-only (`<tr onClick>` without a keyboard-focusable trigger)** (`src/components/MarketTable.tsx:106-122`)
    - **What happens:** Every asset row in Radar's Top 20, the 7 market group tables, Watchlist, and IDX tables binds `onClick` to `<tr>` without a `<button>` or `<a>` on the asset cell, `tabIndex`, or key handler.
    - **Concrete example:** Pressing `Tab` through `#/radar` skips every asset name and lands only on the Watchlist star buttons; a keyboard user cannot open `#/asset/bbca` from any market table.
    - **Smallest fix:** Wrap the asset code + name inside `MarketTable.tsx:115-121` in `<button type="button" onClick={() => onSelect(asset.symbol)} className="text-left focus-visible:underline">`.
    - **If we skip it:** Primary market tables remain inaccessible by keyboard and screen readers.

14. **28 buttons hardcode `#0B1220` text on `--accent-radar`, failing WCAG AA contrast in Light Mode** (`src/index.css:18`, `src/components/SettingsView.tsx:97`, `229`, `src/components/AssetDetailView.tsx:426`, `499`, and 14 other files)
    - **What happens:** `#0B1220` text was written for dark mode's bright mint (`#3DDC97`), then kept when Light Mode darkened `--accent-radar` to `#04875F`—producing a **4.16:1** contrast ratio (below WCAG AA 4.5:1 for 12–14px button labels).
    - **Concrete example:** In Light Mode, active language/timeframe pills in `#/settings`, `+ Add transaction` in `#/portfolio`, and `+ New alert` in `#/alerts` render dark-navy text on dark-emerald buttons.
    - **Smallest fix:** Define `--on-accent: #FFFFFF` in Light Mode and `--on-accent: #08101E` in Dark/Terminal Mode in `src/index.css`, and replace the 28 `'#0B1220'` inline styles with `'var(--on-accent)'`.
    - **If we skip it:** Primary action buttons and active pills remain low-contrast and hard to read in Light Mode.

15. **Stateful server glue (`server/backup.ts`, `server/sync.ts`, `server/push.ts`) has no unit tests behind the deploy gate** (`server/backup.ts:6-65`, `server/sync.ts:88-157`, `server/push.ts:74-172`)
    - **What happens:** Pure helpers in `src/utils/` are well-tested, but the server handlers that talk to GCS, enforce login limits, compute sync deltas, and prune `404/410` push endpoints have no tests—so the `Dockerfile` deploy gate (`npm test`) cannot catch regressions there.
    - **Concrete example:** The Sunday `HTTP 412` backup wedge (#10) and delta-echo edge cases in `server/sync.ts:139-149` pass all existing tests cleanly.
    - **Smallest fix:** Add `server/backup.test.ts` (mocked `fetch` for GCS `200`/`412`/timeout) and `server/sync.test.ts` (testing `/api/sync/login` + `/api/sync/merge` against `MemoryStore`).
    - **If we skip it:** Bugs in authentication, cross-device sync, or Cloud Storage backups can ship straight to production.

---

## Nice to have

16. **Dead Vercel shims and misleading `keepAlive()` calls remain after moving to Cloud Run** (`src/utils/hosting.ts:62-72`, `src/services/serverMode.ts:1-9`, `server/runtime.ts:36-51`, `server.ts:5202-5205`, `server/staples.ts:344`, `.vercelignore`, `supabase/cron.sql`)
    - **What happens:** `originalApiUrl()` is unused outside its own test, `VITE_SERVERLESS` (`serverMode.ts`) is never set, and `keepAlive()` looks up `@vercel/request-context`—which is a no-op on Cloud Run where CPU is throttled as soon as `res.json()` finishes.
    - **Concrete example:** `GET /api/staples` (`server/staples.ts:344`) starts `keepAlive(staplesStep(store, Date.now() + 90_000))` right before `res.json()`, leaving `state.running` held on a throttled container when no SSE stream is open.
    - **Smallest fix:** Delete `originalApiUrl` (+ test), `serverMode.ts`, `.vercelignore`, and `REQUEST_CONTEXT` in `server/runtime.ts`, and skip post-response `staplesStep`/`runIdxSweep` background starts when `CLOUD_RUN && priceStream.clients.size === 0`.
    - **If we skip it:** ~90 lines of dead Vercel code stay around and post-response background tasks stall on idle Cloud Run instances.

17. **`AlertDialog` and mobile `More` sheet do not close on `Escape` or move focus inside on open** (`src/components/AlertEditor.tsx:196-217`, `src/components/Navigation.tsx:396-441`)
    - **What happens:** Unlike `HeaderSearch` and desktop `SidebarNav` popups, these two `role="dialog" aria-modal="true"` overlays have no `Escape` key handler and leave focus on the page behind the backdrop.
    - **Concrete example:** Clicking `Alert` on `#/asset/bbca` opens the dialog, but pressing `Escape` does nothing and `Tab` moves focus across hidden page elements underneath.
    - **Smallest fix:** Add a small `useEffect` in both dialogs to focus the first interactive element on open and call `onClose` on `Escape`.
    - **If we skip it:** Keyboard behavior inside modals stays inconsistent across pages.

18. **1-second Binance browser ticks clone all 163+ ticks and re-render `<App>` even on static pages** (`src/services/marketDataService.ts:208-216`, `src/services/marketDataService.ts:370`, `src/App.tsx:165-173`)
    - **What happens:** Every second `connectBinanceLive` calls `mergeTicks({})` → `setTicks({ ...updatedTicks })` on the root `<App>` and writes the full tick + sparkline map to `localStorage` every 5s, even while viewing `#/macro`, `#/kitchen`, `#/risk`, or `#/settings`.
    - **Concrete example:** Reading `#/kitchen` on a phone still triggers 60 full root state updates and 12 `localStorage` JSON writes per minute.
    - **Smallest fix:** Only call `onTicksUpdate` when a tracked `PriceTick` value changed, and raise `saveTickSnapshot` interval in `marketDataService.ts:370` from `5_000` ms to `30_000` ms.
    - **If we skip it:** Extra mobile battery use and garbage-collection churn while reading text-heavy pages.

---

**Verdict:** Well-structured pure domain logic and strong i18n discipline (`0` untranslated strings, clean `tsc --noEmit`), but **fix #1–#6 first**—they affect nightly scan/backup completion, overnight Cloud Run billing, synced watchlist privacy, push alert reliability, and failed-price UX.

**Lean:** `-90` lines of dead Vercel code removable (`hosting.ts`, `serverMode.ts`, `runtime.ts`, `server.ts`, `.vercelignore`), `0` dependencies removable (all 15 runtime packages in `package.json` are actively used).

**Not checked:**
- Live Google Cloud Console settings (Cloud Run spend cap vs budget alerts, Secret Manager bindings, Cloud Storage lifecycle rules, Cloud Scheduler live logs) and live Supabase table contents/RLS policies.
- `.env` or any `.env*` files (never opened, per project rules).
- Every line of `server.ts` sequentially (searched and read targeted sections around auth, cron, tick, alerts, brief, snapshots, and streams instead of reading all 6,331 lines whole, as instructed).
- Real Web Push delivery to iOS/Android devices, Telegram bot delivery, and live TradingView iframe rendering under regional network conditions.
