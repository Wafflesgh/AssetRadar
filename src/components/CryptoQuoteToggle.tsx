/**
 * CryptoQuoteToggle.tsx — Small USD | IDR switch for the currency crypto prices are shown in
 * (USD = the Binance USDT price, the default; IDR = Indodax Rupiah or converted). The choice is
 * saved and applies everywhere at once (i18n/index.ts setCryptoQuote).
 */
import { setCryptoQuote, useCryptoQuote, useT } from '../i18n/index.ts';
import type { CryptoQuote } from '../utils/format.ts';

export function CryptoQuoteToggle({ className = '' }: { className?: string }) {
  const t = useT();
  const quote = useCryptoQuote();
  const option = (q: CryptoQuote, label: string) => {
    const active = quote === q;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => setCryptoQuote(q)}
        className="px-2 py-0.5 text-[11px] font-semibold rounded-md"
        style={{
          backgroundColor: active ? 'var(--accent-radar)' : 'transparent',
          color: active ? 'var(--bg-canvas)' : 'var(--text-secondary)',
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <span
      role="group"
      aria-label={t('quote.aria')}
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg border align-middle ${className}`}
      style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface-subtle)' }}
    >
      {option('USD', t('quote.usd'))}
      {option('IDR', t('quote.idr'))}
    </span>
  );
}
