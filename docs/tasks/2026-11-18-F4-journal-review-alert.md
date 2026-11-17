# Task: F4 — Journal review reminder

**Status:** open (after F3; same files)
**Written by:** Claude · **Date:** 2026-11-18 · **Plan:** `docs/plans/TRD.md` § F4

## Goal
New alert kind `journalReview` (no symbol): remind the owner when a journal note reaches its 7, 30 or
91-day review (same days as `reviewChanges` in `src/utils/journal.ts`).

## Allowed files
- `src/utils/alerts.ts` + its test; `src/services/alertService.ts`; `src/components/AlertEditor.tsx`
- `src/utils/journal.ts`: only an exported helper `dueReviews(entries, now)` + its test
- `server.ts`: **only** inside `checkServerAlerts`: read the synced `journal` collection from the sync data it
  already loads, only when an alert of this kind exists
- `src/i18n/en.ts`, `src/i18n/id.ts` (new keys only)

## Logic
`dueReviews` returns `{ entryId, symbol, period: 'w1' | 'm1' | 'm3' }` for reviews whose WIB date is today or
earlier and within the last 3 days (no flood for old notes). Fire once per key `entryId:period`
(`state.seen`, keep the last 200). Browser uses `getJournal()`. Body: asset code + period only, **never the
note text**. URL `#/portfolio/journal`.

## Tests
note created 30 days ago → m1 due; 100-day-old w1 not due (outside 3 days); already seen → not again.

## Done when
- [ ] Only allowed files changed; server.ts diff only inside `checkServerAlerts`
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0
- [ ] Notes list what you could not check (browser, live push)

## Do not
- Anything in AGENTS.md section 3. Never put note text in a notification or a server log.

## Notes from Codex

## Review (Claude)
