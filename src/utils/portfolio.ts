/**
 * portfolio.ts — Pure portfolio maths for the Portfolio page: transactions → positions with the
 * average-cost method (as Indonesian brokers report it), realized and unrealized profit/loss,
 * conversion of every position to Rupiah with live exchange rates, allocation by asset class,
 * input validation (positive numbers, no future dates, no selling more than you hold) and the
 * import/export format. Quantities are stored in base units: shares (1 IDX lot = 100 shares),
 * coins, or grams for gold.
 */
import type { AssetConfig, PriceTick } from '../config/assets.ts';

export const SHARES_PER_LOT = 100;

export type TxSide = 'buy' | 'sell';

export interface PortfolioTx {
  id: string;
  symbol: string;
  side: TxSide;
  /** Trade date, YYYY-MM-DD. */
  date: string;
  /** Base units: shares, coins, or grams (gold). */
  quantity: number;
  /** Price per base unit in the trade currency (see tradeUnitOf). */
  price: number;
  /** Total fee in the trade currency (broker fee, tax). */
  fee: number;
  note?: string;
}

/** How a holding is entered and valued. */
export interface TradeUnit {
  /** Label of the quantity typed by the user ("lots", "grams", "units"). */
  inputLabel: string;
  /** Base units per typed unit (100 for IDX lots). */
  perInput: number;
  /** Currency of prices and fees for this asset. */
  currency: string;
  /** Label for the price field, e.g. "Price per share (Rp)". */
  priceLabel: string;
  /** Live price per base unit, in `currency`. */
  livePrice: (tick: PriceTick | undefined) => number | undefined;
}

export function tradeUnitOf(asset: AssetConfig): TradeUnit {
  const usable = (t: PriceTick | undefined) => (t && t.status !== 'error' && Number.isFinite(t.price) ? t : undefined);
  if (asset.symbol === 'XAU/USD') {
    return {
      inputLabel: 'grams',
      perInput: 1,
      currency: 'IDR',
      priceLabel: 'Price per gram (Rp)',
      livePrice: (t) => usable(t)?.priceIdrPerGram,
    };
  }
  if (asset.group === 'idStock') {
    return {
      inputLabel: 'lots',
      perInput: SHARES_PER_LOT,
      currency: 'IDR',
      priceLabel: 'Price per share (Rp)',
      livePrice: (t) => usable(t)?.price,
    };
  }
  const unit = asset.group === 'crypto' ? 'coins' : asset.group === 'forex' ? 'units of currency' : 'units';
  return {
    inputLabel: unit,
    perInput: 1,
    currency: asset.currency === 'USX' ? 'USD' : asset.currency,
    priceLabel: `Price per ${asset.group === 'crypto' ? 'coin' : 'unit'} (${asset.currency === 'IDR' ? 'Rp' : asset.currency === 'USX' ? 'USD' : asset.currency})`,
    livePrice: (t) => {
      const u = usable(t);
      if (!u) return undefined;
      return asset.currency === 'USX' ? u.price / 100 : u.price;
    },
  };
}

/** Assets that can be held (indices are benchmarks, not investable). */
export function isHoldable(asset: AssetConfig): boolean {
  return asset.group !== 'index';
}

/** Rupiah per unit of a currency from the live ticks (undefined when no rate is available). */
export function idrPerUnit(currency: string, ticks: Record<string, PriceTick>): number | undefined {
  if (currency === 'IDR') return 1;
  const t = ticks[`${currency}/IDR`];
  return t && t.status !== 'error' && Number.isFinite(t.price) && t.price > 0 ? t.price : undefined;
}

export interface Position {
  symbol: string;
  quantity: number;
  /** Remaining cost of the open quantity (including buy fees), trade currency. */
  costBasis: number;
  avgCost: number;
  realized: number;
  /** Totals bought/sold for display. */
  buys: number;
  sells: number;
}

function byDate(a: PortfolioTx, b: PortfolioTx): number {
  return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
}

/** Average-cost positions per symbol (closed positions keep their realized P/L). */
export function buildPositions(txs: PortfolioTx[]): Map<string, Position> {
  const out = new Map<string, Position>();
  for (const tx of [...txs].sort(byDate)) {
    const p = out.get(tx.symbol) ?? { symbol: tx.symbol, quantity: 0, costBasis: 0, avgCost: 0, realized: 0, buys: 0, sells: 0 };
    if (tx.side === 'buy') {
      p.quantity += tx.quantity;
      p.costBasis += tx.quantity * tx.price + tx.fee;
      p.buys += 1;
    } else {
      const q = Math.min(tx.quantity, p.quantity);
      const avg = p.quantity > 0 ? p.costBasis / p.quantity : 0;
      p.realized += q * tx.price - tx.fee - avg * q;
      p.costBasis -= avg * q;
      p.quantity -= q;
      p.sells += 1;
    }
    // Avoid -0 / float dust on fully closed positions
    if (Math.abs(p.quantity) < 1e-9) {
      p.quantity = 0;
      p.costBasis = 0;
    }
    p.avgCost = p.quantity > 0 ? p.costBasis / p.quantity : 0;
    out.set(tx.symbol, p);
  }
  return out;
}

