# Task: T9 — Decision journal

**Status:** open
**Written by:** Claude · **Date:** 2026-11-17 · **Plan:** `docs/plans/TRD.md` § T9

## Goal
The owner writes why they bought or sold. Each note stores a snapshot of what the app showed at that
moment; later the journal shows what happened since (1 week, 1 month, 3 months).

## Allowed files
- New `src/utils/journal.ts` + new `src/utils/journal.test.ts`
- `src/utils/sync.ts`: add `'journal'` to `SYNC_COLLECTIONS` (and its test if the list is asserted)
- `src/utils/storage.ts`: storage key `assetradar_journal_v1`, `getJournal()` / `saveJournal()` wrapped in
  `tracked('journal', …)`, and `registerSyncAdapter('journal', listAdapter(...))` — same pattern as
  `portfolio` (lines ~209 and ~558)
- New `src/components/PortfolioJournal.tsx`; `src/components/PortfolioView.tsx` (render it below the
  holdings; a "Add note" button on each transaction row that opens the editor with that tx linked)
- `src/i18n/en.ts`, `src/i18n/id.ts` (new keys `journal.*` only)

## Data
`JournalEntry = { id, symbol, txId: string | null, createdAt (ms), note (1–1000 chars),
snapshot: { price: number | null, currency: string, sentiment: { short, medium, long } (label or null),
evidenceScore: number | null } }`. Snapshot uses data the page already has (live tick, the evidence score
it already fetches); sentiment from the existing `/api/sentiment/v2?symbol=` client helper if one exists,
otherwise null. Missing parts are null, never 0.

## Logic (`journal.ts`)
- `validateEntry`, `parseJournal(raw)` (drops invalid entries), `sortEntries` (newest first).
- `reviewChanges(entry, bars)` → `{ w1, m1, m3 }` % change from `snapshot.price` to the close on/after
  createdAt + 7/30/91 days using `/api/market/daily` bars; `null` when the date is in the future or data
  is missing.

## UI
List of notes (asset, date, note, snapshot chips, review chips 1W/1M/3M), filter by asset, edit and
delete with confirmation. Neutral wording: "since this note: +4.2%", no "right/wrong" verdicts.
375 px, light/dark, EN + ID.

## Tests
validation (empty, too long), parse drops bad rows, review: future → null, missing bars → null,
known bars → correct %; sync adapter round trip like the portfolio test (if one exists).

## Done when
- [ ] Only allowed files changed
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0

## Do not
- Anything in AGENTS.md section 3 (note: `storage.ts` and `sync.ts` are explicitly allowed here, only for
  the additions above). No server changes; notes are never sent anywhere except the owner's sync.

## Notes from Codex

## Review (Claude)
