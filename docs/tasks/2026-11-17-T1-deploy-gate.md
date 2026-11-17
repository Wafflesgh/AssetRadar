# Task: T1 — Deploy gate in the Dockerfile

**Status:** done
**Written by:** Claude · **Date:** 2026-11-17 · **Plan:** `docs/plans/TRD.md` § T1

## Goal
Cloud Build deploys every push to `main` by building the `Dockerfile`. Today it only runs
`npm run build`, so a commit with failing lint or tests still goes live. Make the image build fail
when lint, tests or the i18n check fail, so Cloud Run keeps the previous revision.

## Allowed files
- `Dockerfile` (explicitly allowed for this task)

## Steps
1. In `Dockerfile`, after `COPY . .` and before `RUN npm run build`, add one line:
   `RUN npm run lint && npm test && node scripts/check-i18n.mjs`
   with a one-line English comment explaining why (a failing check stops the deploy).
2. Confirm the tests need no network and no secrets: run `npm test` once with networking unavailable
   if you can, or grep the tests for `fetch(` against real hosts. Report what you found; do not change
   tests.
3. If Docker is available locally, run `docker build .` and report the result and the extra build time.
   If Docker is not available, say so (do not install it).

## Done when
- [ ] `git diff` shows only the Dockerfile (comment + one RUN line)
- [ ] `npm run lint`, `npm test`, `npm run build` pass; `node scripts/check-i18n.mjs` = 0
- [ ] Notes say whether tests touch the network and whether `docker build` was tried

## Do not
- Anything in AGENTS.md section 3. Plus: do not change `ENV`, `CMD`, the base image, `npm ci`, or
  add a `.dockerignore` in this task.

## Notes from Codex

- Changed `Dockerfile` only: added the requested English comment and `RUN npm run lint && npm test && node scripts/check-i18n.mjs` between `COPY . .` and the existing build. A nonzero check exits the image build before deployment. Updated these notes as required by AGENTS.md.
- PASS: `npm run lint`; `npm test` (368 passed, 0 failed); `npm run build`; `node scripts/check-i18n.mjs` (0 untranslated texts). Build emitted the existing >500 kB chunk warning.
- Used the permitted static network check: searched all `src/**/*.test.ts` and `server/*.test.ts` for `fetch(`, HTTP/network imports, Axios, WebSocket, `process.env` and dotenv; no matches. URL matches were fixture data or URL/parser assertions, not real-host fetch calls. No real secrets were supplied or .env files opened. This supports offline test suitability but is not an enforced network-isolated execution or a complete transitive-import audit.
- Docker CLI is unavailable on PATH (`Get-Command docker` found nothing), so `docker build .` was not attempted and actual extra Docker build time could not be measured. No installation performed. Local added checks took approximately 14.2 seconds combined (lint 8.3 s, tests 5.4 s, i18n 0.5 s); this is not a Docker/Cloud Build timing estimate.
- No tests, dependencies, ENV, CMD, base image or npm ci changes. No commit or production changes. Pre-existing untracked files, including the T2 task, were left untouched.

## Review (Claude)
PASS (2026-11-17). Diff is the comment + one RUN line. Checked the Linux shell glob in `npm test`:
all 64 test files sit one folder deep, so `/bin/sh` without globstar still runs every test. Re-ran
all four checks locally. Docker not tried locally; first Cloud Build after push is the real proof.
