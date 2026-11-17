# Task: F3 — Alert when a retail SBN offer opens or is about to close

**Status:** open
**Written by:** Claude · **Date:** 2026-11-18 · **Plan:** `docs/plans/TRD.md` § F3

## Goal
New alert kind `sbnOffer` (no symbol): notify when an ORI/SBR/SR/ST/SWR offer opens, and 2 days before
it closes. Data already exists: `SbnSeries` in `src/utils/sbnRetail.ts` (`offerStart`, `offerEnd`,
`closeTime`), stored on the server as `sbn:series`, served by `/api/sbn/retail`.

## Allowed files
- `src/utils/alerts.ts` + its test (new `AlertKind`, label, `evaluateAlert` branch, validation)
- `src/services/alertService.ts` (browser evaluation), `src/components/AlertEditor.tsx` (create/edit UI)
- `server.ts`: **only** inside `checkServerAlerts` (~line 5001): load `sbn:series` once per check, only when
  an alert of this kind exists, and pass it in the context
- `src/i18n/en.ts`, `src/i18n/id.ts` (new keys only)

## Logic
Fire once per series per event, keys `<code>:open` and `<code>:closing` in `state.seen` (keep the last
50). Open = today (WIB) between offerStart and offerEnd and not yet seen; closing = today = offerEnd − 2
days. Body: series code, coupon, offer end date + close time. URL `#/macro`. Respect quiet hours and
throttle like other kinds. In the editor it is a simple on/off alert (no value field).

## Tests
open day fires once then not again; closing fires on offerEnd−2; series without dates ignored.

## Done when
- [ ] Only allowed files changed; server.ts diff only inside `checkServerAlerts`
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0
- [ ] Notes list what you could not check (browser, live push)

## Do not
- Anything in AGENTS.md section 3. No new data source, no Gemini, no buy/sell wording.

## Notes from Codex

## Review (Claude)
