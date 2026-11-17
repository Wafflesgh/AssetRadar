# Task: T9 — Decision journal

**Status:** done
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
- [x] Only allowed files changed
- [x] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0

## Do not
- Anything in AGENTS.md section 3 (note: `storage.ts` and `sync.ts` are explicitly allowed here, only for
  the additions above). No server changes; notes are never sent anywhere except the owner's sync.

## Notes from Codex

- Implemented T9 without committing or changing production. Files changed: new
  `src/utils/journal.ts`, `src/utils/journal.test.ts`, `src/components/PortfolioJournal.tsx`;
  `src/utils/storage.ts`, `src/utils/sync.ts`, `src/components/PortfolioView.tsx`,
  `src/i18n/en.ts`, `src/i18n/id.ts`, and this task file.
- Added validated entries, invalid-row filtering, newest-first sorting, and reviews at 7/30/91
  calendar days. Reviews use the first valid close on/after the target WIB date, reject future
  deadlines/bars, and leave missing prices/history null. A genuine unchanged price returns 0%.
- Added a journal below the holdings/transactions, an Add note button on each transaction, standalone
  notes with asset search, asset filtering, snapshot/review chips, and confirmed edits/deletions.
  Edits preserve the original snapshot, timestamp, symbol and transaction link. Deleted transactions
  do not delete their notes. The UI uses existing color tokens, wrapping layouts and EN/ID text.
- Snapshots capture the available native live tick and already-fetched portfolio evidence at save
  time. Offline/error quotes are null. Sentiment uses `fetchSentimentV2` while the editor is open;
  a failed or unfinished request leaves labels null. No note text is sent to market/AI endpoints.
- Native quote units match `fetchDailyHistory`; reviews require matching currencies. Gold snapshots
  use spot USD/oz, while the existing daily endpoint supplies GC futures history. This existing
  source difference is disclosed in the journal, and reviews are described as market-price changes,
  not portfolio returns. No server changes or extra market-data helpers were introduced.
- Added the `journal` collection, tracked storage and list adapter using the existing sync mechanism.
  Added the required collection label and used `journal.title` in sync summaries so all new
  translation keys remain under `journal.*`. Saves verify the exact stored JSON; failed writes
  leave the editor open. Sync tests use isolated in-memory browser storage only.
- Checks on the final code: `npm run lint` PASS; `npm test` PASS (402 tests, including 5 new journal
  tests); `npm run build` PASS (existing >500 kB chunk warning); `node scripts/check-i18n.mjs --fail`
  PASS (0 untranslated); `git -c core.whitespace=cr-at-eol diff --check` PASS.
- Browser verification was attempted against a local static build, but the in-app browser could
  not reach localhost (`ERR_CONNECTION_TIMED_OUT`) and native Chrome access timed out. Therefore
  375 px/1440 px, light/dark visual checks and browser interactions are not verified. The temporary
  local server was stopped. Real cross-device sync and live market responses were not exercised;
  no production data was read or written.
- Existing untracked `.agents/`, `.codex/`, and `PROMPT_Lanjutan_AssetRadar.md` were left untouched.

## Review (Claude)
PASS with one cleanup by Claude (2026-11-17): replaced the `journal` special case in the sync summary
with a proper `sync.col.journal` key (EN/ID). Checks: lint ok, 402/0 tests, build, i18n 0. Browser:
added a note on a test transaction (restored after): saved with txId and a real snapshot (price,
3 sentiment labels, evidence score). Cross-device sync not exercised.
