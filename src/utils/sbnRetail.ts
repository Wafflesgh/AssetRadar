/**
 * sbnRetail.ts — Retail Indonesian government securities (SBN Ritel) that individuals buy in
 * Indonesian banking / securities / investment apps: ORI and Sukuk Ritel (SR, tradable, fixed
 * coupon), Savings Bond Ritel (SBR) and Sukuk Tabungan (ST) (not tradable, floating with a
 * floor, early redemption) and Sukuk Wakaf Ritel (SWR). Reads the readable text of the official
 * DJPPR (Ministry of Finance) product pages and pulls out each series' coupon, tenor, maturity,
 * offering period, settlement, minimum / maximum order and tradability. A field that is not on
 * the page stays null — nothing is guessed. Pure; server/sbn.ts fetches the pages.
 */

export type SbnType = 'ORI' | 'SR' | 'SBR' | 'ST' | 'SWR';

export interface SbnPageDef {
  type: SbnType;
  /** Page path on djppr.kemenkeu.go.id (also the CMS "url" parameter). */
  slug: string;
  sharia: boolean;
}

export const SBN_PAGES: SbnPageDef[] = [
  { type: 'ORI', slug: 'obligasinegararitel', sharia: false },
  { type: 'SBR', slug: 'savingsbondritel', sharia: false },
  { type: 'SR', slug: 'sukukritel', sharia: true },
  { type: 'ST', slug: 'sukuktabungan', sharia: true },
  { type: 'SWR', slug: 'sukukwakaf', sharia: true },
];

export const DJPPR_SITE = 'https://djppr.kemenkeu.go.id';
export const DJPPR_CMS_API = 'https://api-djppr.kemenkeu.go.id/web/api/v1/page?url=';

export interface SbnSeries {
  code: string;
  type: SbnType;
  sharia: boolean;
  /** Coupon / return in % per year (for floating series: the first rate, which is also the floor). */
  couponPct: number | null;
  couponType: 'fixed' | 'floatingFloor' | null;
  tenorYears: number | null;
  /** YYYY-MM-DD. */
  maturity: string | null;
  offerStart: string | null;
  offerEnd: string | null;
  /** Closing time on the last day, e.g. "10.00 WIB". */
  closeTime: string | null;
  settlement: string | null;
  /** Rupiah. */
  minOrder: number | null;
  maxOrder: number | null;
  maxUnlimited: boolean;
  tradable: boolean | null;
  earlyRedemption: boolean;
  /** Official page. */
  url: string;
  /** Distribution partners (host names) listed on the page. */
  partners: string[];
}

const MONTHS: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  january: 1, february: 2, march: 3, may: 5, june: 6, july: 7, august: 8, october: 10, december: 12,
};
const MONTH_RE = '(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)';
const DATE_RE = `(\\d{1,2})\\s+${MONTH_RE}\\s+(\\d{4})`;

