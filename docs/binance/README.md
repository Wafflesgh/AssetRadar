# Binance API reference for AssetRadar

The two JSON files here are **subsets of Binance's official OpenAPI specs** (provided by the owner,
October 2026): only the public market-data `GET` endpoints AssetRadar uses. No endpoint here needs
an API key. Account, order, wallet and user-data endpoints were left out on purpose: the app never
asks for or stores Binance API keys.

- `spot-market-data.openapi.json` — Binance Spot (`https://api.binance.com`; for market data prefer
  `https://data-api.binance.vision`).
- `futures-usdm-market-data.openapi.json` — Binance USDⓈ-M perpetual futures (`https://fapi.binance.com`).

Regenerate from new full specs with the trim script used to make them (keep the same path list).
Full docs: https://developers.binance.com/en/docs/products/spot and
https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/general-info

## Limits (checked 20 Oct 2026)

| | Spot | USDⓈ-M Futures |
|---|---|---|
| `REQUEST_WEIGHT` per minute per IP | 6000 (read `exchangeInfo.rateLimits`) | 2400 (read `exchangeInfo.rateLimits`) |
| Weight header | `X-MBX-USED-WEIGHT-1M` | `X-MBX-USED-WEIGHT-1M` |
| Over the limit | HTTP 429 + `Retry-After`; ignoring 429 → 418 (IP ban) | same |
| Region blocked | HTTP 451 | HTTP 451 (more likely from US servers) |
| Extra limits | — | `/futures/data/*`: **only the last 30 days** of data, **1000 requests / 5 min per IP**; `fundingRate` + `fundingInfo` share **500 / 5 min per IP** |

AssetRadar budget: at most 20% of each weight limit.

## Endpoints used

### Spot (`data-api.binance.vision`, fallback `api.binance.com` → `api-gcp` → `api1`–`api4`)

| Endpoint | Weight | Used for |
|---|---|---|
| `/api/v3/exchangeInfo?permissions=SPOT&symbolStatus=TRADING` | 20 | USDT pair list, `rateLimits`, filters; once per day |
| `/api/v3/ticker/24hr` (all, `type=MINI` when enough) | 80 (all) · 2 (1–20 symbols) · 40 (21–100) | volume ranking, 24h change |
| `/api/v3/ticker` (rolling window, `windowSize=1h/4h/7d`) | 4 per symbol, max 200 | 1h / 4h / 7d change |
| `/api/v3/klines` (`1h`, `4h`, `1d`; limit ≤ 1000) | 2 | indicators, ranges, levels |
| `/api/v3/ticker/price`, `/api/v3/ticker/bookTicker` | 2 · 4 | price checks, spread |
| `/api/v3/depth` (limit 100) | 5 | optional order-book imbalance on the pair page |
| WebSocket `wss://data-stream.binance.vision:443/ws/!miniTicker@arr` | — | live prices for all pairs (±1 s) |

### USDⓈ-M Futures (`fapi.binance.com`)

| Endpoint | Weight | Used for |
|---|---|---|
| `/fapi/v1/exchangeInfo` | 1 | perpetual list (`contractType=PERPETUAL`, `1000`-prefixed contracts such as `1000PEPEUSDT`) |
| `/fapi/v1/premiumIndex` (all) | 10 | mark price, index price, last funding rate, next funding time |
| `/fapi/v1/fundingRate` | shares 500/5 min | funding history (8h) |
| `/fapi/v1/fundingInfo` | 0 (shares 500/5 min) | symbols with non-standard funding interval / caps |
| `/fapi/v1/openInterest` | 1 | current open interest |
| `/futures/data/openInterestHist` (`period` 5m…1d) | 0 (1000/5 min) | OI change; last 30 days only |
| `/futures/data/globalLongShortAccountRatio` | 0 (1000/5 min) | all-account long/short ratio; last 30 days only |
| `/futures/data/takerlongshortRatio` | 0 (1000/5 min) | taker buy/sell volume ratio; last 30 days only |
| `/futures/data/basis` (`contractType=PERPETUAL`) | 0 | basis and annualized basis; last 30 days only |
| `/fapi/v1/klines`, `markPriceKlines` | 1–10 by `limit` | futures candles, mark-price candles |
| `/fapi/v1/ticker/24hr` (all) | 40 | futures volume and change |

**Not used** (need an API key, `MARKET_DATA` security type): `/futures/data/topLongShortAccountRatio`,
`/futures/data/topLongShortPositionRatio`, `/fapi/v1/historicalTrades`.

## Notes for the code

- Times are milliseconds; data is chronological; the last kline is still open.
- Symbol names can contain non-ASCII characters (e.g. `币安人生USDT`): always `encodeURIComponent`.
- Futures statistics only go back 30 days, so a derivatives factor can only be validated over a
  short window unless the server stores daily snapshots (needs the stage 3 database).
- The crypto asset list is in `src/config/cryptoUniverse.json` (see `scripts/update-crypto-universe.mjs`).
