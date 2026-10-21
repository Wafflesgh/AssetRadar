/**
 * oecd.ts — OECD Data Explorer (SDMX REST, no key) for the Indonesia macro page. FRED, which
 * mirrors most of these OECD series, does not answer from Vercel's servers, so the series are read
 * from the OECD directly: interest rates, exchange rates, CPI, GDP growth, merchandise trade,
 * current account and consumer confidence; BIS (same csv layout) for private credit and property
 * prices. Pure parsing here; the server fetches (it must send an Accept-Language header: the
 * OECD API answers 500 to Node's default "*").
 */
import type { MacroPoint } from './macro.ts';

export const OECD_API = 'https://sdmx.oecd.org/public/rest/data';
export const OECD_EXPLORER = 'https://data-explorer.oecd.org/';

export interface OecdSeriesDef {
  /** "AGENCY,DATAFLOW," as in the data URL. */
  flow: string;
  /** Dimension values separated by dots (empty = any). */
  key: string;
}

/** The series the macro page reads from the OECD (keys checked on 22 Oct 2026). */
export const OECD_SERIES = {
  interbank: { flow: 'OECD.SDD.STES,DSD_STES@DF_FINMARK,', key: 'IDN.M.IRSTCI.PA._Z._Z._Z._Z.N' },
  usdIdr: { flow: 'OECD.SDD.STES,DSD_STES@DF_FINMARK,', key: 'IDN.M.CC.XDC_USD._Z._Z._Z._Z.N' },
  reer: { flow: 'OECD.SDD.STES,DSD_STES@DF_FINMARK,', key: 'IDN.M.CCRE.IX._Z._Z._Z._Z.N' },
  usCallRate: { flow: 'OECD.SDD.STES,DSD_STES@DF_FINMARK,', key: 'USA.M.IRSTCI.PA._Z._Z._Z._Z.N' },
  cpiYoy: { flow: 'OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,', key: 'IDN.M.N.CPI.PA._T.N.GY' },
  cpiIndex: { flow: 'OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,', key: 'IDN.M.N.CPI.IX._T.N._Z' },
  gdpYoy: { flow: 'OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_GROWTH_G20,', key: 'Q.Y.IDN.S1.S1.B1GQ._Z._Z._Z.PC.L.GY.T0102' },
  tradeBalance: { flow: 'OECD.SDD.TPS,DSD_IMTS@DF_IMTS,', key: 'IDN.W.TB.C.M.USD_EXC.Y.N' },
  exports: { flow: 'OECD.SDD.TPS,DSD_IMTS@DF_IMTS,', key: 'IDN.W.X.C.M.USD_EXC.Y.N' },
  imports: { flow: 'OECD.SDD.TPS,DSD_IMTS@DF_IMTS,', key: 'IDN.W.M.C.M.USD_EXC.Y.N' },
  currentAccount: { flow: 'OECD.SDD.TPS,DSD_BOP@DF_BOP,', key: 'IDN.WXD.CA.B.T.Q.PT_B1GQ.Y' },
  confidence: { flow: 'OECD.SDD.STES,DSD_STES@DF_CLI,', key: 'IDN.M.CCICP.IX._Z.AA.IX._Z.H' },
} satisfies Record<string, OecdSeriesDef>;

export function oecdUrl(def: OecdSeriesDef, startPeriod: string): string {
  return `${OECD_API}/${def.flow}/${def.key}?startPeriod=${encodeURIComponent(startPeriod)}&format=csvfile`;
}

/** "2026-08" / "2026-Q2" / "2025" → first day of the period (as FRED dates it). */
export function oecdPeriodToDate(period: string): string | null {
  let m = period.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-01`;
  m = period.match(/^(\d{4})-Q([1-4])$/);
  if (m) return `${m[1]}-${String((Number(m[2]) - 1) * 3 + 1).padStart(2, '0')}-01`;
  m = period.match(/^(\d{4})$/);
  if (m) return `${m[1]}-01-01`;
  return null;
}

/**
 * The csvfile answer (one row per observation) → points sorted by date. Values are scaled to
 * base units with UNIT_MULT (trade comes in billions: multiplier 9).
 */
export function parseOecdCsv(text: string): MacroPoint[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = lines[0].split(',');
  const iTime = head.indexOf('TIME_PERIOD');
  const iVal = head.indexOf('OBS_VALUE');
  const iMult = head.indexOf('UNIT_MULT');
  if (iTime < 0 || iVal < 0) return [];
  const byDate = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const date = oecdPeriodToDate(c[iTime] ?? '');
    const v = Number(c[iVal]);
    if (!date || c[iVal] === '' || !Number.isFinite(v)) continue;
    const mult = iMult >= 0 && c[iMult] !== '' && Number.isFinite(Number(c[iMult])) ? Number(c[iMult]) : 0;
    byDate.set(date, v * 10 ** mult);
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value }));
}

/** BIS statistics API (no key; same csv columns TIME_PERIOD / OBS_VALUE / UNIT_MULT). */
export const BIS_API = 'https://stats.bis.org/api/v2/data/dataflow/BIS';
export const BIS_EXPLORER = 'https://data.bis.org/';
export const BIS_SERIES = {
  /** Credit to the private non-financial sector, all lenders, % of GDP, adjusted for breaks. */
  privateCredit: 'WS_TC/2.0/Q.ID.P.A.M.770.A',
  /** Residential property prices, real index. */
  housePrices: 'WS_SPP/1.0/Q.ID.R.628',
} as const;

export function bisUrl(path: string, startPeriod: string): string {
  return `${BIS_API}/${path}?startPeriod=${encodeURIComponent(startPeriod)}&format=csv`;
}
