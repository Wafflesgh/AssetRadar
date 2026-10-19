/**
 * RiskProfileView.tsx — Risk Profile education page (temporary version): the mandatory
 * educational disclaimer and a reference table of sample allocations for the Conservative,
 * Moderate and Aggressive profiles, with links to live prices. Not personal advice.
 */
import { AlertTriangle, ShieldCheck } from 'lucide-react';

interface RiskProfileViewProps {
  onSelectAsset: (symbol: string) => void;
}

export function RiskProfileView({ onSelectAsset }: RiskProfileViewProps) {
  return (
    <div className="space-y-6">
      {/* Mandatory Yellow Educational Disclaimer Box (Spec 6.4 & 11) */}
      <div
        role="note"
        aria-label="Investment education disclaimer"
        className="p-4 rounded-xl border flex items-start gap-3 text-xs md:text-sm leading-relaxed"
        style={{
          backgroundColor: 'var(--color-gold-soft)',
          borderColor: 'var(--color-gold)',
          color: 'var(--text-primary)',
        }}
      >
        <AlertTriangle
          className="w-5 h-5 shrink-0 mt-0.5"
          style={{ color: 'var(--color-gold)' }}
        />
        <p>
          <strong>Educational Disclaimer:</strong> These sample allocations are general and
          educational, not personal investment recommendations. Past performance does not
          guarantee future results. Make sure investment products are registered with/supervised by
          OJK or Bappebti.
        </p>
      </div>

      {/* Header */}
      <header className="space-y-1">
        <div
          className="flex items-center gap-2 text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span>Asset Allocation Education</span>
          <span aria-hidden="true">·</span>
          <span>Interactive Questionnaire Coming Soon</span>
        </div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Investment Risk Profile
        </h1>
        <p className="text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
          Learn the characteristics of each investment risk profile (Conservative, Moderate, and
          Aggressive). A 7-question questionnaire, an allocation donut chart, a starting-capital
          simulator, and custom sliders will be added in an <strong>upcoming update</strong>.
        </p>
      </header>

      {/* Preview of 3 Risk Profiles Allocation Table (from Spec 6.3) */}
      <section
        aria-label="Risk profile allocation reference table"
        className="p-5 md:p-6 rounded-xl border space-y-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} />
          <h2 className="text-base font-bold">
            Sample Portfolio Allocation Reference
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs md:text-sm">
            <thead>
              <tr
                className="border-b"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <th className="py-2.5 pr-4 font-semibold">Instrument</th>
                <th className="py-2.5 px-3 font-semibold">Risk Level</th>
                <th className="py-2.5 px-3 font-semibold text-right">Conservative</th>
                <th className="py-2.5 px-3 font-semibold text-right">Moderate</th>
                <th className="py-2.5 px-3 font-semibold text-right">Aggressive</th>
                <th className="py-2.5 pl-3 font-semibold text-right">Market Chart</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              <tr>
                <td className="py-3 pr-4 font-medium">Money market / time deposits</td>
                <td className="py-3 px-3" style={{ color: 'var(--text-secondary)' }}>
                  Low
                </td>
                <td className="py-3 px-3 text-right font-mono-num">45%</td>
                <td className="py-3 px-3 text-right font-mono-num">20%</td>
                <td className="py-3 px-3 text-right font-mono-num">5%</td>
                <td
                  className="py-3 pl-3 text-right text-xs"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Bank instrument
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium">Retail government bonds (SBN) / bonds</td>
                <td className="py-3 px-3" style={{ color: 'var(--text-secondary)' }}>
                  Low–medium
                </td>
                <td className="py-3 px-3 text-right font-mono-num">30%</td>
                <td className="py-3 px-3 text-right font-mono-num">25%</td>
                <td className="py-3 px-3 text-right font-mono-num">10%</td>
                <td
                  className="py-3 pl-3 text-right text-xs"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Government securities
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium">Gold</td>
                <td className="py-3 px-3" style={{ color: 'var(--text-secondary)' }}>
                  Medium
                </td>
                <td className="py-3 px-3 text-right font-mono-num">15%</td>
                <td className="py-3 px-3 text-right font-mono-num">15%</td>
                <td className="py-3 px-3 text-right font-mono-num">10%</td>
                <td className="py-3 pl-3 text-right">
                  <button
                    type="button"
                    onClick={() => onSelectAsset('XAU/USD')}
                    className="text-xs font-semibold hover:underline"
                    style={{ color: 'var(--accent-radar)' }}
                  >
                    View gold price
                  </button>
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium">Stocks / index funds</td>
                <td className="py-3 px-3" style={{ color: 'var(--text-secondary)' }}>
                  High
                </td>
                <td className="py-3 px-3 text-right font-mono-num">10%</td>
                <td className="py-3 px-3 text-right font-mono-num">35%</td>
                <td className="py-3 px-3 text-right font-mono-num">55%</td>
                <td className="py-3 pl-3 text-right">
                  <button
                    type="button"
                    onClick={() => onSelectAsset('^JKSE')}
                    className="text-xs font-semibold hover:underline"
                    style={{ color: 'var(--accent-radar)' }}
                  >
                    View JCI chart
                  </button>
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium">Crypto</td>
                <td className="py-3 px-3" style={{ color: 'var(--text-secondary)' }}>
                  Very high
                </td>
                <td className="py-3 px-3 text-right font-mono-num">0%</td>
                <td className="py-3 px-3 text-right font-mono-num">5%</td>
                <td className="py-3 px-3 text-right font-mono-num">20%</td>
                <td className="py-3 pl-3 text-right">
                  <button
                    type="button"
                    onClick={() => onSelectAsset('BTC/IDR')}
                    className="text-xs font-semibold hover:underline"
                    style={{ color: 'var(--accent-radar)' }}
                  >
                    View BTC price
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
