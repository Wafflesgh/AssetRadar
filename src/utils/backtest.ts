/**
 * backtest.ts — A simple rule backtester on daily bars. Entry rules (all must hold) and exit
 * rules (any one is enough) are built from blocks: moving-average cross, price vs a moving
 * average, RSI above/below a level, N-day breakout; plus stop-loss / take-profit in %. Signals use
 * only data up to the day's close and are executed at the next day's open (no look-ahead);
 * stops are checked against each day's low/high (a gap fills at the open). Costs per side, lot
 * rounding (100 shares for IDX), equity curve, buy & hold, statistics and an in-sample vs
 * out-of-sample split. Past results do not guarantee future results.
 */
import { rsi, sma } from '../ai/indicators.ts';

export interface OhlcBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Condition =
  | { type: 'maCross'; fast: number; slow: number; dir: 'above' | 'below' }
  | { type: 'priceVsMa'; period: number; dir: 'above' | 'below' }
  | { type: 'rsi'; period: number; level: number; dir: 'above' | 'below' }
  | { type: 'breakout'; days: number; dir: 'high' | 'low' };

export interface Strategy {
  id: string;
  name: string;
  entry: Condition[];
  exit: Condition[];
  /** Percent, e.g. 8 = sell when 8 % below the entry price. */
  stopLossPct?: number;
  takeProfitPct?: number;
  /** Cost per side in percent (fee + tax), e.g. IDX buy 0.15, sell 0.25. */
  buyCostPct: number;
  sellCostPct: number;
  /** Shares per lot (100 for IDX); 0 = fractional units allowed (crypto). */
  lotSize: number;
  capital: number;
}

export interface Trade {
  entryDate: string;
  entryPrice: number;
  exitDate: string | null;
  exitPrice: number | null;
  quantity: number;
  /** Net return of the trade after both costs (null while open). */
  ret: number | null;
  reason: 'signal' | 'stop-loss' | 'take-profit' | 'open';
}

export interface EquityPoint {
  date: string;
  equity: number;
  buyHold: number;
}

export interface Stats {
  totalReturn: number;
  /** Compound annual growth; null under one year. */
  cagr: number | null;
  volatility: number | null;
  maxDrawdown: number;
  trades: number;
  winRate: number | null;
  avgTrade: number | null;
  /** Share of days with a position. */
  exposure: number;
}

export interface BacktestResult {
  equity: EquityPoint[];
  trades: Trade[];
  stats: Stats;
  buyHold: Stats;
  /** Indicator warm-up: first bar where every rule can be evaluated. */
  warmup: number;
}

export function describeCondition(c: Condition): string {
  switch (c.type) {
    case 'maCross':
      return `MA${c.fast} crosses ${c.dir} MA${c.slow}`;
    case 'priceVsMa':
      return `Close ${c.dir} MA${c.period}`;
    case 'rsi':
      return `RSI(${c.period}) ${c.dir} ${c.level}`;
    case 'breakout':
      return c.dir === 'high' ? `Close above the ${c.days}-day high` : `Close below the ${c.days}-day low`;
  }
}

/** Bars needed before a condition can be evaluated. */
export function conditionWarmup(c: Condition): number {
  switch (c.type) {
    case 'maCross':
      return Math.max(c.fast, c.slow);
    case 'priceVsMa':
      return c.period - 1;
    case 'rsi':
      return c.period;
    case 'breakout':
      return c.days;
  }
}

/** Is the condition true at the close of bar t? Uses closes[0..t] only. */
export function conditionAt(c: Condition, closes: number[], t: number): boolean {
  switch (c.type) {
    case 'maCross': {
      if (t < 1) return false;
      const f = sma(closes, t, c.fast);
      const s = sma(closes, t, c.slow);
      const fp = sma(closes, t - 1, c.fast);
      const sp = sma(closes, t - 1, c.slow);
      if (f === null || s === null || fp === null || sp === null) return false;
      return c.dir === 'above' ? f > s && fp <= sp : f < s && fp >= sp;
    }
    case 'priceVsMa': {
      const m = sma(closes, t, c.period);
      if (m === null) return false;
      return c.dir === 'above' ? closes[t] > m : closes[t] < m;
    }
    case 'rsi': {
      const r = rsi(closes, t, c.period);
      if (r === null) return false;
      return c.dir === 'above' ? r > c.level : r < c.level;
    }
    case 'breakout': {
      if (t < c.days) return false;
      let hi = -Infinity;
      let lo = Infinity;
      for (let i = t - c.days; i < t; i++) {
        hi = Math.max(hi, closes[i]);
        lo = Math.min(lo, closes[i]);
      }
      return c.dir === 'high' ? closes[t] > hi : closes[t] < lo;
    }
  }
}

