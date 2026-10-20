/**
 * alertService.ts — Browser side of alerts: the alert list and settings (synced via storage.ts),
 * notification permission, web push subscription (when the server has VAPID keys, a database and
 * the owner is logged in, the server checks alerts and pushes even when the app is closed), and
 * the local checker used otherwise: alerts are evaluated against the live prices while the app is
 * open and shown with the Notification API. Also the "Send test notification" helper.
 */
import { ALL_ASSETS, getAssetBySymbol, type PriceTick } from '../config/assets.ts';
import {
  addHistory,
  afterFire,
  calendarEventsTomorrow,
  evaluateAlert,
  HOLDINGS_CALENDAR_ID,
  inQuietHours,
  parseAlertSettings,
  parseAlerts,
  throttle,
  type AlertFire,
  type AlertHistoryEntry,
  type AlertSettings,
  type AlertState,
  type UserAlert,
} from '../utils/alerts.ts';
import type { CalendarEvent } from '../utils/corporateCalendar.ts';
import { formatAssetPrice } from '../utils/format.ts';
import {
  getAlertHistoryRaw,
  getAlertSettingsRaw,
  getAlertStates,
  getAlertsRaw,
  getPortfolioTxs,
  getSavedWatchlist,
  saveAlertHistory,
  saveAlertSettings,
  saveAlertStates,
  saveAlerts,
} from '../utils/storage.ts';
import { fetchCorporateCalendar } from './marketDataService.ts';
import { newsStore } from './newsStream.ts';
import { getSyncState, ownerHeaders } from './syncService.ts';

export function loadAlerts(): UserAlert[] {
  return parseAlerts(getAlertsRaw());
}

export function storeAlerts(list: UserAlert[]): void {
  saveAlerts(list);
  window.dispatchEvent(new Event('assetradar:alerts-changed'));
}

export function loadAlertSettings(): AlertSettings {
  return parseAlertSettings(getAlertSettingsRaw());
}

export function storeAlertSettings(settings: AlertSettings): void {
  saveAlertSettings(settings);
  window.dispatchEvent(new Event('assetradar:alerts-changed'));
}

export function loadAlertHistory(): AlertHistoryEntry[] {
  return getAlertHistoryRaw() as AlertHistoryEntry[];
}

