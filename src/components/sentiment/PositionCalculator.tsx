/**
 * PositionCalculator.tsx — Educational position-size calculator: AMP volatility targeting (the
 * largest weight that keeps the position at the target volatility from Settings) and risk per
 * trade (capital × risk% ÷ (entry − stop), whole IDX lots of 100). The user types every number;
 * no entry or stop is ever suggested. Shows the disclaimer.
 */
import { useState } from 'react';
import { Calculator } from 'lucide-react';
import { useT } from '../../i18n/index.ts';
import { Rich } from '../../i18n/Rich.tsx';
import { riskPositionSize, volTargetWeight } from '../../sentiment/projections.ts';
import { formatDecimal, formatNumber } from '../../utils/format.ts';
import { getVolTarget } from '../../utils/storage.ts';

interface Props {
  /** Annualized volatility (0.25 = 25%), null when unknown. */
  volatility: number | null;
  volatilityMethod: string;
  /** 100 for IDX stocks, 1 elsewhere. */
  lotSize: number;
  /** Formats an amount in the asset's quote currency. */
  formatMoney: (v: number) => string;
}

const parseNum = (s: string) => {
  const n = Number(s.replace(/[^\d.,-]/g, '').replace(/,/g, '.'));
  return Number.isFinite(n) ? n : NaN;
};

export function PositionCalculator({ volatility, volatilityMethod, lotSize, formatMoney }: Props) {
  const t = useT();
  const target = getVolTarget();
  const weight = volTargetWeight(target, volatility);
  const [capital, setCapital] = useState('');
  const [risk, setRisk] = useState('1');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const filled = capital && risk && entry && stop;
  const r = filled ? riskPositionSize(parseNum(capital), parseNum(risk), parseNum(entry), parseNum(stop), lotSize) : null;
  const input = (label: string, value: string, set: (v: string) => void, id: string) => (
    <label htmlFor={id} className="block space-y-1 text-xs">
      <span className="font-semibold">{label}</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => set(e.target.value)}
        className="w-full rounded-lg border px-2.5 py-2 text-sm font-mono-num bg-transparent outline-none"
        style={{
          borderColor: 'var(--border-subtle)',
          backgroundColor: 'var(--bg-surface-subtle)',
          color: 'var(--text-primary)',
        }}
      />
    </label>
  );
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold flex items-center gap-1.5">
        <Calculator className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} /> {t('calc.title')}
      </h3>
      <p className="text-xs">
        {weight !== null && volatility !== null ? (
          <Rich
            text={t('calc.volTarget', {
              target: formatDecimal(target, 1),
              vol: formatDecimal(volatility * 100, 1),
              method: volatilityMethod,
              weight: formatDecimal(weight * 100, 0),
            })}
          />
        ) : (
          t('calc.volUnknown')
        )}{' '}
        <a href="#/settings" className="hover:underline" style={{ color: 'var(--accent-radar)' }}>
          {t('calc.changeTarget')}
        </a>
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {input(t('calc.capital'), capital, setCapital, 'calc-capital')}
        {input(t('calc.riskPct'), risk, setRisk, 'calc-risk')}
        {input(t('calc.entry'), entry, setEntry, 'calc-entry')}
        {input(t('calc.stop'), stop, setStop, 'calc-stop')}
      </div>
      {r && (
        <div role="status" className="text-xs space-y-0.5">
          {r.error ? (
            <p style={{ color: 'var(--color-down)' }}>{t(r.error === 'stop-above-entry' ? 'calc.err.stop' : 'calc.err.input')}</p>
          ) : (
            <>
              <p>
                <Rich
                  text={
                    r.lots !== null
                      ? t('calc.lots', {
                          lots: formatNumber(r.lots),
                          units: formatNumber(r.units),
                        })
                      : t('calc.units', {
                          units: formatDecimal(r.units, lotSize > 0 ? 0 : 6),
                        })
                  }
                />
              </p>
              <p style={{ color: 'var(--text-secondary)' }}>
                {t('calc.value', {
                  value: formatMoney(r.positionValue),
                  risk: formatMoney(r.riskAmount),
                  weight: formatDecimal(r.weight * 100, 1),
                })}
              </p>
            </>
          )}
        </div>
      )}
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {t('calc.formula')} {t('calc.note')}
      </p>
    </div>
  );
}
