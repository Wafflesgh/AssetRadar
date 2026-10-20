/**
 * AlertsView.tsx — Alerts page (#/alerts): how alerts are delivered on this device (server web
 * push when the server is set up and this device subscribed, otherwise browser notifications
 * while the app is open), iPhone instructions, "Send test notification", quiet hours, reminders
 * for the watchlist/portfolio calendar, the list of alerts (active / switched off, edit, pause,
 * delete) and the history of fired alerts.
 */
import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { getAssetBySymbol, type PriceTick } from '../config/assets.ts';
import { ALERT_KIND_LABELS, type AlertHistoryEntry, type AlertSettings, type UserAlert } from '../utils/alerts.ts';
import { formatAssetPrice } from '../utils/format.ts';
import {
  disablePush,
  enablePush,
  fetchServerAlertHistory,
  getPushStatus,
  loadAlertHistory,
  loadAlerts,
  loadAlertSettings,
  notificationPermission,
  requestNotificationPermission,
  sendTestNotification,
  storeAlerts,
  storeAlertSettings,
  type PushStatus,
} from '../services/alertService.ts';
import { onSyncApplied } from '../services/syncService.ts';
import { AlertEditor } from './AlertEditor.tsx';

const TIME = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
const muted = { color: 'var(--text-secondary)' };
const DELIVERY: Record<AlertHistoryEntry['delivery'], string> = {
  push: 'Push sent',
  browser: 'Shown in browser',
  silenced: 'Quiet hours (not shown)',
  throttled: 'Skipped (too many at once)',
  failed: 'Push failed',
};

function describe(a: UserAlert): string {
  const asset = a.symbol ? getAssetBySymbol(a.symbol) : undefined;
  const name = asset?.shortName ?? a.symbol ?? '';
  switch (a.kind) {
    case 'priceAbove':
    case 'priceBelow':
      return `${name}: ${ALERT_KIND_LABELS[a.kind].toLowerCase()} ${asset && a.value !== undefined ? formatAssetPrice(a.value, asset) : a.value}`;
    case 'dailyMove':
      return `${name}: daily move of at least ${a.value}%`;
    case 'calendar':
      return `${name}: ex-dividend / earnings tomorrow`;
    case 'news':
      return `${name}: new headline`;
    case 'geo':
      return 'Geopolitical alert (high)';
  }
}

