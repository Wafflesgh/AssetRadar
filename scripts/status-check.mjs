/**
 * status-check.mjs — One-shot health report of the live AssetRadar app (what the owner gets when
 * typing "status check"): is the server and its network reachable, are the data sources answering,
 * is each data set fresh (prices, news, macro, sentiment scans, screener, calendar, SBN, Binance,
 * AI jobs), and which optional features are configured. Only public endpoints are read; no key is
 * needed or printed.
 *
 *   node scripts/status-check.mjs [base-url]      (default: APP_URL or the Vercel URL)
 *   node scripts/status-check.mjs --json          (machine-readable)
 *
 * Every line is OK / WARN / FAIL / INFO; the exit code is 1 when any FAIL is found.
 */
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const BASE = (args.find((a) => /^https?:\/\//.test(a)) ?? process.env.APP_URL ?? 'https://assetradar-iota.vercel.app').replace(/\/+$/, '');

/** Sources that never answer from Vercel's servers; the app uses other sources instead. */
const EXPECTED_DOWN = new Set(['fred', 'fredApi', 'imf']);

const now = Date.now();
const results = [];
const add = (area, status, detail) => results.push({ area, status, detail });

const ago = (ms) => {
  if (!Number.isFinite(ms)) return 'unknown';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 90) return `${s} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};

async function get(path, timeoutMs = 120_000) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/api/${path}`, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'AssetRadar status-check' } });
    const ms = Date.now() - t0;
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { ok: res.ok, status: res.status, ms, json };
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - t0, json: null, error: err?.name === 'TimeoutError' ? 'timeout' : String(err?.message ?? err) };
  }
}

