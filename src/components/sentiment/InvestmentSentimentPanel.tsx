/**
 * InvestmentSentimentPanel.tsx — Detail-page card "Investment sentiment": Short / Medium / Long
 * tabs with the 0–100 score and five-level label, confidence and why, review cadence, the next
 * catalyst, every component's contribution (with not-applicable reasons and rescaled weights),
 * the three pillars and their sub-factors for stocks, the re-estimated hybrid fair value, the
 * headlines behind the news score, back-test evidence, data freshness and scan progress.
 * The owner chooses how it reloads: every 2 minutes, hourly or only with "Refresh now".
 * A summary of evidence, not a buy/sell signal; the disclaimer is always shown.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, Gauge, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AssetConfig } from '../../config/assets.ts';
import { dateLocale, tOr, useLang, useT, type TranslationKey } from '../../i18n/index.ts';
import { Rich } from '../../i18n/Rich.tsx';
import type { Horizon } from '../../sentiment/newsHorizon.ts';
import type { ComponentResult } from '../../sentiment/horizons.ts';
import type { PillarId, SubFactor } from '../../sentiment/pillars.ts';
import {
  fetchSentimentV2,
  fetchSentimentValidation,
  type HorizonResult,
  type ScanStatus,
  type SentimentV2,
  type ValidationResponse,
} from '../../services/sentimentService.ts';
import { formatAssetPrice, formatDecimal } from '../../utils/format.ts';
import { formatRelativeTime } from '../../utils/marketHours.ts';
import { getSentimentRefresh, saveSentimentRefresh, type SentimentRefresh } from '../../utils/storage.ts';

const REFRESH_MS: Record<SentimentRefresh, number | null> = { '2m': 2 * 60_000, '1h': 60 * 60_000, manual: null };
const REFRESH_MODES: SentimentRefresh[] = ['2m', '1h', 'manual'];
const HORIZONS: Horizon[] = ['short', 'medium', 'long'];

/** Score color: red → grey → green. */
export function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'var(--text-secondary)';
  if (score >= 60) return 'var(--color-up)';
  if (score < 40) return 'var(--color-down)';
  return 'var(--color-gold)';
}

const signed = (x: number, digits = 1) => `${x >= 0 ? '+' : ''}${formatDecimal(x, digits)}`;

export function horizonRangeKey(group: string, h: Horizon): TranslationKey {
  const kind = group === 'crypto' ? 'crypto' : group === 'idStock' || group === 'usStock' ? 'stock' : 'other';
  return `sent.hRange.${kind}.${h}` as TranslationKey;
}

/** "Scanning IDX: prices 120/962, …" or null when nothing is running. */
export function scanText(t: ReturnType<typeof useT>, scans: ScanStatus | null): string | null {
  // Serverless hosts scan in steps between visits: unfinished counts as scanning
  if (!scans || !scans.progress.some((p) => p.running || (p.total > 0 && p.done < p.total))) return null;
  const p = Object.fromEntries(scans.progress.map((x) => [x.kind, `${x.done}/${x.total}`]));
  return t('sent.scan', {
    market: t(`sent.market.${scans.market}` as TranslationKey),
    m: p.monthly,
    s: p.statements,
    a: p.analyst,
  });
}

