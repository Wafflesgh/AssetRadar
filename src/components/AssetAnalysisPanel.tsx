/**
 * AssetAnalysisPanel.tsx — "Why" behind the sentiment score for one asset, in three parts:
 * 1) the evidence breakdown (each component's reading, weight, contribution and source study),
 * 2) technical analysis — the indicator scorecard, detected chart patterns with their key
 *    level, support/resistance, and how often the same scorecard lean was followed by a rise
 *    on this asset's own history versus the base rate,
 * 3) fundamental analysis — Piotroski F-score and valuation for stocks, plus the news and
 *    events driving the move (classified, weighted by source and recency).
 * Refreshes every 2 minutes and when a new headline for the asset arrives.
 */
import { t, useT, type TranslationKey } from '../i18n/index.ts';
import { Rich } from '../i18n/Rich.tsx';
import {
  analysisSummary,
  componentExplanation,
  componentLabel,
  fScoreDetail,
  fScoreLabel,
  patternDescription,
  patternName,
  signalLabel,
  signalMethod,
  signalReading,
} from '../i18n/analysisText.ts';
import { TranslateButton } from './TranslateButton.tsx';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { BookOpen, CheckCircle2, CircleSlash, ExternalLink, FlaskConical, LineChart, Newspaper, RefreshCw, XCircle } from 'lucide-react';
import type { AssetAnalysis, EvidenceComponent } from '../ai/analysis.ts';
import { getAssetBySymbol } from '../config/assets.ts';
import { fetchAssetAnalysis } from '../services/marketDataService.ts';
import { formatAssetPrice, formatDecimal } from '../utils/format.ts';
import { formatAge } from '../utils/marketHours.ts';

interface AssetAnalysisPanelProps {
  symbol: string;
  assetName: string;
  /** Changes when a new headline for this asset arrives (triggers a silent refresh). */
  refreshKey?: string;
}

const REFRESH_MS = 2 * 60_000;

