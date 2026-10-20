# AssetRadar

**Track the world's largest assets, Indonesian stocks, crypto and global markets on one radar.**

AssetRadar is a personal, non-commercial web app that follows 117 core assets — US and world
mega caps, Indonesian blue chips, 20 crypto coins, commodities, 17 stock indices and major
currencies — plus all ±960 stocks listed on the Indonesia Stock Exchange, with prices pushed
from the server about every 5 seconds. It installs on phones and desktops (PWA) and offers
TradingView-style charts, a Bloomberg-style Terminal, evidence-based sentiment with technical
and fundamental analysis, company financial statements, a personal portfolio, the IDX corporate
calendar, Indonesian macro data, an AI screen with a live track record, a value/momentum
portfolio simulator and risk-profile education — plus (stage 3) sync between devices, price
alerts with phone notifications, an IDX stock screener, side-by-side comparison, portfolio
performance against the IHSG with dividends, a morning brief, Antam gold-bar prices and a simple
strategy backtester.

> Data is for information only, not investment advice. Charts by TradingView.

## Features

- **Radar dashboard** (`#/radar`), ranked like companiesmarketcap.com: search over every asset,
  quick-chart shortcuts for key assets, **Biggest Movers** (live 5-minute window from the ticks
  this app receives, 1H, 24H, 7D; filter by stocks/indices/crypto/commodities/forex), the
  **Top 20 assets by live market cap**, and one table per market (Commodities, Crypto,
  Indonesian Stocks, US Stocks, World Stocks, Indices, Forex) with 1h/24h/7d change, market cap
  and a 24h mini chart.
- **Asset detail**: price, range, gold in USD/oz and Rupiah/gram, 8 timeframes (1m–1W), the
  official TradingView chart or the alternative candlestick chart, and the analysis below.
- **Sentiment that explains itself**: the score is a weighted sum of separately measured
  evidence — technical scorecard, 12-1 month momentum, value, quality (Piotroski F-score for
  stocks) and classified news drivers — each shown with its reading, weight, contribution and
  the research behind it. Headlines that only report a price move get a low weight.
- **Technical analysis**: 200/50-day trend, golden/death cross, MACD, RSI, Bollinger Bands,
  52-week range, 55-day breakout; chart patterns (double top/bottom, head & shoulders and
  inverse, ascending/descending/symmetrical triangles, rising/falling wedges, channels) with
  status and key level; and how often the same scorecard lean was followed by a rise on that
  asset's own history versus the base rate.
- **Fundamental analysis**: Piotroski F-score (9 checks), gross profitability, P/E, P/B from
  annual reports; news and events classified as earnings, central bank, macro data, regulation,
  fund flows, supply, geopolitics, analyst ratings or legal, with a direction per asset.
- **Terminal mode** (`#/terminal`): ticker tape, command line and QuickBar
  (`ETH GP`, `BBCA INTEL`, `SPX HP`, `JCI N`, `MOV`, `WEI`, `FXC`, `CURV`, `HM`, `ECO`, `CORR`,
  `TOP`, `BRIEF`, `CMP BBCA BBRI`, `AI`, `QUANT`, `HELP`), market filter, and MONITOR (live 5m change), CHART, INTEL,
  MOVERS, WORLD INDICES, HEATMAP, SENTIMENT, NEWS, FX CROSS, US YIELD CURVE, HISTORICAL PRICES,
  CORRELATION 30D, ECONOMIC CALENDAR and NEWS FEED panels.
- **AI Advisor** (`#/advisor`): a personalized, backtested screen (see below) with a
  "How verdicts are decided" box and a pass/fail checklist on every card.
- **Quant Lab** (`#/quant`): value vs momentum allocation slider with annual return,
  volatility, Sharpe, max drawdown, the value–momentum correlation and a growth chart against
  pure value, pure momentum and an equal-weight benchmark; optional Piotroski F ≥ 8 filter.
- **Live news**: publisher feeds every 60 s and Google News every 2 min (plus on-demand searches
  for assets without their own feed), pushed over Server-Sent Events, a headline tape, NEW
  badges, and a red **geopolitical alert** for a new war or major escalation (sports and
  hypothetical scenarios are filtered out).
- **Watchlist**, **light/dark theme**, a collapsible desktop sidebar, and an option to open the
  app in Terminal mode.
