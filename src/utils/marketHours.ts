/**
 * marketHours.ts — Indonesia Stock Exchange trading-hours check (WIB) and the
 * "updated X seconds ago" relative-time label used on price cards, plus regular-session
 * open/closed checks for every venue (US, Tokyo, London, Xetra, Hong Kong, Singapore, FX).
 */
import type { ExchangeId } from '../config/assets.ts';

/**
 * Checks whether the Indonesia Stock Exchange (IDX / BEI) is currently open.
 * Trading hours: Monday–Friday, 09:00–16:00 WIB (Asia/Jakarta, UTC+7).
 */
export function isIdxMarketOpen(nowMs: number = Date.now()): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(nowMs));
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '0';

  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
  if (!isWeekday) return false;

  const hour = parseInt(hourStr, 10) % 24;
  const minute = parseInt(minuteStr, 10);
  const totalMinutes = hour * 60 + minute;

  // 09:00 (540 mins) to 16:00 (960 mins) inclusive of 09:00, exclusive after 16:00
  return totalMinutes >= 9 * 60 && totalMinutes < 16 * 60;
}

interface ExchangeHours {
  timeZone: string;
  /** Trading sessions in local minutes from midnight, [start, end). */
  sessions: Array<[number, number]>;
  label: string;
  /** Trading weekdays (default Mon–Fri). */
  days?: string[];
}

const hm = (h: number, m = 0) => h * 60 + m;

/** Regular trading hours per venue (local time, Mon–Fri unless `days` says otherwise; public holidays are not modeled). */
export const EXCHANGE_HOURS: Record<Exclude<ExchangeId, 'CRYPTO' | 'FX' | 'FUTURES'>, ExchangeHours> = {
  IDX: { timeZone: 'Asia/Jakarta', sessions: [[hm(9), hm(16)]], label: 'IDX' },
  NYSE: { timeZone: 'America/New_York', sessions: [[hm(9, 30), hm(16)]], label: 'NYSE' },
  TSE: { timeZone: 'Asia/Tokyo', sessions: [[hm(9), hm(11, 30)], [hm(12, 30), hm(15, 30)]], label: 'Tokyo' },
  LSE: { timeZone: 'Europe/London', sessions: [[hm(8), hm(16, 30)]], label: 'London' },
  XETRA: { timeZone: 'Europe/Berlin', sessions: [[hm(9), hm(17, 30)]], label: 'Xetra' },
  HKEX: { timeZone: 'Asia/Hong_Kong', sessions: [[hm(9, 30), hm(12)], [hm(13), hm(16)]], label: 'Hong Kong' },
  SGX: { timeZone: 'Asia/Singapore', sessions: [[hm(9), hm(12)], [hm(13), hm(17)]], label: 'Singapore' },
  EURONEXT: { timeZone: 'Europe/Paris', sessions: [[hm(9), hm(17, 30)]], label: 'Paris' },
  KRX: { timeZone: 'Asia/Seoul', sessions: [[hm(9), hm(15, 30)]], label: 'Seoul' },
  SSE: { timeZone: 'Asia/Shanghai', sessions: [[hm(9, 30), hm(11, 30)], [hm(13), hm(15)]], label: 'Shanghai' },
  NSE: { timeZone: 'Asia/Kolkata', sessions: [[hm(9, 15), hm(15, 30)]], label: 'Mumbai' },
  ASX: { timeZone: 'Australia/Sydney', sessions: [[hm(10), hm(16)]], label: 'Sydney' },
  TADAWUL: { timeZone: 'Asia/Riyadh', sessions: [[hm(10), hm(15)]], label: 'Riyadh', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'] },
};

function localWeekdayMinutes(nowMs: number, timeZone: string): { weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(nowMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return { weekday: get('weekday'), minutes: (parseInt(get('hour'), 10) % 24) * 60 + parseInt(get('minute'), 10) };
}

/**
 * Whether a venue is in its regular session. Crypto is always open; FX (and spot gold) trades
 * 24/5 from Sunday 17:00 to Friday 17:00 New York time.
 */
export function isExchangeOpen(exchange: ExchangeId, nowMs: number = Date.now()): boolean {
  if (exchange === 'CRYPTO') return true;
  // Futures (CME/NYMEX/COMEX Globex) trade nearly 24/5 like FX
  if (exchange === 'FX' || exchange === 'FUTURES') {
    const { weekday, minutes } = localWeekdayMinutes(nowMs, 'America/New_York');
    if (weekday === 'Sat') return false;
    if (weekday === 'Sun') return minutes >= hm(17);
    if (weekday === 'Fri') return minutes < hm(17);
    return true;
  }
  const hours = EXCHANGE_HOURS[exchange];
  const { weekday, minutes } = localWeekdayMinutes(nowMs, hours.timeZone);
  if (!(hours.days ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']).includes(weekday)) return false;
  return hours.sessions.some(([start, end]) => minutes >= start && minutes < end);
}

/**
 * Compact age of a news item, Terminal style: "now", "45s", "3m", "2h", "1d".
 */
export function formatAge(atMs: number | undefined, nowMs: number = Date.now()): string {
  if (!atMs || !Number.isFinite(atMs)) return '—';
  const sec = Math.max(0, Math.floor((nowMs - atMs) / 1000));
  if (sec < 10) return 'now';
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}h`;
  return `${Math.floor(hour / 24)}d`;
}

/**
 * Formats relative time ("updated just now", "updated 5 seconds ago", "updated 2 minutes ago").
 */
export function formatRelativeTime(updatedAtMs: number, nowMs: number = Date.now()): string {
  if (!updatedAtMs || !Number.isFinite(updatedAtMs)) return 'Not updated yet';
  const diffSec = Math.max(0, Math.floor((nowMs - updatedAtMs) / 1000));
  if (diffSec < 3) return 'updated just now';
  if (diffSec < 60) return `updated ${diffSec} seconds ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `updated ${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHour = Math.floor(diffMin / 60);
  return `updated ${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
}
