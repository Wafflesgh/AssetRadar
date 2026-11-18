# Task: G2 — IDX stock: volume vs the last 20 sessions

**Status:** todo
**Written by:** Claude · **Date:** 2026-11-18 · **Plan:** `docs/plans/TRD.md` § G2

## Goal
On an IDX stock's detail page, one short line: today's volume compared with its usual volume.

## Allowed files
- New `src/utils/volumeContext.ts` + new test
- `src/components/AssetDetailView.tsx` (render one line, IDX stocks only — group `idStock` or universe `idx-*`)
- `src/i18n/en.ts`, `src/i18n/id.ts` (new keys only)

## Logic
- Data: `/api/market/daily?symbol=` through the existing client helper; `OhlcCandle.volume` (shares).
- Baseline = median volume of the last 20 completed sessions; exclude today's WIB bar.
- Ratio = today ÷ baseline. Show ratio + today's volume in lots (÷100) and shares.
- Fewer than 10 sessions with volume, or today has no volume → hide the line.
- Wording: "busier than usual" (≥1.5×), "quieter than usual" (≤0.67×), else "about usual".

## Tests
Median of a known series; today excluded; under 10 sessions → null; lot conversion; three wording bands.

## Done when
- [ ] Only allowed files changed; no server change
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0
- [ ] Notes list what you could not check (browser, live volume during market hours)

## Do not
- Anything in AGENTS.md section 3. No buy/sell or "accumulation" wording.

## Notes from Codex

## Review (Claude)