- **Install as an app (PWA)**: manifest + icons, "Install app" in Settings and a dismissible
  banner on the Radar (iPhone: Share → Add to Home Screen). The service worker caches the app
  shell and the last API answers, so the app opens offline with the last prices marked
  "Offline – last data" (registered in production builds only).
- **IHSG first and every IDX stock** (`#/idx`): a key-indices strip (IHSG first) on the Radar,
  IHSG first in Quick Chart, and a page with all listed Indonesian stocks — sector/board filters,
  sorting, gainers/losers/most active, value traded — priced on demand (a background sweep
  refreshes the whole list every 5 min while the IDX is open and someone is watching).
- **Search in the header of every page**: by code, name, alias or sector, with recent searches;
  `/` or Ctrl+K focuses it, and on phones it opens full-screen.
- **Portfolio** (`#/portfolio`): buy/sell transactions (IDX stocks in lots of 100, gold in grams),
  average-cost positions, live value and unrealized/realized P/L in Rupiah, allocation by asset
  class, JSON export/import. Stored on this device and synced when logged in (see below).
- **AI Advisor live track record**: every verdict is saved once per day on this device and
  scored when its horizon has passed, so the screen is also judged on real, after-the-fact
  results (hit rate vs base rate, shown once there are ≥ 30 results).
- **IDX corporate calendar** (`#/calendar`, Terminal `CAL`): upcoming earnings reports, ex-dividend
  and payment dates, 5 years of dividends and splits, per stock and for the whole exchange
  (all / watchlist / portfolio).
- **Indonesia macro** (`#/macro`, Terminal `IDMACRO`): BI-Rate decisions, the policy-rate path,
  inflation, GDP growth, FX reserves, trade balance and USD/IDR, each with its data date and
  source. The AI Advisor tests the BI-Rate path and inflation as inputs for Indonesian assets
  and keeps them only where they improved the validation period.
- **Financial statements** on every stock page: annual, semester or quarterly income statement,
  balance sheet and cash flow (up to 5 years), ratios (margins, ROE, ROA, DER, current ratio,
  asset turnover, YoY / QoQ growth, EPS, P/E, P/B, dividend yield; quarters use trailing 12
  months or are annualized), a revenue / net income chart, CSV download and the source of
  every number.
- **Prices pushed every ~5 seconds** (Server-Sent Events): the server fetches quotes once for all
  viewers — about every 5 s for what you have open, 15 s for the rest, 5 min while a market is
  closed — slows down automatically if Yahoo rate-limits, and pushes only changed quotes. The
  header shows "Live (streaming)", or "Live · Polling" while the 10 s fallback is used.
  Optional real-time US stock trades from Finnhub.

- **Sync between devices** (Settings → Sync): watchlist, portfolio, dividends, AI forward-test
  log, risk profile, alerts, saved screens and strategies, gold prices and settings are the same
  on phone and PC. The owner logs in with a passphrase; data on each device stays as a backup and
  the app works offline and without logging in. Items merge one by one (the newest edit wins,
  deletions spread, no transaction is lost). Needs a database (optional, see "Optional setup").
- **Server forward test of the AI Advisor**: every weekday after 16:15 WIB the server saves the
  verdicts of both horizons and all risk profiles, even when nobody opens the app, and scores
  them later against real closes ("Server record" in the AI Advisor).
- **Alerts** (`#/alerts`, bell button on every asset page): price crossing above/below a level,
  a daily move of at least X %, ex-dividend or earnings tomorrow (one stock, or every stock in the
  watchlist and portfolio), a new headline for an asset, and the geopolitical alert; once or
  repeating (at most hourly), quiet hours, history, "Send test notification". With the optional
  setup the server checks alerts on its price loop and sends web push to your phone even when
  the app is closed (iPhone: install the app first, iOS 16.4+); without it alerts are checked in
  the browser while the app is open.
- **IDX stock screener** (`#/screener`): every listed stock filtered by sector, board, price,
  1-day/1-week change, value traded, market cap, P/E, P/B, ROE, net margin, DER, dividend yield,
  Piotroski F-score and profit growth; presets, saved screens, sorting, CSV, scan progress and
  the period of each row's figures ("Not reported" when missing). A screen filters reported
  numbers — it is not a recommendation.
- **Compare** (`#/compare?s=BBCA,BBRI,BMRI`, Terminal `CMP BBCA BBRI`): 2–4 assets rebased to 100
  over 1M–5Y, prices and changes, and for stocks the statements and ratios side by side.
