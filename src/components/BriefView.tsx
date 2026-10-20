/**
 * BriefView.tsx — Morning brief page (#/brief): the daily summary made on the server at ±07:30 WIB
 * (Wall Street & Asia, IHSG, movers, Rupiah & gold, today's corporate events with the watchlist
 * and portfolio first, latest macro data, top headlines, AI forward-test status), earlier briefs by
 * date, and how it can also reach Telegram or the phone. A summary of the mood, not a signal.
 */
import { useEffect, useState } from 'react';
import { ExternalLink, Newspaper, RefreshCw } from 'lucide-react';
import { fetchBriefDates, fetchMorningBrief, type BriefResponse } from '../services/marketDataService.ts';
import { getAssetByCode } from '../config/assets.ts';
import { dateLocale, useLang, useT } from '../i18n/index.ts';

const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
const muted = { color: 'var(--text-secondary)' };

export function BriefView({ watchlist, onSelectAsset }: { watchlist: string[]; onSelectAsset: (symbol: string) => void }) {
  const t = useT();
  const lang = useLang();
  const time = new Intl.DateTimeFormat(dateLocale(lang), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
  const [date, setDate] = useState<string>('');
  const [dates, setDates] = useState<string[]>([]);
  const [data, setData] = useState<BriefResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    fetchBriefDates().then(setDates).catch(() => setDates([]));
  }, [retry]);
  useEffect(() => {
    let alive = true;
    setState('loading');
    fetchMorningBrief(date || undefined)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setState('ready');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [date, retry, lang]);

  const brief = data?.brief;
  const watchCodes = new Set(watchlist.map((s) => s.replace(/\.JK$/, '')));

  return (
    <div className="space-y-4 max-w-4xl">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div className="space-y-1">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Newspaper className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} /> {t('briefv.title')}
          </h1>
          <p className="text-sm" style={muted}>
            {t('briefv.intro')}
          </p>
        </div>
        <label className="text-xs flex items-center gap-2">
          <span style={muted}>{t('briefv.date')}</span>
          <select value={date} onChange={(e) => setDate(e.target.value)} className="px-2 py-1.5 rounded-lg border text-xs" style={{ ...card, color: 'var(--text-primary)' }}>
            <option value="">{t('briefv.latest')}</option>
            {dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </header>

      {state === 'error' && (
        <div className="p-4 rounded-xl border text-sm flex items-center justify-between gap-3" style={card}>
          <span>{t('common.dataUnavailable')}</span>
          <button type="button" onClick={() => setRetry((n) => n + 1)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
            <RefreshCw className="w-3.5 h-3.5" /> {t('common.tryAgain')}
          </button>
        </div>
      )}
      {state === 'loading' && !brief && <p className="text-sm" style={muted}>{t('briefv.preparing')}</p>}

      {brief && (
        <article className="p-4 md:p-5 rounded-xl border space-y-4" style={card} aria-labelledby="brief-title">
          <div>
            <h2 id="brief-title" className="text-base md:text-lg font-bold">
              {brief.headline}
            </h2>
            <p className="text-xs" style={muted}>
              {data?.preview ? `${t('briefv.preview')} ` : ''}
              {t('briefv.made', { time: time.format(brief.generatedAt) })} · {brief.aiPolished ? t('briefv.ai') : t('briefv.rules')}
            </p>
          </div>
          {brief.sections.map((s) => (
            <section key={s.id} className="space-y-1">
              <h3 className="text-sm font-bold" style={{ color: s.id === 'overview' ? 'var(--accent-radar)' : undefined }}>
                {s.title}
              </h3>
              {s.id === 'news' && brief.news.length ? (
                <ul className="space-y-1.5 text-sm">
                  {brief.news.map((n) => (
                    <li key={n.link}>
                      <a href={n.link} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex gap-1 items-start">
                        <span>{n.title}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 mt-1" style={muted} aria-hidden="true" />
                      </a>
                      <span className="text-xs block" style={muted}>
                        {n.source}
                        {n.tags.length ? ` · ${n.tags.join(', ')}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className={`text-sm space-y-0.5 ${s.id === 'overview' ? '' : 'list-disc pl-5'}`}>
                  {s.lines.map((l, i) => {
                    const code = s.id === 'calendar' ? l.replace(/^★ /, '').split(':')[0] : '';
                    const asset = code ? getAssetByCode(code) : undefined;
                    const mine = l.startsWith('★ ') || (code && watchCodes.has(code));
                    return (
                      <li key={i} className={mine ? 'font-semibold' : ''}>
                        {asset ? (
                          <button type="button" className="hover:underline text-left" onClick={() => onSelectAsset(asset.symbol)}>
                            {l}
                          </button>
                        ) : (
                          l
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
          <p className="text-xs pt-2 border-t" style={{ ...muted, borderColor: 'var(--border-subtle)' }}>
            {brief.disclaimer} {t('briefv.star')}
          </p>
        </article>
      )}

      <p className="text-xs" style={muted}>
        {t('briefv.delivery')} {data?.telegram ? t('briefv.telegramOn') : ''} {t('briefv.onlyHere')}
      </p>
    </div>
  );
}