/** Largest quantity affordable with `cash` at `price` including the buy cost, in whole lots. */
export function affordable(cash: number, price: number, costPct: number, lotSize: number): number {
  const raw = cash / (price * (1 + costPct / 100));
  if (lotSize <= 0) return raw > 0 ? raw : 0;
  return Math.floor(raw / lotSize + 1e-9) * lotSize;
}

function dailyReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) if (values[i - 1] > 0) out.push(values[i] / values[i - 1] - 1);
  return out;
}

export function computeStats(equity: number[], dates: string[], trades: Trade[], daysInMarket: number): Stats {
  const first = equity[0];
  const last = equity[equity.length - 1];
  const totalReturn = first > 0 ? last / first - 1 : 0;
  const days = dates.length > 1 ? (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86_400_000 : 0;
  const cagr = days >= 365 && first > 0 && last > 0 ? (last / first) ** (365.25 / days) - 1 : null;
  const rets = dailyReturns(equity);
  let volatility: number | null = null;
  if (rets.length >= 10) {
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    volatility = Math.sqrt((rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)) * 252);
  }
  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const v of equity) {
    peak = Math.max(peak, v);
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, v / peak - 1);
  }
  const closed = trades.filter((t) => t.ret !== null);
  return {
    totalReturn,
    cagr,
    volatility,
    maxDrawdown,
    trades: closed.length,
    winRate: closed.length ? closed.filter((t) => (t.ret as number) > 0).length / closed.length : null,
    avgTrade: closed.length ? closed.reduce((a, t) => a + (t.ret as number), 0) / closed.length : null,
    exposure: equity.length ? daysInMarket / equity.length : 0,
  };
}

/**
 * Runs the strategy on bars[from..to] (inclusive). Indicators may use earlier bars (warm-up),
 * trading starts at `from` with the full capital and no position.
 */
export function runBacktest(bars: OhlcBar[], strategy: Strategy, from = 0, to = bars.length - 1): BacktestResult {
  const closes = bars.map((b) => b.close);
  const warmup = Math.max(0, ...[...strategy.entry, ...strategy.exit].map(conditionWarmup));
  const start = Math.max(from, 0);
  const end = Math.min(to, bars.length - 1);
  const buyC = strategy.buyCostPct / 100;
  const sellC = strategy.sellCostPct / 100;
  let cash = strategy.capital;
  let qty = 0;
  let entryCost = 0;
  let pending: 'buy' | 'sell' | null = null;
  let open: Trade | null = null;
  let inMarket = 0;
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];

  // Buy & hold: everything at the first open, same costs and lot rounding
  const bhQty = start <= end ? affordable(strategy.capital, bars[start].open, strategy.buyCostPct, strategy.lotSize) : 0;
  const bhCash = start <= end ? strategy.capital - bhQty * bars[start].open * (1 + buyC) : strategy.capital;

  const sell = (t: number, price: number, reason: Trade['reason']) => {
    const proceeds = qty * price * (1 - sellC);
    cash += proceeds;
    if (open) {
      open.exitDate = bars[t].date;
      open.exitPrice = price;
      open.ret = entryCost > 0 ? proceeds / entryCost - 1 : null;
      open.reason = reason;
      trades.push(open);
    }
    open = null;
    qty = 0;
    entryCost = 0;
  };

  for (let t = start; t <= end; t++) {
    const bar = bars[t];
    // 1. Orders from yesterday's close execute at today's open
    if (pending === 'buy' && qty === 0) {
      const q = affordable(cash, bar.open, strategy.buyCostPct, strategy.lotSize);
      if (q > 0) {
        entryCost = q * bar.open * (1 + buyC);
        cash -= entryCost;
        qty = q;
        open = { entryDate: bar.date, entryPrice: bar.open, exitDate: null, exitPrice: null, quantity: q, ret: null, reason: 'open' };
      }
    } else if (pending === 'sell' && qty > 0) {
      sell(t, bar.open, 'signal');
    }
    pending = null;

    // 2. Stop-loss / take-profit during the day (stop first when both are touched)
    if (qty > 0 && open) {
      const entry = (open as Trade).entryPrice;
      const stop = strategy.stopLossPct ? entry * (1 - strategy.stopLossPct / 100) : null;
      const target = strategy.takeProfitPct ? entry * (1 + strategy.takeProfitPct / 100) : null;
      if (stop !== null && bar.low <= stop) sell(t, Math.min(bar.open, stop), 'stop-loss');
      else if (target !== null && bar.high >= target) sell(t, Math.max(bar.open, target), 'take-profit');
    }

    // 3. Signals at today's close → orders for tomorrow's open (never on the last bar)
    if (t >= warmup && t < end) {
      if (qty === 0 && strategy.entry.length && strategy.entry.every((c) => conditionAt(c, closes, t))) pending = 'buy';
      else if (qty > 0 && strategy.exit.some((c) => conditionAt(c, closes, t))) pending = 'sell';
    }

    if (qty > 0) inMarket++;
    equity.push({ date: bar.date, equity: cash + qty * bar.close, buyHold: bhCash + bhQty * bar.close });
  }
  if (open) trades.push(open);

  const dates = equity.map((e) => e.date);
  return {
    equity,
    trades,
    warmup,
    stats: computeStats(equity.map((e) => e.equity), dates, trades, inMarket),
    buyHold: computeStats(
      equity.map((e) => e.buyHold),
      dates,
      [],
      equity.length
    ),
  };
}

