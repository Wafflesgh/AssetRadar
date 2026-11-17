# AssetRadar — Instructions for Codex (executor)

You are the **executor** on this project. Claude Code is the **lead**: it writes tasks, reviews your
work, commits and pushes. The owner (Dilan, not a programmer) carries messages between you. Reply to
the owner in simple Indonesian.

## 1. Read first
- `CLAUDE.md` is the single source of project rules and architecture. **Every rule in it applies to
  you.** If this file and `CLAUDE.md` disagree, `CLAUDE.md` wins (except the workflow below).
- Then read the task file you were given in `docs/tasks/`. Work **only** on that task.

## 2. Workflow (never skip)
1. Do only what the task file asks. Touch only the files it allows. Something else looks broken?
   Write it under "Notes from Codex" in the task file; do not fix it.
2. When done, run and make sure all pass:
   `npm run lint` · `npm test` · `npm run build` · `node scripts/check-i18n.mjs` (must be 0).
3. Fill "Notes from Codex" in the task file: files changed, what you did, the check results
   (pass/fail with the error), anything you could not do or check.
4. Stop. Tell the owner (in Indonesian): "Selesai, silakan minta Claude untuk review."
5. If the task file has a "Review" section with fixes, do only those fixes, then repeat steps 2–4.

## 3. Never do (stop and ask the owner instead)
- `git commit`, `git push`, `git reset`, `git checkout -- …`, `git stash`, rebase, branch switching,
  or deleting files you did not create in this task.
- Write, print, log, copy or send any secret (API keys, tokens, passwords). Never open, edit or
  commit `.env`. Never put a key in code.
- Write to the database or production: no Supabase writes/migrations/deletes, no Cloud Run, Cloud
  Scheduler, GitHub secrets or Vercel changes. Read-only lookups only if the task asks.
- Change these without the task saying so explicitly:
  - `server.ts` routes, `server/store.ts`, `server/runtime.ts`, `server/sync.ts`, `server/push.ts`
  - `src/utils/storage.ts` keys, `src/utils/sync.ts`, `supabase/`, `Dockerfile`, `.github/workflows/`
  - `package.json` / `package-lock.json` (no new dependencies), `vite.config.ts`, `public/sw.js`
  - `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.codex/`
- Remove or weaken the disclaimers, show sample/dummy prices, add UI text outside `src/i18n/`
  (`en.ts` **and** `id.ts`), remove tests, or rewrite tests just to make them pass.
- Rebuild the position-size calculator (removed on purpose), or put back the past trend in the
  Monte Carlo simulation.
- Large refactors, renames or reformatting of code the task does not need.

## 4. When unsure
Stop and ask the owner one short question in Indonesian. Guessing on anything above is worse than
asking.
