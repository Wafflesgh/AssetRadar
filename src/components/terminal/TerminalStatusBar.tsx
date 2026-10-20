/** TerminalStatusBar.tsx — Terminal top bar: brand, connection state, world market clocks (open/closed) and WIB clock. */
import { useT, type TranslationKey } from '../../i18n/index.ts';
import { useEffect, useState } from 'react';
import { ConnectionState } from '../../services/marketDataService.ts';
import { isExchangeOpen, isIdxMarketOpen } from '../../utils/marketHours.ts';
import type { ExchangeId } from '../../config/assets.ts';

const CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const localClock = (timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });

// Major venues: local time, colored green while the regular session is open
const WORLD_MARKETS: Array<{ label: string; exchange: ExchangeId; clock?: Intl.DateTimeFormat }> = [
  { label: 'IDX', exchange: 'IDX' },
  { label: 'NY', exchange: 'NYSE', clock: localClock('America/New_York') },
  { label: 'LDN', exchange: 'LSE', clock: localClock('Europe/London') },
  { label: 'TYO', exchange: 'TSE', clock: localClock('Asia/Tokyo') },
  { label: 'HK', exchange: 'HKEX', clock: localClock('Asia/Hong_Kong') },
];

const CONNECTION_COLOR: Record<ConnectionState, string> = {
  live: 'var(--t-up)',
  reconnecting: 'var(--t-amber)',
  delayed: 'var(--t-muted)',
  offline: 'var(--t-muted)',
};

/** Terminal top bar: brand, connection state, IDX market status and a running WIB clock. */
export function TerminalStatusBar({ connectionState }: { connectionState: ConnectionState }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const bei = isIdxMarketOpen(now);
  const t = useT();
  const conn = { text: t(`term.conn.${connectionState}` as TranslationKey), color: CONNECTION_COLOR[connectionState] };

  return (
    <div
      className="terminal-mono flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2.5 py-1.5 border-b text-[11px]"
      style={{ backgroundColor: 'var(--t-bg)', borderColor: 'var(--t-line)' }}
    >
      <div className="flex items-center gap-2">
        <span
          className="px-1.5 font-bold tracking-widest"
          style={{ backgroundColor: 'var(--t-amber)', color: '#05070A', borderRadius: 2 }}
        >
          ASSETRADAR
        </span>
        <span className="font-bold tracking-widest" style={{ color: 'var(--t-amber)' }}>
          TERMINAL
        </span>
        <span className="flex items-center gap-1" style={{ color: conn.color }}>
          <span
            aria-hidden="true"
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: conn.color }}
          />
          {conn.text}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {WORLD_MARKETS.map((m) => {
          const open = m.exchange === 'IDX' ? bei : isExchangeOpen(m.exchange, now);
          return (
            <span key={m.label} title={`${m.label} ${open ? t('term.open') : t('term.closed')}`}>
              <span style={{ color: 'var(--t-muted)' }}>{m.label} </span>
              <span className="font-bold" style={{ color: open ? 'var(--t-up)' : 'var(--t-down)' }}>
                {m.clock ? m.clock.format(now) : open ? t('term.OPEN') : t('term.CLOSED')}
              </span>
            </span>
          );
        })}
        <span style={{ color: 'var(--t-muted)' }} className="hidden sm:inline">
          {DATE.format(now)}
        </span>
        <span className="font-bold" style={{ color: 'var(--t-text)' }} aria-label={t('term.wibClock')}>
          {CLOCK.format(now).replace(/\./g, ':')} WIB
        </span>
      </div>
    </div>
  );
}
