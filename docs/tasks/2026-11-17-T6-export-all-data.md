# Task: T6 — Export / import all owner data

**Status:** open (do after T9, so the journal is included)
**Written by:** Claude · **Date:** 2026-11-17 · **Plan:** `docs/plans/TRD.md` § T6

## Goal
One download with every synced collection (`SYNC_COLLECTIONS` in `src/utils/sync.ts`), and an import with
a preview and a choice. Complements the server backup (T4); owner-controlled.

## Allowed files
- New `src/utils/dataExport.ts` + new `src/utils/dataExport.test.ts`
- New `src/components/DataExportCard.tsx`; `src/components/SettingsView.tsx` (render it near the sync card)
- `src/i18n/en.ts`, `src/i18n/id.ts` (new keys `export.*` only)

## Design
- Read/write each collection **through the registered sync adapters** (`registerSyncAdapter` /
  `listAdapter` in `storage.ts`), not by guessing localStorage keys. If adapters are not exported for
  this use, export a read-only accessor from storage.ts — that one addition to `src/utils/storage.ts` is
  allowed; nothing else in it.
- File: `{ app: 'AssetRadar', version: 1, exportedAt, collections: { name: items } }`, name
  `assetradar-data-YYYY-MM-DD.json`. Never include sync tokens, passphrase or any credential.
- Import: parse + validate → preview table (items per collection, new vs existing) → choose
  **Merge** (existing sync rules: newest edit wins) or **Replace** (with a confirm dialog). Unknown
  collections are ignored and listed. After import, fire the existing local-change event so sync runs.

## Tests
round trip export → import (replace) into empty storage gives identical collections; merge keeps the
newer edit; file without `app: 'AssetRadar'` rejected; secrets never present in export.

## Done when
- [ ] Only allowed files changed
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0

## Do not
- Anything in AGENTS.md section 3. Plus: do not remove the existing portfolio-only export.

## Notes from Codex

## Review (Claude)
