# Task: T5 — Hard daily cap on Gemini calls

**Status:** done
**Written by:** Claude · **Date:** 2026-11-17 · **Plan:** `docs/plans/TRD.md` § T5

## Goal
The owner is about to add `GEMINI_API_KEY` to Cloud Run. Gemini is billed per call and the Cloud Run
spend cap does not cover it. Before the key goes live, every model call must pass a daily budget; over
budget the code returns `null`, and callers already fall back to their rule-based text.

## Allowed files
- `server/geminiPolicy.ts` + `server/geminiPolicy.test.ts` (pure budget logic)
- `server/gemini.ts` (check and count the budget inside `geminiGenerate`, expose usage in `geminiStatus()`)
- `.env.example` (one commented line `# GEMINI_DAILY_LIMIT=200`)

## Design
- In `geminiPolicy.ts`: `class DailyBudget` with `constructor(limit, dayOf = wibDate)`,
  `tryUse(now): boolean` (false when the WIB day's count reached the limit; resets on a new WIB day),
  `used(now)`, `load(day, count)`. Write the class without TypeScript parameter properties
  (tests run in strip-only mode). Limit from `GEMINI_DAILY_LIMIT` (integer ≥ 0, default 200;
  0 = Gemini off; invalid → 200).
- In `gemini.ts`: count **every model attempt** (fallback models cost too). Call `tryUse` right
  before each request; when it returns false, stop and return `null` without calling the API.
- Persistence: the instance restarts often on Cloud Run, so keep the count in the store under
  `gemini:usage:YYYY-MM-DD` (WIB). `gemini.ts` has no store today: add an optional setter
  `setGeminiUsageStore(store: KvStore)` and call nothing else from server.ts — **Claude** will wire it
  in server.ts after review. Without a store, the in-memory count still enforces the limit.
  Load once per day before the first call; save after each counted attempt (`.catch(() => {})`).
- `geminiStatus()` adds `{ usedToday, dailyLimit }`. Never the key.

## Tests (`geminiPolicy.test.ts`)
- limit 2: two `tryUse` true, third false; next WIB day true again (day boundary at 17:00 UTC)
- limit 0 → always false; invalid env → 200
- `load` with an existing count continues from it

## Done when
- [ ] Only allowed files changed; no change to server.ts or callers
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs --fail` = 0
- [ ] Notes: how a blocked call behaves and where the count is stored

## Do not
- Anything in AGENTS.md section 3. Plus: no change to model names, prompts, timeouts or callers;
  never log or return the key; no real Gemini calls in tests.

## Notes from Codex

- Added `DailyBudget` and strict environment-limit parsing in geminiPolicy.ts, with tests for two-call exhaustion, 17:00 UTC/WIB midnight reset, zero, invalid settings, loaded counts and prevention of same-day count rollback.
- geminiGenerate reserves usage for every model attempt, including fallback attempts. Exhaustion returns null before any API request, preserving callers' rule-based fallback. Existing model names, prompts, caller code and timeout values are unchanged. Status exposes usedToday and dailyLimit only, never credentials.
- Added optional `setGeminiUsageStore(store)`. When wired, usage is loaded once per WIB day from `gemini:usage:YYYY-MM-DD` (numeric count), and saved for each reserved attempt. Reservations and persistence are serialized within the process to prevent simultaneous calls overwriting newer usage. A store read failure blocks the attempt and allows a later read retry; save failures are swallowed as requested while the in-memory count remains enforced.
- Claude must wire the setter in server.ts after review. Until then enforcement is in-memory only and resets on restart. Failed persistence followed by restart, or multiple instances, is not a globally atomic spending cap. Limit is read when the module initializes; configuration changes require restart. This limits attempts, not currency/token costs.
- Conservative reservation can count an attempt that never reaches Gemini if the original deadline expires while waiting for usage persistence. This avoids exceeding the allowance; no reservation refund was added.
- PASS: lint; all 383 tests; build; i18n --fail (0 untranslated). Existing >500 kB build warning remains. No real Gemini, production or database calls were made. Tests verify pure budget behavior; deployed restart/persistence behavior was not exercised.
- Files changed: server/geminiPolicy.ts, server/geminiPolicy.test.ts, server/gemini.ts, .env.example (commented GEMINI_DAILY_LIMIT), and these notes. No server.ts/caller changes or commit.

## Review (Claude)
PASS (2026-11-17). Every model attempt is reserved before the request; over budget returns null
before any API call; store read failure fails closed. Claude wired `setGeminiUsageStore(store)` in
server.ts. Checks: lint ok, 383/0 tests, build, i18n 0. Not tested: real Gemini calls (key not attached yet).
