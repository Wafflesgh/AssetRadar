/**
 * TerminalPanel.tsx — Shared Terminal building blocks: the panel frame, status messages,
 * retry button, and compact price/percent/WIB-time formatting helpers.
 */
import { t as tr } from '../../i18n/index.ts';
import { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { AssetConfig, PriceTick, SentimentLabel } from '../../config/assets.ts';
import { displayCurrency, displayValue, formatNumber, tickDisplayValue } from '../../utils/format.ts';

const idNumber = (digits: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const NUM_0 = idNumber(0);
const NUM_2 = idNumber(2);

/**
 * Compact Terminal price without a currency sign: whole numbers from 1,000 for Rupiah/Won,
 * 2 decimals otherwise, and 4–6 decimals for sub-1 prices (PEPE, SHIB, DOGE in USD).
 */
/** A value in the asset's own currency, shown in its display currency (crypto: USD or IDR setting). */
export function formatTerminalPrice(value: number | undefined, asset: AssetConfig): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return terminalNumber(displayValue(value, asset), displayCurrency(asset));
}

/** A live tick's price in the display currency (the exact Binance USDT price for crypto in USD). */
export function formatTerminalTick(tick: PriceTick | undefined, asset: AssetConfig): string {
  if (!tick || !Number.isFinite(tick.price)) return '—';
  return terminalNumber(tickDisplayValue(tick, asset), displayCurrency(asset));
}

function terminalNumber(value: number, currency: string): string {
  const abs = Math.abs(value);
  if ((currency === 'IDR' || currency === 'KRW') && abs >= 1000) return NUM_0.format(value);
  if (abs < 0.01) return formatNumber(value, 6);
  if (abs < 1) return formatNumber(value, 4);
  return NUM_2.format(value);
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

const WIB_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const WIB_DAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
});

/** "14:05" for today, "18 Oct 14:05" for other days (WIB). */
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

/** Terminal panel frame: amber title, thin border, 2px corners. */
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

/** In-panel status message: loading, empty, or error + "Try again". */
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
    kind === 'loading' ? tr('term.loading') : kind === 'empty' ? tr('term.empty') : tr('common.dataUnavailable');
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

export function RetryButton({ onClick, label = tr('common.tryAgain') }: { onClick: () => void; label?: string }) {
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
