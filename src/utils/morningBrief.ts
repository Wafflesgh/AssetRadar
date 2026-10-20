/**
 * morningBrief.ts — Builds the daily morning brief (ready ±07:30 WIB) from data the app already
 * has: Wall Street and Asian closes, the IHSG, biggest movers, Rupiah rates and gold, today's
 * corporate events (watchlist/portfolio first), the latest macro releases, the 5 most important
 * headlines and the AI forward-test status. Rule-based wording (Gemini may polish it on the
 * server); also the plain-text version for Telegram and the WIB schedule. A summary of the market
 * mood, not a buy/sell signal.
 */
import type { AssetGroup, MarketNewsItem } from '../config/assets.ts';
import type { CalendarEvent } from './corporateCalendar.ts';
import { classifyDriver } from '../ai/newsDrivers.ts';

export const BRIEF_TIME = '07:30';
export const BRIEF_DISCLAIMER = 'A summary of the market mood from public data — not investment advice or a buy/sell signal.';

export interface BriefQuote {
  code: string;
  name: string;
  group: AssetGroup;
  price: number;
  /** Percent change of the last session / 24 h. */
  changePct: number | null;
  /** Formatted price, e.g. "Rp16,250" or "5,800.12". */
  display: string;
}

export interface BriefInput {
  date: string;
  generatedAt: number;
  wallStreet: BriefQuote[];
  asia: BriefQuote[];
  ihsg: BriefQuote | null;
  /** All assets with a 24 h change, for the movers. */
  movers: BriefQuote[];
  rates: BriefQuote[];
  gold: BriefQuote | null;
  /** Corporate events dated today. */
  events: CalendarEvent[];
  /** Watchlist + portfolio symbols (listed first). */
  priority: string[];
  codeOf: (symbol: string) => string;
  macro: Array<{ label: string; value: string; date: string }>;
  news: MarketNewsItem[];
  forward: { saved: number; evaluated: number; lastRunDate: string | null } | null;
}

export interface BriefSection {
  id: 'overview' | 'global' | 'ihsg' | 'movers' | 'fx' | 'calendar' | 'macro' | 'news' | 'forward';
  title: string;
  lines: string[];
}

export interface MorningBrief {
  date: string;
  generatedAt: number;
  headline: string;
  sections: BriefSection[];
  news: Array<{ title: string; link: string; source: string; tags: string[] }>;
  /** True when Gemini rewrote the overview. */
  aiPolished: boolean;
  disclaimer: string;
}

