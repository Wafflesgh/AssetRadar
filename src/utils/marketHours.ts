/**
 * marketHours.ts — Indonesia Stock Exchange trading-hours check (WIB) and the
 * "updated X seconds ago" relative-time label used on price cards.
 */

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
