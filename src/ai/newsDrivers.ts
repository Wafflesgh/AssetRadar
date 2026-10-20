/**
 * newsDrivers.ts — Turns headlines into fundamental "drivers": each headline is classified
 * into an event category (earnings, central bank, macro data, regulation, fund flows,
 * corporate action, supply, geopolitics, analyst rating, legal/security) with a direction
 * for this asset, and weighted by category importance, source reliability and recency
 * (12-hour half-life). Headlines that only *report* a price move ("BTC jumps 3%") are kept
 * but get a low weight: they describe the move rather than explain it, and media tone
 * mostly reflects past returns (Tetlock 2007). English and Indonesian headlines are handled.
 */
import type { AssetGroup, MarketNewsItem } from '../config/assets.ts';
import { classifyHeadlineSentiment } from '../utils/sentiment.ts';

export type DriverCategory =
  | 'earnings'
  | 'monetary'
  | 'macro'
  | 'regulation'
  | 'flows'
  | 'corporate'
  | 'supply'
  | 'geopolitics'
  | 'analyst'
  | 'legal'
  | 'price';

export const DRIVER_LABELS: Record<DriverCategory, string> = {
  earnings: 'Earnings & guidance',
  monetary: 'Central bank & rates',
  macro: 'Macro data',
  regulation: 'Regulation & policy',
  flows: 'Fund flows & demand',
  corporate: 'Corporate action',
  supply: 'Supply & production',
  geopolitics: 'Geopolitics',
  analyst: 'Analyst rating',
  legal: 'Legal & security',
  price: 'Price report only',
};

interface CategoryRule {
  id: DriverCategory;
  weight: number;
  match: RegExp;
  up?: RegExp;
  down?: RegExp;
}

const w = (words: string) => new RegExp(`\\b(?:${words})\\b`, 'i');

// Order matters: the first matching category wins.
const RULES: CategoryRule[] = [
  {
    id: 'monetary',
    weight: 1.2,
    match: w('fed|fomc|powell|federal reserve|central bank|rate cut|rate hike|interest rates?|bank indonesia|bi rate|suku bunga|ecb|boj|bank of japan|bank of england|yields?|treasury yields?|the fed'),
    up: w('cut|cuts|dovish|easing|pangkas|memangkas|pemangkasan|turunkan|menurunkan|penurunan suku bunga|pause|stimulus'),
    down: w('hike|hikes|hawkish|tightening|naikkan|menaikkan|kenaikan suku bunga|higher for longer'),
  },
  {
    id: 'earnings',
    weight: 1.3,
    match: w('earnings|profit|revenue|results|quarterly|guidance|outlook|eps|laba|pendapatan|kinerja|laporan keuangan|dividend|dividen|buyback'),
    up: w('beat|beats|tops|raises|raised|record|surge|jump|growth|naik|tumbuh|melonjak|dividend|dividen|buyback|upbeat|strong'),
    down: w('miss|misses|cuts|cut|lowers|warns|warning|decline|drop|turun|anjlok|rugi|loss|weak|disappoint'),
  },
  {
    id: 'macro',
    weight: 1,
    match: w('inflation|cpi|ppi|gdp|jobs|payrolls|unemployment|pmi|retail sales|recession|inflasi|pertumbuhan ekonomi|neraca perdagangan|trade balance|consumer confidence'),
    up: w('cools|cooling|eases|easing|beats|strong|surplus|expands|growth|melambat'),
    down: w('hot|hotter|accelerates|misses|weak|contraction|shrinks|recession|resesi|deficit|defisit'),
  },
  {
    id: 'regulation',
    weight: 1.1,
    match: w('sec|regulation|regulator|approval|approves|approved|ban|bans|tariff|tariffs|tax|ojk|bappebti|policy|law|bill|etf approval|sanction|sanctions|aturan|regulasi|larangan|pajak'),
    up: w('approves|approved|approval|eases|clarity|lifts|lifted|relief|exempt'),
    down: w('ban|bans|crackdown|rejects|rejected|tariff|tariffs|sanction|sanctions|probe|restricts|larangan'),
  },
  {
    id: 'flows',
    weight: 1,
    match: w('etf|inflows?|outflows?|whales?|institutional|accumulation|demand|foreign investors?|asing|net buy|net sell|akumulasi|treasury|reserves|holdings'),
    up: w('inflow|inflows|buy|buys|bought|accumulation|accumulate|demand|net buy|akumulasi|adds'),
    down: w('outflow|outflows|sell|sells|sold|dump|dumps|net sell|distribution|lepas'),
  },
  {
    id: 'supply',
    weight: 1,
    match: w('opec|output|production|supply|inventory|inventories|stockpile|mine|mining|harvest|drought|halving|shortage|produksi|pasokan|stok'),
    // For commodities, less supply = higher price
    up: w('cut|cuts|shortage|drought|disruption|draw|falls|deficit|halving|outage'),
    down: w('boost|boosts|increase|increases|surplus|glut|build|rises|record output'),
  },
  {
    id: 'corporate',
    weight: 0.9,
    match: w('acquisition|acquire|acquires|merger|deal|partnership|ipo|rights issue|stock split|layoffs|ceo|contract|ekspansi|akuisisi|merger|kontrak|investasi'),
    up: w('acquires|deal|partnership|wins|contract|expansion|ekspansi|launch|launches'),
    down: w('layoffs|resigns|steps down|delay|delays|cancel|cancels|dilution|rights issue'),
  },
  {
    id: 'geopolitics',
    weight: 1,
    match: w('war|attack|missile|invasion|conflict|military|strike|ceasefire|truce|peace talks|perang|serangan|konflik|gencatan senjata'),
    up: w('ceasefire|truce|peace|deal|de-escalation|gencatan senjata|damai'),
    down: w('war|attack|missile|invasion|escalation|strike|perang|serangan'),
  },
  {
    id: 'analyst',
    weight: 0.8,
    match: w('upgrade|upgrades|downgrade|downgrades|price target|target price|rating|overweight|underweight|outperform|underperform|rekomendasi'),
    up: w('upgrade|upgrades|raises|overweight|outperform|buy'),
    down: w('downgrade|downgrades|cuts|lowers|underweight|underperform|sell'),
  },
  {
    id: 'legal',
    weight: 0.9,
    match: w('hack|hacked|exploit|lawsuit|sued|fraud|investigation|probe|bankruptcy|default|gugatan|penipuan|pailit|gagal bayar'),
    down: w('hack|hacked|exploit|lawsuit|sued|fraud|investigation|probe|bankruptcy|default|gugatan|penipuan|pailit|gagal bayar'),
    up: w('settles|settlement|dismissed|cleared|wins'),
  },
];

