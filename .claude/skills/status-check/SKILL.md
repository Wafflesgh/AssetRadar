---
name: status-check
description: Health report of the live AssetRadar app for the owner. Use when the owner types "status check" (or "cek status", "status aplikasi", "apakah aplikasinya aman"): checks that the server and network are reachable, that each data set is fresh (prices, news, macro, sentiment scans, screener, calendar, SBN, Binance, AI jobs) and which optional features are on, then summarises it in simple Indonesian.
---

# Status check (AssetRadar)

Run the report against the live app (Vercel), wait for it (up to ~5 min when the macro page is cold):

```bash
node scripts/status-check.mjs
```

Every line is `OK | WARN | FAIL | INFO` + area + detail; the last line counts them. Add `--json` for a
machine-readable version, or pass another base URL (e.g. `http://localhost:3000`) for the local server.

## How to report (owner is not a programmer — reply in simple Indonesian)

1. One-line verdict first: **Aman** (no WARN/FAIL), **Perlu perhatian** (WARN only) or **Ada masalah** (any FAIL).
2. Three short sections as tables or bullets:
   - **Jaringan & server** — server online, region, how many data sources reachable. FRED / FRED API / IMF
     are *expected* to be blocked from Vercel (the app uses OECD, BIS, World Bank instead): say so, not an alarm.
   - **Data terbaru** — prices per market (open/closed and how recent), news, Indonesia macro (failed / empty /
     "older than usual" indicators — slow official releases such as annual reserves are normal), sentiment
     scans, screener, IDX calendar, SBN, Binance, monthly commodities.
   - **Fitur & tugas otomatis** — the 10-minute tick, daily jobs (morning brief ≥07:30 WIB; forward test
     weekdays ≥16:15 WIB; analyst ≥16:15 WIB), AI forward test / model arena counts, optional features on/off.
3. For every WARN/FAIL: what it means in plain words and the next step (and offer to fix it). Closed markets
   (US stocks at night WIB, weekends) having older prices is normal, not a problem.
4. Never print or ask for secret values; the script only reads public endpoints.

If the script itself fails to run (no internet on this computer), say so and check `/api/health` with curl.
