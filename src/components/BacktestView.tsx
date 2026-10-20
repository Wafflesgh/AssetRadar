/**
 * BacktestView.tsx — "Test your own strategy" (#/backtest): pick an asset (core assets or any IDX
 * stock) and a period of up to ~5 years of daily bars, build entry rules (all must hold) and exit
 * rules (any one) from simple blocks — moving-average cross, price vs moving average, RSI, N-day
 * breakout — plus stop-loss / take-profit, costs and lot size. Shows the equity curve against buy &
 * hold, return, yearly return, volatility, max drawdown, win rate, trades, the in-sample vs
 * out-of-sample halves and over-fitting warnings. Strategies can be saved (synced). Past results
 * do not guarantee future results.
 */
import { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Play, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getAssetBySymbol, type PriceTick } from '../config/assets.ts';
import { fetchDailyHistory, type DailyHistory } from '../services/marketDataService.ts';
import { onSyncApplied } from '../services/syncService.ts';
import {
  backtestWarnings,
  defaultCosts,
  describeCondition,
  indexFrom,
  parseStrategies,
  runBacktest,
  splitTest,
  validateStrategy,
  type BacktestResult,
  type Condition,
  type Stats,
  type Strategy,
} from '../utils/backtest.ts';
import { getStrategiesRaw, saveStrategies } from '../utils/storage.ts';
import { AssetSearch } from './AssetSearch.tsx';

