# AssetRadar

**Track the world's largest assets, Indonesian stocks, crypto and global markets on one radar.**

AssetRadar is a personal, non-commercial web app that follows 147 assets — US and world
mega caps, Indonesian blue chips, the 50 largest crypto coins, commodities, 17 stock indices and
major currencies — plus all ±960 stocks listed on the Indonesia Stock Exchange and the top 100
Binance USDT pairs, with prices pushed
from the server about every 5 seconds. It installs on phones and desktops (PWA) and offers
TradingView-style charts, a Bloomberg-style Terminal, evidence-based sentiment with technical
and fundamental analysis, company financial statements, a personal portfolio, the IDX corporate
calendar, Indonesian macro data, an AI screen with a live track record, a value/momentum
portfolio simulator and risk-profile education — plus sync between devices, price alerts with
phone notifications, an IDX stock screener, side-by-side comparison, portfolio performance
against the IHSG with dividends, a morning brief, Antam gold-bar prices and a simple strategy
backtester. The interface is available in English and Bahasa Indonesia.

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
  `TOP`, `BRIEF`, `CMP BBCA BBRI`, `AI`, `QUANT`, `BBCA SENT`, `BTC LVL`, `RANK IDX SHORT`, `BINANCE`,
  `BNB SOLUSDT`, `HELP`), market filter, and MONITOR (live 5m change), CHART, INTEL, MOVERS,
  WORLD INDICES, HEATMAP, SENTIMENT, NEWS, FX CROSS, US YIELD CURVE, HISTORICAL PRICES,
  CORRELATION 30D, ECONOMIC CALENDAR, NEWS FEED, MORNING BRIEF, SENT (investment sentiment), LVL
  (ranges & levels), RANK and BINANCE panels. Commands stay in English in both languages.
- **AI Advisor** (`#/advisor`): a personalized, backtested screen (see below) with a
  "How verdicts are decided" box and a pass/fail checklist on every card.
- **Quant Lab** (`#/quant`): value vs momentum allocation slider with annual return,
  volatility, Sharpe, max drawdown, the value–momentum correlation and a growth chart against
  pure value, pure momentum and an equal-weight benchmark; optional Piotroski F ≥ 8 filter.
- **Live news**: publisher feeds every 60 s and Google News every 2 min (plus on-demand searches
  for assets without their own feed), pushed over Server-Sent Events, a headline tape, NEW
  badges, and a red **geopolitical alert** for a new war or major escalation (sports and
  hypothetical scenarios are filtered out). Its market reaction is measured **from the moment the
  news was published** (1-minute bars; also the first 15 and 60 minutes), and a market that has
  not traded since says so instead of showing an old 24-hour move.
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

- **English / Bahasa Indonesia**: switch with the EN | ID button in the header or in Settings
  Numbers follow the language (`Rp1.234.567`, `1,25%` in Indonesian) unless
  Settings → "Always en-US" is on. News headlines stay in their original language, with a
  Translate button next to each headline.
- **Investment sentiment** (asset page, Radar "Sentiment leaders", Terminal `SENT`, `RANK`):
  a 0–100 score with five labels (Strong Bearish … Strong Bullish) for three horizons — Short
  (days to weeks), Medium (1–6 months) and Long (6–24 months) — built from technical analysis,
  momentum, news per horizon, three journal pillars for stocks (financial health, quality &
  earnings, value), macro (IHSG, IDX stocks, Rupiah pairs) and derivatives (Binance crypto).
  Every component shows its weight, contribution in points, data date and paper; confidence and
  the review cadence come from point-in-time validation. A summary of evidence, not a buy/sell
  signal.
- **Technical ranges & levels** (asset page, Binance pair page, Terminal `LVL`): 68% / 90%
  statistical ranges per horizon with their past calibration, ATR, support/resistance from
  several methods (pivots, moving averages, 52-week high/low, classic pivots, volume nodes),
  pattern targets with their historical hit rate, optional Fibonacci (low evidence), and lines
  on the alternative chart.
