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
portfolio simulator and risk-profile education. The interface is available in English and
Bahasa Indonesia.

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
  `TOP`, `AI`, `QUANT`, `BBCA SENT`, `BTC LVL`, `RANK IDX SHORT`, `BINANCE`, `BNB SOLUSDT`,
  `HELP`), market filter, and MONITOR (live 5m change), CHART, INTEL, MOVERS, WORLD INDICES,
  HEATMAP, SENTIMENT, NEWS, FX CROSS, US YIELD CURVE, HISTORICAL PRICES, CORRELATION 30D,
  ECONOMIC CALENDAR, NEWS FEED, SENT (investment sentiment), LVL (ranges & levels), RANK and
  BINANCE panels. Commands stay in English in both languages.
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
  class, JSON export/import. Stored on this device only.
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
  on the alternative chart. An educational **position calculator** (volatility targeting with
  the target from Settings, and risk per trade with whole IDX lots) — you type every number.
- **Crypto Binance** (`#/crypto`): the top 100 Binance USDT pairs by volume (price, 1h / 4h /
  24h / 7d change, volume, funding, sentiment), search, a pair page `#/crypto/<PAIR>` with
  closed-candle charts, ranges, levels and futures positioning (funding, open interest,
  long/short and taker ratios, basis; 30 days only). Public market data only — no account, no
  API key, no orders. The server keeps Binance usage under 20% of its weight limit and backs off
  on 429/418; a 451 (region blocked) is shown honestly. Coins in Rupiah link both ways.
- **Indonesia Macro Pulse** (`#/macro`): one traffic light per category (monetary, inflation,
  growth, external, fiscal, financial, commodities, global) from 10-year z-scores, what each
  usually means for IHSG / the Rupiah / banks, category tabs, stale labels, IDX valuation and
  breadth, and the next FOMC date. Describes conditions; not a forecast.

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
  volatility targeting at 10% a year with a 3-year window (position calculator).
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
| Spot gold (XAU/USD) | gold-api.com; change and history from Yahoo `GC=F` futures |
| US Treasury yields | Yahoo Finance `^IRX`, `^FVX`, `^TNX`, `^TYX` |
| News | Google News RSS (Indonesian and English) and publisher RSS feeds |
| Charts & economic calendar | Official TradingView widgets |

Crude palm oil and coal are not listed: there is no free live source, and stale prices are
never shown. A failing source shows "Data unavailable" with a "Try again" button.

Known limits of the free sources:

- Indonesian and other non-US stocks: Yahoo gives about 4 years of annual and only the last ~5
  quarterly reports, so the 5-year quarterly / semester view is complete for US companies (SEC)
  only. A quarter a source skipped is computed from the annual report where possible, otherwise
  shown as "Not reported".
- About 40 of the ±960 IDX stocks have no Yahoo quote and show "Data unavailable".
- Calendar: AGM (RUPS), cum and recording dates and rights issues have no free source.
- Macro: no free current source for the 10-year SBN yield, the manufacturing PMI, IndONIA /
  JIBOR / JISDOR, daily food prices, external debt, the budget deficit, M2, or car / motorcycle /
  cement sales; the World Bank Pink Sheet (CPO, nickel, tin, rubber) is an xlsx file and is not
  read yet. Core / administered / volatile-food inflation need the free `BPS_API_KEY`. Free CPI
  month-on-month data ends in April 2025.
- Binance may answer 451 (region blocked) from some server regions; the Crypto Binance page then
  says so. Futures positioning statistics cover only the last 30 days.
- Validation of the IDX fundamental pillars is short (Yahoo has about 4 years of annual
  reports); news and daily technicals have no stored history and are not back-tested.
- IDX stock and index quotes are delayed (free data); the BI-Rate history in the AI Advisor uses
  the overnight interbank rate as a proxy.

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

