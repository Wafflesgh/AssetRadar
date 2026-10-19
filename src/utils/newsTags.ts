/**
 * newsTags.ts — Pure helpers for the live news hub: tags headlines with the asset codes
 * they mention (English + Indonesian keywords, plus a MACRO tag for market-wide drivers such
 * as central-bank decisions), detects war/attack headlines (GEO alerts: "high" = a new war or
 * major escalation, "elevated" = strikes by major actors), and merges newly fetched items into
 * the existing list while reporting which ones are new.
 */
import type { MarketNewsItem } from '../config/assets.ts';

/** Tag for market-wide news (rates, inflation, central banks) that moves every asset. */
export const MACRO_TAG = 'MACRO';

// Whole-word patterns per asset code (tags match AssetConfig.code).
const ASSET_PATTERNS: Array<{ tag: string; pattern: RegExp }> = [
  { tag: 'BTC', pattern: /\b(bitcoin|btc)\b/i },
  { tag: 'ETH', pattern: /\b(ethereum|ether|eth)\b/i },
  { tag: 'SOL', pattern: /\b(solana|sol)\b/i },
  {
    tag: 'JCI',
    pattern: /\b(ihsg|jci|jakarta composite|bursa efek indonesia|bei|idx composite|saham ri)\b/i,
  },
  { tag: 'GOLD', pattern: /\b(gold|emas|xau|xau\/usd|xauusd|logam mulia|bullion)\b/i },
  { tag: 'USD', pattern: /\b(rupiah|usd\/idr|usdidr|kurs dolar|dolar as)\b/i },
  { tag: 'SPX', pattern: /(^|\W)(s&p 500|s&p500|s&p|sp500)(\W|$)|\bwall street\b/i },
  { tag: 'NDX', pattern: /\b(nasdaq)\b/i },
  { tag: 'DJI', pattern: /\b(dow jones|the dow|dow industrials)\b/i },
  { tag: 'N225', pattern: /\b(nikkei|topix|tokyo stocks|japanese stocks)\b/i },
  { tag: 'FTSE', pattern: /\b(ftse|london stocks|uk stocks)\b/i },
  { tag: 'DAX', pattern: /\b(dax|german stocks|frankfurt stocks)\b/i },
  { tag: 'HSI', pattern: /\b(hang seng|hong kong stocks)\b/i },
  { tag: 'STI', pattern: /\b(straits times index|singapore stocks)\b/i },
  { tag: 'DXY', pattern: /\b(dollar index|dxy|greenback)\b/i },
  { tag: 'EUR', pattern: /\b(euro|eur\/usd|eurusd|eur\/idr|ecb)\b/i },
  { tag: 'SGD', pattern: /\b(singapore dollar|sgd)\b/i },
  { tag: 'JPY', pattern: /\b(yen|jpy|usd\/jpy|usdjpy|boj|bank of japan)\b/i },
  { tag: 'GBP', pattern: /\b(sterling|pound sterling|gbp|gbp\/usd|bank of england|boe)\b/i },
  { tag: 'CNY', pattern: /\b(yuan|renminbi|cny|pboc)\b/i },
  { tag: 'AUD', pattern: /\b(aussie dollar|australian dollar|aud|aud\/usd|rba)\b/i },
];

const MACRO_PATTERN =
  /\b(fed|fomc|federal reserve|powell|interest rates?|rate (hike|cut)s?|inflation|inflasi|cpi|nonfarm|payrolls|suku bunga|bi rate|bank indonesia|the fed|treasury yields?|recession|resesi|tariffs?|tarif|ecb|boj|bank of japan|bank of england|boe|central banks?|bank sentral)\b/i;

/** Returns the asset codes (and MACRO) a headline is about; empty when unrelated. */
export function tagHeadline(title: string): string[] {
  const tags = ASSET_PATTERNS.filter((a) => a.pattern.test(title)).map((a) => a.tag);
  if (MACRO_PATTERN.test(title)) tags.push(MACRO_TAG);
  return tags;
}

/** Tag for geopolitical / conflict headlines. */
export const GEO_TAG = 'GEO';

export type GeoAlertLevel = 'high' | 'elevated';

// Figurative uses that must never raise an alert ("trade war", "perang harga", "heart attack"...)
const GEO_EXCLUDE =
  /\b(trade|price|currency|tariff|chip|tech|culture|bidding|talent|streaming|console|format) wars?\b|\bstar wars\b|\bwar chest\b|\bwar room\b|\b(heart|panic|asthma|shark|dog|cyber|ransomware|phishing|51%) attacks?\b|\bperang (dagang|harga|tarif|dingin|chip|bintang)\b|\bserangan (jantung|siber|panik|politik|balik harga)\b|\bbom waktu\b|\bledakan (harga|permintaan|kasus|penjualan|penonton)\b|\b(love|film|movie|episode|season|sinopsis|trailer|album|song|game)\b/i;

