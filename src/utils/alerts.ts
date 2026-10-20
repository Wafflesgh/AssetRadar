/**
 * alerts.ts — Pure logic for user alerts: price crossing above/below a level, a daily move of at
 * least X %, ex-dividend or earnings tomorrow (one stock, or every stock in the watchlist and
 * portfolio), a new headline for an asset, and the existing "high" geopolitical alert. Alerts
 * fire once (then switch off) or repeatedly with a minimum gap (default 1 hour). Also quiet hours
 * (WIB), a notification throttle and the alert history. Used by the browser (local mode) and the
 * server (web push). Alerts are reminders the user sets, not buy/sell signals.
 */
import type { CalendarEvent } from './corporateCalendar.ts';
import type { MarketNewsItem } from '../config/assets.ts';

export type AlertKind = 'priceAbove' | 'priceBelow' | 'dailyMove' | 'calendar' | 'news' | 'geo';

export const ALERT_KIND_LABELS: Record<AlertKind, string> = {
  priceAbove: 'Price crosses above',
  priceBelow: 'Price crosses below',
  dailyMove: 'Daily move of at least',
  calendar: 'Ex-dividend / earnings tomorrow',
  news: 'New headline',
  geo: 'Geopolitical alert (high)',
};

export interface UserAlert {
  id: string;
  kind: AlertKind;
  /** Asset symbol (not used by 'geo'). */
  symbol?: string;
  /** Price level for priceAbove/priceBelow, percent for dailyMove. */
  value?: number;
  /** false = fire once, then switch off. */
  repeat: boolean;
  /** Minimum minutes between two notifications of a repeating alert (at least 60). */
  cooldownMin: number;
  active: boolean;
  createdAt: number;
  note?: string;
}

/** What an evaluator remembers per alert (kept apart from the synced definition). */
export interface AlertState {
  lastPrice?: number;
  lastTriggeredAt?: number;
  /** dailyMove: false after firing until the move falls back under the threshold. */
  armed?: boolean;
  /** news: firstSeenAt of the newest headline already handled. */
  lastSeenAt?: number;
  /** calendar/geo: keys of events already notified. */
  seen?: string[];
}

export interface AlertContext {
  now: number;
  price?: number;
  changePct24h?: number;
  /** Corporate events of the alert's stock (or of the watched stocks for holdings alerts). */
  events?: CalendarEvent[];
  news?: MarketNewsItem[];
  /** Asset code used as the news tag (e.g. "BBCA"). */
  code?: string;
  /** Display name, e.g. "Bitcoin (BTC/IDR)". */
  name?: string;
  formatPrice?: (v: number) => string;
}

export interface AlertFire {
  title: string;
  body: string;
  /** Page to open on tap, e.g. "#/asset/btc". */
  url?: string;
}

export const MIN_COOLDOWN_MIN = 60;
const GEO_WINDOW_MS = 6 * 3600_000;
const NEWS_MAX_AGE_MS = 3 * 3600_000;

export function validateAlert(a: Partial<UserAlert>): string[] {
  const errors: string[] = [];
  if (!a.kind || !(a.kind in ALERT_KIND_LABELS)) errors.push('Choose an alert type.');
  if (a.kind !== 'geo' && !a.symbol) errors.push('Choose an asset.');
  if ((a.kind === 'priceAbove' || a.kind === 'priceBelow') && !(typeof a.value === 'number' && a.value > 0)) errors.push('Enter a price above 0.');
  if (a.kind === 'dailyMove' && !(typeof a.value === 'number' && a.value > 0 && a.value <= 100)) errors.push('Enter a move between 0 and 100 %.');
  return errors;
}

/** Tomorrow's WIB date for a timestamp. */
export function wibTomorrow(nowMs: number): string {
  return new Date(nowMs + 7 * 3600_000 + 86_400_000).toISOString().slice(0, 10);
}

/** Ex-dividend and earnings events dated tomorrow (WIB) for the given symbols. */
export function calendarEventsTomorrow(events: CalendarEvent[], symbols: ReadonlySet<string> | null, nowMs: number): CalendarEvent[] {
  const tomorrow = wibTomorrow(nowMs);
  return events.filter(
    (e) => e.date === tomorrow && (e.type === 'exDividend' || e.type === 'dividend' || e.type === 'earnings') && (!symbols || symbols.has(e.symbol))
  );
}