/** Index of the first bar on or after a date. */
export function indexFrom(bars: OhlcBar[], date: string): number {
  const i = bars.findIndex((b) => b.date >= date);
  return i < 0 ? bars.length : i;
}

/**
 * First half (in-sample) and second half (out-of-sample) of the chosen period, each run from a
 * flat start, so a rule that only worked in one half is visible.
 */
export function splitTest(bars: OhlcBar[], strategy: Strategy, from: number): { inSample: BacktestResult; outOfSample: BacktestResult; splitDate: string } | null {
  const end = bars.length - 1;
  if (end - from < 60) return null;
  const mid = from + Math.floor((end - from) / 2);
  return { inSample: runBacktest(bars, strategy, from, mid), outOfSample: runBacktest(bars, strategy, mid + 1, end), splitDate: bars[mid + 1].date };
}

/** Plain-English warnings about over-fitting and weak evidence. */
export function backtestWarnings(full: BacktestResult, split: ReturnType<typeof splitTest>): string[] {
  const w: string[] = [];
  if (full.stats.trades < 10) w.push(`Only ${full.stats.trades} closed trades — far too few to tell skill from luck.`);
  if (full.stats.totalReturn < full.buyHold.totalReturn) w.push('The rules did worse than simply buying and holding over this period.');
  if (split) {
    const is = split.inSample.stats.totalReturn;
    const oos = split.outOfSample.stats.totalReturn;
    if (is > 0 && oos <= 0) w.push('It made money in the first half but not in the second half — a typical sign of rules fitted to the past.');
    else if (is - oos > 0.2) w.push('The second half was much weaker than the first; the result depends strongly on the period chosen.');
    if (split.outOfSample.stats.totalReturn < split.outOfSample.buyHold.totalReturn) w.push('In the second half (out-of-sample) buy & hold did better.');
  }
  w.push('Trying many rule variants and keeping the best one makes the backtest look better than reality (over-fitting).');
  return w;
}

export function defaultCosts(group: string): { buyCostPct: number; sellCostPct: number; lotSize: number } {
  if (group === 'idStock') return { buyCostPct: 0.15, sellCostPct: 0.25, lotSize: 100 };
  if (group === 'crypto') return { buyCostPct: 0.3, sellCostPct: 0.3, lotSize: 0 };
  return { buyCostPct: 0.1, sellCostPct: 0.1, lotSize: 1 };
}

export function validateStrategy(s: Strategy): string[] {
  const errors: string[] = [];
  if (!s.entry.length) errors.push('Add at least one entry rule.');
  if (!s.exit.length && !s.stopLossPct && !s.takeProfitPct) errors.push('Add an exit rule, a stop-loss or a take-profit.');
  for (const c of [...s.entry, ...s.exit]) {
    if (c.type === 'maCross' && !(c.fast > 0 && c.slow > c.fast)) errors.push('For a moving-average cross the slow period must be longer than the fast one.');
    if (c.type === 'priceVsMa' && !(c.period >= 2)) errors.push('The moving-average period must be at least 2.');
    if (c.type === 'rsi' && !(c.period >= 2 && c.level > 0 && c.level < 100)) errors.push('RSI needs a period ≥ 2 and a level between 0 and 100.');
    if (c.type === 'breakout' && !(c.days >= 2)) errors.push('The breakout needs at least 2 days.');
  }
  if (!(s.capital > 0)) errors.push('Starting capital must be above 0.');
  if (s.buyCostPct < 0 || s.sellCostPct < 0) errors.push('Costs cannot be negative.');
  if (s.stopLossPct !== undefined && !(s.stopLossPct > 0 && s.stopLossPct < 100)) errors.push('Stop-loss must be between 0 and 100 %.');
  if (s.takeProfitPct !== undefined && !(s.takeProfitPct > 0)) errors.push('Take-profit must be above 0 %.');
  return [...new Set(errors)];
}

export function parseStrategies(raw: unknown): Strategy[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is Strategy => Boolean(s) && typeof s.id === 'string' && Array.isArray(s.entry) && Array.isArray(s.exit));
}