export function newAlertId(): string {
  return `al-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---- Notifications ------------------------------------------------------------------------------

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (notificationPermission() === 'unsupported') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Shows a notification from this page (through the service worker when there is one: needed on Android). */
export async function showLocalNotification(fire: AlertFire, tag?: string): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false;
  const options = { body: fire.body, icon: '/icons/icon-192.png', tag, data: { url: fire.url ?? '#/alerts' } };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) {
      await reg.showNotification(fire.title, options);
      return true;
    }
    const n = new Notification(fire.title, options);
    n.onclick = () => {
      window.focus();
      if (fire.url) window.location.hash = fire.url;
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

// ---- Web push -------------------------------------------------------------------------------------

export interface PushStatus {
  /** Browser supports push (service worker + PushManager). */
  supported: boolean;
  /** iPhone/iPad not running as an installed app: push needs "Add to Home Screen" first. */
  needsInstall: boolean;
  vapidConfigured: boolean;
  /** The server checks alerts (database + VAPID + owner login set up on the server). */
  serverAlerts: boolean;
  loggedIn: boolean;
  /** This device has a push subscription. */
  subscribed: boolean;
}

function isIosBrowser(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

let serverMode = false;

async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager?.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

export async function getPushStatus(): Promise<PushStatus> {
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  let config = { vapidConfigured: false, serverAlerts: false };
  try {
    const res = await fetch('/api/push/config', { headers: ownerHeaders() });
    if (res.ok && !res.headers.get('X-AssetRadar-Offline')) config = await res.json();
  } catch {
    // Offline: local alerts only
  }
  const subscribed = Boolean(await currentSubscription());
  const loggedIn = getSyncState().loggedIn;
  serverMode = Boolean(config.serverAlerts && loggedIn && subscribed);
  return { supported, needsInstall: supported ? false : isIosBrowser(), vapidConfigured: config.vapidConfigured, serverAlerts: config.serverAlerts, loggedIn, subscribed };
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Subscribes this device for server push (asks for permission first). */
export async function enablePush(): Promise<void> {
  if ((await requestNotificationPermission()) !== 'granted') throw new Error('Notifications are blocked for this site in the browser settings.');
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error('Push needs the installed/production app (no service worker in this build).');
  const res = await fetch('/api/push/config');
  const config = await res.json();
  if (!config.publicKey) throw new Error('Push is not configured on the server.');
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.publicKey) }));
  const save = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...ownerHeaders() },
    body: JSON.stringify({ subscription: { ...sub.toJSON(), label: navigator.userAgent.slice(0, 80) } }),
  });
  if (!save.ok) throw new Error((await save.json().catch(() => ({})))?.error || `HTTP ${save.status}`);
  serverMode = true;
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (sub) {
    await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', ...ownerHeaders() }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe().catch(() => false);
  }
  serverMode = false;
}

/** Server push when this device is subscribed, otherwise a local notification. */
export async function sendTestNotification(): Promise<string> {
  if (serverMode) {
    const res = await fetch('/api/push/test', { method: 'POST', headers: ownerHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return `Sent through the server to ${data.sent} device(s)${data.failed ? `, ${data.failed} failed` : ''}.`;
  }
  if ((await requestNotificationPermission()) !== 'granted') throw new Error('Notifications are blocked for this site in the browser settings.');
  const ok = await showLocalNotification({ title: 'AssetRadar test notification', body: 'Notifications work while the app is open.', url: '#/alerts' }, 'test');
  if (!ok) throw new Error('This browser could not show a notification.');
  return 'Shown on this device.';
}

export async function fetchServerAlertHistory(): Promise<AlertHistoryEntry[] | null> {
  try {
    const res = await fetch('/api/alerts/history', { headers: ownerHeaders() });
    if (!res.ok || res.headers.get('X-AssetRadar-Offline')) return null;
    return (await res.json()).history ?? null;
  } catch {
    return null;
  }
}

// ---- Local checker (while the app is open) --------------------------------------------------------

const STOCKS = new Set(['idStock', 'usStock', 'globalStock']);
const calendarCache = new Map<string, { at: number; events: CalendarEvent[] }>();
let calendarLoading = false;
let lastCheck = 0;
let sentAt: number[] = [];
let newsUnsub: (() => void) | null = null;

function holdingsStocks(): string[] {
  const syms = [...getSavedWatchlist(), ...getPortfolioTxs().map((t) => t.symbol)];
  return [...new Set(syms)].filter((s) => STOCKS.has(getAssetBySymbol(s)?.group ?? ''));
}

/** Loads corporate events for calendar alerts in the background (each stock at most every 6 h). */
function refreshCalendars(symbols: string[]): void {
  if (calendarLoading) return;
  const due = symbols.filter((s) => Date.now() - (calendarCache.get(s)?.at ?? 0) > 6 * 3600_000).slice(0, 10);
  if (due.length === 0) return;
  calendarLoading = true;
  (async () => {
    for (const sym of due) {
      try {
        calendarCache.set(sym, { at: Date.now(), events: (await fetchCorporateCalendar(sym)).events });
      } catch {
        calendarCache.set(sym, { at: Date.now() - 5 * 3600_000, events: calendarCache.get(sym)?.events ?? [] }); // retry in ~1 h
      }
    }
    calendarLoading = false;
  })();
}

/** Called on every price update; evaluates at most every 5 s. Skipped when the server pushes alerts. */
export function checkLocalAlerts(ticks: Record<string, PriceTick>): void {
  const now = Date.now();
  if (now - lastCheck < 5000 || serverMode) return;
  lastCheck = now;
  const settings = loadAlertSettings();
  const alerts = loadAlerts().filter((a) => a.active);
  const holdings = settings.holdingsCalendar ? holdingsStocks() : [];
  if (holdings.length) alerts.push({ id: HOLDINGS_CALENDAR_ID, kind: 'calendar', repeat: true, cooldownMin: 60, active: true, createdAt: 0 });
  if (alerts.length === 0) return;

  const wantsNews = alerts.some((a) => a.kind === 'news' || a.kind === 'geo');
  if (wantsNews && !newsUnsub) newsUnsub = newsStore.subscribe(() => {});
  if (!wantsNews && newsUnsub) {
    newsUnsub();
    newsUnsub = null;
  }
  const calSymbols = [...new Set(alerts.filter((a) => a.kind === 'calendar').flatMap((a) => (a.symbol ? [a.symbol] : holdings)))];
  refreshCalendars(calSymbols);

  const states = getAlertStates<AlertState>();
  let history = loadAlertHistory();
  let statesChanged = false;
  let switchedOff: string[] = [];
  let fired = false;
  const news = newsStore.getState().items;
  for (const alert of alerts) {
    const asset = alert.symbol ? getAssetBySymbol(alert.symbol) : undefined;
    const tick = alert.symbol ? ticks[alert.symbol] : undefined;
    const usable = tick && tick.status !== 'error' && !tick.fromSnapshot && Number.isFinite(tick.price);
    const events = alert.kind === 'calendar' ? (alert.symbol ? [alert.symbol] : holdings).flatMap((s) => calendarCache.get(s)?.events ?? []) : [];
    const { fire, state } = evaluateAlert(alert, states[alert.id] ?? {}, {
      now,
      price: usable ? tick.price : undefined,
      changePct24h: usable && Number.isFinite(tick.changePct24h) ? tick.changePct24h : undefined,
      events: alert.kind === 'calendar' ? calendarEventsTomorrow(events, null, now) : undefined,
      news,
      code: asset?.code,
      name: alert.id === HOLDINGS_CALENDAR_ID ? 'Your stocks' : asset?.shortName,
      formatPrice: asset ? (v) => formatAssetPrice(v, asset) : undefined,
    });
    if (JSON.stringify(state) !== JSON.stringify(states[alert.id] ?? {})) {
      states[alert.id] = state;
      statesChanged = true;
    }
    if (!fire) continue;
    fired = true;
    const withUrl = { ...fire, url: fire.url ?? (asset ? `#/asset/${asset.id}` : '#/alerts') };
    let delivery: AlertHistoryEntry['delivery'] = 'silenced';
    if (!inQuietHours(now, settings.quiet)) {
      const t = throttle(sentAt, now);
      sentAt = t.sentAt;
      delivery = t.allowed ? 'browser' : 'throttled';
      if (t.allowed) showLocalNotification(withUrl, alert.id);
    }
    history = addHistory(history, { id: `${alert.id}-${now}`, alertId: alert.id, symbol: alert.symbol, title: fire.title, body: fire.body, at: now, delivery });
    if (!alert.repeat && alert.id !== HOLDINGS_CALENDAR_ID) switchedOff = [...switchedOff, alert.id];
  }
  if (statesChanged) saveAlertStates(states);
  if (fired) {
    saveAlertHistory(history);
    window.dispatchEvent(new Event('assetradar:alerts-changed'));
  }
  if (switchedOff.length) storeAlerts(loadAlerts().map((a) => (switchedOff.includes(a.id) ? afterFire(a) : a)));
}

/** Records the current price for new price alerts right away, so the first cross counts. */
export function primeAlertState(alert: UserAlert, tick: PriceTick | undefined): void {
  if (!tick || !Number.isFinite(tick.price)) return;
  const states = getAlertStates<AlertState>();
  states[alert.id] = { ...(states[alert.id] ?? {}), lastPrice: tick.price };
  saveAlertStates(states);
}

/** Assets that alerts can watch (everything with a price). */
export const ALERTABLE_ASSETS = ALL_ASSETS;

/** Starts the push status check once so local checks pause when the server takes over. */
export function initAlerts(): void {
  getPushStatus().catch(() => {});
}