export function calendarEventKey(e: CalendarEvent): string {
  return `${e.symbol}|${e.type === 'dividend' ? 'exDividend' : e.type}|${e.date}`;
}

function cooledDown(alert: UserAlert, state: AlertState, now: number): boolean {
  const gap = Math.max(MIN_COOLDOWN_MIN, alert.cooldownMin || MIN_COOLDOWN_MIN) * 60_000;
  return state.lastTriggeredAt === undefined || now - state.lastTriggeredAt >= gap;
}

/**
 * Evaluates one alert. Returns the notification (or null) and the next state. Price alerts fire
 * when the price crosses the level since the previous check (the first check only records the
 * price, so an alert set while the price is already beyond the level waits for the next cross).
 */
export function evaluateAlert(alert: UserAlert, state: AlertState, ctx: AlertContext): { fire: AlertFire | null; state: AlertState } {
  if (!alert.active) return { fire: null, state };
  const name = ctx.name ?? alert.symbol ?? '';
  const fmt = ctx.formatPrice ?? ((v: number) => v.toLocaleString('en-US'));
  const next: AlertState = { ...state };
  let fire: AlertFire | null = null;

  switch (alert.kind) {
    case 'priceAbove':
    case 'priceBelow': {
      const price = ctx.price;
      if (price === undefined || !Number.isFinite(price) || alert.value === undefined) return { fire: null, state };
      const prev = state.lastPrice;
      next.lastPrice = price;
      const crossed =
        prev !== undefined && (alert.kind === 'priceAbove' ? prev < alert.value && price >= alert.value : prev > alert.value && price <= alert.value);
      if (crossed && cooledDown(alert, state, ctx.now)) {
        fire = {
          title: `${name} ${alert.kind === 'priceAbove' ? 'rose above' : 'fell below'} ${fmt(alert.value)}`,
          body: `Now ${fmt(price)}${ctx.changePct24h !== undefined ? ` (${ctx.changePct24h >= 0 ? '+' : ''}${ctx.changePct24h.toFixed(2)}% 24h)` : ''}.`,
        };
      }
      break;
    }
    case 'dailyMove': {
      const chg = ctx.changePct24h;
      if (chg === undefined || !Number.isFinite(chg) || alert.value === undefined) return { fire: null, state };
      const beyond = Math.abs(chg) >= alert.value;
      const armed = state.armed !== false;
      if (!beyond) next.armed = true;
      else if (armed && cooledDown(alert, state, ctx.now)) {
        next.armed = false;
        fire = {
          title: `${name} ${chg >= 0 ? 'up' : 'down'} ${Math.abs(chg).toFixed(2)}% today`,
          body: `Your alert: a daily move of at least ${alert.value}%.${ctx.price !== undefined ? ` Price ${fmt(ctx.price)}.` : ''}`,
        };
      }
      break;
    }
    case 'calendar': {
      const due = calendarEventsTomorrow(ctx.events ?? [], alert.symbol ? new Set([alert.symbol]) : null, ctx.now);
      const seen = new Set(state.seen ?? []);
      const fresh = due.filter((e) => !seen.has(calendarEventKey(e)));
      if (fresh.length) {
        for (const e of fresh) seen.add(calendarEventKey(e));
        next.seen = [...seen].slice(-50);
        fire = {
          title: `${name}: ${fresh.map((e) => (e.type === 'earnings' ? 'earnings report' : 'ex-dividend')).join(' & ')} tomorrow`,
          body: fresh
            .map((e) => {
              const who = alert.symbol ? '' : `${e.symbol.replace(/\.JK$/, '')}: `;
              return e.type === 'earnings'
                ? `${who}earnings on ${e.date}${e.estimate ? ' (estimated)' : ''}`
                : `${who}ex-dividend on ${e.date}${e.amount ? ` (${fmt(e.amount)} per share)` : ''}`;
            })
            .join(' · '),
        };
      }
      break;
    }
    case 'news': {
      const code = ctx.code;
      if (!code) return { fire: null, state };
      const since = Math.max(state.lastSeenAt ?? 0, alert.createdAt);
      const fresh = (ctx.news ?? [])
        .filter((n) => n.assetTags?.includes(code) && (n.firstSeenAt ?? 0) > since && ctx.now - (n.publishedAtMs ?? ctx.now) <= NEWS_MAX_AGE_MS)
        .sort((a, b) => (b.firstSeenAt ?? 0) - (a.firstSeenAt ?? 0));
      if (fresh.length === 0) return { fire: null, state };
      next.lastSeenAt = fresh[0].firstSeenAt;
      if (cooledDown(alert, state, ctx.now)) {
        fire = {
          title: `${name}: ${fresh.length > 1 ? `${fresh.length} new headlines` : 'new headline'}`,
          body: `${fresh[0].title} — ${fresh[0].source}`,
        };
      }
      break;
    }
    case 'geo': {
      const seen = new Set(state.seen ?? []);
      const alertItem = (ctx.news ?? []).find(
        (n) => n.geoAlert === 'high' && ctx.now - (n.publishedAtMs ?? 0) <= GEO_WINDOW_MS && (n.firstSeenAt ?? ctx.now) > alert.createdAt && !seen.has(n.id)
      );
      if (!alertItem) return { fire: null, state };
      seen.add(alertItem.id);
      next.seen = [...seen].slice(-50);
      fire = { title: '⚠ Geopolitical alert', body: `${alertItem.title} — ${alertItem.source}`, url: '#/radar' };
      break;
    }
  }
  if (fire) {
    next.lastTriggeredAt = ctx.now;
    return { fire, state: next };
  }
  return { fire: null, state: next };
}

