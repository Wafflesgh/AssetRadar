/**
 * FundArenaView.tsx — AI Fund Arena page (#/fund-arena): ten simulated fund managers, one per
 * model, each started with US$100 of pretend money. The server rebalances them every evening
 * (src/ai/fundArena.ts); this page shows the leaderboard valued at live prices, each manager's
 * holdings, and the value of every manager over time against buying and holding the IDX Composite.
 */
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getAssetBySymbol, type PriceTick } from '../config/assets.ts';
import { FUND_START_USD, fundBoard, type FundArenaState, type FundManagerId, type FundQuote } from '../ai/fundArena.ts';
import { fetchFundArena } from '../services/marketDataService.ts';
import { useT, type TranslationKey } from '../i18n/index.ts';
import { Rich } from '../i18n/Rich.tsx';
import { formatNumber, formatPercent, formatRupiah } from '../utils/format.ts';

const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
const muted = { color: 'var(--text-secondary)' };
const COLORS = ['#38BDF8', '#F59E0B', '#A78BFA', '#34D399', '#F472B6', '#FB923C', '#22D3EE', '#A3E635', '#E879F9', '#94A3B8'];
const usd = (v: number) => `US$${formatNumber(v, 2)}`;
const tone = (v: number) => (v > 0 ? 'var(--color-up)' : v < 0 ? 'var(--color-down)' : 'var(--text-secondary)');

interface FundArenaViewProps {
  ticks: Record<string, PriceTick>;
  onSelectAsset: (symbol: string) => void;
}