- **Portfolio analytics**: daily value and time-weighted return against the IHSG (method
  explained on the page), volatility, max drawdown, correlation between holdings, cash dividends
  (recorded, or suggested from the dividend history × shares held before the ex-date and
  confirmed by you) and the calendar of the stocks you hold.
- **Morning brief** (`#/brief`, Terminal `BRIEF`): every morning at about 07:30 WIB — Wall Street
  and Asian closes, IHSG, movers, Rupiah and gold, today's corporate events (watchlist and
  portfolio first), latest macro data, the 5 most important headlines and the forward-test
  status; optionally sent to Telegram and as a push notification.
- **Antam gold bar** (gold page): links to the official Logam Mulia and Pegadaian price pages and
  the buyback price per gram you record there (no scraping); physical gold in the portfolio is
  valued at a recent buyback price.
- **Backtest** (`#/backtest`): your own entry/exit rules (moving-average cross, price vs MA, RSI,
  N-day breakout, stop-loss/take-profit) on up to 5 years of daily prices, IDX costs and lots,
  equity vs buy & hold, statistics, first half vs second half and over-fitting warnings. Past
  results do not guarantee future results.

## AI Advisor (scientific approach)

1. **Data**: ~5 years of daily closes per instrument, US 3-month and 10-year yields, the dollar
   index; today's live price is the latest data point.
2. **Rate events**: every FOMC decision since 2021 (recorded through 2025, later ones inferred
   from T-bill moves) feeds a "Fed stance" feature and an event study per asset.
3. **Test 1 — backtested strategy**: a logistic model (13 features), a trend rule and a
   mean-reversion rule compete in a walk-forward test; the method is picked on the first 60% of
   out-of-sample predictions and judged only on the last 40% (holdout). It counts if its signals
   beat the base rate with ≥ 30 signals and a higher average return.
4. **Test 2 — technical scorecard**: the fixed nine-rule scorecard is replayed over the asset's
   history; today's lean counts if it beat the base rate by ≥ 3 points over ≥ 60 days.
5. **Verdicts**: *Favorable* = a proven test points up, none down, the evidence score is not
   bearish and the chance of a gain is ≥ 55%; *Unfavorable* = a proven test points down and none
   up; *Watch list* = a proven test exists but no setup, the tests disagree, or the evidence
   contradicts; *No proven edge* = neither test beat the base rate; *Not suitable* = above the
   risk profile's volatility limit. The evidence score can tilt the chance by at most ±3 points.

> The AI Advisor is a statistical screen, not personal financial advice. Past patterns can
> break, and no outcome is guaranteed.

## Research used

- Asness, Moskowitz & Pedersen (2013), *Value and Momentum Everywhere* — value and momentum
  signals, rank-weighted portfolios, the negative value–momentum correlation (Quant Lab, evidence).
- Piotroski (2000), *Value Investing: The Use of Historical Financial Statement Information* —
  the F-score.
- Novy-Marx (2013), *The Other Side of Value: The Gross Profitability Premium*.
- Bettman, Sault & Schultz (2009), *Fundamental and Technical Analysis: Substitutes or
  Complements?* — why both kinds of evidence are combined and their agreement is shown.
- Also: Moskowitz, Ooi & Pedersen (2012) time-series momentum; Brock, Lakonishok & LeBaron (1992)
  moving-average rules; Lo, Mamaysky & Wang (2000) chart patterns; George & Hwang (2004)
  52-week high; Tetlock (2007) media tone; Estrella & Mishkin (1998) yield-curve inversion.

## Data sources

