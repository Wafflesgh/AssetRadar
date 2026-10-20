/**
 * PortfolioView.tsx — Personal portfolio (#/portfolio): record buy/sell transactions for any
 * asset (all IDX stocks in lots, crypto, gold in grams, US/world stocks, currencies) and see
 * positions at live prices with the average-cost method: average price, cost, market value,
 * unrealized and realized profit/loss, the total in Rupiah, the split by asset class versus the
 * saved Risk Profile, and each position's evidence score / F-score as information. Data stays on
 * this device (localStorage) with JSON export/import for backups. Not investment advice.
 */
import { t, t as tr, useT, type TranslationKey } from '../i18n/index.ts';
import { Rich } from '../i18n/Rich.tsx';
import { assetName } from '../i18n/assetNames.ts';
import { useEffect, useMemo, useState } from 'react';
import { Download, Pencil, Plus, Trash2, Upload, Wallet, X } from 'lucide-react';
import { Cell, Pie, PieChart } from 'recharts';
import { AssetConfig, PriceTick, getAssetBySymbol } from '../config/assets.ts';
import { INSTRUMENTS, PROFILE_ALLOCATIONS, PROFILE_INFO, profileForAnswers, type Allocation } from '../config/riskProfiles.ts';
import { useTrackedSymbols } from '../hooks/useTrackedSymbols.ts';
import { fetchAssetAnalysis } from '../services/marketDataService.ts';
import { formatNumber, formatPercent, formatPrice, formatRupiah } from '../utils/format.ts';
import {
  assetClassOf,
  buildPositions,
  exportPortfolio,
  isHoldable,
  parsePortfolioImport,
  tradeUnitOf,
  validateTx,
  valuePosition,
  type AssetClass,
  type PortfolioTx,
  type TxSide,
  type ValuedPosition,
} from '../utils/portfolio.ts';
import { getPortfolioTxs, getSavedRiskResult, savePortfolioTxs } from '../utils/storage.ts';
import { AssetSearch } from './AssetSearch.tsx';

const CLASS_META: Record<AssetClass, { color: string }> = {
  stocks: { color: INSTRUMENTS.find((i) => i.id === 'stocks')?.color ?? '#3B82F6' },
  gold: { color: INSTRUMENTS.find((i) => i.id === 'gold')?.color ?? '#F59E0B' },
  crypto: { color: INSTRUMENTS.find((i) => i.id === 'crypto')?.color ?? '#A855F7' },
  other: { color: '#94A3B8' },
};
const classLabel = (c: AssetClass) => t(`pf.class.${c}` as TranslationKey);

/** Quantity unit in the current language ("lots" → "lot"). */
const unitText = (label: string) => t(`pf.unit.${label}` as TranslationKey);

/** Price field label in the current language. */
function priceLabelText(asset: AssetConfig): string {
  if (asset.symbol === 'XAU/USD') return t('pf.priceGram');
  if (asset.group === 'idStock') return t('pf.priceShare');
  const cur = asset.currency === 'IDR' ? 'Rp' : asset.currency === 'USX' ? 'USD' : asset.currency;
  return asset.group === 'crypto' ? t('pf.priceCoin', { cur }) : t('pf.priceUnit', { cur });
}

const trError = (e: string) => {
  const key = `pf.err.${e}` as TranslationKey;
  const out = t(key);
  return out === key ? e : out;
};

function todayWib(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

/** "1,250.5" → 1250.5 (en-US: comma thousands, dot decimals). */
function parseNum(text: string): number {
  const t = text.replace(/[\s,]/g, '');
  return t === '' ? NaN : Number(t);
}

function money(value: number | undefined, currency: string): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return currency === 'IDR' ? formatRupiah(value, Math.abs(value) >= 1000 ? 0 : 2) : formatPrice(value, currency);
}

