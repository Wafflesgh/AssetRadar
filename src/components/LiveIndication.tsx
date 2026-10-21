/**
 * LiveIndication.tsx — A second-by-second "≈ live" line under an asset's official price for the
 * stocks, ETFs and commodities that have a Binance TradFi perpetual (src/config/liveProxies.ts).
 * It shows the contract's index price in US$ with its own label and never replaces the official
 * price; it hides itself when the stream is off or the value is implausibly far from the official one.
 */
import { Radio } from 'lucide-react';
import { INDICATION_MAX_GAP, LIVE_INDICATIONS, indicationPlausible } from '../config/liveProxies.ts';
import { useT } from '../i18n/index.ts';
import { useBinanceFuturesLive } from '../services/binanceLive.ts';
import { formatDecimal } from '../utils/format.ts';

export function LiveIndication({ code, officialUsd }: { code: string; officialUsd: number | null }) {
  const t = useT();
  const proxy = LIVE_INDICATIONS[code];
  // Only assets with a contract open the stream
  return proxy ? <LiveIndicationLine contract={proxy.contract} kind={proxy.kind} officialUsd={officialUsd} t={t} /> : null;
}

function LiveIndicationLine({
  contract,
  kind,
  officialUsd,
  t,
}: {
  contract: string;
  kind: 'stock' | 'etf' | 'commodity';
  officialUsd: number | null;
  t: ReturnType<typeof useT>;
}) {
  const live = useBinanceFuturesLive();
  const tk = live.tickers.get(contract);
  if (live.status !== 'live' || !tk || !indicationPlausible(kind, tk.index, officialUsd)) return null;
  const gap = officialUsd && kind !== 'etf' ? (tk.index / officialUsd - 1) * 100 : null;
  return (
    <span className="text-[11px] flex flex-wrap items-center gap-x-1.5 mt-1" style={{ color: 'var(--text-secondary)' }}>
      <Radio className="w-3 h-3 motion-safe:animate-pulse" style={{ color: 'var(--color-up)' }} aria-hidden="true" />
      <span className="font-mono-num font-semibold" style={{ color: 'var(--text-primary)' }}>
        {t('live.value', { price: formatDecimal(tk.index, tk.index >= 100 ? 2 : 4) })}
      </span>
      {gap !== null && <span className="font-mono-num">({t('live.gap', { gap: `${gap >= 0 ? '+' : ''}${formatDecimal(gap, 2)}` })})</span>}
      <span>{t(kind === 'etf' ? 'live.noteEtf' : 'live.note', { contract, max: Math.round(INDICATION_MAX_GAP * 100) })}</span>
    </span>
  );
}