function iso(day: string | number, month: string, year: string | number): string | null {
  const m = MONTHS[month.toLowerCase()];
  const d = Number(day);
  const y = Number(year);
  if (!m || !(d >= 1 && d <= 31) || !(y > 2000 && y < 2100)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "6 Juli - 30 Juli 2026", "28 September 2026 - 22 Oktober 2026", "4 September - 21 Oktober 2026". */
export function parseDateRange(text: string): { start: string; end: string } | null {
  const m = text.match(new RegExp(`(\\d{1,2})(?:\\s+${MONTH_RE})?(?:\\s+(\\d{4}))?\\s*(?:-|–|—|s\\.d\\.|sampai)\\s*${DATE_RE}`, 'i'));
  if (!m) return null;
  const [, d1, m1, y1, d2, m2, y2] = m;
  const end = iso(d2, m2, y2);
  const start = iso(d1, m1 ?? m2, y1 ?? y2);
  return start && end && start <= end ? { start, end } : null;
}

function firstDate(text: string): string | null {
  const m = text.match(new RegExp(DATE_RE, 'i'));
  return m ? iso(m[1], m[2], m[3]) : null;
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&lsquo;|&rsquo;|&#39;/g, "'")
    .replace(/&ndash;|&mdash;/g, '-')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

/** Readable lines and external links from the CMS page JSON ("PageContentLive"). */
export function extractCms(pageContentLive: string): { lines: string[]; links: string[] } {
  let tree: unknown;
  try {
    tree = JSON.parse(pageContentLive || '[]');
  } catch {
    return { lines: [], links: [] };
  }
  const lines: string[] = [];
  const links: string[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    for (const k of ['text', 'htmlContent', 'title', 'caption', 'label']) {
      const v = o[k];
      if (typeof v !== 'string' || !v.trim()) continue;
      for (const href of v.matchAll(/href="(https?:[^"]+)"/g)) links.push(href[1]);
      // One line per CMS field (a table row or a timeline step is one field on these pages)
      const t = decode(v.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (t) lines.push(t);
    }
    for (const k of ['linkUrl', 'url', 'link', 'href']) if (typeof o[k] === 'string' && /^https?:/.test(o[k] as string)) links.push(o[k] as string);
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v);
  };
  walk(tree);
  return { lines, links };
}

/** Distribution partner hosts from the page links (social media, videos and the ministry itself excluded). */
export function partnerHosts(links: string[]): string[] {
  const out = new Set<string>();
  for (const link of links) {
    let host: string;
    try {
      host = new URL(link).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (/(^|\.)(youtube\.com|youtu\.be|instagram\.com|facebook\.com|twitter\.com|x\.com|tiktok\.com|kemenkeu\.go\.id|google\.com|onelink\.me|per\.mt|bit\.ly|wa\.me)$/.test(host)) continue;
    out.add(host.replace(/^www\./, ''));
  }
  return [...out].sort();
}

const CODE_RE: Record<SbnType, RegExp> = {
  ORI: /\bORI(\d{3})(T\d{1,2})?\b/g,
  SR: /\bSR(\d{3})(T\d{1,2})?\b/g,
  SBR: /\bSBR(\d{3})(T\d{1,2})?\b/g,
  ST: /\bST(\d{3})(T\d{1,2})?\b/g,
  SWR: /\bSWR(\d{3})(T\d{1,2})?\b/g,
};

/** The current series on a page: the series number mentioned most often (pages keep typos of old numbers). */
export function currentCodes(type: SbnType, text: string): string[] {
  const counts = new Map<string, number>();
  const withTenor = new Map<string, Set<string>>();
  for (const m of text.matchAll(CODE_RE[type])) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    if (m[2]) {
      const set = withTenor.get(m[1]) ?? new Set<string>();
      set.add(m[2].toUpperCase());
      withTenor.set(m[1], set);
    }
  }
  const best = [...counts].sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))[0]?.[0];
  if (!best) return [];
  const tenors = [...(withTenor.get(best) ?? [])].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return tenors.length ? tenors.map((t) => `${type}${best}${t}`) : [`${type}${best}`];
}

const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const rupiah = (amount: string, unit: string) => num(amount) * (/miliar/i.test(unit) ? 1e9 : /juta/i.test(unit) ? 1e6 : 1);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function couponFor(code: string, lines: string[], text: string): number | null {
  // "Kupon ORI030T3" / "Imbalan SR025T5" followed by "6,90% p.a." within the next lines
  for (let i = 0; i < lines.length; i++) {
    if (!new RegExp(`^(Kupon|Imbalan)\\s+${escape(code)}$`, 'i').test(lines[i])) continue;
    for (let k = i + 1; k <= i + 3 && k < lines.length; k++) {
      const m = lines[k].match(/(\d{1,2}[,.]\d{1,2})\s*%/);
      if (m) return num(m[1]);
    }
  }
  // "... sebesar 6,75% p.a. untuk SBR015T2" or "6,05% p.a. (ST016T2)"
  const m =
    text.match(new RegExp(`(\\d{1,2}[,.]\\d{1,2})\\s*%\\s*(?:p\\.a\\.?)?\\s*(?:untuk\\s*(?:seri\\s*)?|\\()${escape(code)}\\b`, 'i')) ??
    text.match(new RegExp(`${escape(code)}\\)?\\s*(?:sebesar|:)\\s*(\\d{1,2}[,.]\\d{1,2})\\s*%`, 'i'));
  return m ? num(m[1]) : null;
}

function maturityFor(code: string, text: string): string | null {
  const after = text.match(new RegExp(`${escape(code)},?\\s*(?:bertenor\\s*)?(?:\\d{1,2}\\s*Tahun,?\\s*)?${DATE_RE}`, 'i'));
  if (after) return iso(after[1], after[2], after[3]);
  const before = text.match(new RegExp(`${DATE_RE}\\s+Jatuh Tempo\\s+${escape(code)}\\b`, 'i'));
  return before ? iso(before[1], before[2], before[3]) : null;
}

function maxFor(code: string, text: string): number | null {
  // "Rp5 miliar (ST016T2)" first; then "ORI030T3 Rp5 miliar" (a ")" right after the code belongs to the first form)
  const m =
    text.match(new RegExp(`Rp\\s?([\\d.,]+)\\s*(miliar|juta)\\s*\\(${escape(code)}\\)`, 'i')) ??
    text.match(new RegExp(`${escape(code)}\\s*:?\\s*Rp\\s?([\\d.,]+)\\s*(miliar|juta)`, 'i'));
  return m ? rupiah(m[1], m[2]) : null;
}

/** All series on one product page. */
export function parseSbnPage(def: SbnPageDef, lines: string[], links: string[] = []): SbnSeries[] {
  const text = lines.join('\n');
  const codes = currentCodes(def.type, text);
  if (codes.length === 0) return [];
  const flat = lines.join(' ');

  // Offering period: "Masa Penawaran <range>", "<range> Masa Penawaran", or the timeline
  let offer: { start: string; end: string } | null = null;
  let closeTime: string | null = null;
  for (const l of lines) {
    if (/Masa Penawaran/i.test(l) && !/Pembukaan|Mulai|Selesai|Penutupan|Peresmian/i.test(l)) offer ??= parseDateRange(l);
  }
  let open: string | null = null;
  let close: string | null = null;
  for (const l of lines) {
    const m = l.match(new RegExp(`^${DATE_RE}(?:\\s*\\(([^)]*)\\))?\\s+(.+)$`, 'i'));
    if (!m) continue;
    const date = iso(m[1], m[2], m[3]);
    const what = m[5];
    if (/Pembukaan Masa Penawaran|Mulai Masa Penawaran/i.test(what)) open ??= date;
    if (/^Penutupan|Masa Penawaran Selesai|Penutupan Masa Penawaran/i.test(what)) {
      close ??= date;
      if (m[4] && /WIB/i.test(m[4])) closeTime ??= m[4].trim();
    }
  }
  if (!offer && open && close && open <= close) offer = { start: open, end: close };

  // "Setelmen/Penerbitan 5 Agustus 2026" (structure table) or "23 September 2026 Setelmen/Penerbitan" (timeline)
  let settlement: string | null = null;
  for (const l of lines) {
    const m = l.match(new RegExp(`^Setelmen\\s*/\\s*Penerbitan\\s+${DATE_RE}`, 'i')) ?? l.match(new RegExp(`^${DATE_RE}\\s+Setelmen\\s*/\\s*Penerbitan`, 'i'));
    if (m) {
      settlement = iso(m[1], m[2], m[3]);
      break;
    }
  }

  const minM =
    flat.match(/Minimum Pemesanan\s*Rp\s?([\d.,]+)\s*(juta|miliar)/i) ??
    flat.match(/(?:Minimal pembelian|Pemesanan mulai dari|mulai dari)\s*Rp\s?([\d.,]+)\s*(juta|miliar)/i);
  const minOrder = minM ? rupiah(minM[1], minM[2]) : null;
  const maxUnlimited = /Maksimum pemesanan tidak terbatas/i.test(flat);

  const floating = /floating with floor|mengambang/i.test(flat);
  const fixed = /kupon tetap|imbalan tetap|fixed rate/i.test(flat);
  const tradable = /tidak dapat diperdagangkan/i.test(flat) ? false : /dapat diperdagangkan/i.test(flat) ? true : null;
  const tenorText = flat.match(/Tenor\s+(\d{1,2})\s*tahun/i);
  const partners = partnerHosts(links);
  // A page with a single series may give "10 Oktober 2028 Jatuh tempo" without the code
  let soleMaturity: string | null = null;
  if (codes.length === 1) {
    for (const l of lines) {
      const m = l.match(new RegExp(`^${DATE_RE}\\s+Jatuh tempo$`, 'i'));
      if (m) soleMaturity = iso(m[1], m[2], m[3]);
    }
  }

  return codes.map((code) => {
    const t = code.match(/T(\d{1,2})$/);
    return {
      code,
      type: def.type,
      sharia: def.sharia,
      couponPct: couponFor(code, lines, flat),
      couponType: floating ? 'floatingFloor' : fixed ? 'fixed' : null,
      tenorYears: t ? Number(t[1]) : tenorText ? Number(tenorText[1]) : null,
      maturity: maturityFor(code, flat) ?? soleMaturity,
      offerStart: offer?.start ?? null,
      offerEnd: offer?.end ?? null,
      closeTime,
      settlement,
      minOrder,
      maxOrder: maxUnlimited ? null : maxFor(code, flat),
      maxUnlimited,
      tradable,
      earlyRedemption: /early redemption/i.test(flat),
      url: `${DJPPR_SITE}/${def.slug}`,
      partners,
    };
  });
}

export type SbnStatus = 'open' | 'upcoming' | 'closed' | 'unknown';

/** Offering status on a WIB date (YYYY-MM-DD). */
export function sbnStatus(s: Pick<SbnSeries, 'offerStart' | 'offerEnd'>, wibToday: string): SbnStatus {
  if (!s.offerStart || !s.offerEnd) return 'unknown';
  if (wibToday < s.offerStart) return 'upcoming';
  if (wibToday > s.offerEnd) return 'closed';
  return 'open';
}

/** Merges freshly read series into the saved history (newest reading of a code wins). */
export function mergeSbnHistory(saved: SbnSeries[], fresh: SbnSeries[]): SbnSeries[] {
  const map = new Map<string, SbnSeries>();
  for (const s of saved) if (s && typeof s.code === 'string') map.set(s.code, s);
  for (const s of fresh) map.set(s.code, { ...map.get(s.code), ...s });
  return [...map.values()].sort((a, b) => (b.offerStart ?? '').localeCompare(a.offerStart ?? '') || a.code.localeCompare(b.code));
}
