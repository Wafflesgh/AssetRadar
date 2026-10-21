/**
 * hosting.ts — Where the server runs and how it reaches Supabase (pure, env in → values out).
 * Hosts: Vercel (the target: front end + the API as one serverless function, no background
 * timers), Railway (optional always-on Node), Google Cloud Run (old AI Studio publish) or a local
 * computer. Always-on hosts run the daily jobs from an internal timer; serverless hosts get them
 * from the database scheduler (pg_cron → /api/cron/tick) instead. Supabase accepts the new
 * secret keys (sb_secret_…) and the legacy service_role JWT; new keys go in the apikey header only
 * because they are not JWTs.
 */

export type HostKind = 'railway' | 'cloudRun' | 'vercel' | 'local';

export interface Hosting {
  host: HostKind;
  /** Region reported by the platform's environment (Cloud Run reads it from metadata instead). */
  region: string | null;
  /** The process keeps running between requests (timers and streams keep working). */
  alwaysOn: boolean;
}

export function hostingFrom(env: Record<string, string | undefined>): Hosting {
  if (env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID) {
    return { host: 'railway', region: env.RAILWAY_REPLICA_REGION?.trim() || null, alwaysOn: true };
  }
  if (env.K_SERVICE) return { host: 'cloudRun', region: null, alwaysOn: false };
  if (env.VERCEL) return { host: 'vercel', region: env.VERCEL_REGION?.trim() || null, alwaysOn: false };
  return { host: 'local', region: null, alwaysOn: true };
}

/**
 * Serverless mode: no timers, sockets or streams between requests (Vercel, or SERVERLESS=1 to try
 * it locally). Background work then runs from /api/cron/tick and keeps its progress in the database.
 */
export function serverlessFrom(env: Record<string, string | undefined>): boolean {
  const flag = env.SERVERLESS?.trim();
  if (flag === '1' || flag === 'true') return true;
  if (flag === '0' || flag === 'false') return false;
  return hostingFrom(env).host === 'vercel';
}

/**
 * Internal daily-job timer: on by default on always-on hosts except a local dev machine,
 * forced with INTERNAL_SCHEDULER=1 / off with INTERNAL_SCHEDULER=0.
 */
export function internalSchedulerOn(env: Record<string, string | undefined>): boolean {
  const flag = env.INTERNAL_SCHEDULER?.trim();
  if (flag === '1' || flag === 'true') return true;
  if (flag === '0' || flag === 'false') return false;
  return hostingFrom(env).host === 'railway';
}

/** The Supabase server key: the new SUPABASE_SECRET_KEY first, else the legacy service_role key. */
export function supabaseKey(env: Record<string, string | undefined>): string | null {
  return env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

/** Request headers for Supabase REST with a server key (no Bearer for the new non-JWT keys). */
export function supabaseHeaders(key: string): Record<string, string> {
  return key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

/**
 * Vercel routes /api/<path> to the one function as /api/index?__p=<path>. Restores the original
 * URL whether the platform passes the rewritten or the original one (and drops __p either way).
 */
export function originalApiUrl(url: string): string {
  const u = new URL(url, 'http://local');
  const p = u.searchParams.get('__p');
  if (p === null) return url;
  u.searchParams.delete('__p');
  return u.pathname === '/api/index' ? `/api/${p}${u.search}` : `${u.pathname}${u.search}`;
}