| Data | Source |
|---|---|
| Crypto (20 coins in IDR) | Indodax public WebSocket + REST; Indodax candles for charts and history |
| Crypto market caps, 1h/7d change | CoinGecko |
| Stocks, indices, commodities (futures), currencies | Yahoo Finance (batched quotes; exchange data is delayed) |
| Real-time US stock trades (optional) | Finnhub WebSocket, free plan (personal use, 1 connection, ≤ 50 symbols) |
| List of IDX stocks (code, name, shares, board, sector) | idx.co.id export, saved in `src/config/idxStocks.json` |
| Annual reports (F-score, P/E, P/B) | Yahoo Finance fundamentals time series |
| Financial statements | SEC EDGAR company facts (28 US companies, 10-K/10-Q) and Yahoo Finance fundamentals |
| Corporate calendar | Yahoo Finance calendar events, dividends and splits |
| Indonesia macro | Bank Indonesia (bi.go.id), FRED (OECD/IMF series), World Bank |
| Spot gold (XAU/USD) | gold-api.com; change and history from Yahoo `GC=F` futures |
| US Treasury yields | Yahoo Finance `^IRX`, `^FVX`, `^TNX`, `^TYX` |
| News | Google News RSS (Indonesian and English) and publisher RSS feeds |
| Charts & economic calendar | Official TradingView widgets |
| Daily price history (Compare, Backtest, portfolio performance) | Yahoo Finance `1d/5y`; crypto Indodax daily candles |
| Antam / Pegadaian gold-bar prices | Typed in by the owner from logammulia.com / pegadaian.co.id (no official feed) |
| Sync and server data (optional) | Supabase (Postgres REST), only through this server |
| Notifications (optional) | Web push (VAPID, `web-push`); Telegram Bot API for the morning brief |

Crude palm oil and coal are not listed: there is no free live source, and stale prices are
never shown. A failing source shows "Data unavailable" with a "Try again" button.

Known limits of the free sources:

- Indonesian and other non-US stocks: Yahoo gives about 4 years of annual and only the last ~5
  quarterly reports, so the 5-year quarterly / semester view is complete for US companies (SEC)
  only. A quarter a source skipped is computed from the annual report where possible, otherwise
  shown as "Not reported".
- About 40 of the ±960 IDX stocks have no Yahoo quote and show "Data unavailable".
- Calendar: AGM (RUPS), cum and recording dates and rights issues have no free source.
- Macro: no free current source for the 10-year SBN yield or the manufacturing PMI; free CPI
  month-on-month data ends in April 2025.
- IDX stock and index quotes are delayed (free data); the BI-Rate history in the AI Advisor uses
  the overnight interbank rate as a proxy.
- Screener: the full statement scan of ±960 stocks takes 10–20 minutes and is refreshed daily;
  ratios use Yahoo figures (latest annual report or trailing 12 months).
- Gold bars: no official Antam/Pegadaian feed the server may use, so prices are entered by hand.
- Cloud Run sleeps without visitors: server alerts and daily jobs run while it is awake — use the
  daily scheduler below (and, for alerts while the app is closed, a 5–15 minute ping or a minimum
  instance).

### Updating the list of IDX stocks

idx.co.id blocks scripted downloads, so export the two lists from a normal browser and run the
script (steps in the header of `scripts/update-idx-stocks.mjs`):