Optional `.env` (see `.env.example`): `GEMINI_API_KEY` to word the sentiment and AI summaries;
`FINNHUB_API_KEY` (free at finnhub.io) for real-time US stock trades; `BPS_API_KEY` (free, register
at https://webapi.bps.go.id/developer/) for core, administered-price and volatile-food inflation on
the macro page. Keys are used on the server only, never logged or sent to the browser. Without
them everything else still works. Never commit `.env`.

Checks that must pass after every change:

```bash
npm run lint && npm test && npm run build
```

Production: `npm run build`, then `NODE_ENV=production npm start`.

## Deploy

The repository can be imported into Google AI Studio (Build → ⊕ → Import from GitHub), which
runs `server.ts` on Cloud Run. Set `GEMINI_API_KEY`, `FINNHUB_API_KEY` and/or `BPS_API_KEY` in the Secrets
panel if you want them. Do not push from AI Studio back to GitHub; import the latest version
instead (as a new app), then Publish.

## Files

### Root

| File | Description |
|---|---|
| `server.ts` | Express server: serves the app and all `/api/*` endpoints with in-memory caching. |
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
| `config/cryptoUniverse.json` | The 50 largest crypto coins with their Binance pairs (built by `scripts/update-crypto-universe.mjs`). |
| `i18n/` | English source texts (`en.ts`), Indonesian translations (`id.ts`), `useT`/`t`, rich text, server text parts. |
| `crypto/binance.ts` | Binance public-data parsers, weight governor (20% budget, 429/418/451), client with backup hosts. |
| `crypto/cryptoPricing.ts` | USDT → Rupiah conversion and the price source of each coin. |
| `sentiment/` | Investment sentiment: cross-section ranks, point-in-time factors, hybrid fair value, pillars, news per horizon, horizon scores, macro signal, cadence, projections (ranges, ATR, levels, position sizing), validation (IC, hit rate). |
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
| `services/newsStream.ts` | Shared live news store (SSE stream with polling fallback). |
| `hooks/useLiveNews.ts` | React hooks for the live news store. |
| `hooks/usePriceFlash.ts` | Price-change flash state for tables. |
| `utils/format.ts` | Price formatting for every quote currency, percentages, market caps, gold per gram. |
| `utils/marketHours.ts` | Trading hours per exchange and "updated X ago" labels. |
| `utils/movers.ts` | Live price buffer (5-minute window) and movers ranking. |
| `utils/sentiment.ts` | Headline tone and the RSS parser. |
| `utils/storage.ts` | All localStorage access (theme, timeframe, watchlist, snapshot, options, sidebar). |
| `utils/router.ts` | Hash routes (`#/radar`, `#/asset/<id>`, `#/idx`, `#/watchlist`, `#/portfolio`, `#/calendar`, `#/macro`, `#/risk`, `#/settings`, `#/terminal`, `#/advisor`, `#/quant`, `#/crypto`, `#/crypto/<PAIR>`). |
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
| `LiveTrackRecord.tsx` | AI Advisor live (forward-test) track record. |
| `CorporateCalendarPanel.tsx` | Corporate calendar on a stock's detail page. |
| `IdxCalendarView.tsx` | IDX corporate calendar page. |
| `IndonesiaMacroView.tsx` | Indonesia macro page: Macro Pulse, category tabs, indicator cards, IDX valuation (lazy-loaded). |
| `CryptoBinanceView.tsx` | Crypto Binance page and pair pages (lazy-loaded). |
| `sentiment/InvestmentSentimentPanel.tsx` | Short / Medium / Long investment sentiment card on the asset page. |
| `sentiment/TechnicalLevelsPanel.tsx` | Technical ranges, ATR, levels and pattern targets. |
| `sentiment/PositionCalculator.tsx` | Educational position-size calculator. |
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
| `MarketFunctionPanels.tsx` | MOVERS, WORLD INDICES, FX CROSS, US YIELD CURVE and ID MACRO panels. |
| `AnalysisPanels.tsx` | INTEL, HISTORICAL PRICES and CALENDAR panels. |
| `IntelligencePanels.tsx` | SENTIMENT and NEWS panels and the shared news row. |
| `DataPanels.tsx` | CHART, ECONOMIC CALENDAR, CORRELATION 30D and NEWS FEED panels. |
| `TerminalPanel.tsx` | Shared panel frame, messages and formatting helpers. |
| `SentimentPanels.tsx` | SENT, LVL, RANK and BINANCE panels. |