export function FundArenaView({ ticks, onSelectAsset }: FundArenaViewProps) {
  const t = useT();
  const [data, setData] = useState<{ state: FundArenaState | null; database: boolean } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    fetchFundArena()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setStatus('ready');
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [retry]);

  const usdIdr = ticks['USD/IDR']?.price ?? 0;
  const state = data?.state ?? null;
  // Holdings valued at live prices between the evening rebalances
  const board = useMemo(() => {
    if (!state) return [];
    const quotes: Record<string, FundQuote> = {};
    for (const m of Object.values(state.managers))
      for (const p of m.positions) {
        const tick = ticks[p.symbol];
        const asset = getAssetBySymbol(p.symbol);
        if (tick && tick.price > 0 && !tick.fromSnapshot) quotes[p.symbol] = { price: tick.price, idr: asset?.currency === 'IDR' || asset?.id === 'jci' };
      }
    return fundBoard(state, usdIdr > 0 ? { quotes, usdIdr } : undefined);
  }, [state, ticks, usdIdr]);

  const chart = useMemo(() => {
    if (!state) return [];
    const byDate = new Map<string, Record<string, number | string>>();
    const put = (key: string, rows: Array<[string, number]>) => {
      for (const [d, v] of rows) {
        const row = byDate.get(d) ?? { date: d };
        row[key] = Math.round(v * 100) / 100;
        byDate.set(d, row);
      }
    };
    for (const [id, m] of Object.entries(state.managers)) put(id, m.history);
    put('benchmark', state.benchmark.history);
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [state]);

  const bench = state?.benchmark.history.at(-1)?.[1] ?? null;
  const nameOf = (id: string) => (id === 'benchmark' ? t('fund.benchmark') : t(`fund.m.${id}` as TranslationKey));
  const colorOf = (id: string) => COLORS[Object.keys(state?.managers ?? {}).indexOf(id)] ?? '#94A3B8';

  return (
    <div className="space-y-5">
      <p className="text-xs rounded-lg border p-3" style={{ borderColor: 'var(--color-gold)', color: 'var(--text-primary)' }}>
        <Rich text={t('fund.disclaimer')} />
      </p>
      <header className="space-y-1">
        <h2 className="text-xl font-bold">{t('fund.title')}</h2>
        <p className="text-sm" style={muted}>
          {t('fund.intro', { start: usd(FUND_START_USD) })}
        </p>
      </header>

      {status === 'loading' && <p className="text-sm" style={muted}>{t('common.loading')}</p>}
      {status === 'error' && (
        <div className="flex items-center gap-2 text-sm">
          <span style={muted}>{t('common.dataUnavailable')}</span>
          <button type="button" onClick={() => setRetry((n) => n + 1)} className="inline-flex items-center gap-1 px-2 py-1 rounded border font-semibold" style={card}>
            <RefreshCw className="w-3 h-3" /> {t('common.tryAgain')}
          </button>
        </div>
      )}
      {status === 'ready' && !state && (
        <p className="text-sm rounded-lg border p-3" style={{ ...card, ...muted }}>
          {data?.database ? t('fund.notStarted') : t('fund.noDatabase')}
        </p>
      )}

      {state && (
        <>
          <p className="text-xs" style={muted}>
            {t('fund.since', { start: state.startDate, last: state.lastDate })}
            {bench !== null && <> · {t('fund.benchLine', { value: usd(bench), ret: formatPercent((bench / FUND_START_USD - 1) * 100) })}</>}
          </p>
          <ol className="space-y-2">
            {board.map((row, i) => (
              <li key={row.id} className="rounded-lg border p-3 space-y-2" style={card}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono-num text-sm font-bold" style={muted}>
                    #{i + 1}
                  </span>
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorOf(row.id) }} aria-hidden />
                  <span className="font-bold">{nameOf(row.id)}</span>
                  <span className="ml-auto font-mono-num font-bold">{usd(row.value)}</span>
                  <span className="font-mono-num text-sm font-semibold" style={{ color: tone(row.ret) }}>
                    {formatPercent(row.ret * 100)}
                  </span>
                </div>
                <p className="text-xs" style={muted}>
                  {t(`fund.how.${row.id}` as TranslationKey)}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {row.positions.length === 0 ? (
                    <span style={muted}>{t('fund.allCash')}</span>
                  ) : (
                    row.positions.map((p) => {
                      const asset = getAssetBySymbol(p.symbol);
                      return (
                        <button
                          key={p.symbol}
                          type="button"
                          onClick={() => onSelectAsset(p.symbol)}
                          className="px-2 py-0.5 rounded-full border font-mono-num"
                          style={{ borderColor: 'var(--border-subtle)' }}
                          title={asset?.name ?? p.symbol}
                        >
                          {asset?.code ?? p.symbol} {usd(p.value)}
                        </button>
                      );
                    })
                  )}
                  <span className="ml-auto font-mono-num" style={muted}>
                    {usdIdr > 0 && `≈ ${formatRupiah(row.value * usdIdr, 0)} · `}
                    {t('fund.maxDd', { dd: formatPercent(row.maxDrawdown * 100) })}
                  </span>
                </div>
              </li>
            ))}
          </ol>

          {chart.length > 1 ? (
            <section className="rounded-lg border p-3 space-y-2" style={card}>
              <h3 className="text-sm font-bold">{t('fund.chartTitle')}</h3>
              <div className="h-64 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart} margin={{ top: 5, right: 8, bottom: 0, left: -10 }}>
                    <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} minTickGap={40} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', fontSize: 12 }}
                      formatter={(v, name) => [usd(Number(v)), nameOf(String(name))]}
                    />
                    {Object.keys(state.managers).map((id) => (
                      <Line key={id} type="monotone" dataKey={id} dot={false} strokeWidth={2} stroke={colorOf(id)} isAnimationActive={false} connectNulls />
                    ))}
                    <Line type="monotone" dataKey="benchmark" dot={false} strokeWidth={2} stroke="var(--text-secondary)" strokeDasharray="5 4" isAnimationActive={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs" style={muted}>
                {t('fund.chartNote')}
              </p>
            </section>
          ) : (
            <p className="text-xs" style={muted}>
              {t('fund.chartSoon')}
            </p>
          )}
        </>
      )}

      <section className="rounded-lg border p-3 space-y-1 text-xs" style={{ ...card, ...muted }}>
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('fund.rulesTitle')}
        </h3>
        {(['fund.rule1', 'fund.rule2', 'fund.rule3', 'fund.rule4'] as const).map((k) => (
          <p key={k}>
            <Rich text={t(k)} />
          </p>
        ))}
      </section>
    </div>
  );
}
