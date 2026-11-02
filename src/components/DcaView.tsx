/**
 * DcaView.tsx — Saving-plan simulator page (#/dca): "what if I had put RpX into this every month
 * for N years?" for up to three assets side by side, on real daily closes (fetched from
 * /api/market/daily; dollar assets are converted at each month's USD/IDR rate). Shows the value of
 * each plan against the money put in, the yearly return, the deepest dip along the way and how a
 * single lump sum would have done. Choices are remembered on this device. Education only.
 */
import { useEffect, useMemo, useState } from 'react';
import { PiggyBank, X } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getAssetBySymbol, type AssetConfig, type PriceTick } from '../config/assets.ts';
import { fetchDailyHistory } from '../services/marketDataService.ts';
import { simulateDca, type DcaBar, type DcaResult } from '../utils/dca.ts';
import { paperFeeRate } from '../utils/paperTrading.ts';
import { getDcaPrefsRaw, saveDcaPrefs } from '../utils/storage.ts';
import { useT } from '../i18n/index.ts';
import { Rich } from '../i18n/Rich.tsx';
import { assetShortName } from '../i18n/assetNames.ts';
import { formatIdrCompact, formatNumber, formatPercent, formatRupiah } from '../utils/format.ts';
import { AssetSearch } from './AssetSearch.tsx';

const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
const muted = { color: 'var(--text-secondary)' };
const COLORS = ['#38BDF8', '#F5C451', '#A78BFA'];
const YEARS = [1, 3, 5, 10] as const;
const AMOUNTS = [500_000, 1_000_000, 2_500_000, 5_000_000];
const MAX_ASSETS = 3;
const DEFAULT_PREFS = { symbols: ['^JKSE', 'XAU/USD', 'BTC/IDR'], monthly: 1_000_000, years: 5 as (typeof YEARS)[number] };
const simulable = (a: AssetConfig) => Boolean(a.yahooSymbol || a.indodaxPair) && fxSymbolFor(a) !== undefined;

/** Rate series an asset's prices need to become Rupiah: null = already Rupiah (or index points). */
function fxSymbolFor(asset: AssetConfig): string | null | undefined {
  if (asset.currency === 'IDR' || asset.currency === 'PTS') return null;
  const cur = asset.currency === 'USX' ? 'USD' : asset.currency;
  return getAssetBySymbol(`${cur}/IDR`) ? `${cur}/IDR` : undefined;
}

function loadPrefs(): typeof DEFAULT_PREFS {
  const raw = getDcaPrefsRaw() as Partial<typeof DEFAULT_PREFS> | null;
  const symbols = Array.isArray(raw?.symbols) ? raw!.symbols.filter((s) => typeof s === 'string' && getAssetBySymbol(s)).slice(0, MAX_ASSETS) : DEFAULT_PREFS.symbols;
  return {
    symbols: symbols.length ? symbols : DEFAULT_PREFS.symbols,
    monthly: typeof raw?.monthly === 'number' && raw.monthly > 0 ? raw.monthly : DEFAULT_PREFS.monthly,
    years: YEARS.includes(raw?.years as (typeof YEARS)[number]) ? (raw!.years as (typeof YEARS)[number]) : DEFAULT_PREFS.years,
  };
}

type Run = { status: 'loading' } | { status: 'error' } | { status: 'ready'; result: DcaResult | null };

async function runPlan(asset: AssetConfig, monthly: number, years: number): Promise<DcaResult | null> {
  const fxSymbol = fxSymbolFor(asset);
  const [hist, fxHist] = await Promise.all([fetchDailyHistory(asset.symbol), fxSymbol ? fetchDailyHistory(fxSymbol) : Promise.resolve(null)]);
  const scale = asset.currency === 'USX' ? 0.01 : 1;
  const bars: DcaBar[] = hist.bars.map((b) => ({ date: b.date, close: b.close * scale }));
  const fx: DcaBar[] | null = fxHist ? fxHist.bars.map((b) => ({ date: b.date, close: b.close })) : null;
  return simulateDca({ bars, fx, monthly, years, feeRate: paperFeeRate(asset, 'buy') });
}

