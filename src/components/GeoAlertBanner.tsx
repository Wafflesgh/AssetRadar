/**
 * GeoAlertBanner.tsx — Large red banner shown on every page when the live news hub detects a
 * sudden war / attack / major escalation ("high" geo alert in the last 3 hours). Shows the
 * lead headline in its original language, corroborating sources, how key safe-haven and
 * risk assets are moving right now, and offers desktop notifications. Dismissible per alert.
 */
import { assetShortName } from '../i18n/assetNames.ts';
import { useT } from '../i18n/index.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertOctagon, Bell, ExternalLink, X } from 'lucide-react';
import { ASSETS, PriceTick } from '../config/assets.ts';
import { isBreaking, useLiveNews, useNow } from '../hooks/useLiveNews.ts';
import { formatAge } from '../utils/marketHours.ts';
import { formatPercent } from '../utils/format.ts';
import { selectGeoAlert } from '../utils/newsTags.ts';
import { getDismissedAlerts, saveDismissedAlerts } from '../utils/storage.ts';

// Assets that usually react first to conflict news (shown as "market reaction now")
const REACTION_SYMBOLS = ['XAU/USD', 'USD/IDR', '^JKSE', 'BTC/IDR'];

function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function GeoAlertBanner({ ticks }: { ticks: Record<string, PriceTick> }) {
  const news = useLiveNews();
  const now = useNow(15_000);
  const [dismissed, setDismissed] = useState<string[]>(() => getDismissedAlerts());
  const t = useT();
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    notificationsSupported() ? Notification.permission : 'unsupported'
  );
  const notifiedIds = useRef(new Set<string>());

  const alert = useMemo(
    () => selectGeoAlert(news.items, now, new Set(dismissed)),
    [news.items, now, dismissed]
  );
  const breaking = alert ? isBreaking(news, alert.lead.id, now) : false;

  // Desktop notification + tab title flash for alerts that arrive live
  useEffect(() => {
    if (!alert || !breaking || notifiedIds.current.has(alert.lead.id)) return;
    notifiedIds.current.add(alert.lead.id);
    if (permission === 'granted') {
      try {
        new Notification(t('geo.notifTitle'), {
          body: `${alert.lead.title} — ${alert.lead.source}`,
          tag: alert.lead.id,
        });
      } catch {
        // Some browsers only allow notifications from a service worker
      }
    }
    const original = document.title;
    let on = false;
    const timer = setInterval(() => {
      on = !on;
      document.title = on ? t('geo.tabFlash') : original;
    }, 1000);
    const stop = setTimeout(() => {
      clearInterval(timer);
      document.title = original;
    }, 30_000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
      document.title = original;
    };
  }, [alert, breaking, permission]);

  if (!alert) return null;

  const dismiss = () => {
    const ids = [...dismissed, alert.lead.id, ...alert.related.map((r) => r.id)];
    setDismissed(ids);
    saveDismissedAlerts(ids);
  };

  const enableNotifications = async () => {
    if (!notificationsSupported()) return;
    try {
      setPermission(await Notification.requestPermission());
    } catch {
      setPermission(Notification.permission);
    }
  };

  const { lead, related, sources } = alert;
  const age = formatAge(lead.publishedAtMs, now);

  return (
    <section
      role="alert"
      aria-live="assertive"
      className={`relative z-30 border-b-2 px-4 md:px-8 py-3 ${breaking ? 'news-breaking' : ''}`}
      style={{
        backgroundColor: 'var(--color-down-soft)',
        borderColor: 'var(--color-down)',
        color: 'var(--text-primary)',
      }}
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-start gap-3">
        <AlertOctagon
          className={`w-7 h-7 shrink-0 ${breaking ? 'news-live-dot' : ''}`}
          style={{ color: 'var(--color-down)' }}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold tracking-widest uppercase">
            <span
              className="px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'var(--color-down)', color: '#FFFFFF' }}
            >
              {t('geo.badge')}
            </span>
            {breaking && <span style={{ color: 'var(--color-down)' }}>{t('geo.breaking')}</span>}
            <span className="font-mono-num normal-case tracking-normal" style={{ color: 'var(--text-secondary)' }}>
              {lead.source} · {age === 'now' ? t('geo.justNow') : t('geo.ago', { age })}
              {related.length > 0 && ` ${t('geo.moreReports', { count: related.length, sources: sources.length })}`}
            </span>
          </div>
          <a
            href={lead.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-1.5 text-base md:text-lg font-bold leading-snug hover:underline"
          >
            <span>{lead.title}</span>
            <ExternalLink className="w-4 h-4 mt-1 shrink-0 opacity-60 group-hover:opacity-100" />
          </a>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono-num">
            <span style={{ color: 'var(--text-secondary)' }}>{t('geo.reaction')}</span>
            {REACTION_SYMBOLS.map((symbol) => {
              const asset = ASSETS.find((a) => a.symbol === symbol);
              const pct = ticks[symbol]?.changePct24h;
              return (
                <span key={symbol} className="font-semibold">
                  {asset ? assetShortName(asset) : ''}{' '}
                  <span
                    style={{
                      color:
                        pct === undefined || pct === 0
                          ? 'var(--text-secondary)'
                          : pct > 0
                            ? 'var(--color-up)'
                            : 'var(--color-down)',
                    }}
                  >
                    {formatPercent(pct)}
                  </span>
                </span>
              );
            })}
          </div>
          {related.length > 0 && (
            <ul className="text-xs space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
              {related.slice(0, 2).map((r) => (
                <li key={r.id} className="truncate">
                  ›{' '}
                  <a href={r.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {r.title}
                  </a>{' '}
                  — {r.source}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {t('geo.note')}
          </p>
        </div>
        <div className="flex md:flex-col gap-2 shrink-0">
          {permission === 'default' && (
            <button
              type="button"
              onClick={enableNotifications}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
              style={{ borderColor: 'var(--color-down)', color: 'var(--color-down)' }}
            >
              <Bell className="w-3.5 h-3.5" />
              {t('geo.notify')}
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('geo.dismissLabel')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
          >
            <X className="w-3.5 h-3.5" />
            {t('geo.dismiss')}
          </button>
        </div>
      </div>
    </section>
  );
}
