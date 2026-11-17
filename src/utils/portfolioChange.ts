/** portfolioChange.ts — Quote-based 24-hour change for currently valued holdings. */
export function portfolioChange(rows: { valueIdr?: number; changePct24h?: number }[]) {
  let total = 0;
  let included = 0;
  for (const { valueIdr: value, changePct24h: c } of rows) {
    if (value === undefined || c === undefined || !Number.isFinite(value) || !Number.isFinite(c) || value < 0 || c <= -100) continue;
    const change = value * c / (100 + c);
    if (!Number.isFinite(change)) continue;
    total += change;
    included++;
  }
  return { total: included ? total : null, excluded: rows.length - included };
}