const signed = (v: number | null) => (v === null || !Number.isFinite(v) ? 'n/a' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`);

function quoteLine(q: BriefQuote): string {
  return `${q.name} ${q.display} (${signed(q.changePct)})`;
}

function avg(list: BriefQuote[]): number | null {
  const v = list.map((q) => q.changePct).filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function tone(change: number | null): string {
  if (change === null) return 'mixed';
  if (change > 0.75) return 'strongly higher';
  if (change > 0.15) return 'higher';
  if (change < -0.75) return 'sharply lower';
  if (change < -0.15) return 'lower';
  return 'little changed';
}

/** Title words used to drop near-duplicate headlines (same story from several outlets). */
function storyKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s[-–|]\s[^-–|]+$/, '')
    .replace(/[^a-z0-9 ]/g, '')
    .split(' ')
    .filter((w) => w.length > 3)
    .slice(0, 6)
    .join(' ');
}

/**
 * The most important recent headlines: high geopolitical alerts first, then by event weight
 * (monetary policy, earnings, macro… over plain price reports), market-wide tags and recency.
 */
export function pickTopNews(items: MarketNewsItem[], now: number, n = 5, maxAgeH = 18): MarketNewsItem[] {
  const seen = new Set<string>();
  return items
    .filter((i) => now - (i.publishedAtMs ?? 0) <= maxAgeH * 3600_000)
    .map((i) => {
      const w = classifyDriver(i, 'index', '^JKSE').baseWeight;
      const tags = i.assetTags ?? [];
      const ageH = (now - (i.publishedAtMs ?? now)) / 3600_000;
      const score = (i.geoAlert === 'high' ? 5 : i.geoAlert === 'elevated' ? 1 : 0) + w * 2 + (tags.includes('MACRO') ? 0.8 : 0) + Math.min(tags.length, 3) * 0.2 + Math.max(0, 1 - ageH / maxAgeH);
      return { i, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter(({ i }) => {
      const k = storyKey(i.title);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, n)
    .map(({ i }) => i);
}

/** Which brief to show: today's from 07:30 WIB, before that yesterday's. */
export function briefDateFor(nowMs: number): { date: string; ready: boolean } {
  const wib = new Date(nowMs + 7 * 3600_000);
  const today = wib.toISOString().slice(0, 10);
  const [h, m] = BRIEF_TIME.split(':').map(Number);
  const ready = wib.getUTCHours() * 60 + wib.getUTCMinutes() >= h * 60 + m;
  if (ready) return { date: today, ready: true };
  return { date: new Date(nowMs + 7 * 3600_000 - 86_400_000).toISOString().slice(0, 10), ready: false };
}

export function buildBrief(input: BriefInput): MorningBrief {
  const sections: BriefSection[] = [];
  const us = avg(input.wallStreet);
  const asia = avg(input.asia);
  const ihsgChg = input.ihsg?.changePct ?? null;

  const overview: string[] = [];
  if (input.wallStreet.length) overview.push(`Wall Street closed ${tone(us)}.`);
  if (input.asia.length) overview.push(`Asian markets are ${tone(asia)} so far.`);
  if (input.ihsg) overview.push(`The IHSG ended the last session ${tone(ihsgChg)} at ${input.ihsg.display} (${signed(ihsgChg)}).`);
  const usd = input.rates.find((q) => q.code === 'USD');
  if (usd) overview.push(`The dollar is at ${usd.display} (${signed(usd.changePct)}).`);
  const geo = input.news.find((n) => n.geoAlert === 'high');
  if (geo) overview.push('A geopolitical alert is active, which raises short-term risk.');
  sections.push({ id: 'overview', title: 'In short', lines: overview.length ? [overview.join(' ')] : ['Market data is unavailable right now.'] });

  if (input.wallStreet.length || input.asia.length) {
    sections.push({ id: 'global', title: 'Wall Street & Asia', lines: [...input.wallStreet, ...input.asia].map(quoteLine) });
  }
  if (input.ihsg) sections.push({ id: 'ihsg', title: 'IHSG (last session)', lines: [quoteLine(input.ihsg)] });

  const withChange = input.movers.filter((q) => q.changePct !== null && Number.isFinite(q.changePct));
  if (withChange.length) {
    const up = [...withChange].sort((a, b) => (b.changePct as number) - (a.changePct as number)).slice(0, 3);
    const down = [...withChange].sort((a, b) => (a.changePct as number) - (b.changePct as number)).slice(0, 3);
    sections.push({
      id: 'movers',
      title: 'Biggest movers (24 h)',
      lines: [`Up: ${up.map((q) => `${q.code} ${signed(q.changePct)}`).join(', ')}`, `Down: ${down.map((q) => `${q.code} ${signed(q.changePct)}`).join(', ')}`],
    });
  }
  const fx = [...input.rates, ...(input.gold ? [input.gold] : [])];
  if (fx.length) sections.push({ id: 'fx', title: 'Rupiah & gold', lines: fx.map(quoteLine) });

  const prio = new Set(input.priority);
  const events = [...input.events].sort((a, b) => Number(prio.has(b.symbol)) - Number(prio.has(a.symbol)) || a.symbol.localeCompare(b.symbol));
  const label: Record<string, string> = { earnings: 'earnings report', exDividend: 'ex-dividend', dividend: 'ex-dividend', dividendPayment: 'dividend payment', split: 'stock split' };
  sections.push({
    id: 'calendar',
    title: 'Corporate events today',
    lines: events.length
      ? events.slice(0, 12).map((e) => `${prio.has(e.symbol) ? '★ ' : ''}${input.codeOf(e.symbol)}: ${label[e.type] ?? e.type}${e.amount ? ` (${e.amount.toLocaleString('en-US')} per share)` : ''}${e.estimate ? ' (estimated)' : ''}`)
      : ['No published events for today.'],
  });
  if (input.macro.length) sections.push({ id: 'macro', title: 'Latest macro data (Indonesia)', lines: input.macro.map((m) => `${m.label}: ${m.value} (${m.date})`) });

  const top = pickTopNews(input.news, input.generatedAt);
  sections.push({ id: 'news', title: 'Top headlines', lines: top.length ? top.map((n) => `${n.title} — ${n.source}`) : ['No headlines available.'] });

  if (input.forward) {
    sections.push({
      id: 'forward',
      title: 'AI forward test',
      lines: [
        input.forward.saved
          ? `${input.forward.saved} verdicts saved since the start, ${input.forward.evaluated} already scored against real prices (last saved ${input.forward.lastRunDate ?? 'n/a'}).`
          : 'No server forward-test record yet.',
      ],
    });
  }

  const headline = input.ihsg
    ? `IHSG ${signed(ihsgChg)} · Wall Street ${tone(us)} · ${input.date}`
    : `Morning brief · ${input.date}`;
  return {
    date: input.date,
    generatedAt: input.generatedAt,
    headline,
    sections,
    news: top.map((n) => ({ title: n.title, link: n.link, source: n.source, tags: n.assetTags ?? [] })),
    aiPolished: false,
    disclaimer: BRIEF_DISCLAIMER,
  };
}

/** Plain text for Telegram (max 4096 characters per message). */
export function briefToText(brief: MorningBrief, appUrl?: string): string {
  const parts = [`AssetRadar morning brief — ${brief.date}`, ''];
  for (const s of brief.sections) {
    parts.push(s.title.toUpperCase());
    for (const l of s.lines) parts.push(`• ${l}`);
    parts.push('');
  }
  if (appUrl) parts.push(`${appUrl.replace(/\/+$/, '')}/#/brief`, '');
  parts.push(brief.disclaimer);
  const text = parts.join('\n');
  return text.length > 4000 ? `${text.slice(0, 3990)}…` : text;
}
