/**
 * diagnostics.ts — Pure logic for the server diagnostics page: the list of upstream sources the
 * app depends on (with the features each one feeds), how an HTTP probe result is classified
 * (ok, blocked by region, rate-limited, needs a key, down), and the summary of optional setup
 * (database, push, Telegram, scheduler, API keys). Used by server/diagnostics.ts and the Settings
 * card, so the owner can see right after publishing which sources the server can reach.
 */

export type ProbeStatus = 'ok' | 'blocked' | 'limited' | 'auth' | 'down';

export interface ProbeDef {
  id: string;
  /** Short name shown in the table. */
  name: string;
  url: string;
  /** Translation-key suffixes of the features that need this source (diag.feat.<id>). */
  features: string[];
  /** Extra request headers (e.g. a User-Agent the source asks for). */
  headers?: Record<string, string>;
  /** Status codes that still prove the host is reachable (e.g. 401 without a key). */
  okStatuses?: number[];
}

export interface ProbeResult {
  id: string;
  name: string;
  status: ProbeStatus;
  httpStatus: number | null;
  ms: number | null;
  features: string[];
  /** Short technical detail ("HTTP 451", "timeout"…), never a key or a URL with a key. */
  detail: string;
}

export const SEC_UA = 'AssetRadar personal research app (non-commercial)';

