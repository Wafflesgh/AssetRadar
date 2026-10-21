/**
 * CryptoBinanceView.tsx — The #/crypto page: the Binance top-100 USDT pairs (live price, 1h /
 * 4h / 24h / 7d change, 24h volume, funding, Short/Medium/Long sentiment) with search (also
 * non-Latin symbols) and a filter for coins AssetRadar also follows; a pair page with 1h/4h/1D
 * candles (the open candle marked), ranges and levels computed from closed candles, futures
 * positioning (open interest, long/short, taker ratio, basis, funding) and the position
 * calculator. Public market data only; Binance limits and region blocks are explained. The last
 * price and 24h change come live from Binance's public stream in the browser (about every second,
 * binanceLive.ts); the other columns from the server every 10 s.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CandlestickSeries, ColorType, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { AlertTriangle, ArrowLeft, Bitcoin, Search } from 'lucide-react';
import { ASSETS, getAssetBySymbol, type OhlcCandle } from '../config/assets.ts';
import { useT, type TranslationKey } from '../i18n/index.ts';
import { Rich } from '../i18n/Rich.tsx';
import { likelyRange, supportResistance, upsideDownside } from '../sentiment/projections.ts';
import { fetchBinanceDerivatives, fetchBinanceKlines, fetchBinanceTable, type BinanceRow, type BinanceStatus } from '../services/sentimentService.ts';
import { formatDecimal, formatUsdCompact } from '../utils/format.ts';
import { formatRelativeTime } from '../utils/marketHours.ts';
import { scoreColor } from './sentiment/InvestmentSentimentPanel.tsx';
import type { Kline } from '../crypto/binance.ts';
import { useBinanceLive } from '../services/binanceLive.ts';

const REFRESH_MS = 10_000;

const usdt = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : formatDecimal(v, Math.abs(v) >= 100 ? 2 : Math.abs(v) >= 1 ? 4 : Math.abs(v) >= 0.01 ? 6 : 8);
const pct = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${formatDecimal(v, d)}%`;
const pctColor = (v: number | null | undefined) =>
  v === null || v === undefined ? undefined : v > 0 ? 'var(--color-up)' : v < 0 ? 'var(--color-down)' : undefined;

function StatusNote({ status }: { status: BinanceStatus | null }) {
  const t = useT();
  if (!status) return null;
  const bad = status.availability !== 'ok';
  return (
    <div className="space-y-1">
      {bad && (
        <p
          role="alert"
          className="text-xs flex items-start gap-1.5 p-2.5 rounded-lg"
          style={{
            backgroundColor: 'var(--color-down-soft)',
            color: 'var(--color-down)',
          }}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          {t(`bn.status.${status.availability}` as TranslationKey)}
          {status.resumeAt ? ` (${new Date(status.resumeAt).toLocaleTimeString()})` : ''}
        </p>
      )}
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {t('bn.weight', {
          used: status.weightUsed,
          budget: status.weightBudget,
          limit: status.weightLimit,
          stream: status.stream,
          done: status.scan.done,
          total: status.scan.total,
        })}
      </p>
    </div>
  );
}

export function CryptoBinanceView({
  pair,
  onOpenPair,
  onSelectAsset,
  theme,
}: {
  pair?: string;
  onOpenPair: (pair?: string) => void;
  onSelectAsset: (symbol: string) => void;
  theme: 'light' | 'dark';
}) {
  const t = useT();
  const [rows, setRows] = useState<BinanceRow[]>([]);
  const [status, setStatus] = useState<BinanceStatus | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [linkedOnly, setLinkedOnly] = useState(false);
  const live = useBinanceLive();

  // Live price and 24h change over the server rows (the server still supplies everything else)
  const liveRows = useMemo(
    () =>
      rows.map((r) => {
        const tk = live.tickers.get(r.symbol);
        if (!tk) return r;
        const change24h = tk.open > 0 ? (tk.close / tk.open - 1) * 100 : r.change24h;
        return { ...r, price: tk.close, change24h, updatedAt: tk.eventTime || r.updatedAt };
      }),
    [rows, live.tickers]
  );

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchBinanceTable()
        .then((d) => {
          if (!alive) return;
          setRows(d.rows);
          setStatus(d.status);
          setError(false);
        })
        .catch(() => alive && setError(true));
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toUpperCase();
    return liveRows.filter((r) => (!q || r.symbol.toUpperCase().includes(q) || r.base.toUpperCase().includes(q)) && (!linkedOnly || r.assetId));
  }, [liveRows, query, linkedOnly]);

  const card = {
    backgroundColor: 'var(--bg-surface)',
    borderColor: 'var(--border-subtle)',
  };

  if (pair) {
    const row = liveRows.find((r) => r.symbol === pair) ?? null;
    return <PairView pair={pair} row={row} status={status} onBack={() => onOpenPair()} onSelectAsset={onSelectAsset} theme={theme} />;
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bitcoin className="w-6 h-6" style={{ color: 'var(--accent-radar)' }} /> {t('bn.title')}
        </h1>
        <p className="text-sm max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
          {t('bn.intro')}
        </p>
      </header>
      <StatusNote status={status} />
      <p className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
        <span
          aria-hidden="true"
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: live.status === 'live' ? 'var(--color-up)' : live.status === 'connecting' ? 'var(--color-gold)' : 'var(--text-secondary)' }}
        />
        {t(`bn.live.${live.status}` as TranslationKey)}
      </p>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <label className="flex items-center gap-2 flex-1 rounded-lg border px-3" style={{ ...card }}>
          <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('bn.search')}
            aria-label={t('bn.search')}
            className="w-full bg-transparent py-2 text-sm outline-none"
          />
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={linkedOnly} onChange={(e) => setLinkedOnly(e.target.checked)} />
          {t('bn.linkedOnly')}
        </label>
      </div>
      <section className="rounded-xl border overflow-hidden" style={card}>
        {rows.length === 0 ? (
          <p className="p-5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {error ? t('common.dataUnavailable') : t('bn.empty')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr
                  className="text-left"
                  style={{
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--bg-surface-subtle)',
                  }}
                >
                  <th className="px-2 py-2 font-semibold">#</th>
                  <th className="px-2 py-2 font-semibold">{t('bn.col.pair')}</th>
                  <th className="px-2 py-2 font-semibold text-right">{t('bn.col.price')}</th>
                  <th className="px-2 py-2 font-semibold text-right hidden md:table-cell">1h</th>
                  <th className="px-2 py-2 font-semibold text-right hidden lg:table-cell">4h</th>
                  <th className="px-2 py-2 font-semibold text-right">24h</th>
                  <th className="px-2 py-2 font-semibold text-right hidden md:table-cell">7d</th>
                  <th className="px-2 py-2 font-semibold text-right hidden lg:table-cell">{t('bn.col.volume')}</th>
                  <th className="px-2 py-2 font-semibold text-right hidden lg:table-cell">{t('bn.col.funding')}</th>
                  <th className="px-2 py-2 font-semibold text-right">{t('sent.h.short')}</th>
                  <th className="px-2 py-2 font-semibold text-right hidden sm:table-cell">{t('sent.h.medium')}</th>
                  <th className="px-2 py-2 font-semibold text-right hidden sm:table-cell">{t('sent.h.long')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr
                    key={r.symbol}
                    onClick={() => onOpenPair(r.symbol)}
                    className="border-t cursor-pointer hover:opacity-80"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <td className="px-2 py-2 font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                      {r.rank}
                    </td>
                    <td className="px-2 py-2 font-bold whitespace-nowrap">
                      {r.base}
                      <span className="font-normal" style={{ color: 'var(--text-secondary)' }}>
                        /USDT
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono-num whitespace-nowrap">{usdt(r.price)}</td>
                    <td className="px-2 py-2 text-right font-mono-num hidden md:table-cell" style={{ color: pctColor(r.change1h) }}>
                      {pct(r.change1h)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono-num hidden lg:table-cell" style={{ color: pctColor(r.change4h) }}>
                      {pct(r.change4h)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono-num" style={{ color: pctColor(r.change24h) }}>
                      {pct(r.change24h)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono-num hidden md:table-cell" style={{ color: pctColor(r.change7d) }}>
                      {pct(r.change7d)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono-num hidden lg:table-cell">
                      {r.quoteVolume ? formatUsdCompact(r.quoteVolume) : '—'}
                    </td>
                    <td className="px-2 py-2 text-right font-mono-num hidden lg:table-cell">
                      {r.fundingRate === null ? '—' : pct(r.fundingRate * 100, 4)}
                    </td>
                    {(['short', 'medium', 'long'] as const).map((h) => (
                      <td
                        key={h}
                        className={`px-2 py-2 text-right font-mono-num ${h === 'short' ? '' : 'hidden sm:table-cell'}`}
                        style={{ color: scoreColor(r.scores?.[h]?.score) }}
                      >
                        {r.scores?.[h]?.score === null || r.scores?.[h]?.score === undefined ? '—' : Math.round(r.scores[h].score as number)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {t('sent.disclaimer')}
      </p>
    </div>
  );
}

const CHART_COLORS = {
  light: {
    background: '#FFFFFF',
    text: '#64748B',
    grid: '#E2E8F0',
    up: '#16A34A',
    down: '#DC2626',
  },
  dark: {
    background: '#0F172A',
    text: '#94A3B8',
    grid: '#1E293B',
    up: '#22C55E',
    down: '#EF4444',
  },
};

function KlineChart({ klines, theme }: { klines: Kline[]; theme: 'light' | 'dark' }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94A3B8',
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
    });
    seriesRef.current = chart.addSeries(CandlestickSeries, {
      borderVisible: false,
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);
  useEffect(() => {
    const c = CHART_COLORS[theme];
    chartRef.current?.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: c.background },
        textColor: c.text,
      },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
    });
    seriesRef.current?.applyOptions({
      upColor: c.up,
      downColor: c.down,
      wickUpColor: c.up,
      wickDownColor: c.down,
    });
  }, [theme]);
  useEffect(() => {
    // Shown in UTC+7 (WIB) like the other charts
    seriesRef.current?.setData(
      klines.map((k) => ({
        time: (Math.floor(k.openTime / 1000) + 7 * 3600) as UTCTimestamp,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      }))
    );
    chartRef.current?.timeScale().fitContent();
  }, [klines]);
  return <div ref={ref} className="w-full h-72 md:h-96" />;
}

function PairView({
  pair,
  row,
  status,
  onBack,
  onSelectAsset,
  theme,
}: {
  pair: string;
  row: BinanceRow | null;
  status: BinanceStatus | null;
  onBack: () => void;
  onSelectAsset: (s: string) => void;
  theme: 'light' | 'dark';
}) {
  const t = useT();
  const [tf, setTf] = useState<'1h' | '4h' | '1d'>('1d');
  const [klines, setKlines] = useState<Kline[]>([]);
  const [error, setError] = useState(false);
  const [deriv, setDeriv] = useState<Awaited<ReturnType<typeof fetchBinanceDerivatives>> | null>(null);
  const linked = row?.assetId ? getAssetBySymbol(row.assetId) : ASSETS.find((a) => a.binanceSpot === pair);

  useEffect(() => {
    let alive = true;
    setError(false);
    fetchBinanceKlines(pair, tf)
      .then((d) => alive && setKlines(d.klines))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [pair, tf]);

  useEffect(() => {
    if (!row?.futures) return;
    let alive = true;
    fetchBinanceDerivatives(row.futures)
      .then((d) => alive && setDeriv(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [row?.futures]);

  const closed = klines.filter((k) => k.closed);
  const candles: OhlcCandle[] = closed.map((k) => ({
    time: Math.floor(k.openTime / 1000),
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
  }));
  const closes = candles.map((c) => c.close);
  const barsPerYear = tf === '1h' ? 24 * 365 : tf === '4h' ? 6 * 365 : 365;
  const range = likelyRange(closes, 1, tf === '1d' ? 365 : 500);
  const sr = supportResistance(candles, {
    yearBars: Math.min(candles.length, barsPerYear),
  });
  const price = row?.price ?? closes[closes.length - 1] ?? null;
  const near = price ? upsideDownside(sr.levels, price) : null;
  const card = 'p-5 rounded-xl border space-y-3';
  const cardStyle = {
    backgroundColor: 'var(--bg-surface)',
    borderColor: 'var(--border-subtle)',
  };

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold"
        style={{ color: 'var(--accent-radar)' }}
      >
        <ArrowLeft className="w-4 h-4" /> {t('bn.back')}
      </button>
      <header className="space-y-1">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight break-all">{pair}</h1>
        <p className="text-2xl font-bold font-mono-num">
          {usdt(price)}{' '}
          <span className="text-sm" style={{ color: pctColor(row?.change24h) }}>
            {pct(row?.change24h)}
          </span>
        </p>
        {row?.updatedAt && (
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {formatRelativeTime(row.updatedAt)}
          </p>
        )}
        {!row && rows0(status) && <p className="text-xs">{t('bn.unknownPair')}</p>}
        {linked && (
          <button
            type="button"
            onClick={() => onSelectAsset(linked.symbol)}
            className="text-xs hover:underline"
            style={{ color: 'var(--accent-radar)' }}
          >
            <Rich text={t('bn.linked', { code: linked.code })} />
          </button>
        )}
      </header>
      <StatusNote status={status} />

      <section className={card} style={cardStyle} aria-label={t('bn.chart')}>
        <div className="flex gap-1.5">
          {(['1h', '4h', '1d'] as const).map((x) => (
            <button
              key={x}
              type="button"
              aria-pressed={tf === x}
              onClick={() => setTf(x)}
              className="px-2.5 py-1 rounded-md border text-xs font-mono-num font-semibold"
              style={{
                backgroundColor: tf === x ? 'var(--accent-radar)' : 'var(--bg-surface-subtle)',
                color: tf === x ? '#0B1220' : 'var(--text-primary)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {x.toUpperCase()}
            </button>
          ))}
        </div>
        {error ? <p className="text-sm">{t('common.dataUnavailable')}</p> : <KlineChart klines={klines} theme={theme} />}
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {t('bn.openCandle')} · Binance
        </p>
      </section>

      {row && (
        <section className={card} style={cardStyle}>
          <h2 className="text-sm font-bold">{t('bn.scores')}</h2>
          <div className="grid grid-cols-3 gap-2">
            {(['short', 'medium', 'long'] as const).map((h) => (
              <div key={h} className="p-2 rounded-lg text-center" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
                <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {t(`sent.h.${h}` as TranslationKey)}
                </div>
                <div className="text-lg font-bold font-mono-num" style={{ color: scoreColor(row.scores?.[h]?.score) }}>
                  {row.scores?.[h]?.score === null || row.scores?.[h]?.score === undefined ? '—' : Math.round(row.scores[h].score as number)}
                </div>
                <div className="text-[10px]">{row.scores?.[h]?.label ? t(`sent.label.${row.scores[h].label}` as TranslationKey) : ''}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={card} style={cardStyle}>
        <h2 className="text-sm font-bold">{t('bn.levels', { n: closed.length, tf: tf.toUpperCase() })}</h2>
        {range ? (
          <p className="text-xs font-mono-num">
            {t('proj.r68')}: {usdt(range.low68)} – {usdt(range.high68)} · {t('proj.r90')}: {usdt(range.low90)} – {usdt(range.high90)}
            {range.calibration.samples > 0 && (
              <span
                style={{
                  color: range.calibration.warning ? 'var(--color-gold)' : 'var(--text-secondary)',
                }}
              >
                {' '}
                ·{' '}
                {t('proj.calib', {
                  h68: Math.round(range.calibration.hit68 ?? 0),
                  h90: Math.round(range.calibration.hit90 ?? 0),
                  n: range.calibration.samples,
                })}
              </span>
            )}
          </p>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {tf === '1d' ? t('proj.unavailable1y') : t('proj.unavailable4h')}
          </p>
        )}
        {near && (near.resistance || near.support) && (
          <p className="text-xs">
            <Rich
              text={t('proj.nearest', {
                res: near.resistance ? usdt(near.resistance.price) : '—',
                up: pct(near.upsidePct, 1),
                sup: near.support ? usdt(near.support.price) : '—',
                down: pct(near.downsidePct, 1),
                rr: near.rewardRisk === null ? '—' : formatDecimal(near.rewardRisk, 2),
              })}
            />
          </p>
        )}
      </section>

      <section className={card} style={cardStyle}>
        <h2 className="text-sm font-bold">{t('bn.derivatives')}</h2>
        {!row?.futures ? (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t('bn.noFutures')}
          </p>
        ) : (
          <ul className="text-xs space-y-1 font-mono-num">
            {row.fundingRate !== null && (
              <li>
                {t('bn.fundingNext', {
                  rate: pct(row.fundingRate * 100, 4),
                  time: deriv?.funding?.nextFundingTime ? new Date(deriv.funding.nextFundingTime).toLocaleTimeString() : '—',
                })}
              </li>
            )}
            {deriv?.openInterest !== undefined && (
              <li>
                {t('bn.oi', {
                  oi: formatDecimal(deriv.openInterest, 0),
                  chg: pct(deriv.openInterestChange24h ?? null, 1),
                })}
              </li>
            )}
            {deriv?.longShortRatio !== undefined && <li>{t('bn.ls', { r: formatDecimal(deriv.longShortRatio, 2) })}</li>}
            {deriv?.takerBuySellRatio !== undefined && (
              <li>
                {t('bn.taker', {
                  r: formatDecimal(deriv.takerBuySellRatio, 2),
                })}
              </li>
            )}
            {deriv?.basisRate !== undefined && <li>{t('bn.basis', { r: pct(deriv.basisRate, 2) })}</li>}
          </ul>
        )}
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {t('bn.futuresNote')}
        </p>
      </section>
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {t('sent.disclaimer')}
      </p>
    </div>
  );
}

/** True once the server has loaded the universe (so "unknown pair" is meaningful). */
const rows0 = (status: BinanceStatus | null) => Boolean(status && status.pairs > 0);
