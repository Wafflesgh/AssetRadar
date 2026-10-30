/**
 * fundArena.ts — AI Fund Arena: ten simulated fund managers, one per model the app already has
 * (sentiment short/medium/long, the AI Advisor verdict, and six arena models), each starting with
 * US$100 of pretend money. Every day after the evening job each manager holds an equal-weight
 * portfolio of up to FUND_PICKS assets it believes will rise (or cash when it believes in none),
 * pays FUND_COST on every trade, and is marked to market with the day's prices. Values are in US
 * dollars: Rupiah-priced assets are converted with USD/IDR; other quote currencies are taken as
 * their local return (foreign exchange of non-US markets is not modelled). Pure helpers only; the
 * server stores the state and the page values the holdings at live prices.
 */

export const FUND_START_USD = 100;
/** Cost per trade (fee + spread), as a share of the value traded. */
export const FUND_COST = 0.002;
/** Assets held at most. */
export const FUND_PICKS = 5;
/** Minimum arena probability of a gain to buy. */
export const FUND_MIN_P = 0.55;

export const FUND_MANAGERS = [
  'sentShort',
  'sentMedium',
  'sentLong',
  'advisor',
  'logistic',
  'naiveBayes',
  'trend',
  'momentum',
  'meanReversion',
  'ensemble',
] as const;
export type FundManagerId = (typeof FUND_MANAGERS)[number];

/** Arena model behind each arena manager. */
export const ARENA_MANAGER_MODEL: Partial<Record<FundManagerId, string>> = {
  logistic: 'logistic',
  naiveBayes: 'naiveBayes',
  trend: 'trend',
  momentum: 'momentum',
  meanReversion: 'meanReversion',
  ensemble: 'ensemble',
};

export interface FundPosition {
  symbol: string;
  /** Value in US$ at the last mark. */
  value: number;
  /** Price (asset currency) and USD/IDR at the last mark. */
  price: number;
  fx: number;
  /** Day the position was opened. */
  since: string;
}

export interface FundTrade {
  date: string;
  symbol: string;
  side: 'buy' | 'sell';
  value: number;
}

export interface FundManager {
  cash: number;
  positions: FundPosition[];
  /** [date, value in US$] after each day's trades. */
  history: Array<[string, number]>;
  /** Most recent trades (newest last). */
  trades: FundTrade[];
}

export interface FundArenaState {
  version: 1;
  startDate: string;
  lastDate: string;
  managers: Record<FundManagerId, FundManager>;
  /** Buy and hold of the IDX Composite with the same US$100 (a yardstick, not a manager). */
  benchmark: { symbol: string; position: FundPosition | null; history: Array<[string, number]> };
}

/** A price for the day: quote currency decides whether the dollar conversion applies. */
export type FundQuote = { price: number; idr: boolean };

const KEEP_TRADES = 60;

const newManager = (date: string): FundManager => ({ cash: FUND_START_USD, positions: [], history: [[date, FUND_START_USD]], trades: [] });

/** One position marked to the day's price; unchanged when no price is known. */
export function markPosition(p: FundPosition, q: FundQuote | undefined, usdIdr: number): FundPosition {
  if (!q || !(q.price > 0) || !(p.price > 0)) return p;
  const fxFactor = q.idr && usdIdr > 0 && p.fx > 0 ? p.fx / usdIdr : 1;
  return { ...p, value: p.value * (q.price / p.price) * fxFactor, price: q.price, fx: usdIdr };
}

export const managerValue = (m: Pick<FundManager, 'cash' | 'positions'>) => m.cash + m.positions.reduce((a, p) => a + p.value, 0);

/**
 * Marks the manager to market, then moves to an equal-weight portfolio of `picks` (cash when
 * empty). Positions already held are resized only by the difference; every trade pays FUND_COST.
 */
export function rebalanceManager(
  m: FundManager,
  date: string,
  picks: string[],
  quotes: Record<string, FundQuote>,
  usdIdr: number
): FundManager {
  const marked = m.positions.map((p) => markPosition(p, quotes[p.symbol], usdIdr));
  const total = m.cash + marked.reduce((a, p) => a + p.value, 0);
  const wanted = [...new Set(picks)].filter((s) => quotes[s]?.price > 0).slice(0, FUND_PICKS);
  // Pay the trading cost out of the portfolio first, then split the rest equally
  const target = wanted.length ? total / wanted.length : 0;
  const held = new Map(marked.map((p) => [p.symbol, p]));
  let turnover = 0;
  for (const p of marked) if (!wanted.includes(p.symbol)) turnover += p.value;
  for (const s of wanted) turnover += Math.abs(target - (held.get(s)?.value ?? 0));
  const cost = turnover * FUND_COST;
  const net = total - cost;
  const each = wanted.length ? net / wanted.length : 0;
  const trades: FundTrade[] = [];
  for (const p of marked) if (!wanted.includes(p.symbol)) trades.push({ date, symbol: p.symbol, side: 'sell', value: p.value });
  const positions: FundPosition[] = wanted.map((s) => {
    const old = held.get(s);
    const diff = each - (old?.value ?? 0);
    if (!old) trades.push({ date, symbol: s, side: 'buy', value: each });
    else if (Math.abs(diff) > 0.01) trades.push({ date, symbol: s, side: diff > 0 ? 'buy' : 'sell', value: Math.abs(diff) });
    return { symbol: s, value: each, price: quotes[s].price, fx: usdIdr, since: old?.since ?? date };
  });
  const cash = wanted.length ? 0 : net;
  const history = [...m.history.filter(([d]) => d !== date), [date, cash + positions.reduce((a, p) => a + p.value, 0)] as [string, number]];
  return { cash, positions, history, trades: [...m.trades, ...trades].slice(-KEEP_TRADES) };
}