/** Every public source the server calls (no keys in these URLs). */
export const PROBES: ProbeDef[] = [
  { id: 'yahooChart', name: 'Yahoo Finance (prices)', url: 'https://query1.finance.yahoo.com/v8/finance/chart/BBCA.JK?range=1d&interval=1d', features: ['prices', 'charts', 'advisor'] },
  { id: 'yahooFundamentals', name: 'Yahoo Finance (statements)', url: 'https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/BBCA.JK?symbol=BBCA.JK&type=annualNetIncome&period1=1600000000&period2=1900000000', features: ['statements', 'sentiment', 'screener'] },
  { id: 'sec', name: 'SEC EDGAR', url: 'https://data.sec.gov/submissions/CIK0000320193.json', headers: { 'User-Agent': SEC_UA }, features: ['statements'] },
  { id: 'indodax', name: 'Indodax', url: 'https://indodax.com/api/summaries', features: ['crypto'] },
  { id: 'coingecko', name: 'CoinGecko', url: 'https://api.coingecko.com/api/v3/ping', features: ['crypto'] },
  { id: 'binanceData', name: 'Binance (market data)', url: 'https://data-api.binance.vision/api/v3/ping', features: ['binance'] },
  { id: 'binanceApi', name: 'Binance (api.binance.com)', url: 'https://api.binance.com/api/v3/ping', features: ['binance'] },
  { id: 'binanceFutures', name: 'Binance Futures', url: 'https://fapi.binance.com/fapi/v1/ping', features: ['binanceFutures'] },
  { id: 'fearGreed', name: 'Fear & Greed (alternative.me)', url: 'https://api.alternative.me/fng/?limit=1', features: ['binance'] },
  { id: 'goldApi', name: 'gold-api.com', url: 'https://api.gold-api.com/price/XAU', features: ['gold'] },
  { id: 'googleNews', name: 'Google News', url: 'https://news.google.com/rss/search?q=IHSG&hl=id&gl=ID&ceid=ID:id', features: ['news', 'sentiment'] },
  { id: 'fred', name: 'FRED (St. Louis Fed)', url: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=IRSTCI01IDM156N', headers: { 'User-Agent': 'AssetRadar/1.0 (personal research; non-commercial)' }, features: ['macro'] },
  // Alternatives when fredgraph.csv is unreachable (it times out from Vercel's Singapore servers)
  { id: 'fredApi', name: 'FRED API (needs a free key)', url: 'https://api.stlouisfed.org/fred/series?series_id=IRSTCI01IDM156N&file_type=json', okStatuses: [400], features: ['macro'] },
  { id: 'oecd', name: 'OECD Data API', url: 'https://sdmx.oecd.org/public/rest/dataflow/OECD.SDD.STES/DSD_STES@DF_FINMARK/latest', features: ['macro'] },
  { id: 'bis', name: 'BIS statistics API', url: 'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_SPP/1.0/Q.ID.R.628?startPeriod=2026&format=csv', features: ['macro'] },
  { id: 'imf', name: 'IMF DataMapper', url: 'https://www.imf.org/external/datamapper/api/v1/PCPIPCH/IDN', features: ['macro'] },
  { id: 'worldBank', name: 'World Bank', url: 'https://api.worldbank.org/v2/country/IDN/indicator/FP.CPI.TOTL.ZG?format=json&per_page=1', features: ['macro'] },
  { id: 'worldBankCmo', name: 'World Bank commodity prices', url: 'https://www.worldbank.org/en/research/commodity-markets', features: ['commodities'] },
  { id: 'bi', name: 'Bank Indonesia', url: 'https://www.bi.go.id/en/statistik/indikator/bi-rate.aspx', features: ['macro'] },
  { id: 'wikipedia', name: 'Wikipedia API (S&P 500 list)', url: 'https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json', features: ['usPeers'] },
  { id: 'finnhub', name: 'Finnhub', url: 'https://finnhub.io/api/v1/quote?symbol=AAPL', okStatuses: [401], features: ['finnhub'] },
  { id: 'telegram', name: 'Telegram API', url: 'https://api.telegram.org/', okStatuses: [302, 404], features: ['telegram'] },
];

/** Classifies one probe response. */
export function classifyProbe(httpStatus: number | null, okStatuses: number[] = [], error?: string): { status: ProbeStatus; detail: string } {
  if (httpStatus === null) return { status: 'down', detail: error === 'timeout' ? 'timeout' : error ? 'network error' : 'no response' };
  if ((httpStatus >= 200 && httpStatus < 400) || okStatuses.includes(httpStatus)) return { status: 'ok', detail: `HTTP ${httpStatus}` };
  if (httpStatus === 451 || httpStatus === 403) return { status: 'blocked', detail: `HTTP ${httpStatus}` };
  if (httpStatus === 429 || httpStatus === 418) return { status: 'limited', detail: `HTTP ${httpStatus}` };
  if (httpStatus === 401) return { status: 'auth', detail: `HTTP ${httpStatus}` };
  return { status: 'down', detail: `HTTP ${httpStatus}` };
}

export interface SetupItem {
  id: string;
  configured: boolean;
  /** Names of the secrets this item needs (never their values). */
  secrets: string[];
}

/** Optional setup read from the environment: which features are switched on (no values exposed). */
export function setupStatus(env: Record<string, string | undefined>): SetupItem[] {
  const has = (k: string) => Boolean(env[k]?.trim());
  const db = has('SUPABASE_URL') && (has('SUPABASE_SECRET_KEY') || has('SUPABASE_SERVICE_ROLE_KEY')) && /^https:\/\//.test(env.SUPABASE_URL?.trim() ?? '');
  return [
    { id: 'database', configured: db, secrets: ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'] },
    { id: 'sync', configured: db && (env.SYNC_PASSPHRASE?.trim().length ?? 0) >= 8, secrets: ['SYNC_PASSPHRASE'] },
    { id: 'push', configured: db && has('VAPID_PUBLIC_KEY') && has('VAPID_PRIVATE_KEY'), secrets: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] },
    { id: 'cron', configured: has('CRON_TOKEN'), secrets: ['CRON_TOKEN'] },
    { id: 'telegram', configured: has('TELEGRAM_BOT_TOKEN') && has('TELEGRAM_CHAT_ID'), secrets: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'] },
    { id: 'gemini', configured: has('GEMINI_API_KEY') && env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY', secrets: ['GEMINI_API_KEY'] },
    { id: 'finnhub', configured: has('FINNHUB_API_KEY'), secrets: ['FINNHUB_API_KEY'] },
    { id: 'bps', configured: has('BPS_API_KEY'), secrets: ['BPS_API_KEY'] },
    { id: 'appUrl', configured: /^https?:\/\//.test(env.APP_URL?.trim() ?? ''), secrets: ['APP_URL'] },
  ];
}

/** "projects/123/regions/us-central1" → "us-central1". */
export function regionFromMetadata(text: string): string | null {
  const m = text.trim().match(/regions\/([a-z0-9-]+)$/);
  return m ? m[1] : null;
}
