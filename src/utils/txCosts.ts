/** txCosts.ts — Recorded transaction fees grouped without mixing trade currencies. */
import { getAssetBySymbol } from '../config/assets.ts';
import { tradeUnitOf, type PortfolioTx } from './portfolio.ts';

export interface CostTotal {
  fees: number;
  tradedValue: number;
  feePct: number | null;
}
export interface CostRow extends CostTotal { key: string }
export interface CurrencyCosts extends CostTotal {
  currency: string;
  months: CostRow[];
  years: CostRow[];
  assets: CostRow[];
}

const empty = (): CostTotal => ({ fees: 0, tradedValue: 0, feePct: null });

export function txCosts(txs: readonly PortfolioTx[]): { currencies: CurrencyCosts[]; excluded: number } {
  const groups = new Map<string, { total: CostTotal; months: Map<string, CostTotal>; years: Map<string, CostTotal>; assets: Map<string, CostTotal> }>();
  let excluded = 0;
  const add = (total: CostTotal, tx: PortfolioTx) => {
    total.fees += tx.fee;
    total.tradedValue += tx.quantity * tx.price;
    total.feePct = total.tradedValue > 0 ? total.fees / total.tradedValue * 100 : null;
  };
  for (const tx of txs) {
    const asset = getAssetBySymbol(tx.symbol);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(tx.date) ? new Date(`${tx.date}T00:00:00Z`) : null;
    if (!asset || !date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== tx.date
      || !Number.isFinite(tx.fee) || tx.fee < 0 || !Number.isFinite(tx.quantity) || tx.quantity <= 0
      || !Number.isFinite(tx.price) || tx.price <= 0 || !Number.isFinite(tx.quantity * tx.price)) {
      excluded++;
      continue;
    }
    const currency = tradeUnitOf(asset).currency;
    let group = groups.get(currency);
    if (!group) {
      group = { total: empty(), months: new Map(), years: new Map(), assets: new Map() };
      groups.set(currency, group);
    }
    add(group.total, tx);
    const buckets: [Map<string, CostTotal>, string][] = [
      [group.months, tx.date.slice(0, 7)], [group.years, tx.date.slice(0, 4)], [group.assets, tx.symbol],
    ];
    for (const [map, key] of buckets) {
      const total = map.get(key) ?? empty();
      add(total, tx);
      map.set(key, total);
    }
  }
  const rows = (map: Map<string, CostTotal>): CostRow[] => [...map].map(([key, value]) => ({ key, ...value }));
  return {
    excluded,
    currencies: [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([currency, group]) => ({
      currency, ...group.total,
      months: rows(group.months).sort((a, b) => b.key.localeCompare(a.key)),
      years: rows(group.years).sort((a, b) => b.key.localeCompare(a.key)),
      assets: rows(group.assets).sort((a, b) => b.fees - a.fees || a.key.localeCompare(b.key)).slice(0, 10),
    })),
  };
}
