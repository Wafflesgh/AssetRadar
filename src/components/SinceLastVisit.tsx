/** SinceLastVisit.tsx — Returning visitor summary using existing quotes, news and alert history. */
import { useEffect, useRef, useState } from 'react';
import { getAssetBySymbol, type PriceTick } from '../config/assets.ts';
import { useLiveNews } from '../hooks/useLiveNews.ts';
import { useT, dateLocale } from '../i18n/index.ts';
import { formatPercent } from '../utils/format.ts';
import { getLastVisit, saveLastVisit, getSavedWatchlist, getPortfolioTxs } from '../utils/storage.ts';
import { sinceLastVisit, visitSnapshot } from '../utils/sinceLastVisit.ts';
import { loadAlertHistory, getPushStatus, fetchServerAlertHistory } from '../services/alertService.ts';
import type { AlertHistoryEntry } from '../utils/alerts.ts';

export function SinceLastVisit({ ticks }: { ticks: Record<string, PriceTick> }) {
  const t = useT();
  const news = useLiveNews();
  const [previous] = useState(getLastVisit);
  const [openedAt] = useState(Date.now);
  const [dismissed, setDismissed] = useState(false);
  const [history, setHistory] = useState<AlertHistoryEntry[]>(loadAlertHistory);
  const latest = useRef(ticks);
  latest.current = ticks;
  const symbols = () => [...new Set([...getSavedWatchlist(), ...getPortfolioTxs().map(tx => tx.symbol)])];
  useEffect(() => {
    const save = () => saveLastVisit(visitSnapshot(symbols(), latest.current, Date.now()));
    const hidden = () => { if (document.visibilityState === 'hidden') save(); };
    const timer = window.setInterval(save, 600_000);
    document.addEventListener('visibilitychange', hidden);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', hidden); save(); };
  }, []);
  useEffect(() => {
    let active = true;
    const reload = () => setHistory(loadAlertHistory());
    window.addEventListener('assetradar:alerts-changed', reload);
    if (previous && openedAt - previous.at >= 3600_000) {
      getPushStatus().then(s => s.loggedIn && s.serverAlerts ? fetchServerAlertHistory() : null).then(server => {
        if (active && server) setHistory([...server, ...loadAlertHistory()]);
      }).catch(() => {});
    }
    return () => { active = false; window.removeEventListener('assetradar:alerts-changed', reload); };
  }, [previous, openedAt]);
  const result = sinceLastVisit(previous, openedAt, symbols(), ticks, news.items);
  if (dismissed || !result || !previous) return null;
  const hours = Math.floor((openedAt - previous.at) / 3600_000);
  const relative = new Intl.RelativeTimeFormat(dateLocale(), { numeric: 'always' }).format(hours >= 24 ? -Math.floor(hours / 24) : -hours, hours >= 24 ? 'day' : 'hour');
  const alerts = [...new Map(history.filter(h => h.at >= previous.at).map(h => [h.id, h])).values()].sort((a, b) => b.at - a.at);
  return <section className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
    <div className="flex justify-between gap-3 items-center"><h2 className="font-bold">{t('since.title', { time: relative })}</h2>
      <button type="button" className="min-h-11 px-3" onClick={() => setDismissed(true)}>{t('since.dismiss')}</button></div>
    <ul className="space-y-2">{result.changes.map(row => <li key={row.symbol} className="flex justify-between gap-3">
      <span>{getAssetBySymbol(row.symbol)?.shortName ?? row.symbol}</span><span>{row.change === null ? t('since.unavailable') : formatPercent(row.change)}</span>
    </li>)}</ul>
    {result.news.length > 0 && <div><h3 className="font-semibold">{t('since.news')}</h3><ul>{result.news.map(n => <li key={n.id}>
      <a href={/^https?:\/\//i.test(n.link) ? n.link : undefined} target="_blank" rel="noopener noreferrer" className="underline">{n.title}</a>
    </li>)}</ul></div>}
    {alerts.length > 0 && <div><h3 className="font-semibold">{t('since.alerts')}</h3><ul>{alerts.map(h => <li key={h.id}>{h.title}: {h.body}</li>)}</ul></div>}
  </section>;
}
