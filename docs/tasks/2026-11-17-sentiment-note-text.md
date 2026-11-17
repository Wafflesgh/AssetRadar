# Task: Fix the outdated note under the sentiment panel

**Status:** done
**Written by:** Claude · **Date:** 2026-11-17

## Goal
The note at the bottom of the asset sentiment panel says the score comes from "24-hour price momentum
and the tone of the latest headlines". That is outdated: the score now comes from `/api/market/analysis`
(technical scorecard of 9 indicators + chart patterns, fundamentals for stocks, and news events).
Update the note so it tells the truth. This is also a small test of the Claude → Codex workflow.

## Allowed files
- `src/i18n/en.ts` (only the value of key `intel.note`)
- `src/i18n/id.ts` (only the value of key `intel.note`)

## Steps
1. Read `src/ai/analysis.ts` briefly to confirm what the score combines (do not change it).
2. Rewrite `intel.note` in `en.ts`, for example:
   "The sentiment score combines technical indicators and chart patterns, fundamentals (stocks only)
   and recent news events. Not a buy/sell recommendation."
   Adjust only if `analysis.ts` shows something different.
3. Write the same meaning in simple Indonesian in `id.ts`.
4. Keep the sentence "Not a buy/sell recommendation." / "Bukan rekomendasi beli/jual." — it is a
   required disclaimer.

## Done when
- [ ] Only the two `intel.note` values changed (`git diff` shows 2 lines)
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs` = 0

## Do not
- Anything in AGENTS.md section 3. Plus: do not change `src/utils/sentiment.ts`, the panel component,
  or any other i18n key.

## Notes from Codex
<!-- Codex fills this in: files changed, what was done, check results, open points. -->
- Changed only `intel.note` in `src/i18n/en.ts` and `src/i18n/id.ts`; updated this task's notes as required by AGENTS.md.
- Confirmed `src/ai/analysis.ts` combines technical indicators/chart patterns, momentum, valuation, stock fundamentals and recent news events. Both translations now describe these inputs and retain the required buy/sell disclaimer.
- PASS: `npm run lint`; `npm test` (368 passed, 0 failed); `npm run build`; `node scripts/check-i18n.mjs` (0 untranslated texts).
- Build reported a chunk-size warning (>500 kB); no unrelated changes made. Browser layout was not checked for this text-only change. No commit or production changes.

## Review (Claude)
<!-- Claude fills this in: pass, or numbered fixes for Codex. -->
PASS (2026-11-17). Diff is exactly the two `intel.note` values; momentum and valuation confirmed in
`analysis.ts`; disclaimer kept. Re-ran lint, test (368/0), build, check-i18n (0). Committed by Claude.