/** A one-time alert switches off after it fired. */
export function afterFire(alert: UserAlert): UserAlert {
  return alert.repeat ? alert : { ...alert, active: false };
}

// ---- Quiet hours and throttle -----------------------------------------------------------------

export interface QuietHours {
  enabled: boolean;
  /** "HH:MM" WIB. */
  start: string;
  end: string;
}

export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: false, start: '22:00', end: '06:00' };

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h % 24) * 60 + (m % 60);
}

/** True inside the quiet window (WIB); the window may wrap past midnight. */
export function inQuietHours(nowMs: number, q: QuietHours | undefined): boolean {
  if (!q?.enabled) return false;
  const d = new Date(nowMs + 7 * 3600_000);
  const now = d.getUTCHours() * 60 + d.getUTCMinutes();
  const s = minutes(q.start);
  const e = minutes(q.end);
  if (s === e) return false;
  return s < e ? now >= s && now < e : now >= s || now < e;
}

/** At most `max` notifications per `windowMs`; returns the kept send times and whether this one may go. */
export function throttle(sentAt: number[], now: number, max = 5, windowMs = 60_000): { allowed: boolean; sentAt: number[] } {
  const recent = sentAt.filter((t) => now - t < windowMs);
  if (recent.length >= max) return { allowed: false, sentAt: recent };
  return { allowed: true, sentAt: [...recent, now] };
}

export type Delivery = 'push' | 'browser' | 'silenced' | 'throttled' | 'failed';

export interface AlertHistoryEntry {
  id: string;
  alertId: string;
  symbol?: string;
  title: string;
  body: string;
  at: number;
  delivery: Delivery;
}

export function addHistory(history: AlertHistoryEntry[], entry: AlertHistoryEntry, max = 200): AlertHistoryEntry[] {
  return [entry, ...history].slice(0, max);
}

/** Alert settings (synced with the other settings). */
export interface AlertSettings {
  quiet: QuietHours;
  /** Ex-dividend / earnings reminders for every stock in the watchlist and portfolio. */
  holdingsCalendar: boolean;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = { quiet: DEFAULT_QUIET_HOURS, holdingsCalendar: false };

export function parseAlertSettings(raw: unknown): AlertSettings {
  const r = raw as Partial<AlertSettings> | null;
  const q = r?.quiet;
  const time = (v: unknown, d: string) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : d);
  return {
    quiet: { enabled: Boolean(q?.enabled), start: time(q?.start, '22:00'), end: time(q?.end, '06:00') },
    holdingsCalendar: Boolean(r?.holdingsCalendar),
  };
}

export function parseAlerts(raw: unknown): UserAlert[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is UserAlert =>
      Boolean(a) && typeof a.id === 'string' && typeof a.kind === 'string' && a.kind in ALERT_KIND_LABELS && typeof a.createdAt === 'number'
  );
}

/** Virtual alert id used for the watchlist/portfolio calendar reminders. */
export const HOLDINGS_CALENDAR_ID = 'holdings-calendar';
