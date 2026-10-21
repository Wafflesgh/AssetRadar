/**
 * newsStream.ts — Client-side live news store shared by every news panel. Opens one
 * Server-Sent Events connection to /api/market/news-stream while at least one component is
 * subscribed, merges breaking headlines as they arrive, remembers when each one arrived
 * (for "NEW" badges), and falls back to polling /api/market/news-feed every 60 s when the
 * stream is blocked or stalls (some proxies buffer SSE). Framework-free; see useLiveNews.
 */
import { SERVER_PUSH } from './serverMode.ts';
import type { MarketNewsItem } from '../config/assets.ts';
import { fetchNewsFeed } from './marketDataService.ts';

export type NewsStreamStatus = 'connecting' | 'live' | 'polling' | 'offline';

export interface NewsState {
  items: MarketNewsItem[];
  status: NewsStreamStatus;
  /** epoch ms of the last successful update (stream event or poll) */
  updatedAt: number;
  /** id → epoch ms when the headline arrived in this browser as breaking news */
  arrivedAt: Record<string, number>;
}

const STREAM_URL = '/api/market/news-stream';
const POLL_MS = 60_000;
const STALL_MS = 50_000; // the server pings every 20 s
const RETRY_STREAM_MS = 3 * 60_000;
const MAX_ITEMS = 80;

type Listener = () => void;

class NewsStore {
  private state: NewsState = { items: [], status: 'connecting', updatedAt: 0, arrivedAt: {} };
  private listeners = new Set<Listener>();
  private source: EventSource | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  getState = (): NewsState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  };

  /** Manual refresh (e.g. a "Reload" button). */
  refresh = (): void => {
    void this.pollOnce();
  };

  private setState(patch: Partial<NewsState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private start(): void {
    if (typeof window === 'undefined') return;
    // Serverless build: the server has no stream, poll right away
    if (typeof EventSource === 'undefined' || !SERVER_PUSH) {
      this.startPolling();
      return;
    }
    this.openStream();
  }

  private stop(): void {
    this.closeStream();
    this.stopPolling();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private openStream(): void {
    this.closeStream();
    this.setState({ status: this.state.items.length ? this.state.status : 'connecting' });
    const es = new EventSource(STREAM_URL);
    this.source = es;
    this.armStallTimer();

    es.addEventListener('snapshot', (e) => {
      this.armStallTimer();
      this.stopPolling();
      const items = parseItems(e);
      if (items) this.applyItems(items, false);
      this.setState({ status: 'live', updatedAt: Date.now() });
    });
    es.addEventListener('news', (e) => {
      this.armStallTimer();
      const items = parseItems(e);
      if (items) this.applyItems(items, true);
      this.setState({ status: 'live', updatedAt: Date.now() });
    });
    es.addEventListener('ping', () => {
      this.armStallTimer();
      if (this.state.status !== 'live') this.setState({ status: 'live' });
    });
    es.onerror = () => {
      // EventSource reconnects by itself; keep data flowing via polling in the meantime
      if (es.readyState === EventSource.CLOSED) this.fallBackToPolling();
      else if (this.state.status === 'live') this.setState({ status: 'connecting' });
    };
  }

  private closeStream(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = null;
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }

  private armStallTimer(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = setTimeout(() => this.fallBackToPolling(), STALL_MS);
  }

  /** Stream unusable: poll instead and try the stream again later. */
  private fallBackToPolling(): void {
    this.closeStream();
    this.startPolling();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      if (this.listeners.size > 0) this.openStream();
    }, RETRY_STREAM_MS);
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    void this.pollOnce();
    this.pollTimer = setInterval(() => void this.pollOnce(), POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async pollOnce(): Promise<void> {
    try {
      const items = await fetchNewsFeed();
      // After the first load, unseen headlines from a poll also count as breaking news
      this.applyItems(items, this.state.items.length > 0);
      this.setState({
        status: this.source && this.state.status === 'live' ? 'live' : 'polling',
        updatedAt: Date.now(),
      });
    } catch {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      this.setState({ status: offline ? 'offline' : this.state.status });
    }
  }

  private applyItems(incoming: MarketNewsItem[], markArrivals: boolean): void {
    const now = Date.now();
    const byId = new Map(this.state.items.map((i) => [i.id, i]));
    const arrivedAt = { ...this.state.arrivedAt };
    for (const item of incoming) {
      if (!byId.has(item.id) && markArrivals) arrivedAt[item.id] = now;
      byId.set(item.id, item);
    }
    const items = [...byId.values()]
      .sort((a, b) => (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0))
      .slice(0, MAX_ITEMS);
    const kept = new Set(items.map((i) => i.id));
    for (const id of Object.keys(arrivedAt)) if (!kept.has(id)) delete arrivedAt[id];
    this.setState({ items, arrivedAt });
  }
}

function parseItems(e: Event): MarketNewsItem[] | null {
  try {
    const data = JSON.parse((e as MessageEvent<string>).data);
    return Array.isArray(data?.items) ? data.items : null;
  } catch {
    return null;
  }
}

export const newsStore = new NewsStore();

/** Headlines tagged with an asset code (e.g. "BTC"); MACRO news is included when asked. */
export function filterNewsByCode(
  items: MarketNewsItem[],
  code: string,
  includeMacro = false
): MarketNewsItem[] {
  return items.filter(
    (i) => i.assetTags?.includes(code) || (includeMacro && i.assetTags?.includes('MACRO'))
  );
}
