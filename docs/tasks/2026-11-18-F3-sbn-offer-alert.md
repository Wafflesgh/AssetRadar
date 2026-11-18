# Task: F3 — Alert when a retail SBN offer opens or is about to close

**Status:** done
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

- PARTIAL / BLOCKED: added sbnOffer kind, validation, series/event deduplication (last 50),
  coupon/end-date/close-time notifications and #/macro destination in alerts.ts, plus tests.
  Added symbol-free repeating editor option, existing SBN endpoint loading in alertService.ts,
  and conditional sbn:series read/context inside checkServerAlerts only. Added EN/ID keys.
- Final checks: lint FAIL — `src/components/AlertsView.tsx(38,49): TS2366: Function lacks ending
  return statement and return type does not include undefined`. Its exhaustive `describe()`
  switch needs a case for sbnOffer, but AlertsView.tsx is NOT an allowed file for this task.
  Did not weaken AlertKind or edit that file to bypass the scope restriction.
- PASS: npm test (430 tests), npm run build, check-i18n --fail (0). Existing >500 kB bundle
  warning remains. Earlier edit syntax/payload errors were corrected within the allowed files.
- Stopped here as instructed; F4 has not been started. Claude must add AlertsView.tsx to the
  allowed scope (or supply the missing description case) before this task can finish.
- Not checked: browser/editor interaction, live SBN responses or real push delivery. No commit,
  production write or new source. F2 changes remain in the workspace with their own Notes.

## Review (Claude)
PASS after one fix by Claude (2026-11-18). Codex correctly stopped: `AlertsView.tsx` needed a case for the
new kind but was not in the allowed files (task-writing gap). Claude added `sbnOffer` next to `geo` in
`describe()`. server.ts diff stays inside checkServerAlerts. Checks: lint ok, 430/0 tests, build, i18n 0;
the editor lists "Retail SBN offering". Not tested: real SBN dates / push delivery.
