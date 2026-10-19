/** TerminalStatusBar.tsx — Terminal top bar: brand, connection state, IDX open/closed and WIB clock. */
import { useEffect, useState } from 'react';
import { ConnectionState } from '../../services/marketDataService.ts';
import { isIdxMarketOpen } from '../../utils/marketHours.ts';

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

const CONNECTION_LABEL: Record<ConnectionState, { text: string; color: string }> = {
  live: { text: 'LIVE', color: 'var(--t-up)' },
  reconnecting: { text: 'RECONNECTING', color: 'var(--t-amber)' },
  delayed: { text: 'DELAYED', color: 'var(--t-muted)' },
  offline: { text: 'OFFLINE', color: 'var(--t-muted)' },
};

/** Terminal top bar: brand, connection state, IDX market status and a running WIB clock. */
export function TerminalStatusBar({ connectionState }: { connectionState: ConnectionState }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const bei = isIdxMarketOpen(now);
  const conn = CONNECTION_LABEL[connectionState];

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
      <div className="flex items-center gap-3">
        <span>
          <span style={{ color: 'var(--t-muted)' }}>IDX </span>
          <span className="font-bold" style={{ color: bei ? 'var(--t-up)' : 'var(--t-down)' }}>
            {bei ? 'OPEN' : 'CLOSED'}
          </span>
        </span>
        <span style={{ color: 'var(--t-muted)' }} className="hidden sm:inline">
          {DATE.format(now)}
        </span>
        <span className="font-bold" style={{ color: 'var(--t-text)' }} aria-label="WIB clock">
          {CLOCK.format(now).replace(/\./g, ':')} WIB
        </span>
      </div>
    </div>
  );
}