export function AlertsView({ ticks, onSelectAsset }: { ticks: Record<string, PriceTick>; onSelectAsset: (symbol: string) => void }) {
  const [alerts, setAlerts] = useState<UserAlert[]>(() => loadAlerts());
  const [settings, setSettings] = useState<AlertSettings>(() => loadAlertSettings());
  const [history, setHistory] = useState<AlertHistoryEntry[]>(() => loadAlertHistory());
  const [serverHistory, setServerHistory] = useState<AlertHistoryEntry[] | null>(null);
  const [push, setPush] = useState<PushStatus | null>(null);
  const [permission, setPermission] = useState(() => notificationPermission());
  const [editing, setEditing] = useState<UserAlert | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () => {
    setAlerts(loadAlerts());
    setSettings(loadAlertSettings());
    setHistory(loadAlertHistory());
  };
  useEffect(() => {
    window.addEventListener('assetradar:alerts-changed', reload);
    const off = onSyncApplied(['alerts', 'settings'], reload);
    return () => {
      window.removeEventListener('assetradar:alerts-changed', reload);
      off();
    };
  }, []);
  const refreshPush = () =>
    getPushStatus().then((s) => {
      setPush(s);
      if (s.loggedIn && s.serverAlerts) fetchServerAlertHistory().then(setServerHistory);
    });
  useEffect(() => {
    refreshPush();
  }, []);

  const act = async (job: () => Promise<string | void>) => {
    setBusy(true);
    setMessage(null);
    try {
      const msg = await job();
      if (msg) setMessage(msg);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
      setPermission(notificationPermission());
      refreshPush();
    }
  };

  const update = (next: UserAlert[]) => {
    storeAlerts(next);
    setAlerts(next);
  };
  const saveSettings = (next: AlertSettings) => {
    storeAlertSettings(next);
    setSettings(next);
  };

  const serverMode = Boolean(push?.serverAlerts && push.loggedIn && push.subscribed);
  const allHistory = [...(serverHistory ?? []), ...history].sort((a, b) => b.at - a.at).slice(0, 100);

  return (
    <div className="space-y-5 max-w-4xl">
      <header className="space-y-1">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} /> Alerts
        </h1>
        <p className="text-sm" style={muted}>
          Price levels, big daily moves, ex-dividend or earnings tomorrow, new headlines and geopolitical alerts. Alerts are reminders you set
          yourself — not buy or sell signals.
        </p>
      </header>

      {/* Delivery */}
      <section className="p-4 md:p-5 rounded-xl border space-y-3" style={card} aria-labelledby="alerts-delivery">
        <h2 id="alerts-delivery" className="text-base font-bold">
          How you are notified
        </h2>
        {serverMode ? (
          <p className="text-sm">
            <strong>Server push is on for this device.</strong> The server checks your alerts against the live prices and sends a notification
            even when AssetRadar is closed (while the server is awake — see README).
          </p>
        ) : (
          <p className="text-sm">
            <strong>Browser notifications while the app is open.</strong> Alerts are checked on this device every few seconds while AssetRadar
            is open in a tab or as an installed app; nothing is checked while it is closed.
            {push && !push.serverAlerts && ' Server push is not set up (it needs a database, the owner passphrase and VAPID keys on the server — see README).'}
            {push?.serverAlerts && !push.loggedIn && ' Log in under Settings → Sync to use server push.'}
          </p>
        )}
        {push?.needsInstall && (
          <p className="text-xs p-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
            iPhone / iPad: notifications only work after installing the app — tap Share → <strong>Add to Home Screen</strong>, open AssetRadar
            from the home screen (iOS 16.4 or newer), then enable notifications here.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {permission !== 'granted' && permission !== 'unsupported' && (
            <button type="button" disabled={busy} onClick={() => act(async () => void (await requestNotificationPermission()))} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold" style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}>
              <BellRing className="w-3.5 h-3.5" /> Allow notifications
            </button>
          )}
          {push?.serverAlerts && push.loggedIn && push.supported && !push.subscribed && (
            <button type="button" disabled={busy} onClick={() => act(async () => { await enablePush(); return 'Server push enabled for this device.'; })} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--accent-radar)', color: 'var(--accent-radar)' }}>
              <BellRing className="w-3.5 h-3.5" /> Enable server push on this device
            </button>
          )}
          {push?.subscribed && (
            <button type="button" disabled={busy} onClick={() => act(async () => { await disablePush(); return 'Server push turned off for this device.'; })} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--border-subtle)' }}>
              <BellOff className="w-3.5 h-3.5" /> Turn off push on this device
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => act(sendTestNotification)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--border-subtle)' }}>
            <Send className="w-3.5 h-3.5" /> Send test notification
          </button>
        </div>
        {permission === 'denied' && (
          <p className="text-xs font-semibold" style={{ color: 'var(--color-down)' }}>
            Notifications are blocked for this site. Allow them in the browser's site settings.
          </p>
        )}
        {permission === 'unsupported' && <p className="text-xs" style={muted}>This browser does not support notifications.</p>}
        {message && (
          <p className="text-xs" role="status">
            {message}
          </p>
        )}

        <div className="pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="space-y-1.5">
            <label className="inline-flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={settings.quiet.enabled} onChange={(e) => saveSettings({ ...settings, quiet: { ...settings.quiet, enabled: e.target.checked } })} /> Quiet hours (WIB)
            </label>
            <div className="flex items-center gap-2">
              <input type="time" value={settings.quiet.start} onChange={(e) => saveSettings({ ...settings, quiet: { ...settings.quiet, start: e.target.value } })} className="px-2 py-1 rounded border" style={{ ...card, color: 'var(--text-primary)' }} aria-label="Quiet hours start" />
              <span>to</span>
              <input type="time" value={settings.quiet.end} onChange={(e) => saveSettings({ ...settings, quiet: { ...settings.quiet, end: e.target.value } })} className="px-2 py-1 rounded border" style={{ ...card, color: 'var(--text-primary)' }} aria-label="Quiet hours end" />
            </div>
            <p style={muted}>Alerts that fire in this window are kept in the history but not shown.</p>
          </div>
          <div className="space-y-1.5">
            <label className="inline-flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={settings.holdingsCalendar} onChange={(e) => saveSettings({ ...settings, holdingsCalendar: e.target.checked })} /> Ex-dividend & earnings reminders
            </label>
            <p style={muted}>The day before an ex-dividend date or earnings report of any stock in your watchlist or portfolio.</p>
          </div>
        </div>
      </section>

      {/* Alert list */}
      <section className="p-4 md:p-5 rounded-xl border space-y-3" style={card} aria-labelledby="alerts-list">
        <div className="flex items-center justify-between gap-2">
          <h2 id="alerts-list" className="text-base font-bold">
            Your alerts ({alerts.length})
          </h2>
          {editing === null && (
            <button type="button" onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold" style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}>
              <Plus className="w-3.5 h-3.5" /> New alert
            </button>
          )}
        </div>
        {editing !== null && (
          <div className="p-3 rounded-lg border" style={{ borderColor: 'var(--accent-radar)' }}>
            <AlertEditor editing={editing === 'new' ? undefined : editing} ticks={ticks} onDone={() => setEditing(null)} />
          </div>
        )}
        {alerts.length === 0 && editing === null && (
          <p className="text-sm" style={muted}>
            No alerts yet. Create one here or with the bell button on any asset page.
          </p>
        )}
        <ul className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {alerts.map((a) => {
            const asset = a.symbol ? getAssetBySymbol(a.symbol) : undefined;
            const tick = a.symbol ? ticks[a.symbol] : undefined;
            return (
              <li key={a.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold break-words">
                    {asset ? (
                      <button type="button" className="hover:underline text-left" onClick={() => onSelectAsset(asset.symbol)}>
                        {describe(a)}
                      </button>
                    ) : (
                      describe(a)
                    )}
                  </p>
                  <p className="text-xs" style={muted}>
                    <span style={{ color: a.active ? 'var(--color-up)' : 'var(--text-secondary)' }}>{a.active ? 'Active' : 'Off'}</span>
                    {' · '}
                    {a.repeat ? `repeats, at most every ${a.cooldownMin >= 1440 ? '1 day' : `${a.cooldownMin / 60} h`}` : 'once'}
                    {asset && tick && Number.isFinite(tick.price) && tick.status !== 'error' ? ` · now ${formatAssetPrice(tick.price, asset)}` : ''}
                    {a.note ? ` · ${a.note}` : ''}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button type="button" onClick={() => update(alerts.map((x) => (x.id === a.id ? { ...x, active: !x.active } : x)))} className="px-2.5 py-1.5 rounded-lg border text-xs font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
                    {a.active ? 'Pause' : 'Turn on'}
                  </button>
                  <button type="button" onClick={() => setEditing(a)} aria-label="Edit alert" className="p-1.5 rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => update(alerts.filter((x) => x.id !== a.id))} aria-label="Delete alert" className="p-1.5 rounded-lg border" style={{ borderColor: 'var(--border-subtle)', color: 'var(--color-down)' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* History */}
      <section className="p-4 md:p-5 rounded-xl border space-y-3" style={card} aria-labelledby="alerts-history">
        <h2 id="alerts-history" className="text-base font-bold">
          History
        </h2>
        {allHistory.length === 0 ? (
          <p className="text-sm" style={muted}>
            Nothing has fired yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {allHistory.map((h) => (
              <li key={h.id + h.delivery} className="text-xs">
                <p className="font-semibold text-sm break-words">{h.title}</p>
                <p className="break-words" style={muted}>
                  {TIME.format(h.at)} WIB · {DELIVERY[h.delivery]} · {h.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