const PRICE_REPORT = w(
  'rises|rose|falls|fell|jumps|jumped|slips|slipped|gains|gained|drops|dropped|climbs|climbed|surges|surged|plunges|plunged|rallies|rallied|tumbles|tumbled|edges|hits|naik|turun|menguat|melemah|anjlok|melonjak|ditutup|dibuka|closes|opens|trades'
);

/** Reliable newswires and financial outlets get full weight; unknown blogs 0.6. */
const TIER1 = /reuters|bloomberg|cnbc|financial times|ft\.com|wall street journal|wsj|associated press|ap news|nikkei|kontan|bisnis|antara|kompas|tempo|katadata|investing\.com|marketwatch|barron|coindesk|the block|cointelegraph|fxstreet|yahoo finance|bbc|al jazeera|idx channel|detik/i;

/** Source reliability weight: reliable newswires and outlets 1, others 0.6. */
export function sourceWeight(source: string, link: string): number {
  return TIER1.test(`${source} ${link}`) ? 1 : 0.6;
}

export interface NewsDriver {
  title: string;
  link: string;
  source: string;
  publishedAtMs?: number;
  category: DriverCategory;
  direction: -1 | 0 | 1;
  /** Final weight (category × source × recency). */
  weight: number;
  /** Why it got this direction, e.g. "rate cut (easing)". */
  reason: string;
}

export interface NewsDriverReport {
  drivers: NewsDriver[];
  /** Weighted net direction of the news flow, −1 … +1. */
  netTone: number;
  /** 0–1: how much weight of evidence there is (more fresh, reliable event news → higher). */
  confidence: number;
  byCategory: Array<{ category: DriverCategory; label: string; net: number; count: number }>;
  priceReportCount: number;
}

function bank(title: string): 'fed' | 'bi' | 'other' {
  if (/\b(fed|fomc|powell|federal reserve|the fed)\b/i.test(title)) return 'fed';
  if (/\b(bank indonesia|bi rate|bi)\b/i.test(title)) return 'bi';
  return 'other';
}

/**
 * Direction of an easing/tightening headline for this asset: easing helps risk assets and
 * gold; for X/IDR pairs a Fed cut weakens the dollar (USD/IDR down) while a Bank Indonesia
 * cut weakens the Rupiah (pairs up).
 */
function monetaryDirection(easing: boolean, title: string, group: AssetGroup, symbol: string): -1 | 0 | 1 {
  const base: -1 | 1 = easing ? 1 : -1;
  if (group !== 'forex') return base;
  const b = bank(title);
  if (b === 'bi') return base;
  if (b === 'fed' && symbol.startsWith('USD')) return easing ? -1 : 1;
  return 0;
}