function signedRupiah(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : '−'}${formatRupiah(Math.abs(v), 0)}`;
}

interface Draft {
  id?: string;
  symbol: string;
  side: TxSide;
  date: string;
  qty: string;
  price: string;
  fee: string;
  note: string;
}

const emptyDraft = (): Draft => ({ symbol: '', side: 'buy', date: todayWib(), qty: '', price: '', fee: '', note: '' });

interface PortfolioViewProps {
  ticks: Record<string, PriceTick>;
  onSelectAsset: (symbol: string) => void;
}

export function PortfolioView({ ticks, onSelectAsset }: PortfolioViewProps) {
  const [txs, setTxs] = useState<PortfolioTx[]>(() => getPortfolioTxs<PortfolioTx>());
  useT();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Record<string, { score: number; label: string; f?: string }>>({});

  const persist = (next: PortfolioTx[]) => {
    setTxs(next);
    if (!savePortfolioTxs(next)) setNotice('This browser did not allow saving (private mode or storage full). Export a backup.');
  };

  const positions = useMemo(() => buildPositions(txs), [txs]);
  const held = [...positions.values()].filter((p) => p.quantity > 0 || p.realized !== 0);
  useTrackedSymbols(held.map((p) => p.symbol));

  const valued = useMemo(
    () =>
      held
        .map((p) => {
          const asset = getAssetBySymbol(p.symbol);
          if (!asset) return null;
          return { asset, v: valuePosition(p, tradeUnitOf(asset), ticks[p.symbol], ticks) };
        })
        .filter((x): x is { asset: AssetConfig; v: ValuedPosition } => x !== null),
    [held, ticks]
  );

  // Evidence score and F-score per open position (information, not a signal)
  const openSymbols = valued.filter((x) => x.v.quantity > 0).map((x) => x.asset.symbol).join(',');
  useEffect(() => {
    let alive = true;
    const list = openSymbols ? openSymbols.split(',').slice(0, 20) : [];
    (async () => {
      for (const sym of list) {
        try {
          const a = await fetchAssetAnalysis(sym);
          if (!alive) return;
          setEvidence((e) => ({
            ...e,
            [sym]: { score: a.score, label: a.label, f: a.fundamentals ? `${a.fundamentals.fScore}/${a.fundamentals.fScoreMax}` : undefined },
          }));
        } catch {
          // Shown as "—"
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [openSymbols]);

  const open = valued.filter((x) => x.v.quantity > 0);
  const total = open.reduce((s, x) => s + (x.v.marketValueIdr ?? 0), 0);
  const cost = open.reduce((s, x) => s + (x.v.marketValueIdr !== undefined ? (x.v.costBasisIdr ?? 0) : 0), 0);
  const unrealized = total - cost;
  const realized = valued.reduce((s, x) => s + (x.v.realizedIdr ?? 0), 0);
  const unpriced = open.filter((x) => x.v.marketValueIdr === undefined);

  const byClass = (['stocks', 'gold', 'crypto', 'other'] as AssetClass[])
    .map((c) => ({ c, value: open.filter((x) => assetClassOf(x.asset) === c).reduce((s, x) => s + (x.v.marketValueIdr ?? 0), 0) }))
    .filter((x) => x.value > 0);

  const saved = getSavedRiskResult();
  const profile = saved ? profileForAnswers(saved.answers) : null;
  const target: Allocation | null = saved?.customAllocation ? (saved.customAllocation as Allocation) : profile ? PROFILE_ALLOCATIONS[profile] : null;

  const startEdit = (t?: PortfolioTx) => {
    setErrors([]);
    if (!t) return setDraft(emptyDraft());
    const asset = getAssetBySymbol(t.symbol);
    const per = asset ? tradeUnitOf(asset).perInput : 1;
    setDraft({ id: t.id, symbol: t.symbol, side: t.side, date: t.date, qty: String(t.quantity / per), price: String(t.price), fee: t.fee ? String(t.fee) : '', note: t.note ?? '' });
  };

  const saveDraft = () => {
    if (!draft) return;
    const asset = getAssetBySymbol(draft.symbol);
    const per = asset ? tradeUnitOf(asset).perInput : 1;
    const parsed = {
      symbol: draft.symbol,
      side: draft.side,
      date: draft.date,
      quantity: parseNum(draft.qty) * per,
      price: parseNum(draft.price),
      fee: draft.fee.trim() ? parseNum(draft.fee) : 0,
    };
    const errs = validateTx(parsed, txs, todayWib(), draft.id);
    if (errs.length) return setErrors(errs);
    const tx: PortfolioTx = { id: draft.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, ...parsed };
    if (draft.note.trim()) tx.note = draft.note.trim();
    persist(draft.id ? txs.map((t) => (t.id === draft.id ? tx : t)) : [...txs, tx]);
    setDraft(null);
  };

  const remove = (t: PortfolioTx) => {
    // Deleting a buy must not leave a later sell without shares
    const rest = txs.filter((x) => x.id !== t.id);
    const broken = buildPositionsCheck(rest);
    if (broken) return setNotice(tr('pf.deleteSellsFirst', { name: getAssetBySymbol(t.symbol)?.shortName ?? t.symbol }));
    if (window.confirm(tr('pf.confirmDelete'))) persist(rest);
  };

  const doExport = () => {
    const blob = new Blob([exportPortfolio(txs)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assetradar-portfolio-${todayWib()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const doImport = async (file: File) => {
    try {
      const list = parsePortfolioImport(await file.text(), (s) => Boolean(getAssetBySymbol(s)));
      if (txs.length && !window.confirm(tr('pf.confirmReplace', { old: txs.length, new: list.length }))) return;
      persist(list);
      setNotice(tr('pf.imported', { count: list.length }));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : tr('pf.importFailed'));
    }
  };

  const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
  const sortedTxs = [...txs].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  return (
    <div className="space-y-6">
      <section className="p-5 md:p-6 rounded-xl border space-y-3" style={card}>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
              <Wallet className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} /> {tr('pf.title')}
            </h1>
            <p className="text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              <Rich text={tr('pf.intro')} />
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => startEdit()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}>
              <Plus className="w-4 h-4" /> {tr('pf.add')}
            </button>
            <button type="button" onClick={doExport} disabled={!txs.length} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border disabled:opacity-40" style={{ borderColor: 'var(--border-subtle)' }}>
              <Download className="w-4 h-4" /> {tr('pf.export')}
            </button>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border cursor-pointer" style={{ borderColor: 'var(--border-subtle)' }}>
              <Upload className="w-4 h-4" /> {tr('pf.import')}
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) doImport(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
        {notice && (
          <p role="status" className="text-xs flex items-center justify-between gap-2 p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
            {notice}
            <button type="button" aria-label={tr('pf.dismiss')} onClick={() => setNotice(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </p>
        )}
      </section>

      {draft && (
        <TxForm draft={draft} setDraft={setDraft} errors={errors} ticks={ticks} onCancel={() => setDraft(null)} onSave={saveDraft} />
      )}

      {txs.length === 0 && !draft ? (
        <section className="p-8 rounded-xl border text-center space-y-2" style={card}>
          <p className="font-semibold">{tr('pf.emptyTitle')}</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {tr('pf.emptyText')}
          </p>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label={tr('pf.summary')}>
            <Stat label={tr('pf.value')} value={formatRupiah(total, 0)} />
            <Stat label={tr('pf.cost')} value={formatRupiah(cost, 0)} />
            <Stat
              label={tr('pf.unrealized')}
              value={signedRupiah(unrealized)}
              sub={cost > 0 ? formatPercent((unrealized / cost) * 100) : undefined}
              color={unrealized >= 0 ? 'var(--color-up)' : 'var(--color-down)'}
            />
            <Stat label={tr('pf.realized')} value={signedRupiah(realized)} color={realized >= 0 ? 'var(--color-up)' : 'var(--color-down)'} />
          </section>
          {unpriced.length > 0 && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {tr('pf.unpriced', { list: unpriced.map((x) => x.asset.shortName).join(', ') })}
            </p>
          )}

          <section className="rounded-xl border overflow-x-auto" style={card} aria-labelledby="positions-heading">
            <h2 id="positions-heading" className="text-base font-bold px-4 pt-4">
              {tr('pf.positions')}
            </h2>
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-left" style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface-subtle)' }}>
                  <th className="px-3 py-2 font-semibold">{tr('pf.asset')}</th>
                  <th className="px-3 py-2 font-semibold text-right">{tr('pf.holding')}</th>
                  <th className="px-3 py-2 font-semibold text-right hidden sm:table-cell">{tr('pf.avgLive')}</th>
                  <th className="px-3 py-2 font-semibold text-right">{tr('pf.valueRp')}</th>
                  <th className="px-3 py-2 font-semibold text-right">{tr('pf.pl')}</th>
                  <th className="px-3 py-2 font-semibold hidden lg:table-cell">{tr('pf.evidence')}</th>
                </tr>
              </thead>
              <tbody>
                {valued.map(({ asset, v }) => {
                  const unit = tradeUnitOf(asset);
                  const ev = evidence[asset.symbol];
                  return (
                    <tr key={asset.symbol} className="border-t align-top cursor-pointer hover:bg-[var(--bg-surface-subtle)]" style={{ borderColor: 'var(--border-subtle)' }} onClick={() => onSelectAsset(asset.symbol)}>
                      <td className="px-3 py-2">
                        <span className="font-bold font-mono-num block">{asset.shortName}</span>
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          {assetName(asset)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono-num text-xs whitespace-nowrap">
                        {v.quantity > 0 ? `${formatNumber(v.quantity / unit.perInput, unit.perInput > 1 ? 0 : 4)} ${unitText(unit.inputLabel)}` : tr('pf.closed')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono-num text-xs hidden sm:table-cell whitespace-nowrap">
                        {money(v.avgCost || undefined, v.currency)}
                        <span className="block" style={{ color: 'var(--text-secondary)' }}>
                          {money(v.livePrice, v.currency)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono-num text-xs whitespace-nowrap">
                        {v.quantity > 0 ? (v.marketValueIdr !== undefined ? formatRupiah(v.marketValueIdr, 0) : tr('common.dataUnavailable')) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono-num text-xs whitespace-nowrap" style={{ color: (v.unrealizedIdr ?? v.realizedIdr ?? 0) >= 0 ? 'var(--color-up)' : 'var(--color-down)' }}>
                        {v.quantity > 0 ? signedRupiah(v.unrealizedIdr) : signedRupiah(v.realizedIdr)}
                        <span className="block text-[10px]">
                          {v.quantity > 0 ? formatPercent(v.unrealizedPct) : tr('pf.realizedShort')}
                          {v.quantity > 0 && v.realized !== 0 ? tr('pf.realizedPart', { v: signedRupiah(v.realizedIdr) }) : ''}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs hidden lg:table-cell" style={{ color: 'var(--text-secondary)' }}>
                        {ev ? `${ev.score}/100 ${tr(`sentiment.${ev.label}` as TranslationKey)}${ev.f ? ` · F-score ${ev.f}` : ''}` : v.quantity > 0 ? '…' : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[10px] px-4 pb-3" style={{ color: 'var(--text-secondary)' }}>
              {tr('pf.evidenceNote')}
            </p>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border" style={card}>
              <h2 className="text-base font-bold mb-2">{tr('pf.allocation')}</h2>
              {byClass.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{tr('pf.noPriced')}</p>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <PieChart width={180} height={180}>
                    <Pie data={byClass.map((x) => ({ name: classLabel(x.c), value: x.value }))} dataKey="value" innerRadius={55} outerRadius={85} stroke="none" isAnimationActive={false}>
                      {byClass.map((x) => (
                        <Cell key={x.c} fill={CLASS_META[x.c].color} />
                      ))}
                    </Pie>
                  </PieChart>
                  <ul className="text-sm space-y-1.5 w-full">
                    {byClass.map((x) => (
                      <li key={x.c} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CLASS_META[x.c].color }} />
                          {classLabel(x.c)}
                        </span>
                        <span className="font-mono-num text-xs">{formatNumber((x.value / total) * 100, 1)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="p-4 rounded-xl border text-sm" style={card}>
              <h2 className="text-base font-bold mb-2">{tr('pf.vsProfile')}</h2>
              {!target || !profile ? (
                <p style={{ color: 'var(--text-secondary)' }}>{tr('pf.takeQuiz')}</p>
              ) : (
                <>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                    {saved?.customAllocation ? tr('pf.customAlloc') : tr('pf.sampleAlloc', { profile: tr(`risk.profile.${profile}` as TranslationKey) })}{' '}
                    {tr('pf.allocNote')}
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ color: 'var(--text-secondary)' }}>
                        <th className="text-left py-1 font-semibold">{tr('pf.class')}</th>
                        <th className="text-right py-1 font-semibold">{tr('pf.yours')}</th>
                        <th className="text-right py-1 font-semibold">{tr('pf.profile')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['stocks', 'gold', 'crypto'] as const).map((c) => {
                        const mine = total > 0 ? ((byClass.find((x) => x.c === c)?.value ?? 0) / total) * 100 : 0;
                        return (
                          <tr key={c} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                            <td className="py-1">{classLabel(c)}</td>
                            <td className="py-1 text-right font-mono-num">{formatNumber(mine, 1)}%</td>
                            <td className="py-1 text-right font-mono-num">{target[c]}%</td>
                          </tr>
                        );
                      })}
                      <tr className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                        <td className="py-1">{tr('pf.mmBonds')}</td>
                        <td className="py-1 text-right" style={{ color: 'var(--text-secondary)' }}>
                          {tr('pf.notTracked')}
                        </td>
                        <td className="py-1 text-right font-mono-num">{target.moneyMarket + target.bonds}%</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </section>

          <section className="rounded-xl border overflow-x-auto" style={card} aria-labelledby="tx-heading">
            <h2 id="tx-heading" className="text-base font-bold px-4 pt-4">
              {tr('pf.transactions')}
            </h2>
            <table className="w-full text-xs mt-2">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-left" style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface-subtle)' }}>
                  <th className="px-3 py-2 font-semibold">{tr('pf.date')}</th>
                  <th className="px-3 py-2 font-semibold">{tr('pf.asset')}</th>
                  <th className="px-3 py-2 font-semibold text-right">{tr('pf.quantity')}</th>
                  <th className="px-3 py-2 font-semibold text-right hidden sm:table-cell">{tr('table.price')}</th>
                  <th className="px-3 py-2 font-semibold text-right hidden md:table-cell">{tr('pf.fee')}</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">{tr('pf.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTxs.map((t) => {
                  const asset = getAssetBySymbol(t.symbol);
                  const unit = asset ? tradeUnitOf(asset) : null;
                  return (
                    <tr key={t.id} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="px-3 py-2 font-mono-num whitespace-nowrap">{t.date}</td>
                      <td className="px-3 py-2">
                        <span className="font-semibold" style={{ color: t.side === 'buy' ? 'var(--color-up)' : 'var(--color-down)' }}>
                          {t.side === 'buy' ? tr('pf.buy') : tr('pf.sell')}
                        </span>{' '}
                        {asset?.shortName ?? t.symbol}
                        {t.note && <span className="block text-[10px]" style={{ color: 'var(--text-secondary)' }}>{t.note}</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono-num whitespace-nowrap">
                        {unit ? `${formatNumber(t.quantity / unit.perInput, unit.perInput > 1 ? 0 : 4)} ${unitText(unit.inputLabel)}` : t.quantity}
                      </td>
                      <td className="px-3 py-2 text-right font-mono-num hidden sm:table-cell">{money(t.price, unit?.currency ?? 'IDR')}</td>
                      <td className="px-3 py-2 text-right font-mono-num hidden md:table-cell">{t.fee ? money(t.fee, unit?.currency ?? 'IDR') : '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button type="button" aria-label={tr('pf.editLabel')} onClick={() => startEdit(t)} className="p-1">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" aria-label={tr('pf.deleteLabel')} onClick={() => remove(t)} className="p-1" style={{ color: 'var(--color-down)' }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}

      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {tr('pf.footer')}
      </p>
    </div>
  );
}

/** True when some sell would exceed the holding after removing a transaction. */
function buildPositionsCheck(txs: PortfolioTx[]): boolean {
  const qty = new Map<string, number>();
  for (const t of [...txs].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    const q = (qty.get(t.symbol) ?? 0) + (t.side === 'buy' ? t.quantity : -t.quantity);
    if (q < -1e-9) return true;
    qty.set(t.symbol, q);
  }
  return false;
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="p-3 rounded-xl border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div className="text-lg font-bold font-mono-num truncate" style={{ color: color ?? 'var(--text-primary)' }}>{value}</div>
      {sub && <div className="text-[11px] font-mono-num" style={{ color }}>{sub}</div>}
    </div>
  );
}

function TxForm({
  draft,
  setDraft,
  errors,
  ticks,
  onCancel,
  onSave,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  errors: string[];
  ticks: Record<string, PriceTick>;
  onCancel: () => void;
  onSave: () => void;
}) {
  useT();
  const asset = draft.symbol ? getAssetBySymbol(draft.symbol) : undefined;
  const unit = asset ? tradeUnitOf(asset) : null;
  const live = asset && unit ? unit.livePrice(ticks[asset.symbol]) : undefined;
  useTrackedSymbols(asset ? [asset.symbol] : []);
  const field = 'w-full px-3 py-2 rounded-lg border text-sm bg-transparent';
  const fieldStyle = { borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' };
  return (
    <section className="p-5 rounded-xl border space-y-4" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--accent-radar)' }} aria-labelledby="tx-form-heading">
      <h2 id="tx-form-heading" className="text-base font-bold">
        {draft.id ? tr('pf.edit') : tr('pf.add')}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <span className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>{tr('pf.asset')}</span>
          <AssetSearch
            ticks={ticks}
            selected={asset}
            onSelect={(a) => (isHoldable(a) ? setDraft({ ...draft, symbol: a.symbol }) : undefined)}
            label={tr('pf.chooseAsset')}
            placeholder={tr('pf.searchPh')}
          />
          {asset && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {asset.shortName} · {assetName(asset)}
              {live !== undefined && tr('pf.live', { price: money(live, unit?.currency ?? 'IDR') })}
            </p>
          )}
        </div>
        <div>
          <span className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>{tr('pf.type')}</span>
          <div className="flex gap-2" role="radiogroup" aria-label={tr('pf.buyOrSell')}>
            {(['buy', 'sell'] as TxSide[]).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={draft.side === s}
                onClick={() => setDraft({ ...draft, side: s })}
                className="flex-1 px-3 py-2 rounded-lg border text-sm font-semibold"
                style={{
                  borderColor: draft.side === s ? (s === 'buy' ? 'var(--color-up)' : 'var(--color-down)') : 'var(--border-subtle)',
                  color: draft.side === s ? (s === 'buy' ? 'var(--color-up)' : 'var(--color-down)') : 'var(--text-secondary)',
                }}
              >
                {s === 'buy' ? tr('pf.buy') : tr('pf.sell')}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>{tr('pf.date')}</span>
          <input type="date" value={draft.date} max={todayWib()} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={field} style={fieldStyle} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>
            {tr('pf.qtyLabel', { unit: unit ? unitText(unit.inputLabel) : tr('pf.unitsDefault') })}
            {unit && unit.perInput > 1 ? tr('pf.lotNote', { n: unit.perInput }) : ''}
          </span>
          <input inputMode="decimal" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} placeholder={unit?.perInput && unit.perInput > 1 ? tr('pf.qtyPhLots') : tr('pf.qtyPhUnits')} className={field} style={fieldStyle} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>{asset ? priceLabelText(asset) : tr('pf.priceDefault')}</span>
          <div className="flex gap-2">
            <input inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder={tr('pf.pricePh')} className={field} style={fieldStyle} />
            {live !== undefined && (
              <button type="button" onClick={() => setDraft({ ...draft, price: String(Number(live.toFixed(live < 1 ? 6 : 2))) })} className="px-2.5 rounded-lg border text-xs font-semibold whitespace-nowrap" style={{ borderColor: 'var(--border-subtle)' }}>
                {tr('pf.useLive')}
              </button>
            )}
          </div>
        </label>
        <label className="block">
          <span className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>{tr('pf.feeLabel')}</span>
          <input inputMode="decimal" value={draft.fee} onChange={(e) => setDraft({ ...draft, fee: e.target.value })} placeholder="0" className={field} style={fieldStyle} />
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>{tr('pf.noteLabel')}</span>
          <input value={draft.note} maxLength={120} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className={field} style={fieldStyle} />
        </label>
      </div>
      {errors.length > 0 && (
        <ul role="alert" className="text-xs space-y-0.5" style={{ color: 'var(--color-down)' }}>
          {errors.map((e) => (
            <li key={e}>• {trError(e)}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onSave} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}>
          {tr('common.save')}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-semibold border" style={{ borderColor: 'var(--border-subtle)' }}>
          {tr('common.cancel')}
        </button>
      </div>
    </section>
  );
}
