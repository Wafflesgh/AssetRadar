/**
 * QuantSimView.tsx — Quantitative portfolio allocation simulator (#/quant): blend a value and a
 * momentum factor portfolio with a slider (e.g. 20% / 50% value) and see the combined
 * portfolio's annual return, volatility, Sharpe ratio and maximum drawdown, the value–momentum
 * correlation ρ, and a growth chart of combined vs pure value vs pure momentum vs an
 * equal-weight benchmark. Universes: US / Indonesian stocks, world indices, currencies,
 * commodities, or all non-stock classes together ("everywhere"). Optional Piotroski F ≥ 8
 * quality filter for stocks. Based on Asness, Moskowitz & Pedersen (2013) and Piotroski (2000).
 * Historical simulation with real monthly prices — not a forecast or personal advice.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, FlaskConical, RefreshCw } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  blend,
  correlation,
  equityCurve,
  performance,
  type PerformanceStats,
  type QuantFactorsPayload,
  type QuantUniverse,
} from '../ai/factorPortfolio.ts';
import { fetchQuantFactors } from '../services/marketDataService.ts';
import { useT, type TranslationKey } from '../i18n/index.ts';
import { Rich } from '../i18n/Rich.tsx';

type Mode = 'longShort' | 'longOnly';
type Period = 'all' | '10y' | '5y' | '3y';

const PERIOD_MONTHS: Record<Period, number> = { all: Infinity, '10y': 120, '5y': 60, '3y': 36 };
const STOCK_UNIVERSES: QuantUniverse[] = ['usStock', 'idStock'];

const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v >= 0 ? '' : '−'}${Math.abs(v * 100).toFixed(digits)}%`;

const UNIVERSES: QuantUniverse[] = ['usStock', 'idStock', 'index', 'forex', 'commodity', 'everywhere'];

export function QuantSimView() {
  const t = useT();
  const [universe, setUniverse] = useState<QuantUniverse>('everywhere');
  const [mode, setMode] = useState<Mode>('longShort');
  const [valueWeight, setValueWeight] = useState(50);
  const [quality, setQuality] = useState(false);
  const [period, setPeriod] = useState<Period>('all');
  const [data, setData] = useState<QuantFactorsPayload | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setState('loading');
    fetchQuantFactors(universe)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setState('ready');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [universe, reload]);

  const qualityOn = quality && mode === 'longOnly' && STOCK_UNIVERSES.includes(universe) && Boolean(data?.hasQuality);

  const view = useMemo(() => {
    if (!data) return null;
    const value = mode === 'longShort' ? data.valueLS : qualityOn ? data.valueLOQ : data.valueLO;
    const momentum = mode === 'longShort' ? data.momentumLS : qualityOn ? data.momentumLOQ : data.momentumLO;
    // Window: the chosen period, and only months where the selected portfolios exist
    let first = value.findIndex((v, i) => v !== null && momentum[i] !== null);
    if (first < 0) return null;
    const n = data.months.length;
    first = Math.max(first, n - PERIOD_MONTHS[period]);
    const slice = <T,>(a: T[]) => a.slice(first);
    const v = slice(value);
    const m = slice(momentum);
    const b = slice(data.benchmark);
    const rf = slice(data.rf);
    const combo = blend(v, m, valueWeight / 100);
    // Long-short portfolios are self-financing: Sharpe = mean / volatility; long-only use excess over T-bills
    const rfUse = mode === 'longShort' ? null : rf;
    const stats = {
      combo: performance(combo, rfUse),
      value: performance(v, rfUse),
      momentum: performance(m, rfUse),
      benchmark: performance(b, rf),
    };
    const curves = {
      combo: equityCurve(combo),
      value: equityCurve(v),
      momentum: equityCurve(m),
      benchmark: equityCurve(b),
    };
    const months = slice(data.months);
    const chart = months.map((month, i) => ({
      month,
      Combined: +curves.combo[i].toFixed(4),
      Value: +curves.value[i].toFixed(4),
      Momentum: +curves.momentum[i].toFixed(4),
      Benchmark: +curves.benchmark[i].toFixed(4),
    }));
    return { stats, rho: correlation(v, m), chart, from: months[0], to: months[months.length - 1] };
  }, [data, mode, qualityOn, valueWeight, period]);

  const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };

  return (
    <div className="space-y-6">
      <section className="p-5 md:p-6 rounded-xl border space-y-2" style={card}>
        <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          <FlaskConical className="w-3.5 h-3.5" style={{ color: 'var(--accent-radar)' }} />
          <span>{t('quant.kicker')}</span>
        </div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">{t('quant.title')}</h1>
        <p className="text-sm max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
          <Rich text={t('quant.intro')} />
        </p>
      </section>

      {/* Controls */}
      <section className="p-5 rounded-xl border space-y-4" style={card} aria-label={t('quant.settings')}>
        <div className="space-y-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('quant.universe')}</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('quant.universe')}>
            {UNIVERSES.map((u) => (
              <Chip key={u} active={universe === u} onClick={() => setUniverse(u)} role="radio">
                {t(`quant.u.${u}` as TranslationKey)}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('quant.type')}</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('quant.type')}>
              <Chip active={mode === 'longShort'} onClick={() => setMode('longShort')} role="radio">
                {t('quant.longShort')}
              </Chip>
              <Chip active={mode === 'longOnly'} onClick={() => setMode('longOnly')} role="radio">
                {t('quant.longOnly')}
              </Chip>
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('quant.period')}</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('quant.period')}>
              {(['all', '10y', '5y', '3y'] as Period[]).map((p) => (
                <Chip key={p} active={period === p} onClick={() => setPeriod(p)} role="radio">
                  {p === 'all' ? t('quant.allHistory') : p.toUpperCase()}
                </Chip>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('quant.qualityFilter')}</span>
            <label
              className="flex items-start gap-2 text-xs"
              style={{ opacity: STOCK_UNIVERSES.includes(universe) && mode === 'longOnly' ? 1 : 0.5 }}
            >
              <input
                type="checkbox"
                checked={quality}
                disabled={!STOCK_UNIVERSES.includes(universe) || mode !== 'longOnly'}
                onChange={(e) => setQuality(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                {t('quant.qualityLabel')}
                <span className="block text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {t('quant.qualityNote')}
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="value-weight" className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              {t('quant.allocation')} <span style={{ color: 'var(--color-gold)' }}>{t('quant.valuePct', { n: valueWeight })}</span> ·{' '}
              <span style={{ color: 'var(--accent-radar)' }}>{t('quant.momPct', { n: 100 - valueWeight })}</span>
            </label>
            <div className="flex gap-1.5">
              {[0, 20, 50, 80, 100].map((w) => (
                <Chip key={w} active={valueWeight === w} onClick={() => setValueWeight(w)}>
                  {w}%
                </Chip>
              ))}
            </div>
          </div>
          <input
            id="value-weight"
            type="range"
            min={0}
            max={100}
            step={5}
            value={valueWeight}
            onChange={(e) => setValueWeight(Number(e.target.value))}
            className="w-full accent-[var(--accent-radar)]"
            aria-valuetext={t('quant.sliderText', { v: valueWeight, m: 100 - valueWeight })}
          />
        </div>
      </section>

      {state === 'loading' && !data ? (
        <div className="p-8 rounded-xl border text-sm" style={{ ...card, color: 'var(--text-secondary)' }} aria-busy="true">
          {t('quant.loading')}
        </div>
      ) : state === 'error' && !data ? (
        <div className="p-8 rounded-xl border text-sm space-y-3" style={card} role="alert">
          <p>{t('common.dataUnavailable')}</p>
          <button
            type="button"
            onClick={() => setReload((r) => r + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> {t('common.tryAgain')}
          </button>
        </div>
      ) : data && view ? (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-5 gap-3" aria-label={t('quant.results')}>
            <Stat label={t('quant.annualReturn')} value={pct(view.stats.combo?.annualReturn)} color={(view.stats.combo?.annualReturn ?? 0) >= 0 ? 'var(--color-up)' : 'var(--color-down)'} />
            <Stat label={t('quant.volYr')} value={pct(view.stats.combo?.volatility)} />
            <Stat label={t('quant.sharpe')} value={view.stats.combo?.sharpe?.toFixed(2) ?? '—'} sub={mode === 'longShort' ? t('quant.sharpeLS') : t('quant.sharpeLO')} />
            <Stat label={t('quant.maxDd')} value={pct(view.stats.combo?.maxDrawdown)} color="var(--color-down)" />
            <Stat label={t('quant.rho')} value={view.rho === null ? '—' : view.rho.toFixed(2)} sub={view.rho !== null && view.rho < 0 ? t('quant.rhoNeg') : t('quant.rhoNotNeg')} />
          </section>

          <section className="p-4 md:p-5 rounded-xl border space-y-3" style={card} aria-labelledby="quant-chart-heading">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
              <h2 id="quant-chart-heading" className="text-base font-bold">
                {t('quant.growth', { label: t(`quant.u.${universe}` as TranslationKey) })}
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t('quant.range', { from: view.from, to: view.to, months: view.stats.combo?.months ?? 0, assets: data.members.length })}
                {qualityOn ? ` ${t('quant.fOnly')}` : ''}
              </p>
            </div>
            <div className="h-72 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={view.chart} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} minTickGap={40} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(1)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', fontSize: 12 }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                    formatter={(v) => (typeof v === 'number' ? v.toFixed(2) : String(v))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Combined" name={t('quant.line.combined')} stroke="var(--text-primary)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="Value" name={t('quant.line.value')} stroke="var(--color-gold)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="Momentum" name={t('quant.line.momentum')} stroke="var(--accent-radar)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="Benchmark" name={t('quant.line.benchmark')} stroke="var(--text-secondary)" strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">{t('quant.caption')}</caption>
                <thead>
                  <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                    <th scope="col" className="py-1.5 pr-2 font-semibold">{t('quant.th.portfolio')}</th>
                    <th scope="col" className="py-1.5 pr-2 font-semibold text-right">{t('quant.th.return')}</th>
                    <th scope="col" className="py-1.5 pr-2 font-semibold text-right">{t('quant.th.vol')}</th>
                    <th scope="col" className="py-1.5 pr-2 font-semibold text-right">{t('quant.th.sharpe')}</th>
                    <th scope="col" className="py-1.5 font-semibold text-right">{t('quant.maxDd')}</th>
                  </tr>
                </thead>
                <tbody>
                  <Row name={t('quant.row.combined', { v: valueWeight, m: 100 - valueWeight })} s={view.stats.combo} bold />
                  <Row name={t('quant.row.value')} s={view.stats.value} />
                  <Row name={t('quant.row.momentum')} s={view.stats.momentum} />
                  <Row name={t('quant.row.benchmark')} s={view.stats.benchmark} />
                </tbody>
              </table>
            </div>
          </section>

          <section className="p-4 rounded-xl border text-xs space-y-1.5 leading-relaxed" style={{ ...card, color: 'var(--text-secondary)' }}>
            <p className="flex items-center gap-1.5 font-bold" style={{ color: 'var(--text-primary)' }}>
              <AlertTriangle className="w-4 h-4" style={{ color: 'var(--color-gold)' }} /> {t('quant.howTo')}
            </p>
            <p>
              <Rich text={t('quant.method')} strongStyle={{ color: 'var(--text-primary)' }} />
            </p>
            <p>
              <Rich text={t('quant.biases')} strongStyle={{ color: 'var(--text-primary)' }} />
            </p>
            <p>{t('quant.members', { list: data.members.join(', ') })}</p>
          </section>
        </>
      ) : (
        <div className="p-8 rounded-xl border text-sm" style={{ ...card, color: 'var(--text-secondary)' }}>
          {t('quant.notEnough')}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children, role }: { active: boolean; onClick: () => void; children: ReactNode; role?: string }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role ? active : undefined}
      aria-pressed={role ? undefined : active}
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap"
      style={{
        backgroundColor: active ? 'var(--accent-radar-soft)' : 'var(--bg-surface-subtle)',
        borderColor: active ? 'var(--accent-radar)' : 'var(--border-subtle)',
        color: active ? 'var(--accent-radar)' : 'var(--text-secondary)',
      }}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="p-3 rounded-xl border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div className="text-xl font-bold font-mono-num" style={{ color: color ?? 'var(--text-primary)' }}>{value}</div>
      {sub && <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{sub}</div>}
    </div>
  );
}

function Row({ name, s, bold = false }: { name: string; s: PerformanceStats | null; bold?: boolean }) {
  return (
    <tr className={`border-t ${bold ? 'font-bold' : ''}`} style={{ borderColor: 'var(--border-subtle)' }}>
      <td className="py-2 pr-2">{name}</td>
      <td className="py-2 pr-2 text-right font-mono-num" style={{ color: (s?.annualReturn ?? 0) >= 0 ? 'var(--color-up)' : 'var(--color-down)' }}>
        {pct(s?.annualReturn)}
      </td>
      <td className="py-2 pr-2 text-right font-mono-num">{pct(s?.volatility)}</td>
      <td className="py-2 pr-2 text-right font-mono-num">{s?.sharpe?.toFixed(2) ?? '—'}</td>
      <td className="py-2 text-right font-mono-num">{pct(s?.maxDrawdown)}</td>
    </tr>
  );
}