export function classifyDriver(
  item: Pick<MarketNewsItem, 'title' | 'source'>,
  group: AssetGroup,
  symbol: string
): { category: DriverCategory; direction: -1 | 0 | 1; reason: string; baseWeight: number } {
  const title = item.title;
  for (const rule of RULES) {
    if (!rule.match.test(title)) continue;
    const upHit = rule.up?.exec(title)?.[0];
    const downHit = rule.down?.exec(title)?.[0];
    let direction: -1 | 0 | 1 = 0;
    let reason = '';
    if (rule.id === 'monetary' && (upHit || downHit)) {
      const easing = Boolean(upHit) && !downHit;
      direction = upHit && downHit ? 0 : monetaryDirection(easing, title, group, symbol);
      reason = `${(upHit ?? downHit ?? '').toLowerCase()} (${easing ? 'easing' : 'tightening'})`;
    } else if (rule.id === 'supply' && group !== 'commodity') {
      const tone = classifyHeadlineSentiment(title);
      direction = tone === 'Bullish' ? 1 : tone === 'Bearish' ? -1 : 0;
      reason = 'supply news, tone of headline';
    } else if (upHit && !downHit) {
      direction = 1;
      reason = `"${upHit.toLowerCase()}"`;
    } else if (downHit && !upHit) {
      direction = -1;
      reason = `"${downHit.toLowerCase()}"`;
    } else {
      const tone = classifyHeadlineSentiment(title);
      direction = tone === 'Bullish' ? 1 : tone === 'Bearish' ? -1 : 0;
      reason = direction === 0 ? 'no clear direction' : 'tone of headline';
    }
    // Geopolitical stress tends to lift gold and the dollar while hurting risk assets
    if (rule.id === 'geopolitics' && direction !== 0 && (symbol === 'XAU/USD' || symbol === 'USD/IDR' || symbol === 'DX-Y.NYB')) {
      direction = (direction * -1) as -1 | 1;
      reason += ' (safe-haven asset)';
    }
    // Company news (earnings, deals, ratings) about other firms says little about a coin, a
    // commodity or a currency
    const companyNews = rule.id === 'earnings' || rule.id === 'corporate' || rule.id === 'analyst';
    const isStockLike = group === 'idStock' || group === 'usStock' || group === 'globalStock' || group === 'index';
    return { category: rule.id, direction, reason, baseWeight: companyNews && !isStockLike ? rule.weight * 0.4 : rule.weight };
  }
  const tone = classifyHeadlineSentiment(title);
  const direction: -1 | 0 | 1 = tone === 'Bullish' ? 1 : tone === 'Bearish' ? -1 : 0;
  return {
    category: 'price',
    direction,
    reason: PRICE_REPORT.test(title) ? 'describes a price move, not its cause' : 'general headline',
    baseWeight: 0.25,
  };
}

export function analyzeNewsDrivers(
  news: Array<Pick<MarketNewsItem, 'title' | 'link' | 'source' | 'publishedAtMs'>>,
  group: AssetGroup,
  symbol: string,
  now: number = Date.now()
): NewsDriverReport {
  const seen = new Set<string>();
  const drivers: NewsDriver[] = [];
  for (const item of news) {
    const key = item.title.toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    const c = classifyDriver(item, group, symbol);
    const ageH = item.publishedAtMs ? Math.max(0, (now - item.publishedAtMs) / 3_600_000) : 24;
    const recency = Math.pow(0.5, ageH / 12);
    const source = sourceWeight(item.source, item.link);
    drivers.push({
      title: item.title,
      link: item.link,
      source: item.source,
      publishedAtMs: item.publishedAtMs,
      category: c.category,
      direction: c.direction,
      weight: c.baseWeight * source * recency,
      reason: c.reason,
    });
  }
  drivers.sort((a, b) => Math.abs(b.direction) * b.weight - Math.abs(a.direction) * a.weight || b.weight - a.weight);
  const totalW = drivers.reduce((a, d) => a + d.weight, 0);
  const net = totalW > 0 ? drivers.reduce((a, d) => a + d.direction * d.weight, 0) / totalW : 0;
  const cats = new Map<DriverCategory, { net: number; count: number }>();
  for (const d of drivers) {
    if (d.category === 'price') continue;
    const c = cats.get(d.category) ?? { net: 0, count: 0 };
    c.net += d.direction * d.weight;
    c.count += 1;
    cats.set(d.category, c);
  }
  return {
    drivers,
    netTone: net,
    confidence: 1 - Math.exp(-totalW / 1.5),
    byCategory: [...cats.entries()]
      .map(([category, v]) => ({ category, label: DRIVER_LABELS[category], net: v.net, count: v.count }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
    priceReportCount: drivers.filter((d) => d.category === 'price').length,
  };
}