/** WIB calendar date and minutes after midnight. */
function wib(ms = now) {
  const d = new Date(ms + 7 * 3600_000);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday: d.getUTCDay() };
}
const prevDate = (date) => new Date(Date.parse(`${date}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);

const [health, diag, tick, snap, news, scan, screener, calendar, sbn, binance, analyst, brief, forward, arena, monthly] = await Promise.all([
  get('health', 30_000),
  get('diagnostics'),
  get('cron/tick/last'),
  get('market/snapshot'),
  get('market/news-feed'),
  get('sentiment/scan-status'),
  get('screener/idx'),
  get('idx/calendar'),
  get('sbn/retail'),
  get('crypto/binance/overview'),
  get('analyst'),
  get('brief/dates'),
  get('ai/forward-track'),
  get('ai/arena-live?horizon=20'),
  get('commodities/monthly'),
]);
// Macro is the slowest (OECD pacing on a cold instance): fetched last, with a longer wait
const macro = await get('macro/indonesia', 280_000);

// ---- Server & network ----------------------------------------------------------------------
if (health.ok && health.json?.ok) add('Server', 'OK', `online (${health.json.host ?? '?'}${health.json.serverless ? ', serverless' : ''}), answered in ${health.ms} ms`);
else add('Server', 'FAIL', `not answering (${health.error ?? `HTTP ${health.status}`})`);

if (diag.ok && diag.json) {
  const probes = diag.json.probes ?? [];
  const bad = probes.filter((p) => p.status !== 'ok' && !EXPECTED_DOWN.has(p.id));
  const expected = probes.filter((p) => p.status !== 'ok' && EXPECTED_DOWN.has(p.id));
  const slow = probes.filter((p) => p.status === 'ok' && p.ms > 3000);
  const region = diag.json.region ? `, region ${diag.json.region}` : '';
  if (bad.length) add('Network / sources', 'FAIL', `${probes.length - bad.length - expected.length}/${probes.length} sources reachable${region}; DOWN: ${bad.map((p) => `${p.name} (${p.detail ?? p.status})`).join(', ')}`);
  else add('Network / sources', slow.length ? 'WARN' : 'OK', `${probes.length - expected.length}/${probes.length} sources reachable${region}${slow.length ? `; slow: ${slow.map((p) => `${p.name} ${p.ms} ms`).join(', ')}` : ''}`);
  if (expected.length) add('Network / sources', 'INFO', `known blocked from Vercel (replaced by other sources): ${expected.map((p) => p.name).join(', ')}`);
  const setup = diag.json.setup ?? [];
  add('Optional features', 'INFO', `on: ${setup.filter((x) => x.configured).map((x) => x.id).join(', ') || 'none'}; off: ${setup.filter((x) => !x.configured).map((x) => x.id).join(', ') || 'none'}`);
  const g = diag.json.gemini;
  if (g?.configured && g.lastError) add('Gemini', 'WARN', `last error: ${g.lastError}`);
} else add('Network / sources', 'FAIL', `diagnostics not answering (${diag.error ?? `HTTP ${diag.status}`})`);

// ---- Background jobs -----------------------------------------------------------------------
const last = tick.json?.last;
if (last?.finishedAt) {
  const age = now - last.finishedAt;
  add('Scheduled tick (every 10 min)', age < 25 * 60_000 ? 'OK' : age < 60 * 60_000 ? 'WARN' : 'FAIL', `last run finished ${ago(last.finishedAt)}`);
} else if (tick.json && tick.json.serverless === false) add('Scheduled tick (every 10 min)', 'INFO', 'always-on host (no tick)');
else add('Scheduled tick (every 10 min)', 'FAIL', 'no tick recorded');

const jobs = diag.json?.jobs;
if (jobs?.lastRun) {
  const w = wib();
  const isWeekday = w.weekday >= 1 && w.weekday <= 5;
  const expect = (job, dueMinutes, weekdaysOnly) => {
    const ran = jobs.lastRun[job];
    // Expected: today once its time has passed, else the previous (week)day
    let want = w.minutes >= dueMinutes && (!weekdaysOnly || isWeekday) ? w.date : prevDate(w.date);
    if (weekdaysOnly) while ([0, 6].includes(new Date(`${want}T00:00:00Z`).getUTCDay())) want = prevDate(want);
    const status = ran && ran >= want ? 'OK' : ran && ran >= prevDate(want) ? 'WARN' : 'FAIL';
    return { status, text: `${job} ${ran ?? 'never'}${status === 'OK' ? '' : ` (expected ${want})`}` };
  };
  const checks = [expect('brief', 7 * 60 + 30, false), expect('forward', 16 * 60 + 15, true), expect('analyst', 16 * 60 + 15, false)];
  const worst = checks.some((c) => c.status === 'FAIL') ? 'FAIL' : checks.some((c) => c.status === 'WARN') ? 'WARN' : 'OK';
  add('Daily jobs', worst, `${checks.map((c) => c.text).join('; ')}${jobs.running?.length ? `; running: ${jobs.running.join(', ')}` : ''}`);
}

// ---- Data freshness ------------------------------------------------------------------------
if (snap.ok && snap.json?.ticks) {
  const ticks = Object.values(snap.json.ticks);
  const byGroup = new Map();
  for (const t of ticks) {
    if (!byGroup.has(t.group)) byGroup.set(t.group, []);
    byGroup.get(t.group).push(t);
  }
  const lines = [];
  let worst = 'OK';
  for (const [group, list] of byGroup) {
    const open = list.filter((t) => t.isMarketOpen);
    const newest = Math.max(...list.map((t) => t.updatedAt ?? 0));
    const staleOpen = open.filter((t) => now - (t.updatedAt ?? 0) > 20 * 60_000);
    if (open.length && staleOpen.length > open.length / 2) worst = 'WARN';
    lines.push(`${group} ${list.length} (${open.length ? `${open.length} open` : 'closed'}, newest ${ago(newest)}${staleOpen.length ? `, ${staleOpen.length} open but stale` : ''})`);
  }
  const errors = ticks.filter((t) => t.status === 'error').length;
  if (errors) worst = 'WARN';
  add('Prices', worst, `${ticks.length} assets${errors ? `, ${errors} with errors` : ''}; ${lines.join('; ')}`);
} else add('Prices', 'FAIL', `snapshot not answering (${snap.error ?? `HTTP ${snap.status}`})`);

if (news.ok && news.json?.items?.length) {
  const newest = Math.max(...news.json.items.map((n) => n.publishedAtMs ?? 0));
  const t = newest || news.json.updatedAt;
  add('News', now - t < 6 * 3600_000 ? 'OK' : 'WARN', `${news.json.items.length} headlines, newest ${ago(t)}`);
} else add('News', 'WARN', `no headlines (${news.error ?? `HTTP ${news.status}`})`);

if (macro.ok && macro.json) {
  const m = macro.json;
  const stale = (m.indicators ?? []).filter((i) => i.stale).map((i) => i.id);
  const empty = (m.indicators ?? []).filter((i) => !i.points?.length).map((i) => i.id);
  const status = m.failed?.length ? 'WARN' : 'OK';
  add(
    'Indonesia macro',
    status,
    `${(m.indicators ?? []).length} indicators, computed ${ago(m.generatedAt)}${m.failed?.length ? `; failed: ${m.failed.join(', ')}` : ''}${empty.length ? `; empty: ${empty.join(', ')}` : ''}${stale.length ? `; older than usual: ${stale.join(', ')}` : ''}; BPS ${m.bpsConfigured ? 'on' : 'off'}`
  );
} else add('Indonesia macro', 'FAIL', `not answering (${macro.error ?? `HTTP ${macro.status}`})`);

if (scan.ok && scan.json?.markets) {
  for (const mk of scan.json.markets) {
    const parts = (mk.progress ?? []).map((p) => `${p.kind} ${p.done}/${p.total}${p.failed ? ` (${p.failed} failed)` : ''}`);
    const newest = Math.max(...Object.values(mk.freshness ?? {}).map((f) => f.newest ?? 0));
    const low = (mk.progress ?? []).some((p) => p.total && p.done / p.total < 0.8);
    add(`Sentiment scan ${mk.market.toUpperCase()}`, low ? 'WARN' : 'OK', `${parts.join(', ')}; newest data ${ago(newest)}`);
  }
} else add('Sentiment scan', 'WARN', `status not answering (${scan.error ?? `HTTP ${scan.status}`})`);

if (screener.ok && screener.json?.scan) {
  const s = screener.json.scan;
  add('IDX screener', s.withData / Math.max(1, s.total) < 0.5 ? 'WARN' : 'OK', `${s.withData}/${s.total} stocks with ratios; prices ${ago(screener.json.pricesAt)}`);
}
if (calendar.ok && calendar.json) add('IDX calendar', 'OK', `${calendar.json.events?.length ?? 0} events, ${calendar.json.scanned}/${calendar.json.total} stocks checked`);
if (sbn.ok && sbn.json) add('Retail SBN', sbn.json.errors?.length ? 'WARN' : 'OK', `${sbn.json.current?.length ?? 0} current series, checked ${ago(sbn.json.checkedAt)}${sbn.json.errors?.length ? `; errors: ${sbn.json.errors.length}` : ''}`);
if (binance.ok && binance.json?.status) {
  const b = binance.json.status;
  add('Binance', b.availability === 'ok' ? 'OK' : 'WARN', `${b.availability}, ${b.pairs} pairs, tickers ${ago(b.tickersAt)}, weight ${b.weightUsed}/${b.weightLimit}`);
}
if (monthly.ok && monthly.json?.rows) add('Monthly commodities', monthly.json.rows.length ? 'OK' : 'WARN', `${monthly.json.rows.length} series, latest month ${monthly.json.rows[0]?.month?.slice(0, 7) ?? '—'}`);

// ---- AI ------------------------------------------------------------------------------------
if (analyst.ok && analyst.json) add('Daily AI analysis', 'INFO', `latest report ${analyst.json.report?.date ?? 'none'}`);
if (brief.ok && brief.json?.dates) add('Morning brief', 'INFO', `latest ${brief.json.dates[0] ?? 'none'}`);
if (forward.ok && forward.json?.record) add('AI forward test', 'INFO', `${forward.json.record.saved} predictions saved since ${forward.json.record.startedAt}, ${forward.json.record.evaluated} scored`);
if (arena.ok && arena.json?.board) add('Model arena (live)', 'INFO', `${arena.json.board.saved} predictions saved, ${arena.json.board.evaluated} scored`);

// ---- Output --------------------------------------------------------------------------------
const counts = { OK: 0, WARN: 0, FAIL: 0, INFO: 0 };
for (const r of results) counts[r.status]++;
if (asJson) {
  console.log(JSON.stringify({ base: BASE, checkedAt: new Date(now).toISOString(), counts, results }, null, 2));
} else {
  console.log(`AssetRadar status check — ${BASE} — ${new Date(now).toISOString()} (WIB ${wib().date})`);
  for (const r of results) console.log(`${r.status.padEnd(4)} | ${r.area} | ${r.detail}`);
  console.log(`Summary: ${counts.OK} OK, ${counts.WARN} WARN, ${counts.FAIL} FAIL`);
}
process.exitCode = counts.FAIL ? 1 : 0;
