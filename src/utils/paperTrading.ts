/**
 * paperTrading.ts — Pure maths for Paper Trading: a pretend Rupiah account (Rp100 million by
 * default) that buys and sells any holdable asset at the live price. Orders reuse the Portfolio's
 * average-cost positions (utils/portfolio.ts); cash stays in Rupiah, so every order records the
 * exchange rate it was filled at. Fees follow typical retail costs per market and IDX stocks trade
 * in lots of 100 shares. The account remembers the IDX Composite level at its start, so the result
 * can be compared with simply holding the index. Stored as one synced list (`paper`): the account
 * record plus one record per order.
 */
import type { AssetConfig, PriceTick } from '../config/assets.ts';
import { buildPositions, idrPerUnit, isHoldable, tradeUnitOf, valuePosition, type PortfolioTx, type ValuedPosition } from './portfolio.ts';

export const PAPER_START_IDR = 100_000_000;
export const PAPER_ACCOUNT_ID = 'account';
export const JCI_SYMBOL = '^JKSE';

export type PaperSide = 'buy' | 'sell';

export interface PaperAccount {
  id: typeof PAPER_ACCOUNT_ID;
  kind: 'account';
  startedAt: number;
  startCash: number;
  /** IDX Composite level when the account started (null when it was not known). */
  jciStart: number | null;
}

export interface PaperOrder {
  id: string;
  kind: 'order';
  /** Fill time (ms). */
  at: number;
  symbol: string;
  side: PaperSide;
  /** Base units: shares, coins or grams (gold). */
  quantity: number;
  /** Price per base unit in `currency`. */
  price: number;
  currency: string;
  /** Rupiah per unit of `currency` at the fill (1 for Rupiah assets). */
  fx: number;
  /** Fee in `currency`. */
  fee: number;
}

export type PaperError = 'notTradable' | 'noPrice' | 'noRate' | 'badQuantity' | 'wholeLots' | 'notEnoughCash' | 'notEnoughHolding';

/** Fee per side as a share of the order value (broker fee, sales tax on IDX sells, crypto spread). */
export function paperFeeRate(asset: AssetConfig, side: PaperSide): number {
  if (asset.group === 'idStock') return side === 'buy' ? 0.0015 : 0.0025;
  if (asset.group === 'crypto') return 0.002;
  return 0.001;
}

export function isPaperTradable(asset: AssetConfig): boolean {
  return isHoldable(asset);
}

export function newPaperAccount(now: number, jciStart: number | null, startCash = PAPER_START_IDR): PaperAccount {
  return { id: PAPER_ACCOUNT_ID, kind: 'account', startedAt: now, startCash, jciStart: jciStart && jciStart > 0 ? jciStart : null };
}

const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Reads the stored list (anything malformed is skipped). */
export function parsePaperItems(raw: unknown): { account: PaperAccount | null; orders: PaperOrder[] } {
  const list = Array.isArray(raw) ? raw : [];
  let account: PaperAccount | null = null;
  const orders: PaperOrder[] = [];
  for (const it of list) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    if (o.kind === 'account' && o.id === PAPER_ACCOUNT_ID && positive(o.startCash) && typeof o.startedAt === 'number') {
      account = { id: PAPER_ACCOUNT_ID, kind: 'account', startedAt: o.startedAt, startCash: o.startCash, jciStart: positive(o.jciStart) ? o.jciStart : null };
    } else if (
      o.kind === 'order' &&
      typeof o.id === 'string' &&
      typeof o.symbol === 'string' &&
      (o.side === 'buy' || o.side === 'sell') &&
      positive(o.quantity) &&
      positive(o.price) &&
      positive(o.fx) &&
      typeof o.currency === 'string' &&
      typeof o.at === 'number' &&
      typeof o.fee === 'number' &&
      o.fee >= 0
    ) {
      orders.push(o as unknown as PaperOrder);
    }
  }
  // Orders from before the current account started belong to an account that was reset
  const live = account ? orders.filter((o) => o.at >= account!.startedAt) : orders;
  return { account, orders: live.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)) };
}

/** Cash change of one order in Rupiah (negative for a buy). */
export function orderCashIdr(o: Pick<PaperOrder, 'side' | 'quantity' | 'price' | 'fee' | 'fx'>): number {
  const gross = o.quantity * o.price;
  return o.side === 'buy' ? -(gross + o.fee) * o.fx : (gross - o.fee) * o.fx;
}

export function cashOf(account: PaperAccount, orders: PaperOrder[]): number {
  return orders.reduce((cash, o) => cash + orderCashIdr(o), account.startCash);
}

const toTxs = (orders: PaperOrder[]): PortfolioTx[] =>
  orders.map((o) => ({ id: o.id, symbol: o.symbol, side: o.side, date: new Date(o.at).toISOString(), quantity: o.quantity, price: o.price, fee: o.fee }));

/** Quantity held per symbol (base units). */
export function heldQuantity(orders: PaperOrder[], symbol: string): number {
  return buildPositions(toTxs(orders.filter((o) => o.symbol === symbol))).get(symbol)?.quantity ?? 0;
}

