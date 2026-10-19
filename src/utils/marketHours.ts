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
 * Formats relative time in Indonesian ("baru saja", "diperbarui 5 detik lalu", "2 menit lalu")
 */
export function formatRelativeTimeId(updatedAtMs: number, nowMs: number = Date.now()): string {
  if (!updatedAtMs || !Number.isFinite(updatedAtMs)) return 'Belum diperbarui';
  const diffSec = Math.max(0, Math.floor((nowMs - updatedAtMs) / 1000));
  if (diffSec < 3) return 'diperbarui baru saja';
  if (diffSec < 60) return `diperbarui ${diffSec} detik lalu`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `diperbarui ${diffMin} menit lalu`;
  const diffHour = Math.floor(diffMin / 60);
  return `diperbarui ${diffHour} jam lalu`;
}
