/**
 * PaperTradingView.tsx — Paper Trading page (#/paper): practise buying and selling any holdable
 * asset with pretend Rupiah at live prices. Shows the account (value, result against simply holding
 * the IDX Composite, cash, fees), an order ticket (lots for IDX stocks, live quote with fee, "max"),
 * open holdings and the order history. The account syncs across devices like the portfolio
 * (collection `paper`); the maths is in utils/paperTrading.ts.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gamepad2, RotateCcw } from 'lucide-react';
import { getAssetBySymbol, type AssetConfig, type PriceTick } from '../config/assets.ts';
import {
  JCI_SYMBOL,
  PAPER_START_IDR,
  checkPaperOrder,
  cashOf,
  heldQuantity,
  isPaperTradable,
  makePaperOrder,
  maxAffordable,
  newPaperAccount,
  parsePaperItems,
  quotePaperOrder,
  summarizePaper,
  type PaperError,
  type PaperSide,
} from '../utils/paperTrading.ts';
import { tradeUnitOf } from '../utils/portfolio.ts';
import { getPaperRaw, savePaper } from '../utils/storage.ts';
import { onSyncApplied } from '../services/syncService.ts';
import { useTrackedSymbols } from '../hooks/useTrackedSymbols.ts';
import { dateLocale, useT, type TranslationKey } from '../i18n/index.ts';
import { Rich } from '../i18n/Rich.tsx';
import { assetName, assetShortName } from '../i18n/assetNames.ts';
import { formatAssetPrice, formatIdrCompact, formatNumber, formatPercent, formatPrice, formatRupiah } from '../utils/format.ts';
import { AssetSearch } from './AssetSearch.tsx';

const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
const muted = { color: 'var(--text-secondary)' };
const tone = (v: number) => (v > 0 ? 'var(--color-up)' : v < 0 ? 'var(--color-down)' : 'var(--text-secondary)');
const tradable = (a: AssetConfig) => isPaperTradable(a);
const START_CHOICES = [10_000_000, 100_000_000, 1_000_000_000];

const UNIT_KEYS: Record<string, TranslationKey> = {
  lots: 'paper.unit.lots',
  grams: 'paper.unit.grams',
  coins: 'paper.unit.coins',
  units: 'paper.unit.units',
  'units of currency': 'paper.unit.currency',
};

function loadPaper() {
  return parsePaperItems(getPaperRaw());
}

interface PaperTradingViewProps {
  ticks: Record<string, PriceTick>;
  onSelectAsset: (symbol: string) => void;
}

export function PaperTradingView({ ticks, onSelectAsset }: PaperTradingViewProps) {
  const t = useT();
  const [{ account, orders }, setData] = useState(loadPaper);
  useEffect(() => onSyncApplied(['paper'], () => setData(loadPaper())), []);
  const [asset, setAsset] = useState<AssetConfig | undefined>(undefined);
  const [side, setSide] = useState<PaperSide>('buy');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [startCash, setStartCash] = useState(PAPER_START_IDR);

  const summary = useMemo(() => (account ? summarizePaper(account, orders, ticks, getAssetBySymbol) : null), [account, orders, ticks]);
  useTrackedSymbols([...(summary?.holdings.map((h) => h.symbol) ?? []), ...(asset ? [asset.symbol] : []), JCI_SYMBOL]);

  const persist = useCallback((next: ReturnType<typeof loadPaper>) => {
    setData(next);
    savePaper([...(next.account ? [next.account] : []), ...next.orders]);
  }, []);

  const start = () => {
    const jci = ticks[JCI_SYMBOL];
    persist({ account: newPaperAccount(Date.now(), jci && !jci.fromSnapshot ? jci.price : null, startCash), orders: [] });
    setConfirmReset(false);
    setMessage(null);
  };

  const unit = asset ? tradeUnitOf(asset) : null;
  const unitLabel = unit ? t(UNIT_KEYS[unit.inputLabel] ?? 'paper.unit.units') : '';
  const n = Number(amount.replace(',', '.'));
  const quoted = asset && amount ? quotePaperOrder(asset, side, n, ticks[asset.symbol], ticks) : null;
  const cash = account ? cashOf(account, orders) : 0;
  const held = asset ? heldQuantity(orders, asset.symbol) : 0;
  const problem: PaperError | null = !quoted ? null : 'error' in quoted ? quoted.error : checkPaperOrder(side, quoted.quote, cash, held);
  const errorText = (e: PaperError) => t(`paper.err.${e}` as TranslationKey);

  const fillMax = () => {
    if (!asset || !unit) return;
    if (side === 'sell') {
      setAmount(String(held / unit.perInput));
      return;
    }
    const q = quotePaperOrder(asset, 'buy', 1, ticks[asset.symbol], ticks);
    if ('quote' in q) setAmount(String(maxAffordable(asset, q.quote, cash)));
  };

  const place = () => {
    if (!account || !asset || !quoted || !('quote' in quoted) || problem) return;
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    persist({ account, orders: [...orders, makePaperOrder(asset, side, quoted.quote, Date.now(), id)] });
    setMessage({
      ok: true,
      text: t(side === 'buy' ? 'paper.filledBuy' : 'paper.filledSell', { amount: formatNumber(n, unit && unit.perInput > 1 ? 0 : 4), unit: unitLabel, name: assetShortName(asset), price: formatPrice(quoted.quote.price, quoted.quote.currency) }),
    });
    setAmount('');
  };

  const sellAll = (symbol: string) => {
    const a = getAssetBySymbol(symbol);
    if (!a) return;
    setAsset(a);
    setSide('sell');
    setAmount(String(heldQuantity(orders, symbol) / tradeUnitOf(a).perInput));
    setMessage(null);
  };

  return (
    <div className="space-y-5">
      <p className="text-xs rounded-lg border p-3" style={{ borderColor: 'var(--color-gold)', color: 'var(--text-primary)' }}>
        <Rich text={t('paper.disclaimer')} />
      </p>
      <header className="space-y-1">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Gamepad2 className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} /> {t('paper.title')}
        </h2>
        <p className="text-sm max-w-3xl" style={muted}>
          {t('paper.intro')}
        </p>
      </header>

      {!account || !summary ? (
        <section className="rounded-2xl border p-5 space-y-3 max-w-xl" style={card}>
          <h3 className="font-bold">{t('paper.startTitle')}</h3>
          <p className="text-sm" style={muted}>
            {t('paper.startBody')}
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('paper.startAmount')}>
            {START_CHOICES.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={startCash === v}
                onClick={() => setStartCash(v)}
                className="px-3 py-1.5 rounded-lg border text-sm font-semibold font-mono-num"
                style={startCash === v ? { borderColor: 'var(--accent-radar)', color: 'var(--accent-radar)', backgroundColor: 'var(--accent-radar-soft)' } : card}
              >
                {formatRupiah(v, 0)}
              </button>
            ))}
          </div>
          <button type="button" onClick={start} className="btn-accent">
            {t('paper.start', { amount: formatRupiah(startCash, 0) })}
          </button>
        </section>
      ) : (
        <>
          {/* Account */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label={t('paper.total')} value={formatRupiah(summary.totalIdr, 0)} sub={formatPercent(summary.ret * 100)} subColor={tone(summary.ret)} big />
            <Stat
              label={t('paper.vsJci')}
              value={summary.jciRet === null ? '—' : formatPercent(summary.jciRet * 100)}
              valueColor={summary.jciRet === null ? undefined : tone(summary.jciRet)}
              sub={summary.jciRet === null ? t('paper.jciUnknown') : summary.ret >= summary.jciRet ? t('paper.aheadOfJci') : t('paper.behindJci')}
            />
            <Stat label={t('paper.cash')} value={formatRupiah(summary.cash, 0)} sub={t('paper.holdingsValue', { value: formatIdrCompact(summary.holdingsIdr) })} />
            <Stat label={t('paper.realized')} value={formatRupiah(summary.realizedIdr, 0)} valueColor={tone(summary.realizedIdr)} sub={t('paper.feesPaid', { value: formatIdrCompact(summary.feesIdr) })} />
          </section>
          <p className="text-xs" style={muted}>
            {t('paper.since', { date: new Date(account.startedAt).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' }), start: formatRupiah(account.startCash, 0) })}
            {summary.unpriced > 0 && <> · {t('paper.unpriced', { count: summary.unpriced })}</>}
          </p>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] items-start">
            {/* Order ticket */}
            <section className="rounded-2xl border p-4 space-y-3" style={card} aria-labelledby="paper-ticket">
              <h3 id="paper-ticket" className="font-bold">
                {t('paper.ticket')}
              </h3>
              <AssetSearch
                ticks={ticks}
                filter={tradable}
                selected={asset}
                label={t('paper.pickAsset')}
                placeholder={t('paper.pickAsset')}
                onSelect={(a) => {
                  setAsset(a);
                  setAmount('');
                  setMessage(null);
                }}
              />
              {asset && unit && (
                <>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <button type="button" onClick={() => onSelectAsset(asset.symbol)} className="font-semibold truncate text-left hover:underline">
                      {assetName(asset)}
                    </button>
                    <span className="font-mono-num font-semibold shrink-0">{ticks[asset.symbol] ? formatAssetPrice(ticks[asset.symbol].price, asset, { native: true }) : t('common.loading')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-surface-subtle)' }} role="radiogroup" aria-label={t('paper.side')}>
                    {(['buy', 'sell'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={side === s}
                        onClick={() => setSide(s)}
                        className="py-1.5 rounded-md text-sm font-bold"
                        style={side === s ? { backgroundColor: s === 'buy' ? 'var(--color-up)' : 'var(--color-down)', color: '#fff' } : muted}
                      >
                        {t(s === 'buy' ? 'paper.buy' : 'paper.sell')}
                      </button>
                    ))}
                  </div>
                  <label className="block text-xs font-semibold" style={muted}>
                    {t('paper.amount', { unit: unitLabel })}
                    <div className="mt-1 flex gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step={unit.perInput > 1 ? 1 : 'any'}
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value);
                          setMessage(null);
                        }}
                        className="w-full min-w-0 px-3 py-2 rounded-lg border text-sm font-mono-num"
                        style={{ backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                      />
                      <button type="button" onClick={fillMax} className="px-3 rounded-lg border text-xs font-semibold shrink-0" style={card}>
                        {t('paper.max')}
                      </button>
                    </div>
                  </label>
                  {side === 'sell' && (
                    <p className="text-xs" style={muted}>
                      {t('paper.youHold', { amount: formatNumber(held / unit.perInput, unit.perInput > 1 ? 0 : 4), unit: unitLabel })}
                    </p>
                  )}
                  {quoted && 'quote' in quoted && (
                    <dl className="text-xs grid grid-cols-2 gap-x-3 gap-y-1">
                      <dt style={muted}>{t('paper.orderValue')}</dt>
                      <dd className="text-right font-mono-num">{formatPrice(quoted.quote.gross, quoted.quote.currency)}</dd>
                      <dt style={muted}>{t('paper.fee')}</dt>
                      <dd className="text-right font-mono-num">{formatPrice(quoted.quote.fee, quoted.quote.currency)}</dd>
                      <dt style={muted}>{t(side === 'buy' ? 'paper.cashOut' : 'paper.cashIn')}</dt>
                      <dd className="text-right font-mono-num font-semibold">{formatRupiah(Math.abs(quoted.quote.cashIdr), 0)}</dd>
                    </dl>
                  )}
                  {problem && (
                    <p className="text-xs font-semibold" role="alert" style={{ color: 'var(--color-down)' }}>
                      {errorText(problem)}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={place}
                    disabled={!quoted || 'error' in quoted || Boolean(problem)}
                    className="w-full py-2 rounded-lg text-sm font-bold disabled:opacity-40"
                    style={{ backgroundColor: side === 'buy' ? 'var(--color-up)' : 'var(--color-down)', color: '#fff' }}
                  >
                    {t(side === 'buy' ? 'paper.placeBuy' : 'paper.placeSell')}
                  </button>
                  {ticks[asset.symbol]?.isMarketOpen === false && (
                    <p className="text-[11px]" style={muted}>
                      {t('paper.closedNote')}
                    </p>
                  )}
                </>
              )}
              {message && (
                <p className="text-xs font-semibold" role="status" style={{ color: message.ok ? 'var(--color-up)' : 'var(--color-down)' }}>
                  {message.text}
                </p>
              )}
            </section>

            {/* Holdings and history */}
            <div className="space-y-5 min-w-0">
              <section className="rounded-2xl border overflow-hidden" style={card} aria-labelledby="paper-holdings">
                <h3 id="paper-holdings" className="font-bold px-4 pt-4 pb-2">
                  {t('paper.holdings')}
                </h3>
                {summary.holdings.length === 0 ? (
                  <p className="px-4 pb-4 text-sm" style={muted}>
                    {t('paper.noHoldings')}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-left" style={{ ...muted, backgroundColor: 'var(--bg-surface-subtle)' }}>
                          <th className="px-4 py-2 font-semibold">{t('table.asset')}</th>
                          <th className="px-3 py-2 font-semibold text-right">{t('paper.qty')}</th>
                          <th className="px-3 py-2 font-semibold text-right hidden sm:table-cell">{t('paper.avgCost')}</th>
                          <th className="px-3 py-2 font-semibold text-right">{t('paper.value')}</th>
                          <th className="px-3 py-2 font-semibold text-right">{t('paper.pl')}</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {summary.holdings.map((h) => {
                          const u = tradeUnitOf(h.asset);
                          return (
                            <tr key={h.symbol} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                              <td className="px-4 py-2">
                                <button type="button" onClick={() => onSelectAsset(h.symbol)} className="text-left">
                                  <span className="font-bold font-mono-num text-[13px] block">{h.asset.code}</span>
                                  <span className="text-[11px] block truncate max-w-[10rem]" style={muted}>
                                    {assetName(h.asset)}
                                  </span>
                                </button>
                              </td>
                              <td className="px-3 py-2 text-right font-mono-num text-xs whitespace-nowrap">
                                {formatNumber(h.quantity / u.perInput, u.perInput > 1 ? 0 : 4)} {t(UNIT_KEYS[u.inputLabel] ?? 'paper.unit.units')}
                              </td>
                              <td className="px-3 py-2 text-right font-mono-num text-xs hidden sm:table-cell">{formatPrice(h.avgCost, h.currency)}</td>
                              <td className="px-3 py-2 text-right font-mono-num text-xs">{formatIdrCompact(h.valueIdr)}</td>
                              <td className="px-3 py-2 text-right font-mono-num text-xs font-semibold" style={{ color: tone(h.unrealizedPct ?? 0) }}>
                                {h.priced ? formatPercent(h.unrealizedPct) : '—'}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button type="button" onClick={() => sellAll(h.symbol)} className="text-xs font-semibold px-2 py-1 rounded-md border whitespace-nowrap" style={card}>
                                  {t('paper.sell')}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border p-4 space-y-2" style={card} aria-labelledby="paper-history">
                <h3 id="paper-history" className="font-bold">
                  {t('paper.history')}
                </h3>
                {orders.length === 0 ? (
                  <p className="text-sm" style={muted}>
                    {t('paper.noOrders')}
                  </p>
                ) : (
                  <ol className="text-xs divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                    {[...orders]
                      .reverse()
                      .slice(0, 50)
                      .map((o) => {
                        const a = getAssetBySymbol(o.symbol);
                        const u = a ? tradeUnitOf(a) : null;
                        return (
                          <li key={o.id} className="py-1.5 flex flex-wrap items-baseline gap-x-2" style={{ borderColor: 'var(--border-subtle)' }}>
                            <span className="font-bold" style={{ color: o.side === 'buy' ? 'var(--color-up)' : 'var(--color-down)' }}>
                              {t(o.side === 'buy' ? 'paper.buy' : 'paper.sell')}
                            </span>
                            <span className="font-mono-num">
                              {formatNumber(o.quantity / (u?.perInput ?? 1), u && u.perInput > 1 ? 0 : 4)} {a?.code ?? o.symbol}
                            </span>
                            <span style={muted}>@ {formatPrice(o.price, o.currency)}</span>
                            <span className="ml-auto" style={muted}>
                              {new Date(o.at).toLocaleString(dateLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </li>
                        );
                      })}
                  </ol>
                )}
              </section>

              <div className="flex flex-wrap items-center gap-2">
                {confirmReset ? (
                  <>
                    <span className="text-xs" style={muted}>
                      {t('paper.resetConfirm')}
                    </span>
                    <button type="button" onClick={start} className="text-xs font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--color-down)', color: 'var(--color-down)' }}>
                      {t('paper.resetYes')}
                    </button>
                    <button type="button" onClick={() => setConfirmReset(false)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border" style={card}>
                      {t('paper.resetNo')}
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmReset(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border" style={card}>
                    <RotateCcw className="w-3.5 h-3.5" /> {t('paper.reset')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, subColor, valueColor, big = false }: { label: string; value: string; sub?: string; subColor?: string; valueColor?: string; big?: boolean }) {
  return (
    <div className="rounded-xl border p-3 min-w-0" style={card}>
      <p className="text-xs" style={muted}>
        {label}
      </p>
      <p className={`font-mono-num font-bold truncate ${big ? 'text-lg md:text-xl' : 'text-base md:text-lg'}`} style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </p>
      {sub && (
        <p className="text-xs font-semibold truncate" style={{ color: subColor ?? 'var(--text-secondary)' }}>
          {sub}
        </p>
      )}
    </div>
  );
}
