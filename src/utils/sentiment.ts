import type { MarketNewsItem, SentimentLabel } from '../config/assets.ts';

const POSITIVE_KEYWORDS = [
  'naik',
  'menguat',
  'rekor',
  'bullish',
  'melonjak',
  'positif',
  'untung',
  'tumbuh',
  'optimis',
  'surplus',
  'reli',
  'hijau',
  'cuan',
  'bangkit',
  'terbang',
  'akumulasi',
  'inflow',
  'surge',
  'rally',
  'gain',
  'soar',
  'adoption',
  'upgrade',
];

const NEGATIVE_KEYWORDS = [
  'turun',
  'melemah',
  'anjlok',
  'bearish',
  'koreksi',
  'merah',
  'rugi',
  'tekanan',
  'resesi',
  'defisit',
  'jatuh',
  'longsor',
  'waspada',
  'outflow',
  'drop',
  'fall',
  'crash',
  'plunge',
  'dip',
  'selloff',
  'fear',
];

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const POSITIVE_REGEXES = POSITIVE_KEYWORDS.map(
  (word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i')
);

const NEGATIVE_REGEXES = NEGATIVE_KEYWORDS.map(
  (word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i')
);

export function classifyHeadlineSentiment(title: string): SentimentLabel {
  let pos = 0;
  let neg = 0;

  for (const regex of POSITIVE_REGEXES) {
    if (regex.test(title)) pos += 1;
  }
  for (const regex of NEGATIVE_REGEXES) {
    if (regex.test(title)) neg += 1;
  }

  if (pos > neg) return 'Bullish';
  if (neg > pos) return 'Bearish';
  return 'Netral';
}

export interface ComputedSentiment {
  score: number; // 0 to 100
  label: SentimentLabel;
  summary: string;
  keyFactors: string[];
}

export function computeMarketSentiment(params: {
  assetName: string;
  symbol: string;
  changePct24h?: number;
  price?: number;
  high24h?: number;
  low24h?: number;
  news: MarketNewsItem[];
}): ComputedSentiment {
  const { assetName, symbol, changePct24h = 0, price, high24h, low24h, news } = params;

  // 1. Price momentum component (-25 to +25 around 50)
  const clampedChange = Math.max(-8, Math.min(8, changePct24h));
  const priceMomentumDelta = (clampedChange / 8) * 25;

  // 2. Intraday range position (-10 to +10)
  let rangeDelta = 0;
  if (
    price !== undefined &&
    high24h !== undefined &&
    low24h !== undefined &&
    high24h > low24h
  ) {
    const ratio = (price - low24h) / (high24h - low24h); // 0..1
    rangeDelta = (ratio - 0.5) * 20;
  }

  // 3. News headline sentiment component (-15 to +15)
  let newsDelta = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  if (news.length > 0) {
    for (const item of news) {
      if (item.sentiment === 'Bullish') bullishCount++;
      if (item.sentiment === 'Bearish') bearishCount++;
    }
    const netRatio = (bullishCount - bearishCount) / news.length;
    newsDelta = netRatio * 15;
  }

  const rawScore = Math.round(50 + priceMomentumDelta + rangeDelta + newsDelta);
  const score = Math.max(8, Math.min(95, rawScore));

  let label: SentimentLabel = 'Netral';
  if (score >= 58) label = 'Bullish';
  else if (score <= 42) label = 'Bearish';

  const directionWord =
    changePct24h > 0.15
      ? `menguat +${changePct24h.toFixed(2).replace('.', ',')}%`
      : changePct24h < -0.15
        ? `terkoreksi ${changePct24h.toFixed(2).replace('.', ',')}%`
        : 'bergerak stabil/konsolidasi';

  const summary =
    label === 'Bullish'
      ? `Sentimen pasar untuk ${assetName} (${symbol}) cenderung optimis (Bullish, skor ${score}/100). Pergerakan harga 24 jam terakhir ${directionWord} didukung nada pemberitaan yang mayoritas konstruktif.`
      : label === 'Bearish'
        ? `Sentimen pasar untuk ${assetName} (${symbol}) berada di zona waspada (Bearish, skor ${score}/100). Harga ${directionWord} dalam 24 jam terakhir seiring pelaku pasar mencermati tekanan jangka pendek.`
        : `Sentimen pasar untuk ${assetName} (${symbol}) berada di fase seimbang/konsolidasi (Netral, skor ${score}/100). Pergerakan harga ${directionWord} dengan keseimbangan antara katalis positif dan kehati-hatian pasar.`;

  const keyFactors: string[] = [
    `Momentum harga 24 jam: ${directionWord}.`,
  ];

  if (high24h && low24h && price && high24h > low24h) {
    const posPct = Math.round(((price - low24h) / (high24h - low24h)) * 100);
    keyFactors.push(
      `Posisi harga berada di ${posPct}% dari rentang perdagangan 24 jam terakhir.`
    );
  }

  if (news.length > 0) {
    keyFactors.push(
      `Sorotan media terkini: ${bullishCount} berita bernada positif, ${bearishCount} bernada waspada, dan ${news.length - bullishCount - bearishCount} netral.`
    );
  }

  return {
    score,
    label,
    summary,
    keyFactors,
  };
}

/**
 * Parses Google News / Yahoo RSS XML string into clean MarketNewsItem entries.
 */
export function parseRssItems(xml: string, maxItems: number = 6): MarketNewsItem[] {
  const items: MarketNewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1];
    const rawTitle = extractXmlTag(block, 'title');
    const link = extractXmlTag(block, 'link');
    const pubDate = extractXmlTag(block, 'pubDate');
    const sourceTag = extractXmlTag(block, 'source');

    if (!rawTitle || !link) continue;

    // Clean "- Source Name" suffix from Google News titles if present
    let cleanTitle = decodeHtmlEntities(rawTitle).trim();
    let source = decodeHtmlEntities(sourceTag || 'Berita Pasar').trim();

    const dashIdx = cleanTitle.lastIndexOf(' - ');
    if (dashIdx > 20) {
      if (!sourceTag) {
        source = cleanTitle.slice(dashIdx + 3).trim();
      }
      cleanTitle = cleanTitle.slice(0, dashIdx).trim();
    }

    items.push({
      id: `${items.length}-${pubDate || cleanTitle.slice(0, 16)}`,
      title: cleanTitle,
      link: link.trim(),
      source,
      publishedAt: pubDate ? formatRssDateId(pubDate) : 'Terkini',
      publishedAtMs: pubDate && !Number.isNaN(Date.parse(pubDate)) ? Date.parse(pubDate) : undefined,
      sentiment: classifyHeadlineSentiment(cleanTitle),
    });
  }

  return items;
}

function extractXmlTag(block: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = regex.exec(block);
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim();
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'");
}

function formatRssDateId(dateStr: string): string {
  const parsed = Date.parse(dateStr);
  if (Number.isNaN(parsed)) return dateStr;
  return (
    new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(new Date(parsed)) + ' WIB'
  );
}
