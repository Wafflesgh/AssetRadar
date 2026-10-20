/**
 * AnalystView.tsx — The daily AI analysis page (#/analyst): what the server stored for a day —
 * Gemini's narrative written only from that day's facts (when a key and quota are available),
 * data-quality checks, biggest moves, sentiment labels that changed since the previous day, the
 * strongest and weakest scores per horizon, what the AI Advisor favors, how each method has
 * scored so far, open retail SBN offers and notes added by an outside agent (e.g. Argon).
 * Older days stay selectable. Information and education only, not investment advice.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, ClipboardCheck, RefreshCw, XCircle } from 'lucide-react';
import { dateLocale, tOr, useLang, useT, type TranslationKey } from '../i18n/index.ts';
import { assetShortName } from '../i18n/assetNames.ts';
import { getAssetBySymbol } from '../config/assets.ts';
import { fetchAnalyst, type AnalystPayload } from '../services/marketDataService.ts';
import { formatDecimal, formatPercent } from '../utils/format.ts';
import type { CheckStatus } from '../ai/dailyAnalyst.ts';
import { MethodAccuracy } from './MethodAccuracy.tsx';

const HORIZONS = ['short', 'medium', 'long'] as const;

export function AnalystView({ onSelectAsset }: { onSelectAsset: (symbol: string) => void }) {
  const t = useT();
  const lang = useLang();
  const [date, setDate] = useState<string | undefined>(undefined);
  const [data, setData] = useState<AnalystPayload | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(false);
    fetchAnalyst(date)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [date, reload]);

  const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
  const muted = { color: 'var(--text-secondary)' };
  const day = (iso: string) => new Intl.DateTimeFormat(dateLocale(lang), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const name = (symbol: string) => {
    const a = getAssetBySymbol(symbol);
    return a ? assetShortName(a) : symbol;
  };
  const AssetLink = ({ symbol }: { symbol: string }) => (
    <button type="button" onClick={() => onSelectAsset(symbol)} className="font-semibold hover:underline text-left">
      {name(symbol)}
    </button>
  );
  const report = data?.report ?? null;
  const facts = report?.facts;
  const narrative = report ? report.ai[lang] ?? null : null;
  const otherNarrative = report && !narrative ? report.ai[lang === 'id' ? 'en' : 'id'] ?? null : null;
  const statusIcon = (s: CheckStatus) =>
    s === 'ok' ? (
      <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--color-up)' }} aria-label={t('dan.st.ok')} />
    ) : s === 'warn' ? (
      <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: 'var(--color-gold)' }} aria-label={t('dan.st.warn')} />
    ) : (
      <XCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--color-down)' }} aria-label={t('dan.st.fail')} />
    );

  return (
    <div className="space-y-6">
      <section className="p-5 md:p-6 rounded-xl border space-y-2" style={card}>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} /> {t('dan.title')}
        </h1>
        <p className="text-sm max-w-3xl" style={muted}>
          {t('dan.intro', { time: data?.schedule ?? '16:15 WIB' })}
        </p>
        {data && data.dates.length > 0 && (
          <label className="inline-flex items-center gap-2 text-xs">
            <span style={muted}>{t('dan.pickDate')}</span>
            <select
              value={report?.date ?? ''}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border px-2 py-1 bg-transparent font-mono-num"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              {data.dates.map((d) => (
                <option key={d} value={d}>
                  {day(d)}
                </option>
              ))}
            </select>
          </label>
        )}
        {data && !data.database && (
          <p className="text-xs p-2.5 rounded-lg" style={{ backgroundColor: 'var(--color-gold-soft)' }}>
            {t('dan.noDb')}
          </p>
        )}
      </section>

      {error && !data ? (
        <div className="p-6 rounded-xl border text-sm space-y-3" style={card} role="alert">
          <p>{t('common.dataUnavailable')}</p>
          <button type="button" onClick={() => setReload((r) => r + 1)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--border-subtle)' }}>
            <RefreshCw className="w-3.5 h-3.5" /> {t('common.tryAgain')}
          </button>
        </div>
      ) : !data ? (
        <p className="text-sm" style={muted}>
          {t('common.loading')}
        </p>
      ) : !report || !facts ? (
        <p className="p-5 rounded-xl border text-sm" style={card}>
          {t('dan.none', { time: data.schedule })}
        </p>
      ) : (
        <>
          <section className="p-5 rounded-xl border space-y-2" style={card}>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Bot className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} /> {t('dan.narrative', { date: day(report.date) })}
            </h2>
            {narrative || otherNarrative ? (
              <>
                <p className="text-sm leading-relaxed whitespace-pre-line">{narrative ?? otherNarrative}</p>
                <p className="text-[11px]" style={muted}>
                  {otherNarrative ? t('dan.otherLang') : ''} {t('dan.byModel', { model: report.ai.model ?? 'Gemini' })}
                </p>
              </>
            ) : (
              <p className="text-sm" style={muted}>
                {t('dan.noNarrative')}
              </p>
            )}
          </section>

          <section className="p-5 rounded-xl border space-y-2" style={card}>
            <h2 className="text-base font-bold">{t('dan.quality')}</h2>
            <ul className="space-y-1.5 text-sm">
              {report.quality.map((q) => (
                <li key={q.id} className="flex items-start gap-2">
                  {statusIcon(q.status)}
                  <span>
                    {q.id === 'gemini' && q.status === 'warn'
                      ? t('dan.q.gemini.warn', { error: tOr(`dan.gerr.${q.params.error}`, String(q.params.error)) })
                      : t(`dan.q.${q.id}.${q.status}` as TranslationKey, q.params)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="p-5 rounded-xl border space-y-2" style={card}>
              <h2 className="text-base font-bold">{t('dan.movers')}</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {(['up', 'down'] as const).map((side) => (
                  <ul key={side} className="space-y-1">
                    {facts.movers[side].map((m) => (
                      <li key={m.symbol} className="flex justify-between gap-2">
                        <AssetLink symbol={m.symbol} />
                        <span className="font-mono-num" style={{ color: m.c24 > 0 ? 'var(--color-up)' : 'var(--color-down)' }}>
                          {formatPercent(m.c24)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
            </section>

            <section className="p-5 rounded-xl border space-y-2" style={card}>
              <h2 className="text-base font-bold">{t('dan.changes')}</h2>
              {facts.sentimentChanges.length === 0 ? (
                <p className="text-sm" style={muted}>
                  {facts.previousDate ? t('dan.noChanges') : t('dan.firstDay')}
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {facts.sentimentChanges.slice(0, 12).map((c) => (
                    <li key={`${c.symbol}-${c.horizon}`} className="flex flex-wrap gap-x-2">
                      <AssetLink symbol={c.symbol} />
                      <span style={muted}>{t(`sent.h.${c.horizon}` as TranslationKey)}:</span>
                      <span>
                        {t(`sent.label.${c.from}` as TranslationKey)} → <b>{t(`sent.label.${c.to}` as TranslationKey)}</b>
                      </span>
                      <span className="font-mono-num" style={muted}>
                        ({c.delta > 0 ? '+' : ''}
                        {c.delta})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="p-5 rounded-xl border space-y-3" style={card}>
            <h2 className="text-base font-bold">{t('dan.extremes')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {HORIZONS.map((h) => (
                <div key={h} className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wide" style={muted}>
                    {t(`sent.h.${h}` as TranslationKey)}
                  </h3>
                  {facts.strongest[h].map((x) => (
                    <p key={`s-${x.symbol}`} className="flex justify-between gap-2">
                      <AssetLink symbol={x.symbol} />
                      <span className="font-mono-num" style={{ color: 'var(--color-up)' }}>
                        {x.score}
                      </span>
                    </p>
                  ))}
                  <p className="text-[10px] pt-1" style={muted}>
                    {t('dan.weakest')}
                  </p>
                  {facts.weakest[h].map((x) => (
                    <p key={`w-${x.symbol}`} className="flex justify-between gap-2">
                      <AssetLink symbol={x.symbol} />
                      <span className="font-mono-num" style={{ color: 'var(--color-down)' }}>
                        {x.score}
                      </span>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="p-5 rounded-xl border space-y-2" style={card}>
            <h2 className="text-base font-bold">{t('dan.advisor')}</h2>
            {Object.entries(facts.advisorFavorable).map(([days, list]) => (
              <p key={days} className="text-sm">
                <span style={muted}>{t('trace.h.advisor', { days })}: </span>
                {list.length ? list.map((s, i) => (
                  <span key={s}>
                    {i > 0 && ', '}
                    <AssetLink symbol={s} />
                  </span>
                )) : t('dan.noneFavorable')}
              </p>
            ))}
          </section>

          <section className="p-5 rounded-xl border space-y-2" style={card}>
            <h2 className="text-base font-bold">{t('dan.methods')}</h2>
            <p className="text-xs" style={muted}>
              {t('dan.methodsIntro')}
            </p>
            <MethodAccuracy methods={facts.methods} />
          </section>

          {(facts.sbnOpen.length > 0 || facts.macro.biRate !== null) && (
            <section className="p-5 rounded-xl border space-y-1 text-sm" style={card}>
              <h2 className="text-base font-bold">{t('dan.macro')}</h2>
              {facts.macro.biRate !== null && <p>{t('dan.biRate', { v: formatDecimal(facts.macro.biRate, 2) })}</p>}
              {facts.sbnOpen.map((s) => (
                <p key={s.code}>{t('dan.sbnOpen', { code: s.code, c: s.couponPct === null ? '—' : formatDecimal(s.couponPct, 2), end: s.offerEnd ? day(s.offerEnd) : '—' })}</p>
              ))}
            </section>
          )}

          {report.notes.length > 0 && (
            <section className="p-5 rounded-xl border space-y-2" style={card}>
              <h2 className="text-base font-bold">{t('dan.notes')}</h2>
              {report.notes.map((n) => (
                <div key={n.at} className="text-sm space-y-0.5">
                  <p className="text-xs" style={muted}>
                    {n.author} · {new Date(n.at).toLocaleString(dateLocale(lang), { timeZone: 'Asia/Jakarta' })}
                  </p>
                  <p className="whitespace-pre-line">{n.text}</p>
                </div>
              ))}
            </section>
          )}

          <p className="text-[11px]" style={muted}>
            {t('dan.disclaimer')}
          </p>
        </>
      )}
    </div>
  );
}
