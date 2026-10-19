/**
 * sentiment.ts — Rule-based market sentiment: headline tone classification with whole-word
 * keyword matching (English and Indonesian), a 0–100 score combining price momentum, range
 * position and news tone, and a Google News RSS parser. This summarizes the news mood only;
 * it is not a buy/sell signal.
 */
import type { MarketNewsItem, SentimentLabel } from '../config/assets.ts';

// English and Indonesian keywords (headlines may come in either language).
// Matching is whole-word, so inflected forms are listed explicitly.
const POSITIVE_KEYWORDS = [
  // English
  'bullish',
  'surge',
  'surges',
  'surged',
  'rally',
  'rallies',
  'rallied',
  'gain',
  'gains',
  'gained',
  'soar',
  'soars',
  'soared',
  'jump',
  'jumps',
  'jumped',
  'climb',
  'climbs',
  'climbed',
  'rebound',
  'rebounds',
  'record',
  'upgrade',
  'adoption',
  'inflow',
  'inflows',
  'optimism',
  'optimistic',
  'strengthens',
  // Indonesian
  'naik',
  'menguat',
  'rekor',
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
  'akumulasi',
];

const NEGATIVE_KEYWORDS = [
  // English
  'bearish',
  'drop',
  'drops',
  'dropped',
  'fall',
  'falls',
  'fell',
  'crash',
  'crashes',
  'plunge',
  'plunges',
  'plunged',
  'slump',
  'slumps',
  'tumble',
  'tumbles',
  'tumbled',
  'decline',
  'declines',
  'sink',
  'sinks',
  'dip',
  'dips',
  'selloff',
  'sell-off',
  'loss',
  'losses',
  'weakens',
  'recession',
  'deficit',
  'outflow',
  'outflows',
  'fear',
  'fears',
  // Indonesian
  'turun',
  'melemah',
  'anjlok',
  'koreksi',
  'merah',
  'rugi',
  'tekanan',
  'resesi',
  'defisit',
  'jatuh',
  'longsor',
  'waspada',
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
  return 'Neutral';
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

  let label: SentimentLabel = 'Neutral';
  if (score >= 58) label = 'Bullish';
  else if (score <= 42) label = 'Bearish';

  const directionWord =
    changePct24h > 0.15
      ? `rose +${changePct24h.toFixed(2)}%`
      : changePct24h < -0.15
        ? `fell ${changePct24h.toFixed(2)}%`
        : 'moved sideways (consolidation)';

  const summary =
    label === 'Bullish'
      ? `Market sentiment for ${assetName} (${symbol}) leans optimistic (Bullish, score ${score}/100). Over the last 24 hours the price ${directionWord}, supported by mostly constructive news coverage.`
      : label === 'Bearish'
        ? `Market sentiment for ${assetName} (${symbol}) is in a cautious zone (Bearish, score ${score}/100). The price ${directionWord} over the last 24 hours as market participants weigh short-term pressure.`
        : `Market sentiment for ${assetName} (${symbol}) is balanced (Neutral, score ${score}/100). The price ${directionWord}, with positive catalysts offset by market caution.`;

  const keyFactors: string[] = [`24-hour price momentum: ${directionWord}.`];

  if (high24h && low24h && price && high24h > low24h) {
    const posPct = Math.round(((price - low24h) / (high24h - low24h)) * 100);
    keyFactors.push(`The price sits at ${posPct}% of its 24-hour trading range.`);
  }

  if (news.length > 0) {
    keyFactors.push(
      `Latest media coverage: ${bullishCount} positive, ${bearishCount} cautious, and ${news.length - bullishCount - bearishCount} neutral headlines.`
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
    let source = decodeHtmlEntities(sourceTag || 'Market News').trim();

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
      publishedAt: pubDate ? formatRssDate(pubDate) : 'Latest',
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

function formatRssDate(dateStr: string): string {
  const parsed = Date.parse(dateStr);
  if (Number.isNaN(parsed)) return dateStr;
  return (
    new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Jakarta',
    }).format(new Date(parsed)) + ' WIB'
  );
}
