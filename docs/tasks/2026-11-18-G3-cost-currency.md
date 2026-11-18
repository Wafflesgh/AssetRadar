# Task: G3 — Cost card shows amounts in their currency

**Status:** todo
**Written by:** Claude · **Date:** 2026-11-18 · **Plan:** `docs/plans/TRD.md` § G3

## Goal
In the Positions tab cost card, show fee amounts as money (Rp1.234 / $12.34), not bare numbers.

## Allowed files
- `src/components/PortfolioCosts.tsx` only

## Logic
Replace the bare `formatNumber(value, 2)` for amounts with `formatPrice(value, currency)` from
`src/utils/format.ts`, using each block's currency. Percent values stay as they are. Missing stays
"unavailable".

## Done when
- [ ] Only the allowed file changed
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0

## Do not
- Anything in AGENTS.md section 3.

## Notes from Codex

## Review (Claude)