export interface ValuedPosition extends Position {
  currency: string;
  livePrice?: number;
  marketValue?: number;
  unrealized?: number;
  unrealizedPct?: number;
  /** Values converted to Rupiah (undefined when no exchange rate is available). */
  marketValueIdr?: number;
  costBasisIdr?: number;
  unrealizedIdr?: number;
  realizedIdr?: number;
}

export function valuePosition(
  p: Position,
  unit: Pick<TradeUnit, 'currency' | 'livePrice'>,
  tick: PriceTick | undefined,
  ticks: Record<string, PriceTick>
): ValuedPosition {
  const livePrice = unit.livePrice(tick);
  const marketValue = livePrice !== undefined ? p.quantity * livePrice : undefined;
  const unrealized = marketValue !== undefined ? marketValue - p.costBasis : undefined;
  const rate = idrPerUnit(unit.currency, ticks);
  return {
    ...p,
    currency: unit.currency,
    livePrice,
    marketValue,
    unrealized,
    unrealizedPct: unrealized !== undefined && p.costBasis > 0 ? (unrealized / p.costBasis) * 100 : undefined,
    marketValueIdr: rate !== undefined && marketValue !== undefined ? marketValue * rate : undefined,
    costBasisIdr: rate !== undefined ? p.costBasis * rate : undefined,
    unrealizedIdr: rate !== undefined && unrealized !== undefined ? unrealized * rate : undefined,
    realizedIdr: rate !== undefined ? p.realized * rate : undefined,
  };
}

/** Portfolio buckets matching the Risk Profile instruments where possible. */
export type AssetClass = 'stocks' | 'crypto' | 'gold' | 'other';

export function assetClassOf(asset: AssetConfig): AssetClass {
  if (asset.group === 'crypto') return 'crypto';
  if (asset.symbol === 'XAU/USD') return 'gold';
  if (asset.group === 'idStock' || asset.group === 'usStock' || asset.group === 'globalStock') return 'stocks';
  return 'other';
}

export interface TxDraft {
  symbol: string;
  side: TxSide;
  date: string;
  quantity: number;
  price: number;
  fee: number;
}

/** Problems with a new or edited transaction (empty array = valid). */
export function validateTx(draft: TxDraft, existing: PortfolioTx[], today: string, editingId?: string): string[] {
  const errors: string[] = [];
  if (!draft.symbol) errors.push('Choose an asset.');
  if (!(draft.quantity > 0) || !Number.isFinite(draft.quantity)) errors.push('Quantity must be greater than 0.');
  if (!(draft.price > 0) || !Number.isFinite(draft.price)) errors.push('Price must be greater than 0.');
  if (!(draft.fee >= 0) || !Number.isFinite(draft.fee)) errors.push('Fee cannot be negative.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) errors.push('Enter a valid date.');
  else if (draft.date > today) errors.push('The date cannot be in the future.');
  if (errors.length === 0) {
    // Replaying every transaction in date order, the position may never go below zero
    const others = existing.filter((t) => t.id !== editingId && t.symbol === draft.symbol);
    const all = [...others, { ...draft, id: editingId ?? '￿' }].sort(byDate);
    let qty = 0;
    for (const t of all) {
      qty += t.side === 'buy' ? t.quantity : -t.quantity;
      if (qty < -1e-9) {
        errors.push('You cannot sell more than you hold on that date.');
        break;
      }
    }
  }
  return errors;
}

export const PORTFOLIO_EXPORT_VERSION = 1;

export function exportPortfolio(txs: PortfolioTx[], now = new Date()): string {
  return JSON.stringify({ app: 'AssetRadar', type: 'portfolio', version: PORTFOLIO_EXPORT_VERSION, exportedAt: now.toISOString(), transactions: txs }, null, 2);
}

/** Parses an export file; throws a readable error for anything that is not a valid portfolio. */
export function parsePortfolioImport(text: string, knownSymbol: (s: string) => boolean): PortfolioTx[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const list = (data as { transactions?: unknown })?.transactions;
  if (!Array.isArray(list)) throw new Error('No transactions found in this file.');
  const out: PortfolioTx[] = [];
  for (const raw of list) {
    const t = raw as Partial<PortfolioTx>;
    if (
      typeof t.id !== 'string' ||
      typeof t.symbol !== 'string' ||
      (t.side !== 'buy' && t.side !== 'sell') ||
      typeof t.date !== 'string' ||
      typeof t.quantity !== 'number' ||
      typeof t.price !== 'number' ||
      typeof t.fee !== 'number'
    ) {
      throw new Error('The file contains an invalid transaction.');
    }
    if (!knownSymbol(t.symbol)) throw new Error(`Unknown asset in file: ${t.symbol}`);
    const item: PortfolioTx = { id: t.id, symbol: t.symbol, side: t.side, date: t.date, quantity: t.quantity, price: t.price, fee: t.fee };
    if (typeof t.note === 'string' && t.note) item.note = t.note;
    out.push(item);
  }
  return out;
}