- **Crypto Binance** (`#/crypto`): the top 100 Binance USDT pairs by volume (price, 1h / 4h /
  24h / 7d change, volume, funding, sentiment), search, a pair page `#/crypto/<PAIR>` with
  closed-candle charts, ranges, levels and futures positioning (funding, open interest,
  long/short and taker ratios, basis; 30 days only). Public market data only — no account, no
  API key, no orders. The server keeps Binance usage under 20% of its weight limit and backs off
  on 429/418; a 451 (region blocked) is shown honestly. Coins in Rupiah link both ways.
- **Retail government bonds (SBN Ritel)** on the Indonesia Macro page: the series the government
  sells to individuals through banks, securities firms and investment apps — ORI, Sukuk Ritel
  (tradable, fixed coupon), Savings Bond Ritel and Sukuk Tabungan (floating with a floor, early
  redemption), Sukuk Wakaf Ritel — with coupon, tenor, maturity, offering period ("Open now" /
  "Upcoming" / "Offer closed"), minimum and maximum order, whether it can be sold before maturity
  and the official distribution partners. Read from the official DJPPR (Ministry of Finance)
  pages twice a day; every series seen is kept, so earlier series stay listed.
- **Daily AI analysis** (`#/analyst`): every day at 16:15 WIB the server stores a snapshot of all
  147 assets (price, 24-hour change, sentiment per horizon), checks the data (missing or stale
  prices, failed sources, AI Advisor coverage, scheduler, database, Gemini), scores earlier calls
  against real prices, and Gemini writes an analysis from those facts only (English and
  Indonesian; with a model fallback on quota errors, and the facts alone when Gemini is not
  available). Every day stays selectable; an outside agent (e.g. Argon in Google AI Studio) can
  add notes, and `GET /api/analyst/export` gives the raw stored data for further analysis.
- **Recommendation history** (asset page and AI Advisor): every saved day's sentiment per
  horizon (short / medium / long investor) and AI Advisor verdict (20 / 60 trading days, per risk
  profile) with the price then, the change since, and — once the horizon has passed — whether
  the call was right. Per method (and per asset): saved and scored calls, hit rate versus the
  base rate and a plain verdict ("not enough results yet", "beats the base rate", "needs
  review"), to judge whether a method works or should be updated.
- **Indonesia Macro Pulse** (`#/macro`): one traffic light per category (monetary, inflation,
  growth, external, fiscal, financial, commodities, global) from 10-year z-scores, what each
  usually means for IHSG / the Rupiah / banks, category tabs, stale labels, IDX valuation and
  breadth, and the next FOMC date. Describes conditions; not a forecast.
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
  over 1M–10Y or the whole history since the first trade (MAX), prices and changes, and for stocks the statements and ratios side by side.
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
  N-day breakout, stop-loss/take-profit) on 1 year up to the full daily history (e.g. IHSG since
  1990, S&P 500 since 1927, BBCA since 2004, BTC/IDR since 2014), IDX costs and lots,
  equity vs buy & hold, statistics, first half vs second half and over-fitting warnings. Past
  results do not guarantee future results.

## AI Advisor (scientific approach)

1. **Data**: the last 10 years of daily closes per instrument (crypto from Indodax since 2016),
   US 3-month and 10-year yields, the dollar index; today's live price is the latest data point.
   The full history since the first trade is used for charts, Compare, Backtest and portfolio
   analytics; the model keeps to 10 years so the walk-forward retraining stays fast on the server
   (each retraining continues from the previous weights — same results within 0.3 points of
   probability, about 5× faster) and older market regimes do not dominate. Before 2021, where no
   FOMC decisions are recorded, the "Fed stance" is read from the 6-month move of the T-bill yield.
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

## Investment sentiment (how it works)

- **Horizon weights** (points of the 0–100 score; a missing component's weight is shared out
  and marked): Short — technical 45, momentum 20, news 25, macro 5, derivatives 5; Medium —
  technical 15, momentum 35, news 15, health 20, quality 10, macro 5; Long — momentum 10,
  news 5, health 25, quality 45, macro 15. Assets without financial statements use time-series
  momentum and the 200-day trend instead of the pillars.
