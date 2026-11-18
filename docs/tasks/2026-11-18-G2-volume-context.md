# Task: G2 — IDX stock: volume vs the last 20 sessions

**Status:** done
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

- Added volumeContext.ts and tests: median of available non-negative volumes within the last
  20 completed WIB sessions, excluding today's bar; requires at least 10 observations and
  today's volume. Reports ratio, shares, lots and the three wording bands. Zero/missing median
  hides the line instead of dividing by zero; a reported zero current volume remains valid.
- AssetDetailView shows one line only for IDX stocks. Uses fetchDailyHistory/useSymbolSource,
  refreshes on the existing 30-minute cache cadence, and hides failed/insufficient data.
  A keyed child prevents another stock's old volume from flashing after selection changes.
  Added EN/ID keys; text says volume so far today and states the actual baseline session count.
- PASS: lint, 441 tests, build, check-i18n --fail (0), diff whitespace check.
  Existing >500 kB bundle warning remains.
- Not checked: browser appearance or live volume during market hours; freshness is limited by
  the existing daily-history cache/source. No server, new source, production change or commit.
  G3 and G1 completed checks and Notes before this task; existing untracked owner files untouched.

## Review (Claude)
PASS (2026-11-18). Browser BBCA during market hours: 0.48x of 20-session median, quieter than usual, lots + shares.
