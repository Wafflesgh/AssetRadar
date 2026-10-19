import { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { AssetConfig, PriceTick, SentimentLabel } from '../../config/assets.ts';

const idNumber = (digits: number) =>
  new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const NUM_0 = idNumber(0);
const NUM_2 = idNumber(2);

/** Harga padat ala Terminal: Rupiah tanpa "Rp" & tanpa desimal, aset lain 2 desimal. */
export function formatTerminalPrice(value: number | undefined, asset: AssetConfig): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return asset.currency === 'IDR' ? NUM_0.format(value) : NUM_2.format(value);
}

export function formatTerminalPct(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${NUM_2.format(Math.abs(value))}%`;
}

export function changeColor(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value === 0) return 'var(--t-muted)';
  return value > 0 ? 'var(--t-up)' : 'var(--t-down)';
}

export function toneColor(label: SentimentLabel | undefined): string {
  if (label === 'Bullish') return 'var(--t-up)';
  if (label === 'Bearish') return 'var(--t-down)';
  return 'var(--t-amber)';
}

const WIB_TIME = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const WIB_DAY = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
});

/** "14:05" untuk hari ini, "18 Okt 14:05" untuk hari lain (WIB). */
export function formatWibStamp(ms: number | undefined, nowMs = Date.now()): string {
  if (!ms || !Number.isFinite(ms)) return '--:--';
  const sameDay = WIB_DAY.format(ms) === WIB_DAY.format(nowMs);
  return sameDay ? WIB_TIME.format(ms) : `${WIB_DAY.format(ms)} ${WIB_TIME.format(ms)}`;
}

export function isTickUsable(tick: PriceTick | undefined): tick is PriceTick {
  return tick !== undefined && tick.status !== 'error' && Number.isFinite(tick.price);
}

interface TerminalPanelProps {
  id: string;
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  highlighted?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/** Bingkai panel Terminal: judul amber, garis tipis, sudut 2px. */
export function TerminalPanel({
  id,
  title,
  subtitle,
  right,
  highlighted,
  className = '',
  bodyClassName = '',
  children,
}: TerminalPanelProps) {
  return (
    <section
      id={id}
      aria-label={title}
      className={`flex flex-col min-w-0 border scroll-mt-16 transition-colors ${className}`}
      style={{
        backgroundColor: 'var(--t-panel)',
        borderColor: highlighted ? 'var(--t-amber)' : 'var(--t-line)',
        borderRadius: 2,
        boxShadow: highlighted ? '0 0 0 1px var(--t-amber)' : undefined,
      }}
    >
      <header
        className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2.5 py-1 min-h-8 border-b shrink-0"
        style={{ backgroundColor: 'var(--t-panel-head)', borderColor: 'var(--t-line)' }}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <h2
            className="text-[11px] font-bold tracking-widest uppercase shrink-0"
            style={{ color: 'var(--t-amber)' }}
          >
            {title}
          </h2>
          {subtitle && (
            <span className="text-[10px] truncate" style={{ color: 'var(--t-muted)' }}>
              {subtitle}
            </span>
          )}
        </div>
        {right && <div className="flex items-center gap-1.5 shrink-0">{right}</div>}
      </header>
      <div className={`flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** Pesan status di dalam panel: memuat, kosong, atau galat + "Coba lagi". */
export function PanelMessage({
  kind,
  text,
  onRetry,
}: {
  kind: 'loading' | 'empty' | 'error';
  text?: string;
  onRetry?: () => void;
}) {
  const fallbackText =
    kind === 'loading' ? 'Memuat data...' : kind === 'empty' ? 'Belum ada data.' : 'Data tidak tersedia';
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className="h-full min-h-24 flex flex-col items-center justify-center gap-2 p-4 text-[11px] text-center"
      style={{ color: 'var(--t-muted)' }}
    >
      <span>{text ?? fallbackText}</span>
      {kind === 'error' && onRetry && <RetryButton onClick={onRetry} />}
    </div>
  );
}

export function RetryButton({ onClick, label = 'Coba lagi' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 border text-[10px] font-semibold uppercase tracking-wider"
      style={{ borderColor: 'var(--t-amber)', color: 'var(--t-amber)', borderRadius: 2 }}
    >
      <RefreshCw className="w-3 h-3" />
      {label}
    </button>
  );
}
