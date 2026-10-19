# AssetRadar

**Track the world's largest assets, Indonesian stocks, crypto and global markets on one radar.**

AssetRadar is a personal, non-commercial web app that follows 117 assets — US and world mega
caps, Indonesian blue chips, 20 crypto coins, commodities, 17 stock indices and major
currencies — in near real time. It works on desktop and mobile and offers TradingView-style
charts, a Bloomberg-style Terminal, evidence-based sentiment with technical and fundamental
analysis, an AI screen, a value/momentum portfolio simulator and risk-profile education.

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
  `TOP`, `AI`, `QUANT`, `HELP`), market filter, and MONITOR (live 5m change), CHART, INTEL,
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
| Annual reports (F-score, P/E, P/B) | Yahoo Finance fundamentals time series |
| Spot gold (XAU/USD) | gold-api.com; change and history from Yahoo `GC=F` futures |
| US Treasury yields | Yahoo Finance `^IRX`, `^FVX`, `^TNX`, `^TYX` |
| News | Google News RSS (Indonesian and English) and publisher RSS feeds |
| Charts & economic calendar | Official TradingView widgets |

Crude palm oil and coal are not listed: there is no free live source, and stale prices are
never shown. A failing source shows "Data unavailable" with a "Try again" button.

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
```

Optional `.env` (see `.env.example`): `GEMINI_API_KEY` to word the sentiment and AI summaries.
Never commit `.env`.

Checks that must pass after every change:

```bash
npm run lint && npm test && npm run build
```

Production: `npm run build`, then `NODE_ENV=production npm start`.

## Deploy

The repository can be imported into Google AI Studio (Build → ⊕ → Import from GitHub), which
runs `server.ts` on Cloud Run. Set `GEMINI_API_KEY` in the Secrets panel if you want AI wording.
Do not push from AI Studio back to GitHub; import the latest version instead.

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
| `docs/` | The original specification and follow-up prompts (Indonesian, historical). |

### `src/`

| File | Description |
|---|---|
| `main.tsx` | Browser entry point that mounts `App`. |
| `App.tsx` | Root component: global state, hash routing, layout, header and footer. |
| `index.css` | Global styles, light/dark tokens, Terminal tokens, animations. |
| `config/assets.ts` | Shared types, the 117 tracked assets (with share counts, keywords), groups, search. |
| `config/riskProfiles.ts` | Risk questionnaire, scoring, sample allocations and instrument notes. |
| `services/marketDataService.ts` | Live data manager (Indodax WebSocket, 10 s Yahoo polling, offline snapshot) and API helpers. |
| `services/newsStream.ts` | Shared live news store (SSE stream with polling fallback). |
| `hooks/useLiveNews.ts` | React hooks for the live news store. |
| `hooks/usePriceFlash.ts` | Price-change flash state for tables. |
| `utils/format.ts` | Price formatting for every quote currency, percentages, market caps, gold per gram. |
| `utils/marketHours.ts` | Trading hours per exchange and "updated X ago" labels. |
| `utils/movers.ts` | Live price buffer (5-minute window) and movers ranking. |
| `utils/sentiment.ts` | Headline tone and the RSS parser. |
| `utils/storage.ts` | All localStorage access (theme, timeframe, watchlist, snapshot, options, sidebar). |
| `utils/router.ts` | Hash routes (`#/radar`, `#/asset/<id>`, `#/watchlist`, `#/risk`, `#/settings`, `#/terminal`, `#/advisor`, `#/quant`). |
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
| `AssetSearch.tsx` | Keyboard-friendly asset search box. |
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
| `MarketFunctionPanels.tsx` | MOVERS, WORLD INDICES, FX CROSS and US YIELD CURVE panels. |
| `AnalysisPanels.tsx` | INTEL and HISTORICAL PRICES panels. |
| `IntelligencePanels.tsx` | SENTIMENT and NEWS panels and the shared news row. |
| `DataPanels.tsx` | CHART, ECONOMIC CALENDAR, CORRELATION 30D and NEWS FEED panels. |
| `TerminalPanel.tsx` | Shared panel frame, messages and formatting helpers. |
