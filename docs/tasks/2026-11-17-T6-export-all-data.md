# Task: T6 — Export / import all owner data

**Status:** done
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
- [x] Only allowed files changed
- [x] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0

## Do not
- Anything in AGENTS.md section 3. Plus: do not remove the existing portfolio-only export.

## Notes from Codex

- Completed without committing. New files: `src/utils/dataExport.ts`,
  `src/utils/dataExport.test.ts`, `src/components/DataExportCard.tsx`. Updated
  `src/components/SettingsView.tsx`, `src/i18n/en.ts`, `src/i18n/id.ts`, and this task file.
  The only `src/utils/storage.ts` change is the permitted `getSyncAdapter()` accessor, which
  returns a frozen copy of the registered adapter's operations. No adapter behavior was changed.
- Added a Settings card beside Sync for downloading every collection in `SYNC_COLLECTIONS`,
  including the decision journal. The JSON envelope is `{ app, version, exportedAt, collections }`;
  `exportedAt` and item edit times are epoch milliseconds. The filename uses the WIB date:
  `assetradar-data-YYYY-MM-DD.json`. Collection items retain `{ v, t }`, including deletion markers.
  Exports read through sync adapters, not localStorage enumeration. Sessions, credentials,
  device-only caches and sync bookkeeping are excluded.
- Imports validate the envelope, version, timestamps, item IDs and record shapes before writing,
  reusing existing collection parsers. Unsafe object keys are rejected. Unknown collections are
  listed and ignored; a file with no recognized collections has its import buttons disabled.
  Preview shows live item counts, new/existing IDs and deletion-marker counts per collection.
- Merge uses `mergeSyncData`, including the forward-log resolver and tombstone expiry. Imported
  source edit times are retained, including newer timestamps for equal values, so subsequent
  imports still choose the newest source edit. Replace requires confirmation and treats restored
  items/deletions as new local edits so sync can propagate the deliberate replacement. Only
  collections listed in the file are replaced; absent collections are preserved.
- Owner explicitly instructed: "Batasi sesuai tugas, jangan perbaiki adapter" after the settings
  deletion limitation was identified. Accordingly, omitted settings and settings marked deleted
  remain on the device for both import modes. This limitation is explained in the preview and
  replacement confirmation. The existing adapter is unchanged. Existing portfolio-only export
  is untouched.
- Imports verify adapter writes and attempt rollback on failure. Incomplete rollback or failed
  sync bookkeeping produces an explicit partial-import error, never a success message. Settings
  rollback cannot remove a newly introduced setting because of the retained adapter limitation;
  this case is tested and reported as partial. Successful imports mark changed items dirty and
  dispatch the existing local-change and sync-applied events. The completion message asks the
  owner to reload to apply all restored settings.
- Final checks: `npm run lint` PASS; `npm test` PASS (414 tests, including 12 new export/import
  tests); `npm run build` PASS (existing >500 kB bundle warning); `node scripts/check-i18n.mjs --fail`
  PASS (0 untranslated); `git -c core.whitespace=cr-at-eol diff --check` PASS.
  Regression coverage includes all 12 collections round-tripping by value into empty storage,
  successive timestamp-aware merges, replace/deletion behavior, settings retention, unknown
  collections, invalid files, credential exclusion, write rollback and retry after metadata failure.
- Browser file-picker/download flows, 375 px/1440 px light/dark rendering, and real cross-device
  sync were not exercised. Tests used isolated in-memory browser storage; no real owner data,
  credentials, database or production service was read or written. No dependencies added.
- Existing untracked `.agents/`, `.codex/` and `PROMPT_Lanjutan_AssetRadar.md` remain untouched.

## Review (Claude)
PASS (2026-11-17), no changes needed. storage.ts diff = the allowed read-only accessor only. Settings
export holds only preferences (theme, timeframe, AI prefs, alert settings, kitchen basket) — no tokens.
Checks: lint ok, 414/0 tests, build, i18n 0. Browser: card renders; a crafted file showed the preview
(1 new journal item, unknown collection listed, settings note); cancelled, nothing written.