- **Stock pillars**, ranked across the market each month (IDX universe; US core stocks):
  financial health (Piotroski F-score, Abarbanell & Bushee signals), quality & earnings (gross
  profitability, SUE, analyst surprise), value (hybrid fair value from a cross-sectional
  regression, re-estimated per market every month). Industry-adjusted where peers exist.
- **Point-in-time**: reports count only after they were published (IDX annual +4 months,
  quarterly +2 months; SEC filing date), prices only up to the scoring month.
- **Validation**: Spearman IC with overlap-corrected t-statistics, top-quintile hit rate vs
  base rate, quintile spread; first 60% of months for choices, last 40% as holdout. Confidence
  is High only when the IC is positive and significant; the review cadence follows the IC
  half-life. Results: `GET /api/sentiment/validation?market=idx|us|crypto`.

**Notes and corrections from the papers** (checked against the owner's PDFs):

- Bettman, Sault & Schultz (2009): the hybrid model's 76.9% R² mostly comes from the price five
  months earlier explaining today's price level — it is **not** return-prediction accuracy and
  is never shown as such. The US-dollar coefficients are not reused: the model is re-estimated
  per market each month. D_Up / D_Down use the six-month return starting one year back (months
  t−12…t−7, as in the paper); the "last six months" variant is used only if it validates better.
  Stocks without analyst coverage use Model 4 (no FEPS) and are marked.
- Asness, Moskowitz & Pedersen (2013): momentum skips the last month (t−12…t−2); rank weights;
  the 3-year annualized volatility is shown with the technical ranges.
- Piotroski (2000): the F-score was tested inside high book-to-market stocks and works best for
  small and mid caps without analyst coverage; a score of 0–1 is shown as a distress warning.
- Novy-Marx: gross profitability is demeaned by industry; the last month's return is a
  short-term reversal (negative weight); SUE uses an 8-quarter standard deviation and needs 12
  quarters.
- Abarbanell & Bushee (1997): inventory, receivables, capex, gross margin, SG&A and tax-rate
  signals; labour force, LIFO and audit-opinion signals have no free source ("Not reported").

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
  52-week high; Tetlock (2007) media tone; Estrella & Mishkin (1998) yield-curve inversion;
  Abarbanell & Bushee (1997) fundamental signals; Jegadeesh & Titman (1993) momentum windows.

## Data sources

| Data | Source |
|---|---|
| Crypto (20 coins in IDR) | Indodax public WebSocket + REST; Indodax candles for charts and history |
| Crypto (30 more of the top 50, top 100 USDT pairs) | Binance public market data (`data-api.binance.vision`, `api.binance.com` and backups, WebSocket `data-stream.binance.vision`, futures `fapi.binance.com`); converted to Rupiah at the live USD/IDR rate; CoinGecko as backup |
| Analyst estimates (FEPS, surprises) | Yahoo Finance quoteSummary `earningsTrend` / `earningsHistory` |
| Crypto market caps, 1h/7d change | CoinGecko |
| Stocks, indices, commodities (futures), currencies | Yahoo Finance (batched quotes; exchange data is delayed) |
| Real-time US stock trades (optional) | Finnhub WebSocket, free plan (personal use, 1 connection, ≤ 50 symbols) |
| List of IDX stocks (code, name, shares, board, sector) | idx.co.id export, saved in `src/config/idxStocks.json` |
| Annual reports (F-score, P/E, P/B) | Yahoo Finance fundamentals time series |
| Financial statements | SEC EDGAR company facts (28 US companies, 10-K/10-Q) and Yahoo Finance fundamentals |
| Corporate calendar | Yahoo Finance calendar events, dividends and splits |
| Indonesia macro | Bank Indonesia (bi.go.id), FRED (OECD/IMF/BIS series), World Bank, Yahoo Finance (LQ45, EIDO, regional FX, commodities, global markets), BPS API (optional key) |
| Retail government bonds (SBN Ritel) | DJPPR, Ministry of Finance (djppr.kemenkeu.go.id product pages, read through the site's public page API) |
| Full daily history since the first trade | Yahoo Finance chart API with explicit `period1/period2` (`range=max` thins daily bars out to monthly); Indodax daily candles in 10-year windows |
| CPO, Newcastle coal, nickel, tin, rubber, cocoa, robusta coffee, Thai rice (monthly) | World Bank "Pink Sheet" (CMO historical data, monthly xlsx), read on the server without extra packages |
| US peer group for the sentiment percentiles | S&P 500 constituents with GICS sector / sub-industry from Wikipedia (CC BY-SA), `src/config/sp500.json` |
| Spot gold (XAU/USD) | gold-api.com; change and history from Yahoo `GC=F` futures |
| US Treasury yields | Yahoo Finance `^IRX`, `^FVX`, `^TNX`, `^TYX` |
| News | Google News RSS (Indonesian and English) and publisher RSS feeds |
| Charts & economic calendar | Official TradingView widgets |
| Daily price history (Compare, Backtest, portfolio performance) | Yahoo Finance `1d/5y`; crypto Indodax daily candles |
| Antam / Pegadaian gold-bar prices | Typed in by the owner from logammulia.com / pegadaian.co.id (no official feed) |
| Sync and server data (optional) | Supabase (Postgres REST), only through this server |
| Notifications (optional) | Web push (VAPID, `web-push`); Telegram Bot API for the morning brief |

Crude palm oil and coal are not listed as live assets: there is no free live source, and stale
prices are never shown (their monthly World Bank averages are on the macro page). A failing source shows "Data unavailable" with a "Try again" button.

Known limits of the free sources:

- Indonesian and other non-US stocks: Yahoo gives about 4 years of annual and only the last ~5
  quarterly reports, so the 5-year quarterly / semester view is complete for US companies (SEC)
  only. A quarter a source skipped is computed from the annual report where possible, otherwise
  shown as "Not reported".
- About 40 of the ±960 IDX stocks have no Yahoo quote and show "Data unavailable".
- Calendar: AGM (RUPS), cum and recording dates and rights issues have no free source.
- Macro: no free current source for the 10-year SBN yield, the manufacturing PMI, IndONIA /
  JIBOR / JISDOR, daily food prices, external debt, the budget deficit, M2, or car / motorcycle /
  cement sales. CPO, nickel, tin, rubber and Newcastle coal are monthly averages (World Bank,
  updated early each month), not live prices. Core / administered / volatile-food inflation need the free `BPS_API_KEY`. Free CPI
  month-on-month data ends in April 2025.
- Binance may answer 451 (region blocked) from some server regions; the Crypto Binance page then
  says so. Futures positioning statistics cover only the last 30 days.
- Validation of the IDX fundamental pillars is short (Yahoo has about 4 years of annual
  reports); news and daily technicals have no stored history and are not back-tested.
- IDX stock and index quotes are delayed (free data); the BI-Rate history in the AI Advisor uses
  the overnight interbank rate as a proxy.
- Screener: the full statement scan of ±960 stocks takes 10–20 minutes and is refreshed daily;
  ratios use Yahoo figures (latest annual report or trailing 12 months).
- Gold bars: no official Antam/Pegadaian feed the server may use (logammulia.com answers HTTP 403 to
  scripts, pegadaian.co.id sits behind Cloudflare), so prices are entered by hand.
- US sentiment percentiles compare the app's US stocks with the whole S&P 500; the background scan
  of ±500 peers (prices, Yahoo statements, analyst data) takes about 20–30 minutes after a restart.
- Cloud Run sleeps without visitors: server alerts and daily jobs run while it is awake — use the
  daily scheduler below (and, for alerts while the app is closed, a 5–15 minute ping or a minimum
  instance).

### Updating the list of IDX stocks

idx.co.id blocks scripted downloads, so export the two lists from a normal browser and run the
script (steps in the header of `scripts/update-idx-stocks.mjs`):

```bash
node scripts/update-idx-stocks.mjs securities.json profiles.json
```

### Updating the other lists

```bash
node scripts/update-sp500.mjs             # S&P 500 peer group (Wikipedia API)
node scripts/update-crypto-universe.mjs 50 # top 50 crypto with Binance / Indodax pairs
```

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
```

Optional `.env` (see `.env.example`): `GEMINI_API_KEY` to word the sentiment, AI summaries, the
morning brief and the daily analysis (`GEMINI_MODELS` optionally sets the model fallback chain used
on 429 / quota errors); `FINNHUB_API_KEY` (free at finnhub.io) for real-time US stock trades; `BPS_API_KEY`
(free, register at https://webapi.bps.go.id/developer/) for core, administered-price and
volatile-food inflation on the macro page; and the stage 3 keys described in "Optional setup"
(sync, cron, web push, Telegram). All are used on the server only, never logged or sent to the
browser. Without them everything else still works. Never commit `.env`.

Checks that must pass after every change:

```bash
npm run lint && npm test && npm run build
```

Production: `npm run build`, then `NODE_ENV=production npm start`.

## Optional setup (stage 3)

Every feature works without these keys in a limited, local-only form. Put the values in `.env`
locally or in the Secrets panel of AI Studio / Secret Manager on Cloud Run — never in the code.
Step-by-step guide in Indonesian: `docs/SETUP_Online.md`.

- `node scripts/generate-secrets.mjs` fills the self-made secrets in `.env` (`CRON_TOKEN`,
  `SYNC_PASSPHRASE`, `SYNC_SESSION_SECRET`, a VAPID key pair) without printing them.
- The table for Supabase is in `supabase/schema.sql`.
- After publishing, **Settings → Server diagnostics** shows which data sources the server can
  reach from its region (e.g. Binance 451 from the US) and which optional features are on —
  secret names only, never values (`GET /api/diagnostics`).

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

### Daily jobs (forward test + daily analysis 16:15 WIB, morning brief 07:30 WIB)

The server runs them on the first request after their time. To run them even when nobody opens
the app, set `CRON_TOKEN` to a long random string and schedule a daily HTTP call, e.g. with Google
Cloud Scheduler or cron-job.org:

```
POST https://<your-app>/api/cron/daily
Authorization: Bearer <CRON_TOKEN>
```

Schedule it at 07:35 and 16:20 WIB (00:35 and 09:20 UTC) every day; the call runs whatever is due
(the forward test only on weekdays, the daily analysis every day). The repo
includes a ready GitHub Actions workflow (`.github/workflows/daily-jobs.yml`) that does this for
free — add the repository secrets `APP_URL` and `CRON_TOKEN` (same value as the app's).

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

**Vercel + Supabase (current hosting, free tiers).** Import the GitHub repository into Vercel; the
settings come from `vercel.json`. `npm run build` builds the front end and, on Vercel, bundles the
whole API into one Node function in Singapore (`scripts/build-vercel.mjs`, Build Output API). Set the
secrets (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CRON_TOKEN`, `SYNC_PASSPHRASE`, `SYNC_SESSION_SECRET`,
`VAPID_*`, `GEMINI_API_KEY`, optional `BPS_API_KEY`, `TELEGRAM_*`) under Project → Settings →
Environment Variables. Run `supabase/schema.sql`, then `supabase/cron.sql` (with your app address and
`CRON_TOKEN`) in the Supabase SQL Editor: pg_cron calls `POST /api/cron/tick` every 10 minutes for
alerts, daily jobs and the step-by-step market scans. On this serverless host there are no server
streams: prices are polled every 10 s (crypto stays live through the Indodax WebSocket) and Finnhub
is not used. Owner guide: `docs/BLUEPRINT.md` §9. To try serverless mode locally: `SERVERLESS=1 npm run build`
then `node scripts/build-vercel.mjs --force`.

**Google AI Studio / Cloud Run (old hosting).** The repository can be imported into Google AI Studio (Build → ⊕ → Import from GitHub), which
runs `server.ts` on Cloud Run. Set `GEMINI_API_KEY`, `FINNHUB_API_KEY`, `BPS_API_KEY` and the optional
stage 3 keys (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_PASSPHRASE`, `CRON_TOKEN`,
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
| `scripts/update-crypto-universe.mjs` | Rebuilds `src/config/cryptoUniverse.json` (top 50 crypto with Binance pairs). |
| `scripts/update-sp500.mjs` | Rebuilds `src/config/sp500.json` (S&P 500 peer group, Wikipedia API). |
| `scripts/generate-secrets.mjs` | Fills self-made secrets (cron token, sync passphrase, VAPID keys) in the local `.env` without printing them. |
| `supabase/schema.sql` | The single table needed in Supabase. |
| `supabase/cron.sql` | pg_cron job that calls `POST /api/cron/tick` every 10 minutes (address and token kept in Supabase Vault). |
| `scripts/build-vercel.mjs` | On Vercel: static front end + the whole API bundled as one function (Build Output API, region sin1). |
| `server/vercelEntry.ts` | The Vercel function handler around `createApp()`. |
| `server/runtime.ts` | Serverless mode: timers only on always-on hosts, `keepAlive()` (waitUntil) for work started in a request. |
| `src/services/serverMode.ts` | Client switch: SSE streams on always-on servers, polling on the serverless build. |
| `.github/workflows/daily-jobs.yml` | Free daily scheduler: calls `POST /api/cron/daily` at 07:35 and 16:20 WIB every day. |
| `server/diagnostics.ts` | `GET /api/diagnostics`: source reachability, Cloud Run region, optional-feature status. |
| `server/xlsx.ts` | Minimal .xlsx reader (node:zlib) for the World Bank Pink Sheet. |
| `server/gemini.ts`, `server/geminiPolicy.ts` | Every Gemini call: model chain (`GEMINI_MODELS`), rest after 429 / quota errors, next model, status for diagnostics. |
| `server/sbn.ts` | `GET /api/sbn/retail`: retail SBN from DJPPR (12 h cache, every series kept in the database). |
| `scripts/check-i18n.mjs` | Finds UI text that bypasses the translation system (must report 0). |
| `server/binanceFeed.ts` | Server-side Binance feed: universe, quotes, klines, derivatives, demand-driven polling. |
| `server/crossSection.ts` | Paced market scans (IDX / US) that feed the sentiment pillars and validation. |

### `src/`

| File | Description |
|---|---|
| `main.tsx` | Browser entry point that mounts `App`. |
| `App.tsx` | Root component: global state, hash routing, layout, header and footer. |
| `index.css` | Global styles, light/dark tokens, Terminal tokens, animations. |
| `pwa.ts` | Service worker registration (production only) and the install prompt. |
| `config/assets.ts` | Shared types, the 117 core assets plus the crypto universe (147), the IDX universe, groups, search. |
| `config/sp500.json`, `config/usPeers.ts` | S&P 500 constituents (GICS) and the US peer assets for the sentiment cross-section (not app assets). |
| `utils/diagnostics.ts` | Probe list, status classification and optional-setup summary for the diagnostics page. |
| `utils/pinkSheet.ts`, `utils/xlsxSheet.ts` | World Bank Pink Sheet link finder and parser; worksheet XML reader. |
| `config/cryptoUniverse.json` | The 50 largest crypto coins with their Binance pairs (built by `scripts/update-crypto-universe.mjs`). |
| `i18n/` | English source texts (`en.ts`), Indonesian translations (`id.ts`), `useT`/`t`, rich text, server text parts. |
| `crypto/binance.ts` | Binance public-data parsers, weight governor (20% budget, 429/418/451), client with backup hosts. |
| `crypto/cryptoPricing.ts` | USDT → Rupiah conversion and the price source of each coin. |
| `sentiment/` | Investment sentiment: cross-section ranks, point-in-time factors, hybrid fair value, pillars, news per horizon, horizon scores, macro signal, cadence, projections (ranges, ATR, levels), validation (IC, hit rate). |
| `ai/dailyAnalyst.ts` | Daily analysis (pure): snapshot type, movers, sentiment changes, extremes, data-quality checks, Gemini prompt, agent notes. |
| `ai/recommendationTrace.ts` | Saved sentiment calls, scoring after the horizon, hit rate vs base rate per method, one asset's trace. |
| `utils/sbnRetail.ts` | Retail SBN (ORI, SBR, SR, ST, SWR) from the official DJPPR page text: coupons, dates, orders, tradability. |
| `utils/geoReaction.ts` | Market reaction since a news item was published (base bar before the news, 15/60-minute marks). |
| `utils/analyst.ts` | Analyst estimates (FEPS, earnings surprises) parser. |
| `services/sentimentService.ts` | Client helpers for sentiment, projections, rankings and Binance endpoints. |
| `config/idxStocks.json` | Every IDX-listed stock (code, name, shares, board, sector, industry). |
| `config/secCik.ts` | SEC EDGAR company numbers (CIK) of the US stocks. |
| `config/riskProfiles.ts` | Risk questionnaire, scoring, sample allocations and instrument notes. |
| `services/marketDataService.ts` | Live data manager (Indodax WebSocket, server price stream with polling fallback, offline snapshot) and API helpers. |
| `hooks/useTrackedSymbols.ts` | Registers the symbols a view shows, so they are priced and refreshed first. |
| `utils/priceStream.ts` | Price-stream scheduling, rate-limit backoff, tick diff, trade throttle, client watchdog. |
| `utils/statements.ts` | Financial statements: Yahoo / SEC parsers, quarters, semesters, ratios, CSV. |
| `utils/portfolio.ts` | Portfolio math: trade units, average-cost positions, P/L, import/export. |
| `utils/corporateCalendar.ts` | Corporate events (earnings, dividends, splits) parsing and merging. |
| `utils/macro.ts` | FRED / Bank Indonesia / World Bank / BPS parsers, release-date shifting, 10-year z-scores, staleness, Macro Pulse. |
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
| `utils/storage.ts` | All localStorage access (theme, language, number format, timeframe, watchlist, snapshot, options, sidebar, synced collections and their change tracking). |
| `utils/router.ts` | Hash routes (`#/radar`, `#/asset/<id>`, `#/idx`, `#/watchlist`, `#/portfolio`, `#/calendar`, `#/macro`, `#/risk`, `#/settings`, `#/terminal`, `#/advisor`, `#/quant`, `#/crypto`, `#/crypto/<PAIR>`, `#/alerts`, `#/screener`, `#/compare?s=`, `#/brief`, `#/backtest`). |
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
| `AnalystView.tsx` | Daily AI analysis page (`#/analyst`): stored narrative, data checks, facts, method accuracy, agent notes. |
| `RecommendationHistory.tsx`, `TraceSection.tsx`, `MethodAccuracy.tsx` | Recommendation history of an asset, the track record on the AI Advisor page, and the method-accuracy table. |
| `SbnRetailSection.tsx` | Retail SBN cards on the Indonesia Macro page. |
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
| `IndonesiaMacroView.tsx` | Indonesia macro page: Macro Pulse, category tabs, indicator cards, IDX valuation (lazy-loaded). |
| `CryptoBinanceView.tsx` | Crypto Binance page and pair pages (lazy-loaded). |
| `sentiment/InvestmentSentimentPanel.tsx` | Short / Medium / Long investment sentiment card on the asset page. |
| `sentiment/TechnicalLevelsPanel.tsx` | Technical ranges, ATR, levels and pattern targets. |
| `sentiment/SentimentLeaders.tsx` | Sentiment leaders card on the Radar. |
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
| `SentimentPanels.tsx` | SENT, LVL, RANK and BINANCE panels. |
