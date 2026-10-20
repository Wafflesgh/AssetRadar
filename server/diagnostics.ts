/**
 * diagnostics.ts — GET /api/diagnostics: probes every upstream source from the server (in
 * parallel, short timeouts, cached 5 min), reports the Cloud Run region (from the metadata
 * server, when running on Google Cloud), and which optional features are configured — only the
 * names of secrets, never their values. Lets the owner see right after publishing which sources
 * are blocked where the server runs (e.g. Binance answering 451 from a US region).
 */
import type { Express } from 'express';
import { classifyProbe, PROBES, regionFromMetadata, setupStatus, type ProbeResult } from '../src/utils/diagnostics.ts';

const TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 8000;

interface DiagnosticsReport {
  checkedAt: number;
  region: string | null;
  runtime: { node: string; cloudRun: boolean };
  probes: ProbeResult[];
  setup: ReturnType<typeof setupStatus>;
}

let cache: { at: number; data: DiagnosticsReport } | null = null;
let pending: Promise<DiagnosticsReport> | null = null;

async function probe(def: (typeof PROBES)[number]): Promise<ProbeResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(def.url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (AssetRadar diagnostics)', ...(def.headers ?? {}) },
    });
    // Only the status matters; drop the body
    res.body?.cancel().catch(() => {});
    const { status, detail } = classifyProbe(res.status, def.okStatuses);
    return { id: def.id, name: def.name, status, httpStatus: res.status, ms: Date.now() - started, features: def.features, detail };
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError';
    const { status, detail } = classifyProbe(null, def.okStatuses, aborted ? 'timeout' : 'network');
    return { id: def.id, name: def.name, status, httpStatus: null, ms: null, features: def.features, detail };
  } finally {
    clearTimeout(timer);
  }
}

/** Cloud Run region from the metadata server (null elsewhere, e.g. on the owner's laptop). */
async function cloudRegion(): Promise<string | null> {
  if (!process.env.K_SERVICE) return null;
  try {
    const res = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/region', {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(2000),
    });
    return res.ok ? regionFromMetadata(await res.text()) : null;
  } catch {
    return null;
  }
}

async function runDiagnostics(): Promise<DiagnosticsReport> {
  const [region, probes] = await Promise.all([cloudRegion(), Promise.all(PROBES.map(probe))]);
  return {
    checkedAt: Date.now(),
    region,
    runtime: { node: process.version, cloudRun: Boolean(process.env.K_SERVICE) },
    probes,
    setup: setupStatus(process.env),
  };
}

/** The probe report, from the 5-minute cache when fresh (used by the daily analysis). */
export async function diagnosticsProbes(): Promise<ProbeResult[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data.probes;
  pending ??= runDiagnostics().finally(() => {
    pending = null;
  });
  const data = await pending;
  cache = { at: Date.now(), data };
  return data.probes;
}

/**
 * `live` adds fields that are cheap and change often (Gemini model status, daily job status);
 * they are read on every request, not cached with the probes.
 */
export function registerDiagnosticsRoute(app: Express, live?: () => Promise<Record<string, unknown>> | Record<string, unknown>): void {
  const withLive = async (data: DiagnosticsReport) => ({ ...data, ...(live ? await Promise.resolve(live()).catch(() => ({})) : {}) });
  app.get('/api/diagnostics', async (req, res) => {
    const fresh = req.query.refresh === '1';
    try {
      if (!fresh && cache && Date.now() - cache.at < TTL_MS) {
        res.json(await withLive(cache.data));
        return;
      }
      pending ??= runDiagnostics().finally(() => {
        pending = null;
      });
      const data = await pending;
      cache = { at: Date.now(), data };
      res.json(await withLive(data));
    } catch {
      res.status(500).json({ error: 'Diagnostics failed' });
    }
  });
}
