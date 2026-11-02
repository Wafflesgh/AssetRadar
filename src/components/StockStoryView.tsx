/**
 * StockStoryView.tsx — Stock Story page (#/story/<id>): one stock told in plain sentences and a few
 * pictures, from data the app already keeps: five years of weekly prices with yearly returns, the
 * daily sentiment calls over time (and how often they were right), dividends per year with the
 * trailing yield, and the annual financial ratios. Each part loads on its own and shows "Data
 * unavailable" with a retry if its source fails. Facts come from utils/stockStory.ts.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { BookOpen, LineChart as LineIcon, RefreshCw } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getAssetBySymbol, type AssetConfig, type PriceTick } from '../config/assets.ts';
import {
  fetchAssetTrace,
  fetchCorporateCalendar,
  fetchDailyHistory,
  fetchFinancialStatements,
  type AssetTracePayload,
  type FinancialStatements,
} from '../services/marketDataService.ts';
import { priceFacts, ratioYears, sentimentFacts, STORY_HORIZONS, type StoryHorizon } from '../utils/stockStory.ts';
import { dividendYieldPct, summarizeDividends } from '../utils/dividendYield.ts';
import type { CalendarEvent } from '../utils/corporateCalendar.ts';
import { STORY_GROUPS } from '../utils/router.ts';
import { useTrackedSymbols } from '../hooks/useTrackedSymbols.ts';
import { useSymbolSource } from '../hooks/useSymbolSource.ts';
import { dateLocale, useT, type TranslationKey } from '../i18n/index.ts';
import { Rich } from '../i18n/Rich.tsx';
import { assetName } from '../i18n/assetNames.ts';
import { formatAssetPrice, formatNumber, formatPercent, formatPrice } from '../utils/format.ts';
import { AssetSearch } from './AssetSearch.tsx';

const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
const muted = { color: 'var(--text-secondary)' };
const tone = (v: number) => (v > 0 ? 'var(--color-up)' : v < 0 ? 'var(--color-down)' : 'var(--text-secondary)');
const isStock = (a: AssetConfig) => STORY_GROUPS.has(a.group);
const pct = (fraction: number | null | undefined) => (fraction === null || fraction === undefined ? '—' : formatPercent(fraction * 100));
const LABEL_COLOR: Record<string, string> = {
  'Strong Bullish': 'var(--color-up)',
  Bullish: 'color-mix(in srgb, var(--color-up) 55%, var(--bg-surface-subtle))',
  Neutral: 'var(--border-strong)',
  Bearish: 'color-mix(in srgb, var(--color-down) 55%, var(--bg-surface-subtle))',
  'Strong Bearish': 'var(--color-down)',
};
const LABEL_KEYS: Record<string, TranslationKey> = {
  'Strong Bullish': 'story.label.strongBullish',
  Bullish: 'story.label.bullish',
  Neutral: 'story.label.neutral',
  Bearish: 'story.label.bearish',
  'Strong Bearish': 'story.label.strongBearish',
};

const loadBars = (s: string) => fetchDailyHistory(s).then((d) => d.bars.map((b) => ({ date: b.date, close: b.close })));
const loadTrace = (s: string): Promise<AssetTracePayload> => fetchAssetTrace(s);
const loadEvents = (s: string): Promise<CalendarEvent[]> => fetchCorporateCalendar(s).then((d) => d.events);
const loadRatios = (s: string): Promise<FinancialStatements> => fetchFinancialStatements(s, 'annual');

interface StockStoryViewProps {
  symbol?: string;
  ticks: Record<string, PriceTick>;
  onPick: (symbol: string) => void;
  onSelectAsset: (symbol: string) => void;
}

export function StockStoryView({ symbol, ticks, onPick, onSelectAsset }: StockStoryViewProps) {
  const t = useT();
  const asset = symbol ? getAssetBySymbol(symbol) : undefined;
  const story = asset && isStock(asset) ? asset : undefined;
  const [retry, setRetry] = useState(0);
  useTrackedSymbols(story ? [story.symbol] : []);
  const bars = useSymbolSource(story?.symbol, loadBars, retry);
  const trace = useSymbolSource(story?.symbol, loadTrace, retry);
  const events = useSymbolSource(story?.symbol, loadEvents, retry);
  const statements = useSymbolSource(story?.symbol, loadRatios, retry);

  const price = useMemo(() => (bars.status === 'ready' ? priceFacts(bars.data) : null), [bars]);
  const sentiment = useMemo(() => (trace.status === 'ready' ? sentimentFacts(trace.data.rows) : null), [trace]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const dividends = useMemo(() => (events.status === 'ready' && story ? summarizeDividends(story.symbol, events.data, today) : null), [events, story, today]);
  const ratios = useMemo(() => (statements.status === 'ready' ? ratioYears(statements.data.rows) : []), [statements]);
  const tick = story ? ticks[story.symbol] : undefined;
  const livePrice = tick && !tick.fromSnapshot ? tick.price : price?.last;
  const yieldPct = dividends ? dividendYieldPct(dividends.ttm, livePrice) : null;
  const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });

  // The story in sentences (each one only when its facts are known)
  const chapters: string[] = [];
  if (story && price) {
    if (price.change1y !== null) chapters.push(t(price.change1y >= 0 ? 'story.ch.yearUp' : 'story.ch.yearDown', { pct: formatPercent(Math.abs(price.change1y) * 100).replace(/^[+-]/, '') }));
    chapters.push(price.fromHigh > -0.02 ? t('story.ch.nearHigh') : t('story.ch.belowHigh', { pct: formatPercent(Math.abs(price.fromHigh) * 100).replace(/^[+-]/, '') }));
    if (price.change5y !== null) chapters.push(t('story.ch.fiveYears', { pct: formatPercent(price.change5y * 100) }));
    if (price.best && price.worst && price.best.year !== price.worst.year)
      chapters.push(t('story.ch.bestWorst', { best: price.best.year, bestPct: formatPercent(price.best.ret * 100), worst: price.worst.year, worstPct: formatPercent(price.worst.ret * 100) }));
    if (price.maxDrawdown && price.maxDrawdown.pct < -0.15) chapters.push(t('story.ch.drawdown', { pct: formatPercent(price.maxDrawdown.pct * 100), from: fmtDate(price.maxDrawdown.peakDate), to: fmtDate(price.maxDrawdown.troughDate) }));
  }
  if (sentiment?.latest.medium) {
    chapters.push(t('story.ch.sentiment', { label: t(LABEL_KEYS[sentiment.latest.medium.label] ?? 'story.label.neutral') }));
    const ch = sentiment.lastChange.medium;
    if (ch) chapters.push(t('story.ch.sentimentChange', { date: fmtDate(ch.date), from: t(LABEL_KEYS[ch.from] ?? 'story.label.neutral'), to: t(LABEL_KEYS[ch.to] ?? 'story.label.neutral') }));
  }
  if (events.status === 'ready') {
    if (dividends && dividends.yearsPaid > 0)
      chapters.push(
        t('story.ch.dividends', { years: dividends.yearsPaid }) + (yieldPct !== null ? ` ${t('story.ch.yield', { pct: formatNumber(yieldPct, 1) })}` : '')
      );
    else chapters.push(t('story.ch.noDividends'));
  }
  if (ratios[0]?.roe !== undefined) {
    const prev = ratios[1]?.roe;
    chapters.push(
      t(prev === undefined ? 'story.ch.roe' : ratios[0].roe! >= prev ? 'story.ch.roeUp' : 'story.ch.roeDown', {
        year: ratios[0].year,
        roe: formatNumber(ratios[0].roe! * 100, 1),
        prev: prev === undefined ? '' : formatNumber(prev * 100, 1),
      })
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <BookOpen className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} /> {t('story.title')}
        </h2>
        <p className="text-sm max-w-3xl" style={muted}>
          {t('story.intro')}
        </p>
      </header>
      <div className="max-w-md">
        <AssetSearch ticks={ticks} filter={isStock} selected={story} label={t('story.pick')} placeholder={t('story.pick')} onSelect={(a) => onPick(a.symbol)} />
      </div>

      {!story ? (
        <p className="text-sm rounded-xl border p-4" style={{ ...card, ...muted }}>
          {t('story.empty')}
        </p>
      ) : (
        <>
          <section className="radar-hero rounded-2xl border p-5 space-y-3" style={card}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-2xl font-extrabold tracking-tight">{story.code.replace(/\.JK$/, '')}</h3>
              <span className="text-sm" style={muted}>
                {assetName(story)}
              </span>
              <span className="ml-auto font-mono-num text-lg font-bold">{livePrice !== undefined ? formatAssetPrice(livePrice, story, { native: true }) : '—'}</span>
            </div>
            {chapters.length > 0 ? (
              <div className="space-y-1.5 max-w-3xl text-[0.9375rem] leading-relaxed">
                {chapters.map((c, i) => (
                  <p key={i}>
                    <Rich text={c} />
                  </p>
                ))}
              </div>
            ) : bars.status === 'loading' ? (
              <p className="text-sm" style={muted}>
                {t('common.loading')}
              </p>
            ) : null}
            <button type="button" onClick={() => onSelectAsset(story.symbol)} className="btn-accent inline-flex items-center gap-1.5">
              <LineIcon className="w-3.5 h-3.5" /> {t('story.openChart')}
            </button>
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            {/* Price */}
            <Panel title={t('story.priceTitle')} state={bars.status} onRetry={() => setRetry((n) => n + 1)}>
              {price ? (
                <>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={price.weekly} margin={{ top: 5, right: 8, bottom: 0, left: -6 }}>
                        <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} minTickGap={50} tickFormatter={(d: string) => d.slice(0, 7)} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} domain={['auto', 'auto']} width={56} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', fontSize: 12 }}
                          formatter={(v) => [formatPrice(Number(v), story.currency), t('story.close')]}
                        />
                        <Line type="monotone" dataKey="close" dot={false} strokeWidth={2} stroke="var(--accent-radar)" isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="flex flex-wrap gap-1.5 text-xs" aria-label={t('story.yearly')}>
                    {price.yearly.map((y) => (
                      <li key={y.year} className="px-2 py-1 rounded-md font-mono-num" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
                        {y.year} <b style={{ color: tone(y.ret) }}>{pct(y.ret)}</b>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs" style={muted}>
                    {t('story.range52', { low: formatPrice(price.low52, story.currency), high: formatPrice(price.high52, story.currency) })}
                  </p>
                </>
              ) : (
                <p className="text-sm" style={muted}>
                  {t('common.dataUnavailable')}
                </p>
              )}
            </Panel>

            {/* Sentiment over time */}
            <Panel title={t('story.sentimentTitle')} state={trace.status} onRetry={() => setRetry((n) => n + 1)}>
              {sentiment && STORY_HORIZONS.some((h) => sentiment.timeline[h].length > 0) ? (
                <div className="space-y-3">
                  {STORY_HORIZONS.map((h: StoryHorizon) => {
                    const line = sentiment.timeline[h];
                    const acc = sentiment.accuracy[h];
                    return (
                      <div key={h} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="font-semibold">{t(`story.h.${h}` as TranslationKey)}</span>
                          <span style={muted}>
                            {sentiment.latest[h] ? t(LABEL_KEYS[sentiment.latest[h]!.label] ?? 'story.label.neutral') : '—'}
                            {acc && <> · {t('story.accuracy', { hits: acc.hits, scored: acc.scored })}</>}
                          </span>
                        </div>
                        <div className="flex h-5 gap-px rounded overflow-hidden" role="img" aria-label={t('story.stripAria', { horizon: t(`story.h.${h}` as TranslationKey), days: line.length })}>
                          {line.length === 0 ? (
                            <span className="flex-1" style={{ backgroundColor: 'var(--bg-surface-subtle)' }} />
                          ) : (
                            line.map((d) => <span key={d.date} className="flex-1 min-w-px" title={`${d.date}: ${d.label}`} style={{ backgroundColor: LABEL_COLOR[d.label] ?? 'var(--border-strong)' }} />)
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-[11px]" style={muted}>
                    {t('story.sentimentNote')}
                  </p>
                </div>
              ) : (
                <p className="text-sm" style={muted}>
                  {t('story.noSentiment')}
                </p>
              )}
            </Panel>

            {/* Dividends */}
            <Panel title={t('story.dividendsTitle')} state={events.status} onRetry={() => setRetry((n) => n + 1)}>
              {dividends && dividends.byYear.length > 0 ? (
                <div className="space-y-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-left" style={muted}>
                        <th className="py-1 font-semibold">{t('story.year')}</th>
                        <th className="py-1 font-semibold text-right">{t('story.perShare')}</th>
                        <th className="py-1 font-semibold text-right">{t('story.payments')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dividends.byYear.map((y) => (
                        <tr key={y.year} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                          <td className="py-1.5 font-mono-num">{y.year}</td>
                          <td className="py-1.5 text-right font-mono-num">{formatPrice(y.total, story.currency)}</td>
                          <td className="py-1.5 text-right font-mono-num">{y.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs" style={muted}>
                    {yieldPct !== null ? t('story.yieldLine', { pct: formatNumber(yieldPct, 2), ttm: formatPrice(dividends.ttm, story.currency) }) : t('story.noYield')}
                    {dividends.next && <> · {t('story.nextEx', { date: fmtDate(dividends.next.date) })}</>}
                  </p>
                </div>
              ) : (
                <p className="text-sm" style={muted}>
                  {t('story.noDividendHistory')}
                </p>
              )}
            </Panel>

            {/* Fundamentals */}
            <Panel title={t('story.ratiosTitle')} state={statements.status} onRetry={() => setRetry((n) => n + 1)}>
              {ratios.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-left" style={muted}>
                        <th className="py-1 font-semibold">{t('story.year')}</th>
                        <th className="py-1 px-2 font-semibold text-right">ROE</th>
                        <th className="py-1 px-2 font-semibold text-right">{t('story.netMargin')}</th>
                        <th className="py-1 px-2 font-semibold text-right">{t('story.revenueGrowth')}</th>
                        <th className="py-1 px-2 font-semibold text-right">DER</th>
                        <th className="py-1 pl-2 font-semibold text-right">P/E</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ratios.map((r) => (
                        <tr key={r.year} className="border-t font-mono-num text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                          <td className="py-1.5">{r.year}</td>
                          <td className="py-1.5 px-2 text-right">{r.roe === undefined ? '—' : `${formatNumber(r.roe * 100, 1)}%`}</td>
                          <td className="py-1.5 px-2 text-right">{r.netMargin === undefined ? '—' : `${formatNumber(r.netMargin * 100, 1)}%`}</td>
                          <td className="py-1.5 px-2 text-right" style={{ color: tone(r.revenueYoY ?? 0) }}>
                            {r.revenueYoY === undefined ? '—' : formatPercent(r.revenueYoY)}
                          </td>
                          <td className="py-1.5 px-2 text-right">{r.der === undefined ? '—' : formatNumber(r.der, 2)}</td>
                          <td className="py-1.5 pl-2 text-right">{r.pe === undefined ? '—' : formatNumber(r.pe, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm" style={muted}>
                  {t('story.noRatios')}
                </p>
              )}
            </Panel>
          </div>
          <p className="text-xs" style={muted}>
            {t('story.disclaimer')}
          </p>
        </>
      )}
    </div>
  );
}

function Panel({ title, state, onRetry, children }: { title: string; state: 'loading' | 'ready' | 'error'; onRetry: () => void; children: ReactNode }) {
  const t = useT();
  return (
    <section className="rounded-2xl border p-4 space-y-3 min-w-0" style={card}>
      <h3 className="font-bold">{title}</h3>
      {state === 'loading' ? (
        <div className="skeleton h-32 rounded-xl" aria-busy="true" aria-label={t('common.loading')} />
      ) : state === 'error' ? (
        <div className="flex items-center gap-2 text-sm">
          <span style={muted}>{t('common.dataUnavailable')}</span>
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-semibold" style={card}>
            <RefreshCw className="w-3 h-3" /> {t('common.tryAgain')}
          </button>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