export function AssetAnalysisPanel({ symbol, assetName, refreshKey }: AssetAnalysisPanelProps) {
  const [data, setData] = useState<AssetAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const asset = getAssetBySymbol(symbol);
  const tr = useT();

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetchAssetAnalysis(symbol);
        setData(res);
        setError(null);
      } catch {
        if (!silent) setError(tr('analysis.unavailable'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [symbol]
  );

  useEffect(() => {
    setData(null);
    load();
    const t = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!refreshKey) return;
    const t = setTimeout(() => load(true), 4000);
    return () => clearTimeout(t);
  }, [refreshKey, load]);

  const card = 'p-5 md:p-6 rounded-xl border space-y-4';
  const cardStyle = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };

  if (loading && !data) {
    return (
      <div className={card} style={cardStyle} aria-busy="true">
        <div className="h-5 w-56 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-surface-subtle)' }} />
        <div className="h-24 w-full rounded animate-pulse" style={{ backgroundColor: 'var(--bg-surface-subtle)' }} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className={card} style={cardStyle}>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {error ?? tr('common.dataUnavailable')}
        </p>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
          style={{ backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> {tr('common.tryAgain')}
        </button>
      </div>
    );
  }

  const t = data.technical;
  const f = data.fundamentals;
  const price = (v: number | null | undefined) => (v === null || v === undefined || !asset ? '—' : formatAssetPrice(v, asset));

  return (
    <div className="space-y-6">
      {/* 1. Evidence breakdown */}
      <section aria-labelledby="evidence-heading" className={card} style={cardStyle}>
        <Header
          id="evidence-heading"
          icon={<FlaskConical className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} />}
          title={tr('analysis.whyTitle', { label: tr(`sentiment.${data.label}` as TranslationKey).toLowerCase(), name: assetName })}
          subtitle={tr('analysis.whySubtitle', { score: data.score, years: data.historyYears, age: formatAge(data.generatedAt) })}
        />
        <p className="text-sm leading-relaxed">{analysisSummary(data)}</p>
        <ul className="space-y-3">
          {data.components.map((c) => (
            <EvidenceRow key={c.id} c={c} />
          ))}
        </ul>
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {tr('analysis.evidenceNote')}
        </p>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 2. Technical analysis */}
        <section aria-labelledby="technical-heading" className={card} style={cardStyle}>
          <Header
            id="technical-heading"
            icon={<LineChart className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} />}
            title={tr('analysis.techTitle')}
            subtitle={tr('analysis.techSubtitle')}
          />
          {!t ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{tr('analysis.noHistory')}</p>
          ) : (
            <>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>
                  {tr('analysis.patterns')}
                </h4>
                {t.patterns.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {tr('analysis.noPattern')}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {t.patterns.map((p) => (
                      <li key={p.id} className="p-3 rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm">{patternName(p)}</span>
                          <BiasChip bias={p.bias} />
                          <span
                            className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-secondary)' }}
                          >
                            {p.status === 'confirmed' ? tr('analysis.confirmed') : tr('analysis.forming')}
                          </span>
                          {p.keyLevel !== undefined && (
                            <span className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                              {tr('analysis.keyLevel', { price: price(p.keyLevel) })}
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          {patternDescription(p)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <caption className="sr-only">{tr('analysis.scorecard')}</caption>
                  <thead>
                    <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                      <th scope="col" className="py-1.5 pr-2 font-semibold">{tr('analysis.method')}</th>
                      <th scope="col" className="py-1.5 pr-2 font-semibold">{tr('analysis.reading')}</th>
                      <th scope="col" className="py-1.5 font-semibold text-right">{tr('analysis.lean')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.signals.map((s) => (
                      <tr key={s.id} className="border-t align-top" style={{ borderColor: 'var(--border-subtle)' }}>
                        <td className="py-2 pr-2">
                          <span className="font-semibold block">{signalLabel(s)}</span>
                          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            {signalMethod(s)}
                          </span>
                        </td>
                        <td className="py-2 pr-2">{signalReading(s)}</td>
                        <td className="py-2 text-right">
                          <BiasChip bias={s.bias} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <Level label={tr('analysis.support')} value={price(t.indicators.support)} />
                <Level label={tr('analysis.resistance')} value={price(t.indicators.resistance)} />
                <Level label={tr('analysis.sma50')} value={price(t.indicators.sma50)} />
                <Level label={tr('analysis.sma200')} value={price(t.indicators.sma200)} />
                <Level label={tr('analysis.low52')} value={price(t.indicators.low52w)} />
                <Level label={tr('analysis.high52')} value={price(t.indicators.high52w)} />
              </dl>

              {t.edge && (
                <div className="p-3 rounded-lg text-xs leading-relaxed" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
                  <p className="font-bold mb-1">{tr('analysis.edgeTitle', { name: assetName })}</p>
                  <p>
                    <Rich
                      text={tr('analysis.edgeText', {
                        lean: tr(`analysis.lean.${t.edge.lean}` as TranslationKey),
                        samples: t.edge.samples,
                        days: t.edge.horizonDays,
                        up: Math.round(t.edge.upRate * 100),
                        base: Math.round(t.edge.baseUpRate * 100),
                        avg: formatDecimal(t.edge.avgReturn * 100, 1),
                        baseAvg: formatDecimal(t.edge.baseAvgReturn * 100, 1),
                      })}
                    />
                  </p>
                  <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>{edgeVerdict(t.edge.lean, t.edge.upRate, t.edge.baseUpRate, t.edge.samples)}</p>
                </div>
              )}
            </>
          )}
        </section>

        {/* 3. Fundamental analysis */}
        <section aria-labelledby="fundamental-heading" className={card} style={cardStyle}>
          <Header
            id="fundamental-heading"
            icon={<BookOpen className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} />}
            title={tr('analysis.fundTitle')}
            subtitle={f ? tr('analysis.fundSubtitle', { fy: f.fiscalYearEnd, currency: f.currency }) : tr('analysis.fundSubtitleNews')}
          />

          {f && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <div>
                  <span className="text-[11px] block" style={{ color: 'var(--text-secondary)' }}>Piotroski F-score</span>
                  <span className="text-2xl font-bold font-mono-num">
                    {f.fScore}
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>/{f.fScoreMax}</span>
                  </span>
                </div>
                {f.pe !== null && <Level label="P/E" value={f.pe.toFixed(1)} />}
                {f.pb !== null && <Level label="P/B" value={f.pb.toFixed(1)} />}
                {f.grossProfitability !== null && <Level label={tr('analysis.gpa')} value={`${formatDecimal(f.grossProfitability * 100, 1)}%`} />}
                {f.roa !== null && <Level label={tr('analysis.roa')} value={`${formatDecimal(f.roa * 100, 1)}%`} />}
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {f.signals.map((s) => (
                  <li key={s.id} className="flex items-start gap-1.5">
                    {s.pass === null ? (
                      <CircleSlash className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--text-secondary)' }} aria-label={tr('common.notReported')} />
                    ) : s.pass ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--color-up)' }} aria-label={tr('analysis.pass')} />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--color-down)' }} aria-label={tr('analysis.fail')} />
                    )}
                    <span>
                      {fScoreLabel(s)}
                      <span className="block text-[10px]" style={{ color: 'var(--text-secondary)' }}>{fScoreDetail(s.detail)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                {tr('analysis.piotroskiNote')}
              </p>
            </div>
          )}

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <Newspaper className="w-3.5 h-3.5" /> {tr('analysis.driving')}
            </h4>
            {data.news.byCategory.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {data.news.byCategory.map((c) => (
                  <span
                    key={c.category}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      color: c.net > 0.01 ? 'var(--color-up)' : c.net < -0.01 ? 'var(--color-down)' : 'var(--text-secondary)',
                    }}
                  >
                    {tr(`driver.${c.category}` as TranslationKey)} {c.net > 0.01 ? '▲' : c.net < -0.01 ? '▼' : '•'} {c.count}
                  </span>
                ))}
              </div>
            )}
            {data.news.drivers.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{tr('analysis.noHeadlines')}</p>
            ) : (
              <ul className="space-y-2">
                {data.news.drivers.slice(0, 8).map((d) => (
                  <li key={d.link + d.title} className="text-xs">
                    <a href={d.link} target="_blank" rel="noopener noreferrer" className="group block">
                      <span className="flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        <BiasChip bias={d.direction} />
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{tr(`driver.${d.category}` as TranslationKey)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{d.source}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatAge(d.publishedAtMs)}</span>
                        <span aria-hidden="true">·</span>
                        <span title={tr('analysis.weightTitle')}>{tr('analysis.weight', { w: formatDecimal(d.weight, 2) })}</span>
                      </span>
                      <span className="flex items-start gap-1.5 mt-0.5">
                        <span className="font-semibold leading-snug group-hover:underline">{d.title}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 opacity-60" />
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{tr('analysis.readAs', { reason: d.reason })}</span>
                    </a>
                    <TranslateButton text={d.title} />
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] mt-3" style={{ color: 'var(--text-secondary)' }}>
              {tr('analysis.newsNote')}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function edgeVerdict(lean: string, upRate: number, base: number, n: number): string {
  if (n < 30) return t('analysis.edge.few');
  const diff = upRate - base;
  if (lean === 'neutral') return t('analysis.edge.neutral');
  const helpful = lean === 'bullish' ? diff > 0.03 : diff < -0.03;
  const contrary = lean === 'bullish' ? diff < -0.03 : diff > 0.03;
  const l = t(`analysis.lean.${lean}` as TranslationKey);
  if (helpful) return t('analysis.edge.helpful', { lean: l });
  if (contrary) return t('analysis.edge.contrary', { lean: l });
  return t('analysis.edge.none', { lean: l });
}

function Header({ id, icon, title, subtitle }: { id: string; icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div>
      <h3 id={id} className="text-base font-bold flex items-center gap-2">
        {icon}
        {title}
      </h3>
      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
        {subtitle}
      </p>
    </div>
  );
}

function Level({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{label}</dt>
      <dd className="font-mono-num font-semibold">{value}</dd>
    </div>
  );
}

function BiasChip({ bias }: { bias: number }) {
  const label = t(bias > 0 ? 'sentiment.Bullish' : bias < 0 ? 'sentiment.Bearish' : 'sentiment.Neutral');
  const color = bias > 0 ? 'var(--color-up)' : bias < 0 ? 'var(--color-down)' : 'var(--text-secondary)';
  const bg = bias > 0 ? 'var(--color-up-soft)' : bias < 0 ? 'var(--color-down-soft)' : 'var(--bg-surface-subtle)';
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap" style={{ color, backgroundColor: bg }}>
      {label}
    </span>
  );
}

/** Diverging bar: reading from −1 (left, bearish) to +1 (right, bullish). */
function EvidenceRow({ c }: { c: EvidenceComponent }) {
  const pctW = Math.abs(c.value) * 50;
  const color = c.value > 0 ? 'var(--color-up)' : c.value < 0 ? 'var(--color-down)' : 'var(--text-secondary)';
  return (
    <li>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold">{componentLabel(c)}</span>
        <span className="font-mono-num" style={{ color: 'var(--text-secondary)' }}>
          {t('analysis.contribution', { w: Math.round(c.weight * 100) })}{' '}
          <span style={{ color }}>
            {c.contribution >= 0 ? '+' : ''}
            {t('analysis.pts', { v: formatDecimal(c.contribution * 50, 1) })}
          </span>
        </span>
      </div>
      <div className="relative h-2 mt-1 rounded-full" style={{ backgroundColor: 'var(--bg-surface-subtle)' }} aria-hidden="true">
        <span className="absolute top-0 bottom-0 w-px left-1/2" style={{ backgroundColor: 'var(--border-subtle)' }} />
        <span
          className="absolute top-0 bottom-0 rounded-full"
          style={{ backgroundColor: color, width: `${pctW}%`, left: c.value >= 0 ? '50%' : `${50 - pctW}%` }}
        />
      </div>
      <p className="text-xs mt-1 leading-relaxed">{componentExplanation(c)}</p>
      <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{c.reference}</p>
    </li>
  );
}
