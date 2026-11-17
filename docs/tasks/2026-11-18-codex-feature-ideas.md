# Task: Your feature ideas for the next round (no code)

**Status:** done
**Written by:** Claude · **Date:** 2026-11-18

## Goal
The owner wants new features. Claude leads planning and will compile ideas from both of us, then
write the TRD. Give your **independent** list. This is a read-and-write task only. **Change no code.**

## Read first
- `CLAUDE.md` (features, rules, constraints), `docs/plans/ROADMAP.md`, `docs/plans/PLAN_MyPortfolio.md`
  (what was just built: freshness, backups, export/import, concentration, journal, portfolio tabs,
  sector 1M, weekly digest). Do not repeat those.
- Skim the menu groups in `src/components/Navigation.tsx` to see every page that exists.

## Constraints (hard)
- Personal app, one owner (not a programmer), Indonesia. Budget: plan under Rp50.000/month in GCP.
- Free data only; no scraping where forbidden; never dummy prices.
- Information/education only: no buy/sell instructions, no profit promises, disclaimers stay.
- Gemini is parked (no AI-written features unless they work without it).

## Allowed files
- New `docs/plans/codex-feature-ideas.md` (create). Nothing else except "Notes from Codex" below.

## What to write (English, concrete, ≤150 lines)
For 6–10 ideas, each: **name**, the owner's problem it solves, which existing data/endpoints it reuses
(name files), new data needed (must be free), effort S/M/L, risks (rules above, cost, data quality),
and your priority (high / medium / low). End with your top 3 in order and one line why.
Mark guesses as guesses.

## Done when
- [ ] `docs/plans/codex-feature-ideas.md` exists; `git status` shows no other change
- [ ] No lint/test run needed (no code)

## Do not
- Anything in AGENTS.md section 3. No consoles, no live systems.

## Notes from Codex

- Created `docs/plans/codex-feature-ideas.md`: six independent proposals in English, each with
  the owner's problem, concrete behavior, existing files/endpoints, new-data needs, effort,
  priority, and risks. Ends with an ordered top three and reasons.
- Read the required project rules, roadmap, portfolio plan, navigation groups, and relevant
  source excerpts. Proposals reuse existing data and work without Gemini or new cloud services.
- Checks: manually checked required fields and scope; document length and referenced paths
  checked locally. Lint, tests, build, and i18n checks were not run: this task explicitly
  requires documentation only and waives code checks.
- No code, consoles, live systems, production data, or Git commits changed. Effort and cost
  expectations are marked as guesses; live coverage and billing remain unverified.
- Existing untracked `.agents/`, `.codex/`, and `PROMPT_Lanjutan_AssetRadar.md` were left untouched.
  The task file was already untracked; only this Notes section was edited.

## Review (Claude)
PASS. Six solid, grounded ideas; compiled with Claude's in docs/plans/FEATURES_2026-11-18.md.
