# AssetRadar

**Track gold, stocks, and crypto on one radar.**

AssetRadar is a personal, non-commercial web app for watching the prices of Bitcoin, Ethereum,
Solana, the Jakarta Composite Index (JCI), spot gold, and the USD/IDR exchange rate in real
time. It works on desktop and mobile, offers TradingView-style charts, a Bloomberg-style
Terminal mode, news sentiment, and risk-profile education.

> Data is for information only, not investment advice. Charts by TradingView.

## Features

- **Radar dashboard**: price cards per group (Crypto, Stocks, Gold, Forex) with 24h change,
  24h sparkline, price flash on change, and live/delayed status.
- **Asset detail**: large price, 24h range, gold in USD/oz and Rupiah/gram, 8 timeframes
  (1m–1W), official TradingView chart or the alternative candlestick chart.
- **Terminal mode** (`#/terminal`): ticker tape, command line (`ETH GP`, `JCI N`, `HM`, `ECO`,
  `CORR`, `TOP`, `HELP`, `RADAR`), and MONITOR, CHART, HEATMAP, SENTIMENT, NEWS,
  CORRELATION 30D, ECONOMIC CALENDAR and NEWS FEED panels.
- **Sentiment & news**: a summary of the news mood (not a buy/sell signal), optionally
  enhanced by Gemini. Headlines are shown in their **original language** (Indonesian sources
  in Indonesian, international sources in English).
- **Watchlist** saved on the device, **light/dark theme**, and an option to open the app in
  Terminal mode.

## Data sources

| Data | Source |
|---|---|
| Crypto (BTC, ETH, SOL in IDR) | Indodax public WebSocket + REST, Indodax candles for charts |
| JCI (`^JKSE`) and USD/IDR (`IDR=X`) | Yahoo Finance (JCI is delayed) |
| Spot gold (XAU/USD) | gold-api.com; 24h change and mini chart from Yahoo `GC=F` futures |
| News | Google News RSS (Indonesian and English editions) |
| Charts & economic calendar | Official TradingView widgets |

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
```

Optional `.env` (see `.env.example`): `GEMINI_API_KEY` for AI-enhanced sentiment. Never
commit `.env`.

Checks that must pass after every change:

```bash
npm run lint && npm test && npm run build
```

Production: `npm run build`, then `NODE_ENV=production npm start`.

## Deploy

The repository can be imported into Google AI Studio (Build → ⊕ → Import from GitHub), which
runs `server.ts` on Cloud Run. Set `GEMINI_API_KEY` in the Secrets panel if you want AI
sentiment.

## Files

### Root

| File | Description |
|---|---|
| `server.ts` | Express server: serves the app and all `/api/market/*` endpoints with in-memory caching. |
| `index.html` | HTML shell: title, favicon (radar logo), fonts, and the React mount point. |
| `vite.config.ts` | Vite build config: React + Tailwind plugins and the `@` alias. |
| `package.json` / `package-lock.json` | Dependencies and npm scripts (`dev`, `lint`, `test`, `build`, `start`). |
| `tsconfig.json` | TypeScript settings. |
| `.env.example` | Example environment variables. |
| `metadata.json` | App name/description for Google AI Studio. |
| `CLAUDE.md` | Project notes and remaining work for Claude Code. |
| `docs/` | The original specification and follow-up prompts (Indonesian, historical). |

### `src/`

| File | Description |
|---|---|
| `main.tsx` | Browser entry point that mounts `App`. |
| `App.tsx` | Root component: global state, URL hash routing, layout, header and footer. |
| `index.css` | Global styles, light/dark tokens, Terminal-mode tokens, animations. |
| `config/assets.ts` | Shared types, the six tracked assets, groups and timeframes. |
| `services/marketDataService.ts` | Live data manager (Indodax WebSocket, polling, offline snapshot) and API fetch helpers. |
| `utils/format.ts` | Rupiah/USD/points/percent formatting and the gold-per-gram conversion. |
| `utils/marketHours.ts` | IDX trading-hours check and "updated X ago" labels. |
| `utils/sentiment.ts` | Headline tone, sentiment score/summary, and the RSS parser. |
| `utils/storage.ts` | All localStorage access (theme, timeframe, watchlist, snapshot, options). |
| `utils/router.ts` | Hash routes (`#/radar`, `#/asset/<id>`, `#/watchlist`, `#/risk`, `#/settings`, `#/terminal`). |
| `utils/candles.ts` | 4-hour candle aggregation and WIB chart-data conversion. |
| `utils/correlation.ts` | Pearson correlation of daily returns. |
| `utils/terminalCommands.ts` | Terminal command parser, autocomplete and HELP list. |
| `**/*.test.ts` | Unit tests for the files above (`npm test`). |

### `src/components/`

| File | Description |
|---|---|
| `RadarView.tsx` | Radar dashboard with price cards and the sentiment section. |
| `AssetDetailView.tsx` | Asset detail page with price, timeframes, chart and sentiment. |
| `PriceChart.tsx` | Picks TradingView or the alternative chart, with a manual toggle. |
| `TradingViewChart.tsx` | Official TradingView Advanced Chart widget. |
| `FallbackChart.tsx` | Alternative candlestick + volume chart (lightweight-charts). |
| `SparklineChart.tsx` | 24h mini area chart on price cards. |
| `AssetIntelligencePanel.tsx` | Sentiment score, drivers, and related news for one asset. |
| `WatchlistView.tsx` | Watchlist page. |
| `RiskProfileView.tsx` | Risk-profile education page with the disclaimer. |
| `SettingsView.tsx` | Settings, data sources and disclaimer. |
| `Navigation.tsx` | Desktop sidebar and mobile bottom navigation. |
| `RadarLogo.tsx` | The radar logo (SVG). |

### `src/components/terminal/`

| File | Description |
|---|---|
| `TerminalView.tsx` | The Terminal page: top bars, panel grid, shortcuts and command handling. |
| `TerminalStatusBar.tsx` | Brand, connection state, IDX open/closed and WIB clock. |
| `TickerTape.tsx` | Scrolling price tape. |
| `CommandLine.tsx` | Command line with autocomplete and HELP. |
| `MarketPanels.tsx` | MONITOR table and HEATMAP. |
| `IntelligencePanels.tsx` | SENTIMENT and NEWS panels and the shared news row. |
| `DataPanels.tsx` | CHART, ECONOMIC CALENDAR, CORRELATION 30D and NEWS FEED panels. |
| `TerminalPanel.tsx` | Shared panel frame, messages and formatting helpers. |
