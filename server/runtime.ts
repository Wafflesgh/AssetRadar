/**
 * runtime.ts — How background work runs on this host. Always-on servers (local, Railway, Cloud
 * Run) use timers as before; on a serverless host (Vercel) timers are skipped and work started
 * during a request is handed to the platform's waitUntil, so it may finish after the response
 * (up to the function's maxDuration). The long scans then run from /api/cron/tick instead.
 */
import { serverlessFrom } from '../src/utils/hosting.ts';

/** True on Vercel (or SERVERLESS=1): no timers, sockets or streams between requests. */
export const SERVERLESS = serverlessFrom(process.env);

/** setInterval on always-on hosts; nothing on a serverless host (the cron tick does the work). */
export function everyMs(fn: () => void, ms: number): void {
  if (!SERVERLESS) setInterval(fn, ms);
}

/** setTimeout on always-on hosts only. */
export function afterMs(fn: () => void, ms: number): void {
  if (!SERVERLESS) setTimeout(fn, ms);
}

// Vercel exposes the current request's context on this global symbol (the same lookup the
// official @vercel/functions package does; kept here to avoid its extra dependencies).
const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

interface RequestContext {
  waitUntil?: (promise: Promise<unknown>) => void;
}

/** Keeps a started promise alive after the response on a serverless host; returns it unchanged. */
export function keepAlive<T>(promise: Promise<T>): Promise<T> {
  if (SERVERLESS) {
    const holder = (globalThis as Record<symbol, { get?: () => RequestContext | undefined } | undefined>)[REQUEST_CONTEXT];
    holder?.get?.()?.waitUntil?.(promise.catch(() => undefined));
  }
  return promise;
}