```bash
node scripts/update-idx-stocks.mjs securities.json profiles.json
```

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
```

Optional `.env` (see `.env.example`): `GEMINI_API_KEY` to word the sentiment, AI summaries and the
morning brief; `FINNHUB_API_KEY` (free at finnhub.io) for real-time US stock trades; and the
stage 3 keys described in "Optional setup" (sync, cron, web push, Telegram). All are used on the
server only, never sent to the browser. Without them everything still works. Never commit `.env`.

Checks that must pass after every change:

```bash
npm run lint && npm test && npm run build
```

Production: `npm run build`, then `NODE_ENV=production npm start`.

## Optional setup (stage 3)

Every feature works without these keys in a limited, local-only form. Put the values in `.env`
locally or in the Secrets panel of AI Studio / Secret Manager on Cloud Run — never in the code.

### Sync between devices (database + passphrase)

1. Create a free project at [supabase.com](https://supabase.com) (free plan: 500 MB database;
   inactive free projects are paused after a week — the daily scheduler below keeps it active).
2. In the SQL editor run:

   ```sql
   create table if not exists assetradar_kv (
     key text primary key,
     value jsonb not null,
     updated_at timestamptz not null default now()
   );
   alter table assetradar_kv enable row level security; -- no policies: only the server key can read/write
   ```

3. Settings → API: copy the project URL to `SUPABASE_URL` and the **service_role** key to
   `SUPABASE_SERVICE_ROLE_KEY` (server only — never put it in the browser).
4. Choose a passphrase of at least 8 characters and set `SYNC_PASSPHRASE`. Optional:
   `SYNC_SESSION_SECRET` to sign sessions with a separate secret. Changing the passphrase logs
   every device out.
5. Open Settings → Sync on each device and log in. The first login merges this device with the
   server and shows what was combined.

To try sync locally without a database: `SYNC_PASSPHRASE='at least 8 chars' SYNC_DEV_MEMORY_DB=1 npm run dev`
(data lives in server memory and is lost on restart).

### Daily jobs (forward test 16:15 WIB, morning brief 07:30 WIB)

The server runs them on the first request after their time. To run them even when nobody opens
the app, set `CRON_TOKEN` to a long random string and schedule a daily HTTP call, e.g. with Google
Cloud Scheduler or cron-job.org:

```
POST https://<your-app>/api/cron/daily
Authorization: Bearer <CRON_TOKEN>
```

Schedule it at 07:35 and 16:20 WIB (00:35 and 09:20 UTC); the call runs whatever is due.

### Web push for alerts and the brief

1. `npx web-push generate-vapid-keys` → set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, and
   `VAPID_SUBJECT` (e.g. `mailto:you@example.com`).
2. Sync (database + passphrase) must be set up too: alerts and push subscriptions are stored there.
3. On each phone/PC: log in under Settings → Sync, then Alerts → "Enable server push on this
   device" → "Send test notification". iPhone/iPad: install the app first (Share → Add to Home
   Screen, iOS 16.4+).

### Morning brief to Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather) → `TELEGRAM_BOT_TOKEN`.
2. Send the bot a message, then get your chat id (e.g. from @userinfobot) → `TELEGRAM_CHAT_ID`.
3. Optional `APP_URL` adds a link to the brief page in the message.

## Deploy

The repository can be imported into Google AI Studio (Build → ⊕ → Import from GitHub), which
runs `server.ts` on Cloud Run. Set `GEMINI_API_KEY`, `FINNHUB_API_KEY` and the optional stage 3
keys (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_PASSPHRASE`, `CRON_TOKEN`,
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)
in the Secrets panel if you want them. Do not push from AI Studio back to GitHub; import the latest version
instead (as a new app), then Publish.

## Files

### Root

| File | Description |
|---|---|
| `server.ts` | Express server: serves the app and all `/api/*` endpoints with in-memory caching. |
| `server/store.ts` | Durable key/value storage: Supabase (REST) or an in-memory fallback. |
| `server/sync.ts` | Owner login (passphrase → signed token) and the `/api/sync/*` endpoints. |
| `server/push.ts` | Web push (VAPID keys, subscriptions, sending) and `/api/push/*`. |
| `index.html` | HTML shell: title, favicon (radar logo), fonts, and the React mount point. |
| `vite.config.ts` | Vite build config: React + Tailwind plugins and the `@` alias. |
| `package.json` / `package-lock.json` | Dependencies and npm scripts (`dev`, `lint`, `test`, `build`, `start`). |
| `tsconfig.json` | TypeScript settings. |
| `.env.example` | Example environment variables. |
| `metadata.json` | App name/description for Google AI Studio. |
| `CLAUDE.md` | Project notes for Claude Code. |
| `docs/` | The original specification, follow-up prompts and progress log (Indonesian). |
| `public/manifest.webmanifest`, `public/icons/` | PWA manifest and app icons. |
| `public/sw.js` | Service worker (offline app shell and last API answers; filled in at build time). |
| `scripts/generate-icons.mjs` | Draws the PNG app icons from the radar logo. |
| `scripts/update-idx-stocks.mjs` | Rebuilds `src/config/idxStocks.json` from idx.co.id exports. |

### `src/`

