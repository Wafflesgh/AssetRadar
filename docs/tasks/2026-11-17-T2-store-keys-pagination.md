# Task: T2 — Paginate `SupabaseStore.keys()`

**Status:** done
**Written by:** Claude · **Date:** 2026-11-17 · **Plan:** `docs/plans/TRD.md` § T2

## Goal
`SupabaseStore.keys(prefix)` in `server/store.ts` (around line 91) makes one PostgREST request.
PostgREST caps a response at its max-rows setting (default 1000), so once a prefix has more keys the
list is silently cut. `snap:` (one key per day) will hit this in about 2.7 years; backups (T4) will
need every key. Return all matching keys.

## Allowed files
- `server/store.ts` (only `SupabaseStore.keys`, plus a page-size constant if needed)
- `server/store.test.ts`

## Steps
1. Change `SupabaseStore.keys` to fetch pages with the `Range` request header (`Range: 0-999`,
   `1000-1999`, …; keep `order=key.asc` and `select=key`) and stop when a page returns fewer rows than
   the page size. Keep using `this.call` and `this.headers()` (add the `Range` header to them) so
   error handling stays the same.
2. Keep the prefix escaping exactly as it is. Do not change `MemoryStore` or any other method.
3. Add a test in `server/store.test.ts` with a fake `fetch` (follow how the file already fakes
   requests) that serves 1005 keys in pages of 1000 and asserts `keys()` returns all 1005 in order and
   made 2 requests. Add one test for an empty result (1 request, `[]`).

## Done when
- [ ] `git diff` touches only the two allowed files
- [ ] New tests pass and existing store tests still pass
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs` = 0

## Do not
- Anything in AGENTS.md section 3. Plus: no change to callers in `server.ts`, no new dependency,
  no real network in tests.

## Notes from Codex

- Changed only `SupabaseStore.keys()` in `server/store.ts`: sequential 1000-row Range pages, stopping on a short page. Preserved prefix escaping, key ordering, selected column, headers and shared error handling. Callers and MemoryStore are unchanged.
- Added two isolated fake-fetch tests in `server/store.test.ts`: 1005 ordered keys with exactly `0-999` and `1000-1999` requests, and an empty result with one request. The first also checks prefix escaping and query parameters. Mocks are restored by the test context; no real network or credentials used.
- PASS: `npm run lint`; `npm test` (370 passed, 0 failed); `npm run build`; `node scripts/check-i18n.mjs` (0 untranslated). Build retains the >500 kB chunk warning.
- No production/database access or commit. Live PostgREST behavior was not tested. As specified, pagination assumes the server can return the requested 1000 rows; a lower configured max-rows cap or concurrent key changes requires separate consideration.
- Out-of-scope observation: `scripts/check-i18n.mjs` documents that `--fail` is needed for a nonzero exit on untranslated text. The T1 Docker command omits that flag; Claude should review the i18n deploy gate separately. No T1 files changed here.

## Review (Claude)
PASS (2026-11-17). Diff limited to keys() and its tests; error handling and escaping kept.
Accepted limit: assumes PostgREST max-rows >= 1000 (Supabase default). Good catch on T1: Claude added
`--fail` to the Dockerfile i18n check in the same commit. Re-ran checks: lint ok, 370/0 tests, build, i18n 0.