// A NEW war or major escalation: these trigger the big alert banner
const GEO_HIGH =
  /\b(declares? war|declaration of war|war (breaks|broke) out|outbreak of war|(enters|entered|joins|joined) the war|full[- ]scale (war|invasion)|launch(es|ed)? (an? )?(invasion|ground offensive|war)|invad(e|es|ed|ing)|invasion of|nuclear (strike|attack|detonation)|detonates? (a )?nuclear|martial law|military coup|coup attempt|act of war|menyatakan perang|deklarasi perang|perang (pecah|meletus|dimulai)|(ikut|masuk|memasuki) perang|melancarkan (invasi|serangan besar)|invasi|serangan nuklir|darurat militer|kudeta)\b/i;

// Strikes involving major actors: tagged GEO and marked "elevated", but no banner
const GEO_STRIKE =
  /\b(missile|missiles|ballistic|air ?strikes?|drone (attack|strike)s?|bombing|bombard\w*|shelling|military strike|rudal|serangan (udara|militer|rudal|drone)|pengeboman|dibom)\b/i;
const GEO_ACTORS =
  /\b(iran|israel|us|u\.s\.|united states|america|amerika|russia|rusia|ukraine|ukraina|china|tiongkok|taiwan|nato|north korea|korea utara|saudi|houthi|hezbollah|gaza|lebanon|pakistan|india|kyiv|moscow|tehran|beijing)\b/i;

// Questions and speculation ("Why is X preparing for an invasion?") are analysis, not events
const SPECULATIVE =
  /\?\s*$|^\s*(why|what if|could|will|can|is|are|should|how|mengapa|kenapa|apakah|akankah|bisakah|bagaimana)\b|\b(may|might|could|threatens? to|warns? of|fears? of|risk of|bisa|berpotensi|ancam|khawatir)\b/i;

/** Detects war / attack headlines that can move markets suddenly. */
export function detectGeoAlert(title: string): GeoAlertLevel | null {
  if (GEO_EXCLUDE.test(title)) return null;
  if (GEO_HIGH.test(title)) return SPECULATIVE.test(title) ? 'elevated' : 'high';
  if (GEO_STRIKE.test(title) && GEO_ACTORS.test(title)) return 'elevated';
  return null;
}

export interface ActiveGeoAlert {
  lead: MarketNewsItem;
  /** Other high-alert reports in the window (corroboration), newest first. */
  related: MarketNewsItem[];
  sources: string[];
}

/** How long a "high" geo alert stays on screen after the latest report. */
export const GEO_ALERT_WINDOW_MS = 3 * 3600_000;

/**
 * Picks the alert to show in the banner: the newest "high" geo headline published in the
 * last 3 hours that the viewer has not dismissed, with the other recent high reports.
 */
export function selectGeoAlert(
  items: MarketNewsItem[],
  nowMs: number,
  dismissedIds: ReadonlySet<string> = new Set()
): ActiveGeoAlert | null {
  const recent = items
    .filter((i) => i.geoAlert === 'high' && nowMs - (i.publishedAtMs ?? 0) <= GEO_ALERT_WINDOW_MS)
    .sort((a, b) => (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0));
  const visible = recent.filter((i) => !dismissedIds.has(i.id));
  if (visible.length === 0) return null;
  const [lead, ...rest] = visible;
  return {
    lead,
    related: rest,
    sources: [...new Set(visible.map((i) => i.source))],
  };
}

/** Key used to de-duplicate the same story arriving from different feeds. */
export function newsKey(item: Pick<MarketNewsItem, 'title'>): string {
  return item.title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export interface MergeResult {
  items: MarketNewsItem[];
  added: MarketNewsItem[];
}

/**
 * Merges incoming items into the current list (newest first). Duplicates (same title) are
 * combined so their asset tags are unioned. Items older than maxAgeMs are dropped and the
 * list is capped at maxItems. `firstSeenAt` records when the hub first saw each story.
 */
export function mergeNewsItems(
  current: MarketNewsItem[],
  incoming: MarketNewsItem[],
  nowMs: number,
  opts: { maxAgeMs?: number; maxItems?: number } = {}
): MergeResult {
  const { maxAgeMs = 48 * 3600_000, maxItems = 300 } = opts;
  const byKey = new Map<string, MarketNewsItem>();
  for (const item of current) byKey.set(newsKey(item), item);

  const added: MarketNewsItem[] = [];
  for (const raw of incoming) {
    const key = newsKey(raw);
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) {
      const tags = [...new Set([...(existing.assetTags ?? []), ...(raw.assetTags ?? [])])];
      if (tags.length !== (existing.assetTags ?? []).length) {
        byKey.set(key, { ...existing, assetTags: tags });
      }
      continue;
    }
    // Feeds sometimes report times slightly in the future; never show "in N minutes"
    const publishedAtMs = Math.min(raw.publishedAtMs ?? nowMs, nowMs);
    const item: MarketNewsItem = { ...raw, publishedAtMs, firstSeenAt: nowMs };
    byKey.set(key, item);
    added.push(item);
  }

  const items = [...byKey.values()]
    .filter((item) => nowMs - (item.publishedAtMs ?? nowMs) <= maxAgeMs)
    .sort((a, b) => (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0))
    .slice(0, maxItems);
  const kept = new Set(items.map((i) => i.id));
  return { items, added: added.filter((a) => kept.has(a.id)) };
}
