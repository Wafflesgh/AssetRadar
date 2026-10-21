/**
 * liveProxies.ts — Which assets get second-by-second prices from Binance's public futures stream
 * (index price of a TradFi perpetual, owner's choice 21 Oct 2026). Spot gold uses it as its main
 * price (the XAU index follows spot within about 0.1%). Stocks, ETFs and the other commodities only
 * get a separate "≈ live" indication beside their official price: the contracts trade around the
 * clock and can differ from the exchange price, most of all while the exchange is closed. Checked
 * against Yahoo on 21 Oct 2026; natural gas, Brent and Samsung were left out (3–11% apart: other
 * contract months or units). Coins priced from Binance follow the spot or futures stream.
 */

/** App symbol → futures contract whose index price becomes the main live price. */
export const LIVE_MAIN_FUTURES: Readonly<Record<string, string>> = {
  'XAU/USD': 'XAUUSDT',
};

export interface LiveIndication {
  contract: string;
  /** etf: a fund that tracks the index (other units than the index itself). */
  kind: 'stock' | 'etf' | 'commodity';
}

/** App asset code → futures contract shown as a separate live indication (prices in US$). */
export const LIVE_INDICATIONS: Readonly<Record<string, LiveIndication>> = {
  ...Object.fromEntries(
    ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'META', 'AVGO', 'TSLA', 'SPCX', 'BRKB', 'LLY', 'MU', 'WMT', 'JPM', 'AMD', 'V', 'XOM', 'INTC', 'PLTR', 'NFLX', 'ORCL', 'COST', 'KO', 'BAC', 'UNH', 'TSM', 'ASML'].map(
      (code) => [code, { contract: `${code}USDT`, kind: 'stock' as const }]
    )
  ),
  GOOG: { contract: 'GOOGLUSDT', kind: 'stock' },
  SPX: { contract: 'SPYUSDT', kind: 'etf' },
  NDX: { contract: 'QQQUSDT', kind: 'etf' },
  OIL: { contract: 'CLUSDT', kind: 'commodity' },
  COPPER: { contract: 'COPPERUSDT', kind: 'commodity' },
  SILVER: { contract: 'XAGUSDT', kind: 'commodity' },
  PLAT: { contract: 'XPTUSDT', kind: 'commodity' },
};

/** Indications further than this from the official price are hidden (a wrong match, not a quote). */
export const INDICATION_MAX_GAP = 0.05;

/** True when the indication may be shown next to this official price. */
export function indicationPlausible(kind: LiveIndication['kind'], live: number, official: number | null | undefined): boolean {
  if (!Number.isFinite(live) || live <= 0) return false;
  if (kind === 'etf' || official === null || official === undefined || !Number.isFinite(official) || official <= 0) return true;
  return Math.abs(live / official - 1) <= INDICATION_MAX_GAP;
}

/**
 * The main price with a live value: keeps the official previous close (price ÷ (1 + change)) so the
 * 24h change stays measured against the same close.
 */
export function withLivePrice(price: number, changePct24h: number | undefined, live: number): { price: number; changePct24h: number | undefined } {
  if (changePct24h === undefined || !Number.isFinite(changePct24h) || !Number.isFinite(price) || price <= 0) return { price: live, changePct24h };
  const prevClose = price / (1 + changePct24h / 100);
  return { price: live, changePct24h: (live / prevClose - 1) * 100 };
}
