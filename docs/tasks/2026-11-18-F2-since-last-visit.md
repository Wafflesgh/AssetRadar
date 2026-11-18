# Task: F2 — "Since your last visit" card on Radar

**Status:** done
**Written by:** Claude · **Date:** 2026-11-18 · **Plan:** `docs/plans/TRD.md` § F2

## Goal
When the owner returns after at least 1 hour, show at the top of Radar what changed for their watchlist
and portfolio assets since the last visit.

## Allowed files
- New `src/utils/sinceLastVisit.ts` + new `src/utils/sinceLastVisit.test.ts`
- New `src/components/SinceLastVisit.tsx`; `src/components/RadarView.tsx` (render it at the top only)
- `src/utils/storage.ts`: **only** a device-only key `assetradar_last_visit_v1` with `getLastVisit()` /
  `saveLastVisit()` via `safeGet`/`safeSet` (NOT tracked/synced)
- `src/i18n/en.ts`, `src/i18n/id.ts` (new keys `since.*` only)

## Logic
- Stored: `{ at, prices: Record<symbol, number> }` for watchlist + portfolio symbols (existing getters).
  Save every 10 min while Radar is open and on `visibilitychange` to hidden. Skip ticks marked
  `fromSnapshot` or with status error.
- Card shows when `now - at >= 1 h`: "Since <relative time>": per asset % change (current tick vs stored
  price; null if either missing), sorted by absolute change, top 8; headlines from `useLiveNews` tagged to
  those asset codes with time >= `at` (max 5, link out); alert history entries since `at` from the source the
  Alerts page already uses (skip if none). A dismiss button hides it until the next visit.
- First visit (nothing stored): no card.

## Tests
gap < 1 h → hidden; changes computed and sorted; missing price → null not 0; news filtered by time and tag.

## Done when
- [ ] Only allowed files changed
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0
- [ ] Notes list what you could not check (browser, live data)

## Do not
- Anything in AGENTS.md section 3. No new data source, no Gemini, no buy/sell wording; missing data is
  shown as unavailable, never 0.

## Notes from Codex

- Added `sinceLastVisit.ts`, its tests, and `SinceLastVisit.tsx`; mounted at the top of Radar.
  Snapshot is device-only through `getLastVisit`/`saveLastVisit` in storage.ts, every ten minutes,
  on hidden, and on leaving Radar. The opening baseline stays fixed while viewing the card.
  Invalid/offline snapshot quotes are excluded; missing changes remain unavailable. Uses existing
  news and local/server alert-history sources; dismiss lasts for the mounted visit.
- Added only `since.*` EN/ID keys. No synced key, new source or server changes.
- PASS: lint, 429 tests, build, check-i18n --fail (0). Existing >500 kB bundle warning remains.
- Not checked: browser interaction, responsive/light/dark rendering, live news or server history.
  No commit or production changes. Existing untracked owner files untouched.

## Review (Claude)
PASS (2026-11-18). Browser: with a 5-hour-old visit and a test watchlist (restored after) the card showed
"Since 5 hours ago", BBCA +10.00% (5,000 → 5,500), BTC, and tagged headlines. Device-only key, not synced.
