/** idxCloses.ts — Aligned rolling closes from observed IDX trading dates, without interpolation. */
export interface IdxCloses { dates: string[]; closes: Record<string, Array<number | null>> }

export function appendDay(table: IdxCloses, date: string, symbol: string, close: number): IdxCloses {
  return appendSeries(table, symbol, [{ date, close }]);
}

export function appendSeries(table: IdxCloses, symbol: string, points: Array<{ date: string; close: number }>): IdxCloses {
  const valid = points.filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.close) && p.close > 0);
  if (!valid.length) return table;
  const dates = [...new Set([...table.dates, ...valid.map((p) => p.date)])].sort().slice(-30);
  if (!valid.some((p) => dates.includes(p.date))) return table;
  const changed = dates.length !== table.dates.length || dates.some((day, i) => day !== table.dates[i]);
  const oldIndex = new Map(table.dates.map((day, i) => [day, i]));
  const align = (key: string) => dates.map((day) => {
    const i = oldIndex.get(day);
    return i === undefined ? null : table.closes[key]?.[i] ?? null;
  });
  const closes = changed ? Object.fromEntries(Object.keys(table.closes).map((key) => [key, align(key)])) : { ...table.closes };
  const row = changed ? closes[symbol] ?? dates.map(() => null) : [...(closes[symbol] ?? dates.map(() => null))];
  const index = new Map(dates.map((day, i) => [day, i]));
  for (const point of valid) {
    const i = index.get(point.date);
    if (i !== undefined) row[i] = point.close;
  }
  closes[symbol] = row;
  return { dates, closes };
}

export function change1m(table: IdxCloses, symbol: string): number | null {
  const last = table.dates.length - 1;
  if (last < 21) return null;
  const a = table.closes[symbol]?.[last - 21];
  const b = table.closes[symbol]?.[last];
  return typeof a === 'number' && Number.isFinite(a) && a > 0 && typeof b === 'number' && Number.isFinite(b) && b > 0
    ? (b / a - 1) * 100 : null;
}