export function InvestmentSentimentPanel({ asset }: { asset: AssetConfig }) {
  const t = useT();
  const lang = useLang();
  const [data, setData] = useState<SentimentV2 | null>(null);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Horizon>('medium');
  const [mode, setMode] = useState<SentimentRefresh>(getSentimentRefresh);
  const [refreshing, setRefreshing] = useState(false);

  const market = asset.group === 'idStock' ? 'idx' : asset.group === 'usStock' ? 'us' : asset.group === 'crypto' ? 'crypto' : null;

  const load = useCallback(async (fresh = false) => {
    try {
      const d = await fetchSentimentV2(asset.symbol, fresh);
      setData(d);
      setError(false);
      if (market)
        fetchSentimentValidation(market)
          .then(setValidation)
          .catch(() => {});
    } catch {
      setError(true);
    }
  }, [asset.symbol, market]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  useEffect(() => {
    const every = REFRESH_MS[mode];
    if (every === null) return;
    const timer = setInterval(() => load(), every);
    return () => clearInterval(timer);
  }, [load, mode]);

  const refreshNow = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };
  const chooseMode = (m: SentimentRefresh) => {
    setMode(m);
    saveSentimentRefresh(m);
  };

  const card = 'p-5 md:p-6 rounded-xl border space-y-4';
  const cardStyle = {
    backgroundColor: 'var(--bg-surface)',
    borderColor: 'var(--border-subtle)',
  };

  const header = (
    <div className="flex items-start gap-2.5">
      <Gauge className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--accent-radar)' }} />
      <div className="min-w-0">
        <h2 id="sent-heading" className="text-base font-bold">
          {t('sent.title')}
        </h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('sent.subtitle')}
        </p>
      </div>
    </div>
  );
  const disclaimer = (
    <p role="note" className="text-[11px] flex items-start gap-1.5 p-2.5 rounded-lg" style={{ backgroundColor: 'var(--color-gold-soft)' }}>
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: 'var(--color-gold)' }} />
      <span>{t('sent.disclaimer')}</span>
    </p>
  );

  if (!data) {
    return (
      <section aria-labelledby="sent-heading" className={card} style={cardStyle}>
        {header}
        {error ? (
          <div className="space-y-2">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {t('common.dataUnavailable')}
            </p>
            <button
              type="button"
              onClick={() => load()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" /> {t('common.tryAgain')}
            </button>
          </div>
        ) : (
          <div className="h-24 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-surface-subtle)' }} aria-busy="true" />
        )}
        {disclaimer}
      </section>
    );
  }

  const h = data.horizons[tab];
  const ev = validation?.result?.horizons?.[tab] ?? null;
  const scan = scanText(t, data.freshness.scans);

  return (
    <section aria-labelledby="sent-heading" className={card} style={cardStyle}>
      {header}

      {/* How the card reloads, when it last did, and a manual refresh */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        <span>{t('sent.refresh.label')}</span>
        <div role="radiogroup" aria-label={t('sent.refresh.label')} className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
          {REFRESH_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => chooseMode(m)}
              className="px-2 py-1 font-semibold"
              style={{
                backgroundColor: mode === m ? 'var(--accent-radar-soft)' : 'var(--bg-surface)',
                color: mode === m ? 'var(--accent-radar)' : 'var(--text-secondary)',
              }}
            >
              {t(`sent.refresh.${m}` as TranslationKey)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={refreshNow}
          disabled={refreshing}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border font-semibold disabled:opacity-60"
          style={{ backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'motion-safe:animate-spin' : ''}`} /> {t('sent.refresh.now')}
        </button>
        <span className="font-mono-num">{t('sent.refresh.updated', { time: new Intl.DateTimeFormat(dateLocale(lang), { timeStyle: 'short' }).format(data.generatedAt) })}</span>
      </div>
      <p className="text-[11px] -mt-2" style={{ color: 'var(--text-secondary)' }}>
        {data.liveBar
          ? t('sent.refresh.noteLive', { time: new Intl.DateTimeFormat(dateLocale(lang), { timeStyle: 'short' }).format(data.liveBar.at) })
          : t('sent.refresh.note')}
      </p>

      <div
        role="tablist"
        aria-label={t('sent.title')}
        className="grid grid-cols-3 rounded-lg border overflow-hidden"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {HORIZONS.map((id) => {
          const r = data.horizons[id];
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className="px-2 py-2 text-left"
              style={{
                backgroundColor: active ? 'var(--accent-radar-soft)' : 'var(--bg-surface)',
              }}
            >
              <span
                className="block text-xs font-bold"
                style={{
                  color: active ? 'var(--accent-radar)' : 'var(--text-primary)',
                }}
              >
                {t(`sent.h.${id}` as TranslationKey)}
              </span>
              <span className="block text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>
                {t(horizonRangeKey(data.group, id))}
              </span>
              <span className="block text-sm font-mono-num font-bold" style={{ color: scoreColor(r.score) }}>
                {r.score === null ? '—' : Math.round(r.score)}
              </span>
            </button>
          );
        })}
      </div>

      <HorizonView h={h} lang={lang} />

      {/* Evidence from the back-test */}
      {market && (
        <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: 'var(--accent-radar)' }} />
          <span>
            {ev && ev.meanIC !== null && ev.monthsTopBeatBase !== null
              ? t('sent.evidence', {
                  market: t(`sent.market.${market}` as TranslationKey),
                  ic: formatDecimal(ev.meanIC, 3),
                  t: ev.icTStat === null ? '—' : formatDecimal(ev.icTStat, 1),
                  pct: Math.round(ev.monthsTopBeatBase),
                  n: ev.months,
                  from: ev.from ?? '—',
                  to: ev.to ?? '—',
                })
              : t('sent.notValidated', {
                  status: t(`sent.status.${validation?.status ?? 'computing'}` as TranslationKey),
                })}
          </span>
        </p>
      )}

      {data.notApplicable === 'no-statements' && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('sent.noStatements')}
        </p>
      )}

      {data.pillars && data.market ? (
        <Pillars data={data} asset={asset} />
      ) : market === 'idx' || market === 'us' ? (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('sent.scanWaiting')}
        </p>
      ) : null}

      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {t('sent.freshness', {
          prices: data.freshness.prices ?? '—',
          statements: data.freshness.statements ?? '—',
          news: data.freshness.news ? formatRelativeTime(data.freshness.news) : '—',
        })}
        {scan ? ` · ${scan}` : ''}
      </p>
      {disclaimer}
    </section>
  );
}

/** The server's English confidence reasons in the chosen language. */
function reasonText(t: ReturnType<typeof useT>, r: string): string {
  let m = /^coverage (\d+)%$/.exec(r);
  if (m) return t('sent.r.coverage', { n: m[1] });
  m = /^agreement (\d+)%$/.exec(r);
  if (m) return t('sent.r.agreement', { n: m[1] });
  m = /^validation IC (-?[\d.]+) \((significant|not significant)\)$/.exec(r);
  if (m)
    return t('sent.r.ic', {
      ic: m[1],
      sig: t(m[2] === 'significant' ? 'sent.r.significant' : 'sent.r.notSignificant'),
    });
  if (r === 'not validated yet') return t('sent.r.notValidated');
  return r;
}

function componentNote(t: ReturnType<typeof useT>, c: ComponentResult): string | null {
  if (!c.applicable) return t(c.id === 'macro' ? 'sent.na.macro' : 'sent.na.derivatives');
  if (c.id === 'news')
    return c.score === null
      ? t('sent.noHeadlines')
      : t('sent.headlinesCount', {
          n: (c.note ?? '').match(/\d+/)?.[0] ?? '0',
        });
  if (c.score === null) return t('sent.notReported');
  return null;
}

function HorizonView({ h, lang }: { h: HorizonResult; lang: string }) {
  const t = useT();
  const days = h.cadenceReason ? /(\d+)/.exec(h.cadenceReason)?.[1] : undefined;
  const cadenceReason = days ? t('sent.cadReason', { n: days }) : null;
  const label = h.label ? t(`sent.label.${h.label}` as TranslationKey) : null;
  return (
    <div className="space-y-3" lang={lang}>
      {h.score === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('sent.noScore')}
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-end justify-between gap-2">
            <span className="text-lg font-bold" style={{ color: scoreColor(h.score) }}>
              {label}
            </span>
            <span className="font-mono-num">
              <span className="text-2xl font-bold">{Math.round(h.score)}</span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                /100
              </span>
            </span>
          </div>
          <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-surface-subtle)' }} aria-hidden="true">
            {[20, 40, 60, 80].map((x) => (
              <span
                key={x}
                className="absolute top-0 bottom-0 w-px"
                style={{
                  left: `${x}%`,
                  backgroundColor: 'var(--border-subtle)',
                }}
              />
            ))}
            <div
              className="h-full rounded-full motion-safe:transition-all"
              style={{
                width: `${h.score}%`,
                backgroundColor: scoreColor(h.score),
              }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span title={h.confidenceReasons.map((r) => reasonText(t, r)).join(' · ')}>
          <Rich
            text={t('sent.confidence', {
              c: t(`sent.conf.${h.confidence}` as TranslationKey),
            })}
          />
        </span>
        <span title={cadenceReason ?? undefined}>
          <Rich
            text={t('sent.review', {
              cadence: t(`sent.cad.${h.cadence}` as TranslationKey),
            })}
          />
        </span>
        <span className="inline-flex items-start gap-1" style={{ color: 'var(--text-secondary)' }}>
          <CalendarClock className="w-3.5 h-3.5 shrink-0 mt-px" />
          {h.nextCatalyst ? (
            <span>
              <Rich
                text={t('sent.catalyst', {
                  type: t(`sent.cat.${h.nextCatalyst.type}` as TranslationKey),
                  date: h.nextCatalyst.date,
                  days: h.nextCatalyst.daysUntil,
                })}
              />
            </span>
          ) : (
            t('sent.noCatalyst')
          )}
        </span>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {t('sent.reasons', {
          list: h.confidenceReasons.map((r) => reasonText(t, r)).join(' · '),
        })}
        {cadenceReason ? ` · ${cadenceReason}` : ''}
      </p>

      <div>
        <h3 className="text-sm font-bold mb-1.5">{t('sent.drivers')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                <th className="py-1 pr-2 font-semibold">{t('sent.col.component')}</th>
                <th className="py-1 pr-2 font-semibold text-right">{t('sent.col.score')}</th>
                <th className="py-1 pr-2 font-semibold text-right">{t('sent.col.weight')}</th>
                <th className="py-1 pr-2 font-semibold text-right">{t('sent.col.contribution')}</th>
                <th className="py-1 font-semibold text-right hidden sm:table-cell">{t('sent.col.date')}</th>
              </tr>
            </thead>
            <tbody>
              {h.components.map((c) => {
                const note = componentNote(t, c);
                return (
                  <tr
                    key={c.id}
                    className="border-t align-top"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      opacity: c.weight > 0 ? 1 : 0.6,
                    }}
                  >
                    <td className="py-1.5 pr-2">
                      <span className="font-semibold">{t(`sent.comp.${c.id}` as TranslationKey)}</span>
                      {note && (
                        <span className="block text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                          {note}
                        </span>
                      )}
                      <span className="block text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {c.reference}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono-num" style={{ color: scoreColor(c.score) }}>
                      {c.score === null ? '—' : Math.round(c.score)}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono-num">{c.weight > 0 ? `${Math.round(c.weight * 100)}%` : '—'}</td>
                    <td
                      className="py-1.5 pr-2 text-right font-mono-num"
                      style={{
                        color: c.contribution > 0 ? 'var(--color-up)' : c.contribution < 0 ? 'var(--color-down)' : undefined,
                      }}
                    >
                      {c.weight > 0 ? signed(c.contribution) : '—'}
                    </td>
                    <td className="py-1.5 text-right font-mono-num hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>
                      {c.dataDate ? String(c.dataDate).slice(0, 10) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {h.reweighted && (
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            {t('sent.reweighted')}
          </p>
        )}
      </div>

      {h.news && h.news.headlines.length > 0 && (
        <div>
          <h3 className="text-sm font-bold mb-1.5">{t('sent.headlines')}</h3>
          <ul className="space-y-1 text-xs">
            {h.news.headlines.slice(0, 5).map((n) => (
              <li key={n.link + n.title} className="flex gap-2">
                <span
                  className="font-mono-num shrink-0 w-24 text-right"
                  style={{
                    color: n.points > 0 ? 'var(--color-up)' : n.points < 0 ? 'var(--color-down)' : 'var(--text-secondary)',
                  }}
                >
                  {t('sent.headlinePts', {
                    pts: signed(n.points),
                    age: n.publishedAtMs ? formatRelativeTime(n.publishedAtMs) : '—',
                  })}
                </span>
                <a href={n.link} target="_blank" rel="noopener noreferrer" className="hover:underline min-w-0" title={n.source}>
                  {n.title} <span style={{ color: 'var(--text-secondary)' }}>· {n.source}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function subNote(t: ReturnType<typeof useT>, f: SubFactor): string | null {
  if (!f.note) return null;
  const m = /^decile (\d+)$/.exec(f.note);
  if (m) return t('sent.note.decile', { n: m[1] });
  if (f.note === 'prior bad earnings news') return t('sent.note.priorBad');
  if (f.note === 'market median (small industry)') return t('sent.note.smallIndustry');
  if (f.note === 'analyst surprise (proxy for SUE)') return t('sent.sub.analystSurprise');
  return f.note;
}

function Pillars({ data, asset }: { data: SentimentV2; asset: AssetConfig }) {
  const t = useT();
  const p = data.pillars!;
  const m = data.market!;
  const ids: PillarId[] = ['momentum', 'health', 'quality'];
  const fair = p.fairValue;
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold">
        {t('sent.pillars', {
          market: t(`sent.market.${m.market}` as TranslationKey),
          n: m.n,
        })}
      </h3>
      {m.smallPeerGroup && (
        <p className="text-[11px]" style={{ color: 'var(--color-gold)' }}>
          {t('sent.smallPeers')}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {ids.map((id) => {
          const s = p.scores[id];
          return (
            <div
              key={id}
              className="p-3 rounded-lg border space-y-1.5"
              style={{
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'var(--bg-surface-subtle)',
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold">{t(`sent.pillar.${id}` as TranslationKey)}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {t(`sent.pillar.${id}.who` as TranslationKey)}
                  </div>
                </div>
                <span className="font-mono-num font-bold text-sm" style={{ color: scoreColor(s.score) }}>
                  {s.score === null ? '—' : Math.round(s.score)}
                </span>
              </div>
              <ul className="space-y-1 text-[11px]">
                {s.subFactors.map((f) => (
                  <li key={f.id} className="flex justify-between gap-2">
                    <span className="min-w-0">
                      {tOr(`sent.sub.${f.id}`, f.id)} <span style={{ color: 'var(--text-secondary)' }}>({f.weight}%)</span>
                      {subNote(t, f) && (
                        <span className="block text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                          {subNote(t, f)}
                        </span>
                      )}
                    </span>
                    <span className="font-mono-num shrink-0" style={{ color: scoreColor(f.score) }}>
                      {f.score === null ? t('sent.notReported') : Math.round(f.score)}
                    </span>
                  </li>
                ))}
              </ul>
              {s.reweighted && (
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  {t('sent.reweighted')}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {p.distressWarning && (
        <p role="alert" className="text-xs font-semibold" style={{ color: 'var(--color-down)' }}>
          {t('sent.distress')}
        </p>
      )}
      {(p.dUp || p.dDown) && (
        <p className="text-xs" style={{ color: p.dUp ? 'var(--color-up)' : 'var(--color-down)' }}>
          {t(p.dUp ? 'sent.dUp' : 'sent.dDown')}
        </p>
      )}
      {m.hybrid && fair !== null && p.hybridDiscount !== null && (
        <div className="text-xs space-y-0.5">
          <p>
            <Rich
              text={t('sent.hybrid', {
                market: t(`sent.market.${m.market}` as TranslationKey),
                fair: formatAssetPrice(fair, asset),
                disc: `${signed(p.hybridDiscount * 100)}%`,
                model: m.hybrid.model,
                n: m.hybrid.n,
                r2: formatDecimal(m.hybrid.r2, 2),
              })}
            />
          </p>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {t('sent.hybridWarn')}
          </p>
        </div>
      )}
    </div>
  );
}