export interface PaperQuote {
  /** Base units. */
  quantity: number;
  price: number;
  currency: string;
  fx: number;
  /** Order value and fee in `currency`. */
  gross: number;
  fee: number;
  /** Cash change in Rupiah (negative for a buy). */
  cashIdr: number;
}

/**
 * Prices an order of `amount` input units (lots for IDX stocks, grams for gold, otherwise coins or
 * units) at the live price. Old (saved offline) prices and missing exchange rates are refused.
 */
export function quotePaperOrder(
  asset: AssetConfig,
  side: PaperSide,
  amount: number,
  tick: PriceTick | undefined,
  ticks: Record<string, PriceTick>
): { quote: PaperQuote } | { error: PaperError } {
  if (!isPaperTradable(asset)) return { error: 'notTradable' };
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'badQuantity' };
  const unit = tradeUnitOf(asset);
  if (unit.perInput > 1 && !Number.isInteger(amount)) return { error: 'wholeLots' };
  const price = tick && !tick.fromSnapshot ? unit.livePrice(tick) : undefined;
  if (price === undefined || !(price > 0)) return { error: 'noPrice' };
  const fx = idrPerUnit(unit.currency, ticks);
  if (fx === undefined) return { error: 'noRate' };
  const quantity = amount * unit.perInput;
  const gross = quantity * price;
  const fee = gross * paperFeeRate(asset, side);
  return { quote: { quantity, price, currency: unit.currency, fx, gross, fee, cashIdr: orderCashIdr({ side, quantity, price, fee, fx }) } };
}

/** Whether the account can afford the buy / holds enough to sell. */
export function checkPaperOrder(side: PaperSide, quote: PaperQuote, cash: number, held: number): PaperError | null {
  if (side === 'buy' && -quote.cashIdr > cash + 1e-6) return 'notEnoughCash';
  if (side === 'sell' && quote.quantity > held + 1e-9) return 'notEnoughHolding';
  return null;
}

export function makePaperOrder(asset: AssetConfig, side: PaperSide, quote: PaperQuote, now: number, id: string): PaperOrder {
  return { id, kind: 'order', at: now, symbol: asset.symbol, side, quantity: quote.quantity, price: quote.price, currency: quote.currency, fx: quote.fx, fee: quote.fee };
}

/** Largest whole number of input units (lots, coins…) the cash buys, fee included. */
export function maxAffordable(asset: AssetConfig, quote: Pick<PaperQuote, 'price' | 'fx'>, cash: number): number {
  const unit = tradeUnitOf(asset);
  const perInputIdr = unit.perInput * quote.price * quote.fx * (1 + paperFeeRate(asset, 'buy'));
  if (!(perInputIdr > 0) || cash <= 0) return 0;
  const n = cash / perInputIdr;
  // Lots are whole; coins and grams to 4 decimals
  return unit.perInput > 1 ? Math.floor(n) : Math.floor(n * 1e4) / 1e4;
}

export interface PaperHolding extends ValuedPosition {
  asset: AssetConfig;
  /** Value in Rupiah: live when priced, otherwise the cost at the fill rates. */
  valueIdr: number;
  priced: boolean;
}

export interface PaperSummary {
  cash: number;
  holdingsIdr: number;
  totalIdr: number;
  /** Total result since the start, as a fraction. */
  ret: number;
  realizedIdr: number;
  feesIdr: number;
  holdings: PaperHolding[];
  /** IDX Composite change since the account started, as a fraction (null when unknown). */
  jciRet: number | null;
  /** Open positions without a live price (valued at cost). */
  unpriced: number;
}

export function summarizePaper(
  account: PaperAccount,
  orders: PaperOrder[],
  ticks: Record<string, PriceTick>,
  assetOf: (symbol: string) => AssetConfig | undefined
): PaperSummary {
  const cash = cashOf(account, orders);
  const lastFx = new Map<string, number>();
  for (const o of orders) lastFx.set(o.symbol, o.fx);
  const holdings: PaperHolding[] = [];
  let realizedIdr = 0;
  for (const p of buildPositions(toTxs(orders)).values()) {
    const asset = assetOf(p.symbol);
    const fx = lastFx.get(p.symbol) ?? 1;
    realizedIdr += p.realized * fx;
    if (!asset || p.quantity <= 0) continue;
    const v = valuePosition(p, tradeUnitOf(asset), ticks[p.symbol]?.fromSnapshot ? undefined : ticks[p.symbol], ticks);
    const priced = v.marketValueIdr !== undefined;
    holdings.push({ ...v, asset, priced, valueIdr: priced ? v.marketValueIdr! : p.costBasis * fx });
  }
  holdings.sort((a, b) => b.valueIdr - a.valueIdr);
  const holdingsIdr = holdings.reduce((s, h) => s + h.valueIdr, 0);
  const totalIdr = cash + holdingsIdr;
  const jciNow = ticks[JCI_SYMBOL]?.price;
  return {
    cash,
    holdingsIdr,
    totalIdr,
    ret: totalIdr / account.startCash - 1,
    realizedIdr,
    feesIdr: orders.reduce((s, o) => s + o.fee * o.fx, 0),
    holdings,
    jciRet: account.jciStart && jciNow && jciNow > 0 ? jciNow / account.jciStart - 1 : null,
    unpriced: holdings.filter((h) => !h.priced).length,
  };
}