| File | Description |
|---|---|
| `main.tsx` | Browser entry point that mounts `App`. |
| `App.tsx` | Root component: global state, hash routing, layout, header and footer. |
| `index.css` | Global styles, light/dark tokens, Terminal tokens, animations. |
| `pwa.ts` | Service worker registration (production only) and the install prompt. |
| `config/assets.ts` | Shared types, the 117 core assets, the IDX universe, groups, search. |
| `config/idxStocks.json` | Every IDX-listed stock (code, name, shares, board, sector, industry). |
| `config/secCik.ts` | SEC EDGAR company numbers (CIK) of the US stocks. |
| `config/riskProfiles.ts` | Risk questionnaire, scoring, sample allocations and instrument notes. |
| `services/marketDataService.ts` | Live data manager (Indodax WebSocket, server price stream with polling fallback, offline snapshot) and API helpers. |
| `hooks/useTrackedSymbols.ts` | Registers the symbols a view shows, so they are priced and refreshed first. |
| `utils/priceStream.ts` | Price-stream scheduling, rate-limit backoff, tick diff, trade throttle, client watchdog. |
| `utils/statements.ts` | Financial statements: Yahoo / SEC parsers, quarters, semesters, ratios, CSV. |
| `utils/portfolio.ts` | Portfolio math: trade units, average-cost positions, P/L, import/export. |
| `utils/corporateCalendar.ts` | Corporate events (earnings, dividends, splits) parsing and merging. |
| `utils/macro.ts` | FRED / Bank Indonesia / World Bank parsers and release-date shifting. |
| `ai/forwardTest.ts` | AI Advisor live track record (daily snapshots, scoring, hit rate). |
| `utils/sync.ts` | Sync merge per item (edit times, deletions), deltas, daily job schedule (WIB). |
| `utils/syncAuth.ts` | Server-only passphrase check, session tokens, login limiter. |
| `utils/alerts.ts` | Alert evaluation (crossing, daily move, calendar, news, geo), quiet hours, throttle. |
| `utils/screener.ts` | Screener fields, filters, sorting, presets, CSV and ratios from statements. |
| `utils/compare.ts` | Compare URL parameter and the rebased (start = 100) series. |
| `utils/portfolioAnalytics.ts` | Daily value, time-weighted return, dividends, drawdown, volatility, correlation. |
| `utils/morningBrief.ts` | Morning brief assembly, headline selection, schedule, Telegram text. |
| `utils/goldBar.ts` | Gold-bar sizes, buyback prices and the gold valuation for the portfolio. |
| `utils/backtest.ts` | Rule backtester (next-open fills, costs, lots, stops, stats, split test). |
| `services/syncService.ts` | Browser sync: login, delta sync, automatic syncing. |
| `services/alertService.ts` | Browser alerts: list, notifications, push subscription, local checker. |
| `services/newsStream.ts` | Shared live news store (SSE stream with polling fallback). |
| `hooks/useLiveNews.ts` | React hooks for the live news store. |
| `hooks/usePriceFlash.ts` | Price-change flash state for tables. |
| `utils/format.ts` | Price formatting for every quote currency, percentages, market caps, gold per gram. |
| `utils/marketHours.ts` | Trading hours per exchange and "updated X ago" labels. |
| `utils/movers.ts` | Live price buffer (5-minute window) and movers ranking. |
| `utils/sentiment.ts` | Headline tone and the RSS parser. |
| `utils/storage.ts` | All localStorage access (theme, timeframe, watchlist, snapshot, options, sidebar, synced collections and their change tracking). |
| `utils/router.ts` | Hash routes (`#/radar`, `#/asset/<id>`, `#/idx`, `#/watchlist`, `#/portfolio`, `#/calendar`, `#/macro`, `#/risk`, `#/settings`, `#/terminal`, `#/advisor`, `#/quant`, `#/alerts`, `#/screener`, `#/compare?s=`, `#/brief`, `#/backtest`). |
| `utils/candles.ts` | 4-hour candle aggregation and WIB chart data. |
| `utils/correlation.ts` | Pearson correlation of daily returns. |
| `utils/terminalCommands.ts` | Terminal command parser, autocomplete and HELP list. |
| `utils/newsTags.ts` | Headline asset tagging, MACRO/GEO tags, war-alert detection, news merging. |
| `ai/indicators.ts` | Feature engineering for the AI model. |
| `ai/events.ts` | FOMC calendar, inferred outcomes, Fed stance and event study. |
| `ai/model.ts` | Logistic regression, walk-forward backtest, strategy selection with holdout. |
| `ai/outlook.ts` | Per-asset AI outlook, verdict rules and checklist. |
| `ai/technical.ts` | Indicator scorecard, chart-pattern detection, historical hit rate. |
| `ai/fundamentals.ts` | Piotroski F-score, gross profitability, valuation, Yahoo parser. |
| `ai/newsDrivers.ts` | Headline event classification with direction and weights. |
| `ai/analysis.ts` | Evidence-weighted sentiment combining all of the above. |
| `ai/factorPortfolio.ts` | Value/momentum factor portfolios, blending and performance statistics. |
| `**/*.test.ts` | Unit tests (`npm test`). |

### `src/components/`