const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
const muted = { color: 'var(--text-secondary)' };
const inputStyle = { backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' };
const PERIODS = [
  { label: '1Y', years: 1 },
  { label: '2Y', years: 2 },
  { label: '3Y', years: 3 },
  { label: '5Y', years: 5 },
];
const pct = (v: number | null | undefined, digits = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`);

const TEMPLATES: Record<Condition['type'], Condition> = {
  maCross: { type: 'maCross', fast: 20, slow: 50, dir: 'above' },
  priceVsMa: { type: 'priceVsMa', period: 50, dir: 'above' },
  rsi: { type: 'rsi', period: 14, level: 30, dir: 'below' },
  breakout: { type: 'breakout', days: 20, dir: 'high' },
};

function newStrategy(group: string): Strategy {
  return {
    id: `st-${Date.now().toString(36)}`,
    name: 'MA 20/50 trend',
    entry: [{ type: 'maCross', fast: 20, slow: 50, dir: 'above' }],
    exit: [{ type: 'maCross', fast: 20, slow: 50, dir: 'below' }],
    stopLossPct: undefined,
    takeProfitPct: undefined,
    ...defaultCosts(group),
    capital: 10_000_000,
  };
}

export function BacktestView({ ticks }: { ticks: Record<string, PriceTick> }) {
  const [symbol, setSymbol] = useState('^JKSE');
  const asset = getAssetBySymbol(symbol);
  const [years, setYears] = useState(3);
  const [strategy, setStrategy] = useState<Strategy>(() => newStrategy('index'));
  const [saved, setSaved] = useState<Strategy[]>(() => parseStrategies(getStrategiesRaw()));
  const [history, setHistory] = useState<DailyHistory | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const [ran, setRan] = useState<{ strategy: Strategy; years: number; symbol: string } | null>(null);

  useEffect(() => onSyncApplied(['strategies'], () => setSaved(parseStrategies(getStrategiesRaw()))), []);
  useEffect(() => {
    let alive = true;
    setState('loading');
    setHistory(null);
    fetchDailyHistory(symbol)
      .then((h) => {
        if (!alive) return;
        setHistory(h);
        setState('idle');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [symbol, retry]);

  const pickAsset = (sym: string) => {
    const a = getAssetBySymbol(sym);
    setSymbol(sym);
    setRan(null);
    if (a) setStrategy((s) => ({ ...s, ...defaultCosts(a.group) }));
  };

  const errors = validateStrategy(strategy);
  const result = useMemo(() => {
    if (!ran || !history || history.symbol !== ran.symbol || history.bars.length < 60) return null;
    const bars = history.bars;
    const last = bars[bars.length - 1].date;
    const startDate = new Date(Date.parse(last) - ran.years * 365.25 * 86_400_000).toISOString().slice(0, 10);
    const from = indexFrom(bars, startDate);
    const full = runBacktest(bars, ran.strategy, from);
    const split = splitTest(bars, ran.strategy, from);
    return { full, split, warnings: backtestWarnings(full, split), from, firstDate: bars[from]?.date, historyStart: bars[0].date };
  }, [ran, history]);

  const persist = (list: Strategy[]) => {
    saveStrategies(list);
    setSaved(list);
  };
  const saveCurrent = () => {
    const exists = saved.some((s) => s.id === strategy.id);
    persist(exists ? saved.map((s) => (s.id === strategy.id ? strategy : s)) : [...saved, strategy]);
  };

  const setRule = (side: 'entry' | 'exit', i: number, c: Condition) => setStrategy((s) => ({ ...s, [side]: s[side].map((x, k) => (k === i ? c : x)) }));
  const removeRule = (side: 'entry' | 'exit', i: number) => setStrategy((s) => ({ ...s, [side]: s[side].filter((_, k) => k !== i) }));
  const addRule = (side: 'entry' | 'exit') => setStrategy((s) => ({ ...s, [side]: [...s[side], { ...TEMPLATES.priceVsMa, dir: side === 'entry' ? 'above' : 'below' } as Condition] }));
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const currency = asset?.currency === 'IDR' ? 'Rp' : asset?.currency === 'USX' ? 'US cents' : asset?.currency === 'PTS' ? 'index points' : asset?.currency ?? '';
  const chartData = result?.full.equity.map((e) => ({ date: e.date, Strategy: Math.round(e.equity), 'Buy & hold': Math.round(e.buyHold) }));

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
          <FlaskConical className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} /> Test your own strategy
        </h1>
        <p className="text-sm" style={muted}>
          Build simple rules and see how they would have done on daily prices. <strong>Past results do not guarantee future results.</strong>
        </p>
      </header>

      <section className="p-3 md:p-4 rounded-xl border space-y-3" style={card} aria-label="Asset and period">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <span className="text-xs font-semibold block" style={muted}>
              Asset
            </span>
            <AssetSearch onSelect={(a) => pickAsset(a.symbol)} selected={asset} ticks={ticks} label="Asset to test" limit={6} />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold block" style={muted}>
              Period
            </span>
            <div className="flex gap-1" role="group" aria-label="Period">
              {PERIODS.map((p) => (
                <button key={p.label} type="button" onClick={() => setYears(p.years)} aria-pressed={years === p.years} className="px-3 py-1.5 rounded-md text-xs font-semibold font-mono-num border" style={{ borderColor: years === p.years ? 'var(--accent-radar)' : 'var(--border-subtle)', color: years === p.years ? 'var(--accent-radar)' : 'var(--text-primary)' }}>
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-[11px]" style={muted}>
              {state === 'loading' && 'Loading daily prices…'}
              {state === 'idle' && history && `${history.bars.length} daily bars from ${history.bars[0]?.date} (${history.source}).`}
            </p>
          </div>
        </div>
        {state === 'error' && (
          <div className="flex items-center gap-2 text-xs">
            <span style={{ color: 'var(--color-down)' }}>Data unavailable.</span>
            <button type="button" onClick={() => setRetry((n) => n + 1)} className="inline-flex items-center gap-1 px-2 py-1 rounded border font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
              <RefreshCw className="w-3 h-3" /> Try again
            </button>
          </div>
        )}
      </section>

      <section className="p-3 md:p-4 rounded-xl border space-y-3" style={card} aria-label="Rules">
        <div className="flex flex-wrap items-center gap-2">
          <input value={strategy.name} onChange={(e) => setStrategy({ ...strategy, name: e.target.value })} aria-label="Strategy name" className="flex-1 min-w-[10rem] px-3 py-1.5 rounded-lg border text-sm font-semibold" style={inputStyle} />
          <select
            value=""
            onChange={(e) => {
              const s = saved.find((x) => x.id === e.target.value);
              if (s) {
                setStrategy(s);
                setRan(null);
              }
            }}
            aria-label="Load a saved strategy"
            className="px-2 py-1.5 rounded-lg border text-xs"
            style={inputStyle}
          >
            <option value="">Saved strategies ({saved.length})</option>
            {saved.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {(['entry', 'exit'] as const).map((side) => (
          <div key={side} className="space-y-1.5">
            <h2 className="text-sm font-bold">{side === 'entry' ? 'Buy when ALL of these are true (at the close)' : 'Sell when ANY of these is true (at the close)'}</h2>
            {strategy[side].map((c, i) => (
              <RuleEditor key={i} rule={c} onChange={(r) => setRule(side, i, r)} onRemove={() => removeRule(side, i)} />
            ))}
            <button type="button" onClick={() => addRule(side)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
              <Plus className="w-3 h-3" /> Add rule
            </button>
          </div>
        ))}

        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
          <NumField label="Stop-loss %" value={strategy.stopLossPct} onChange={(v) => setStrategy({ ...strategy, stopLossPct: num(v) })} placeholder="none" />
          <NumField label="Take-profit %" value={strategy.takeProfitPct} onChange={(v) => setStrategy({ ...strategy, takeProfitPct: num(v) })} placeholder="none" />
          <NumField label="Buy cost %" value={strategy.buyCostPct} onChange={(v) => setStrategy({ ...strategy, buyCostPct: num(v) ?? 0 })} />
          <NumField label="Sell cost %" value={strategy.sellCostPct} onChange={(v) => setStrategy({ ...strategy, sellCostPct: num(v) ?? 0 })} />
          <NumField label="Lot size (0 = fractional)" value={strategy.lotSize} onChange={(v) => setStrategy({ ...strategy, lotSize: Math.max(0, Math.floor(num(v) ?? 0)) })} />
          <NumField label={`Capital (${currency})`} value={strategy.capital} onChange={(v) => setStrategy({ ...strategy, capital: num(v) ?? 0 })} />
        </div>
        <p className="text-[11px]" style={muted}>
          IDX defaults: buy 0.15%, sell 0.25% (broker fee + tax), 1 lot = 100 shares. For crypto and US stocks enter your own broker's costs.
          Signals use the day's close; orders fill at the next day's open. Stop-loss and take-profit are checked against each day's low/high.
        </p>

        {errors.length > 0 && (
          <ul className="text-xs font-semibold" role="alert" style={{ color: 'var(--color-down)' }}>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={errors.length > 0 || !history} onClick={() => setRan({ strategy, years, symbol })} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40" style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}>
            <Play className="w-4 h-4" /> Run backtest
          </button>
          <button type="button" disabled={errors.length > 0} onClick={saveCurrent} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border disabled:opacity-40" style={{ borderColor: 'var(--border-subtle)' }}>
            <Save className="w-4 h-4" /> Save strategy
          </button>
          {saved.some((s) => s.id === strategy.id) && (
            <button type="button" onClick={() => { persist(saved.filter((s) => s.id !== strategy.id)); setStrategy({ ...strategy, id: `st-${Date.now().toString(36)}` }); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border" style={{ borderColor: 'var(--border-subtle)', color: 'var(--color-down)' }}>
              <Trash2 className="w-4 h-4" /> Delete saved
            </button>
          )}
          <button type="button" onClick={() => { setStrategy(newStrategy(asset?.group ?? 'index')); setRan(null); }} className="px-3 py-2 rounded-lg text-sm font-semibold border" style={{ borderColor: 'var(--border-subtle)' }}>
            New
          </button>
        </div>
      </section>

      {ran && !result && history && history.bars.length < 60 && <p className="text-sm">Not enough price history for this asset.</p>}

      {result && (
        <section className="p-3 md:p-4 rounded-xl border space-y-4" style={card} aria-labelledby="bt-results">
          <div>
            <h2 id="bt-results" className="text-base font-bold">
              Results · {asset?.shortName} · {result.firstDate} → {result.full.equity[result.full.equity.length - 1]?.date}
            </h2>
            {result.from === 0 ? (
              <p className="text-xs" style={muted}>
                Price history starts on {result.historyStart}; the test covers what is available.
              </p>
            ) : null}
          </div>
          {chartData && chartData.length > 1 && (
            <div className="h-60 md:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} minTickGap={40} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} domain={['auto', 'auto']} tickFormatter={(v) => Number(v).toLocaleString('en-US', { notation: 'compact' })} width={48} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', fontSize: 12 }} formatter={(v) => Number(v).toLocaleString('en-US')} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Strategy" dot={false} strokeWidth={2} stroke="#38BDF8" isAnimationActive={false} />
                  <Line type="monotone" dataKey="Buy & hold" dot={false} strokeWidth={1.5} stroke="#F59E0B" isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr style={muted}>
                  <th className="p-2 text-left font-semibold" />
                  <th className="p-2 text-right font-semibold">Strategy</th>
                  <th className="p-2 text-right font-semibold">Buy & hold</th>
                  {result.split && <th className="p-2 text-right font-semibold">1st half (in-sample)</th>}
                  {result.split && <th className="p-2 text-right font-semibold">2nd half (out-of-sample)</th>}
                </tr>
              </thead>
              <tbody>
                {statRows.map((row) => (
                  <tr key={row.label} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="p-2" style={muted}>
                      {row.label}
                    </td>
                    <td className="p-2 text-right font-mono-num">{row.get(result.full.stats)}</td>
                    <td className="p-2 text-right font-mono-num">{row.bh ? row.get(result.full.buyHold) : '—'}</td>
                    {result.split && <td className="p-2 text-right font-mono-num">{row.get(result.split.inSample.stats)}</td>}
                    {result.split && <td className="p-2 text-right font-mono-num">{row.get(result.split.outOfSample.stats)}</td>}
                  </tr>
                ))}
                {result.split && (
                  <tr className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="p-2" style={muted}>
                      Buy & hold in that half
                    </td>
                    <td className="p-2" />
                    <td className="p-2" />
                    <td className="p-2 text-right font-mono-num">{pct(result.split.inSample.buyHold.totalReturn)}</td>
                    <td className="p-2 text-right font-mono-num">{pct(result.split.outOfSample.buyHold.totalReturn)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 rounded-lg text-xs space-y-1" style={{ backgroundColor: 'var(--color-gold-soft)', color: 'var(--text-primary)' }} role="note">
            <p className="font-semibold">Read this before trusting the result</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
              <li>Past results do not guarantee future results. This is an educational tool, not investment advice.</li>
            </ul>
          </div>

          <TradesTable result={result.full} currency={currency} />
          <p className="text-[11px]" style={muted}>
            Rules: buy when {ran?.strategy.entry.map(describeCondition).join(' and ')}; sell when {ran?.strategy.exit.map(describeCondition).join(' or ') || 'stop/target is hit'}
            {ran?.strategy.stopLossPct ? `; stop-loss ${ran.strategy.stopLossPct}%` : ''}
            {ran?.strategy.takeProfitPct ? `; take-profit ${ran.strategy.takeProfitPct}%` : ''}. Dividends are not included; prices are not adjusted for
            every corporate action.
          </p>
        </section>
      )}
    </div>
  );
}

const statRows: Array<{ label: string; get: (s: Stats) => string; bh: boolean }> = [
  { label: 'Total return', get: (s) => pct(s.totalReturn), bh: true },
  { label: 'Per year', get: (s) => (s.cagr === null ? 'Under 1 year' : pct(s.cagr)), bh: true },
  { label: 'Volatility per year', get: (s) => pct(s.volatility).replace('+', ''), bh: true },
  { label: 'Max drawdown', get: (s) => pct(s.maxDrawdown), bh: true },
  { label: 'Closed trades', get: (s) => String(s.trades), bh: false },
  { label: 'Win rate', get: (s) => (s.winRate === null ? '—' : `${(s.winRate * 100).toFixed(0)}%`), bh: false },
  { label: 'Average trade', get: (s) => pct(s.avgTrade), bh: false },
  { label: 'Time in the market', get: (s) => `${(s.exposure * 100).toFixed(0)}%`, bh: false },
];

function NumField({ label, value, onChange, placeholder }: { label: string; value: number | undefined; onChange: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => setText(value === undefined ? '' : String(value)), [value]);
  return (
    <label className="space-y-1">
      <span className="block" style={muted}>
        {label}
      </span>
      <input
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(text)}
        className="w-full px-2 py-1.5 rounded border font-mono-num"
        style={inputStyle}
      />
    </label>
  );
}

function RuleEditor({ rule, onChange, onRemove }: { rule: Condition; onChange: (c: Condition) => void; onRemove: () => void }) {
  const n = (v: string) => Math.max(1, Math.floor(Number(v) || 1));
  const small = 'w-16 px-2 py-1 rounded border font-mono-num';
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs p-2 rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
      <select value={rule.type} onChange={(e) => onChange(TEMPLATES[e.target.value as Condition['type']])} aria-label="Rule type" className="px-2 py-1 rounded border" style={inputStyle}>
        <option value="maCross">Moving-average cross</option>
        <option value="priceVsMa">Price vs moving average</option>
        <option value="rsi">RSI</option>
        <option value="breakout">N-day breakout</option>
      </select>
      {rule.type === 'maCross' && (
        <>
          <span>MA</span>
          <input aria-label="Fast period" className={small} style={inputStyle} value={rule.fast} onChange={(e) => onChange({ ...rule, fast: n(e.target.value) })} />
          <select aria-label="Direction" value={rule.dir} onChange={(e) => onChange({ ...rule, dir: e.target.value as 'above' | 'below' })} className="px-2 py-1 rounded border" style={inputStyle}>
            <option value="above">crosses above</option>
            <option value="below">crosses below</option>
          </select>
          <span>MA</span>
          <input aria-label="Slow period" className={small} style={inputStyle} value={rule.slow} onChange={(e) => onChange({ ...rule, slow: n(e.target.value) })} />
        </>
      )}
      {rule.type === 'priceVsMa' && (
        <>
          <span>Close</span>
          <select aria-label="Direction" value={rule.dir} onChange={(e) => onChange({ ...rule, dir: e.target.value as 'above' | 'below' })} className="px-2 py-1 rounded border" style={inputStyle}>
            <option value="above">above</option>
            <option value="below">below</option>
          </select>
          <span>MA</span>
          <input aria-label="Period" className={small} style={inputStyle} value={rule.period} onChange={(e) => onChange({ ...rule, period: n(e.target.value) })} />
        </>
      )}
      {rule.type === 'rsi' && (
        <>
          <span>RSI</span>
          <input aria-label="RSI period" className={small} style={inputStyle} value={rule.period} onChange={(e) => onChange({ ...rule, period: n(e.target.value) })} />
          <select aria-label="Direction" value={rule.dir} onChange={(e) => onChange({ ...rule, dir: e.target.value as 'above' | 'below' })} className="px-2 py-1 rounded border" style={inputStyle}>
            <option value="above">above</option>
            <option value="below">below</option>
          </select>
          <input aria-label="RSI level" className={small} style={inputStyle} value={rule.level} onChange={(e) => onChange({ ...rule, level: Math.min(99, n(e.target.value)) })} />
        </>
      )}
      {rule.type === 'breakout' && (
        <>
          <span>Close</span>
          <select aria-label="Direction" value={rule.dir} onChange={(e) => onChange({ ...rule, dir: e.target.value as 'high' | 'low' })} className="px-2 py-1 rounded border" style={inputStyle}>
            <option value="high">above the highest close of</option>
            <option value="low">below the lowest close of</option>
          </select>
          <input aria-label="Days" className={small} style={inputStyle} value={rule.days} onChange={(e) => onChange({ ...rule, days: n(e.target.value) })} />
          <span>days</span>
        </>
      )}
      <button type="button" onClick={onRemove} aria-label="Remove rule" className="ml-auto p-1" style={{ color: 'var(--color-down)' }}>
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function TradesTable({ result, currency }: { result: BacktestResult; currency: string }) {
  const [all, setAll] = useState(false);
  const list = [...result.trades].reverse();
  const shown = all ? list : list.slice(0, 20);
  if (list.length === 0) return <p className="text-xs" style={muted}>No trades in this period.</p>;
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-bold">Trades ({list.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr style={muted}>
              <th className="p-1.5 text-left font-semibold">Bought</th>
              <th className="p-1.5 text-right font-semibold">Price ({currency})</th>
              <th className="p-1.5 text-left font-semibold">Sold</th>
              <th className="p-1.5 text-right font-semibold">Price</th>
              <th className="p-1.5 text-right font-semibold">Quantity</th>
              <th className="p-1.5 text-right font-semibold">Return</th>
              <th className="p-1.5 text-left font-semibold">Why</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t, i) => (
              <tr key={`${t.entryDate}-${i}`} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <td className="p-1.5 font-mono-num">{t.entryDate}</td>
                <td className="p-1.5 text-right font-mono-num">{t.entryPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
                <td className="p-1.5 font-mono-num">{t.exitDate ?? 'still open'}</td>
                <td className="p-1.5 text-right font-mono-num">{t.exitPrice === null ? '—' : t.exitPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
                <td className="p-1.5 text-right font-mono-num">{t.quantity.toLocaleString('en-US', { maximumFractionDigits: 6 })}</td>
                <td className="p-1.5 text-right font-mono-num" style={{ color: t.ret === null ? undefined : t.ret > 0 ? 'var(--color-up)' : 'var(--color-down)' }}>
                  {pct(t.ret)}
                </td>
                <td className="p-1.5">{t.reason === 'open' ? 'open' : t.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length > 20 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-xs underline" style={muted}>
          {all ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}
    </div>
  );
}
