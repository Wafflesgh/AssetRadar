# Task: F7 — Alert: unusual move for this asset

**Status:** open (after F3 and F4; same files)
**Written by:** Claude · **Date:** 2026-11-18 · **Plan:** `docs/plans/TRD.md` § F7

## Goal
New alert kind `unusualMove` (symbol + value = sigma threshold, default 3, allowed 2–6): fire when
|today's change %| ≥ value × σ, σ = standard deviation of the asset's daily % changes over the last 60
completed sessions.

## Allowed files
- New `src/utils/unusualMove.ts` + new test
- `src/utils/alerts.ts` + its test; `src/services/alertService.ts`; `src/components/AlertEditor.tsx`
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

## Review (Claude)