/** One day of the arena: every manager rebalances to its picks; the benchmark is marked. */
export function stepFundArena(
  state: FundArenaState | null,
  input: { date: string; usdIdr: number; quotes: Record<string, FundQuote>; picks: Partial<Record<FundManagerId, string[]>>; benchmark: string }
): FundArenaState {
  const { date, usdIdr, quotes } = input;
  const base: FundArenaState = state ?? {
    version: 1,
    startDate: date,
    lastDate: date,
    managers: Object.fromEntries(FUND_MANAGERS.map((id) => [id, newManager(date)])) as Record<FundManagerId, FundManager>,
    benchmark: { symbol: input.benchmark, position: null, history: [] },
  };
  const managers = { ...base.managers };
  for (const id of FUND_MANAGERS) managers[id] = rebalanceManager(managers[id] ?? newManager(date), date, input.picks[id] ?? [], quotes, usdIdr);
  // Benchmark: buy on the first day it has a price, then only mark
  const bq = quotes[base.benchmark.symbol];
  let position = base.benchmark.position;
  if (position) position = markPosition(position, bq, usdIdr);
  else if (bq?.price > 0) position = { symbol: base.benchmark.symbol, value: FUND_START_USD, price: bq.price, fx: usdIdr, since: date };
  const benchHistory = position ? [...base.benchmark.history.filter(([d]) => d !== date), [date, position.value] as [string, number]] : base.benchmark.history;
  return { ...base, lastDate: date, managers, benchmark: { ...base.benchmark, position, history: benchHistory } };
}

// ---- Picks ------------------------------------------------------------------------------------

type SentimentRow = { symbol: string; label: string; score: number };

/** Sentiment manager: the highest-scoring Bullish / Strong Bullish assets. */
export function sentimentPicks(rows: SentimentRow[], n = FUND_PICKS): string[] {
  return rows
    .filter((r) => r.label === 'Bullish' || r.label === 'Strong Bullish')
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
    .slice(0, n)
    .map((r) => r.symbol);
}

/** Arena manager: assets where the model's chance of a gain is at least FUND_MIN_P, highest first. */
export function probabilityPicks(rows: Array<{ symbol: string; p: number | null | undefined }>, n = FUND_PICKS): string[] {
  return rows
    .filter((r): r is { symbol: string; p: number } => typeof r.p === 'number' && r.p >= FUND_MIN_P)
    .sort((a, b) => b.p - a.p || a.symbol.localeCompare(b.symbol))
    .slice(0, n)
    .map((r) => r.symbol);
}

// ---- Board ------------------------------------------------------------------------------------

export interface FundBoardRow {
  id: FundManagerId;
  value: number;
  /** Return since the start, as a fraction. */
  ret: number;
  /** Largest fall from a previous high, as a fraction (≤ 0). */
  maxDrawdown: number;
  positions: FundPosition[];
  cash: number;
}

export function maxDrawdownOf(values: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    if (peak > 0) worst = Math.min(worst, v / peak - 1);
  }
  return worst;
}

/**
 * Leaderboard, best value first. With `live` quotes the holdings are valued at those prices
 * (between daily rebalances); without, at the last daily mark.
 */
export function fundBoard(state: FundArenaState, live?: { quotes: Record<string, FundQuote>; usdIdr: number }): FundBoardRow[] {
  return FUND_MANAGERS.map((id) => {
    const m = state.managers[id];
    const positions = live ? m.positions.map((p) => markPosition(p, live.quotes[p.symbol], live.usdIdr)) : m.positions;
    const value = m.cash + positions.reduce((a, p) => a + p.value, 0);
    const values = [...m.history.map(([, v]) => v), value];
    return {
      id,
      value,
      ret: value / FUND_START_USD - 1,
      maxDrawdown: maxDrawdownOf(values),
      positions,
      cash: m.cash,
    };
  }).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
}

export function parseFundArena(raw: unknown): FundArenaState | null {
  const s = raw as FundArenaState | null;
  if (!s || s.version !== 1 || !s.managers || typeof s.startDate !== 'string') return null;
  for (const id of FUND_MANAGERS) if (!s.managers[id]) s.managers[id] = newManager(s.lastDate);
  return s;
}
