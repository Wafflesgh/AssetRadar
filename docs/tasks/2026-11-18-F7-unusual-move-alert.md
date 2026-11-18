# Task: F7 — Alert: unusual move for this asset

**Status:** done
**Written by:** Claude · **Date:** 2026-11-18 · **Plan:** `docs/plans/TRD.md` § F7

## Goal
New alert kind `unusualMove` (symbol + value = sigma threshold, default 3, allowed 2–6): fire when
|today's change %| ≥ value × σ, σ = standard deviation of the asset's daily % changes over the last 60
completed sessions.

## Allowed files
- New `src/utils/unusualMove.ts` + new test
- `src/utils/alerts.ts` + its test; `src/services/alertService.ts`; `src/components/AlertEditor.tsx`; `src/components/AlertsView.tsx` (the `describe()` switch needs a case for every kind)
- `server.ts`: **only** inside `checkServerAlerts`: σ for symbols that have this alert, from the existing
  daily history function (`dailyOhlcFor`, cached), cached per WIB day in memory
- `src/i18n/en.ts`, `src/i18n/id.ts` (new keys only)

## Logic
- `dailySigma(closes)` from the last 61 closes (exclude today's unfinished bar); null with fewer than 30.
- Browser: same σ from `/api/market/daily`.
- Re-arms when the move falls back under the threshold (same behaviour as `dailyMove`).
- Body example: "BBCA moved −4.1% today, about 3.2× its usual daily move (60 sessions)". Information only.

## Tests
σ of a known series; fewer than 30 closes → null (no fire); fires at threshold; re-arm behaviour.

## Done when
- [ ] Only allowed files changed; server.ts diff only inside `checkServerAlerts`
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0
- [ ] Notes list what you could not check (browser, live push)

## Do not
- Anything in AGENTS.md section 3. No new data source; no buy/sell wording.

## Notes from Codex

- Added unusualMove.ts and tests: sample standard deviation of daily percentage returns from
  up to 61 closes (60 returns); fewer than 30 closes unavailable. Shared completedSigma excludes
  today's WIB bar. Flat/invalid sigma cannot fire an alert.
- Added unusualMove kind, 2–6 validation, threshold/re-arm logic and tests in alerts.ts and
  alerts.test.ts. AlertEditor defaults the sigma input to 3; AlertsView describes the new kind.
  New EN/ID text reports the actual session count and includes information-only wording.
- alertService loads only requested symbols via existing daily history, once per WIB day with
  in-flight deduplication. Server edits stay inside checkServerAlerts, using dailyOhlcFor and
  a per-WIB-day in-memory cache. Failed/missing history is unavailable until the next day.
- PASS: lint, 437 tests, build, check-i18n --fail (0); diff whitespace check passed.
  Existing >500 kB bundle warning remains.
- Not checked: browser editor/layout, real historical feeds or live push delivery. No new
  sources, dependencies, production writes or commits. F4/F5/F6 each completed their own checks
  and Notes before this task began; existing untracked owner files were left untouched.

## Review (Claude)
PASS (2026-11-18). Server sigma cached per WIB day, only for symbols with this alert. Not tested: live push.