export function DcaView({ ticks }: { ticks: Record<string, PriceTick> }) {
  const t = useT();
  const [prefs, setPrefs] = useState(loadPrefs);
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [customAmount, setCustomAmount] = useState('');
  const update = (next: Partial<typeof DEFAULT_PREFS>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    saveDcaPrefs(merged);
  };

  useEffect(() => {
    let alive = true;
    for (const symbol of prefs.symbols) {
      const asset = getAssetBySymbol(symbol);
      if (!asset) continue;
      setRuns((r) => ({ ...r, [symbol]: { status: 'loading' } }));
      runPlan(asset, prefs.monthly, prefs.years)
        .then((result) => alive && setRuns((r) => ({ ...r, [symbol]: { status: 'ready', result } })))
        .catch(() => alive && setRuns((r) => ({ ...r, [symbol]: { status: 'error' } })));
    }
    return () => {
      alive = false;
    };
  }, [prefs]);

  // One row per month with each plan's value (the money put in is the same for every plan)
  const chart = useMemo(() => {
    const byMonth = new Map<string, Record<string, number | string>>();
    prefs.symbols.forEach((symbol, i) => {
      const run = runs[symbol];
      if (run?.status !== 'ready' || !run.result) return;
      for (const p of run.result.points) {
        const m = p.date.slice(0, 7);
        const row = byMonth.get(m) ?? { month: m };
        row[`v${i}`] = Math.round(p.value);
        row.invested = Math.max(Number(row.invested ?? 0), p.invested);
        byMonth.set(m, row);
      }
    });
    return [...byMonth.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)));
  }, [runs, prefs.symbols]);

  return (
    <div className="space-y-5">
      <p className="text-xs rounded-lg border p-3" style={{ borderColor: 'var(--color-gold)', color: 'var(--text-primary)' }}>
        <Rich text={t('dca.disclaimer')} />
      </p>
      <header className="space-y-1">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <PiggyBank className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} /> {t('dca.title')}
        </h2>
        <p className="text-sm max-w-3xl" style={muted}>
          {t('dca.intro')}
        </p>
      </header>

      <section className="rounded-2xl border p-4 space-y-4" style={card}>
        <div className="space-y-2">
          <p className="text-xs font-semibold" style={muted}>
            {t('dca.monthly')}
          </p>
          <div className="flex flex-wrap gap-2">
            {AMOUNTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setCustomAmount('');
                  update({ monthly: v });
                }}
                className="px-3 py-1.5 rounded-lg border text-sm font-semibold font-mono-num"
                style={prefs.monthly === v ? { borderColor: 'var(--accent-radar)', color: 'var(--accent-radar)', backgroundColor: 'var(--accent-radar-soft)' } : card}
              >
                {formatIdrCompact(v)}
              </button>
            ))}
            <input
              type="number"
              inputMode="numeric"
              min="10000"
              step="10000"
              placeholder={t('dca.other')}
              aria-label={t('dca.otherAria')}
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              onBlur={() => Number(customAmount) >= 10_000 && update({ monthly: Math.round(Number(customAmount)) })}
              onKeyDown={(e) => e.key === 'Enter' && Number(customAmount) >= 10_000 && update({ monthly: Math.round(Number(customAmount)) })}
              className="w-32 px-3 py-1.5 rounded-lg border text-sm font-mono-num"
              style={{ backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold" style={muted}>
            {t('dca.period')}
          </p>
          <div className="flex flex-wrap gap-2">
            {YEARS.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => update({ years: y })}
                className="px-3 py-1.5 rounded-lg border text-sm font-semibold"
                style={prefs.years === y ? { borderColor: 'var(--accent-radar)', color: 'var(--accent-radar)', backgroundColor: 'var(--accent-radar-soft)' } : card}
              >
                {t('dca.years', { n: y })}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold" style={muted}>
            {t('dca.assets', { max: MAX_ASSETS })}
          </p>
          <div className="flex flex-wrap gap-2">
            {prefs.symbols.map((s, i) => {
              const a = getAssetBySymbol(s);
              return (
                <span key={s} className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-lg border text-sm font-semibold" style={{ borderColor: COLORS[i], color: 'var(--text-primary)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }} aria-hidden />
                  {a ? assetShortName(a) : s}
                  <button type="button" onClick={() => update({ symbols: prefs.symbols.filter((x) => x !== s) })} className="p-1 rounded" aria-label={t('dca.remove', { name: a ? assetShortName(a) : s })}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              );
            })}
          </div>
          {prefs.symbols.length < MAX_ASSETS && (
            <div className="max-w-sm">
              <AssetSearch
                ticks={ticks}
                filter={simulable}
                label={t('dca.add')}
                placeholder={t('dca.add')}
                onSelect={(a) => !prefs.symbols.includes(a.symbol) && update({ symbols: [...prefs.symbols, a.symbol] })}
              />
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        {prefs.symbols.map((s, i) => {
          const a = getAssetBySymbol(s);
          const run = runs[s];
          return (
            <section key={s} className="rounded-2xl border p-4 space-y-2 min-w-0" style={{ ...card, borderTop: `3px solid ${COLORS[i]}` }}>
              <h3 className="font-bold truncate">{a ? assetShortName(a) : s}</h3>
              {!run || run.status === 'loading' ? (
                <div className="skeleton h-28 rounded-xl" aria-busy="true" aria-label={t('common.loading')} />
              ) : run.status === 'error' || !run.result ? (
                <p className="text-sm" style={muted}>
                  {run.status === 'error' ? t('common.dataUnavailable') : t('dca.tooShort')}
                </p>
              ) : (
                <ResultCard result={run.result} years={prefs.years} />
              )}
            </section>
          );
        })}
      </div>

      {chart.length > 1 && (
        <section className="rounded-2xl border p-4 space-y-2" style={card}>
          <h3 className="font-bold">{t('dca.chartTitle')}</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 5, right: 8, bottom: 0, left: 4 }}>
                <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickFormatter={(v: number) => formatIdrCompact(v)} width={64} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', fontSize: 12 }}
                  formatter={(v, name) => [formatRupiah(Number(v), 0), String(name)]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="stepAfter" dataKey="invested" name={t('dca.invested')} dot={false} strokeWidth={2} stroke="var(--text-secondary)" strokeDasharray="5 4" isAnimationActive={false} />
                {prefs.symbols.map((s, i) => {
                  const a = getAssetBySymbol(s);
                  return <Line key={s} type="monotone" dataKey={`v${i}`} name={a ? assetShortName(a) : s} dot={false} strokeWidth={2} stroke={COLORS[i]} isAnimationActive={false} connectNulls />;
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs" style={muted}>
            {t('dca.chartNote')}
          </p>
        </section>
      )}
    </div>
  );
}

function ResultCard({ result, years }: { result: DcaResult; years: number }) {
  const t = useT();
  const toneOf = (v: number) => (v >= 0 ? 'var(--color-up)' : 'var(--color-down)');
  return (
    <div className="space-y-2">
      <p className="font-mono-num text-xl font-bold">{formatRupiah(result.value, 0)}</p>
      <p className="text-xs" style={muted}>
        {t('dca.fromInvested', { invested: formatRupiah(result.invested, 0), buys: result.buys })}
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt style={muted}>{t('dca.totalReturn')}</dt>
        <dd className="text-right font-mono-num font-semibold" style={{ color: toneOf(result.ret) }}>
          {formatPercent(result.ret * 100)}
        </dd>
        <dt style={muted}>{t('dca.perYear')}</dt>
        <dd className="text-right font-mono-num">{result.annualized === null ? '—' : formatPercent(result.annualized * 100)}</dd>
        <dt style={muted}>{t('dca.deepestDip')}</dt>
        <dd className="text-right font-mono-num" style={{ color: 'var(--color-down)' }}>
          {formatPercent(result.maxDrawdown * 100)}
        </dd>
        <dt style={muted}>{t('dca.lumpSum')}</dt>
        <dd className="text-right font-mono-num" style={{ color: toneOf(result.lumpSum.ret) }}>
          {formatPercent(result.lumpSum.ret * 100)}
        </dd>
      </dl>
      {result.startDate.slice(0, 4) > String(new Date().getFullYear() - years) && (
        <p className="text-[11px]" style={muted}>
          {t('dca.shorterHistory', { date: result.startDate })}
        </p>
      )}
      <p className="text-[11px]" style={muted}>
        {t('dca.units', { units: formatNumber(result.units, result.units < 10 ? 6 : 2) })}
      </p>
    </div>
  );
}