| File | Description |
|---|---|
| `RadarView.tsx` | Radar: search, quick charts, movers, top 20 by market cap, market tables, sentiment. |
| `MarketTable.tsx` | Compact ranked market table with flash, changes, market cap and mini chart. |
| `MoversPanel.tsx` | Biggest movers (live 5m, 1H, 24H, 7D) with a market filter. |
| `AssetSearch.tsx` | Keyboard-friendly asset search box (results, recent searches). |
| `HeaderSearch.tsx` | Search in the header of every page (full-screen on phones). |
| `KeyIndicesStrip.tsx` | Key indices strip on the Radar (IHSG first). |
| `IndonesianStocksView.tsx` | All IDX stocks with filters, sorting and movers (`#/idx`). |
| `PortfolioView.tsx` | Personal portfolio (lazy-loaded). |
| `PortfolioAnalytics.tsx` | Performance vs IHSG, risk, dividends and calendar of the portfolio (lazy-loaded). |
| `SyncCard.tsx` | Sync card in Settings (login, status, Sync now, first-merge summary). |
| `AlertsView.tsx` / `AlertEditor.tsx` | Alerts page, alert form and the dialog on asset pages. |
| `ScreenerView.tsx` | IDX stock screener (lazy-loaded). |
| `CompareView.tsx` | Compare page (lazy-loaded). |
| `BriefView.tsx` | Morning brief page (lazy-loaded). |
| `AntamGoldCard.tsx` | Antam gold-bar card (official links, recorded buyback prices). |
| `BacktestView.tsx` | Strategy backtester (lazy-loaded). |
| `LiveTrackRecord.tsx` | AI Advisor live (forward-test) track record. |
| `CorporateCalendarPanel.tsx` | Corporate calendar on a stock's detail page. |
| `IdxCalendarView.tsx` | IDX corporate calendar page. |
| `IndonesiaMacroView.tsx` | Indonesia macro page (lazy-loaded). |
| `FinancialStatementsPanel.tsx` | Financial statements and ratios on stock pages (lazy-loaded). |
| `InstallApp.tsx` | "Install app" card and banner. |
| `AssetDetailView.tsx` | Asset detail page with price, timeframes, chart and analysis. |
| `AssetIntelligencePanel.tsx` | Sentiment score and live related news for one asset. |
| `AssetAnalysisPanel.tsx` | Evidence breakdown, technical analysis and fundamental analysis. |
| `PriceChart.tsx` | Picks TradingView or the alternative chart, with a manual toggle. |
| `TradingViewChart.tsx` | Official TradingView Advanced Chart widget. |
| `FallbackChart.tsx` | Alternative candlestick + volume chart (lightweight-charts). |
| `SparklineChart.tsx` | 24h mini area chart. |
| `WatchlistView.tsx` | Watchlist page. |
| `RiskProfileView.tsx` | Risk Profile education (lazy-loaded). |
| `AdvisorView.tsx` | AI Advisor: summary, verdict rules, ranked cards with checklists, methodology. |
| `QuantSimView.tsx` | Quant Lab portfolio allocation simulator. |
| `NewsTape.tsx` | Running live headline tape. |
| `GeoAlertBanner.tsx` | War/attack alert banner shown on every page. |
| `SettingsView.tsx` | Settings, data sources and disclaimer. |
| `Navigation.tsx` | Collapsible desktop sidebar and mobile bottom navigation. |
| `RadarLogo.tsx` | The radar logo (SVG). |

### `src/components/terminal/`

| File | Description |
|---|---|
| `TerminalView.tsx` | The Terminal page: top bars, QuickBar, panel grid, shortcuts and command handling. |
| `TerminalStatusBar.tsx` | Brand, connection state, world market clocks and WIB time. |
| `TickerTape.tsx` | Scrolling price tape. |
| `CommandLine.tsx` | Command line with autocomplete and HELP. |
| `MarketPanels.tsx` | MONITOR table, HEATMAP and the market filter tabs. |
| `MarketFunctionPanels.tsx` | MOVERS, WORLD INDICES, FX CROSS, US YIELD CURVE, ID MACRO and MORNING BRIEF panels. |
| `AnalysisPanels.tsx` | INTEL, HISTORICAL PRICES and CALENDAR panels. |
| `IntelligencePanels.tsx` | SENTIMENT and NEWS panels and the shared news row. |
| `DataPanels.tsx` | CHART, ECONOMIC CALENDAR, CORRELATION 30D and NEWS FEED panels. |
| `TerminalPanel.tsx` | Shared panel frame, messages and formatting helpers. |
