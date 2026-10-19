/**
 * secCik.ts — SEC EDGAR Central Index Keys (CIK) for the US stocks in the asset list, used to
 * load their 10-Q/10-K figures from data.sec.gov. Each number was checked against the company
 * name SEC returns (October 2026). Stocks without an entry (foreign filers such as TSMC and
 * ASML, or companies not filing with SEC) use Yahoo Finance only.
 */
export const SEC_CIK: Record<string, number> = {
  AAPL: 320193,
  MSFT: 789019,
  NVDA: 1045810,
  GOOG: 1652044,
  AMZN: 1018724,
  META: 1326801,
  AVGO: 1730168,
  TSLA: 1318605,
  BRKB: 1067983,
  LLY: 59478,
  MU: 723125,
  WMT: 104169,
  JPM: 19617,
  AMD: 2488,
  V: 1403161,
  XOM: 34088,
  JNJ: 200406,
  MA: 1141391,
  ABBV: 1551152,
  INTC: 50863,
  PLTR: 1321655,
  CVX: 93410,
  NFLX: 1065280,
  ORCL: 1341439,
  COST: 909832,
  KO: 21344,
  BAC: 70858,
  UNH: 731766,
};

export function secCikFor(code: string): string | null {
  const cik = SEC_CIK[code];
  return cik ? String(cik).padStart(10, '0') : null;
}
