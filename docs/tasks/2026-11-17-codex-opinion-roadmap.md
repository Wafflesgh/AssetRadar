# Task: Your opinion on the next features and infrastructure (no code)

**Status:** done
**Written by:** Claude · **Date:** 2026-11-17

## Goal
The owner wants a plan for new features: things Google Cloud (Cloud Run and other GCP products) makes
possible, and features outside GCP. Claude is the planner and makes the final decisions. Before that,
Claude wants **your independent view** as a second engineer who has read the current architecture.
This is a **read-and-write-an-opinion task only. Change no code.**

## Context to read first
- `CLAUDE.md` (whole file: architecture, rules, history)
- `docs/SETUP_CloudRun.md`, `Dockerfile`, `server/runtime.ts`, `.github/workflows/`
- Skim `server.ts` route list (do not read it whole) and `server/store.ts`

Facts and limits:
- Personal, non-commercial app; one owner (not a programmer), a few devices.
- Cloud Run asia-southeast1, max 1 instance, request-based billing, no min instances.
- Hourly Cloud Scheduler → `POST /api/cron/tick` (300 s budget). Database = Supabase (KV table).
- Cost guard: spend cap about Rp50.000/month plus budget alert. GCP free credit about Rp5,4 juta,
  expires 2027-02-12. `GEMINI_API_KEY` is not set yet.
- No paid data sources. No scraping where a site forbids it. Never dummy prices.

## Allowed files
- New file `docs/plans/codex-opinion.md` (create it). Nothing else, except "Notes from Codex" below.

## What to write in `docs/plans/codex-opinion.md` (English, be concrete)
1. **Current weak points** you see (reliability, cost, security, data freshness, cold starts, the
   single big `server.ts`, tests). Each with the file/area and why it matters.
2. **GCP features worth adding** (e.g. Secret Manager, Uptime checks/alerting, Error Reporting,
   Cloud Storage backups, Cloud Tasks, Pub/Sub, Firestore, Memorystore, Cloud CDN, Artifact Registry/
   Cloud Build, Vertex AI/Gemini, Cloud Run jobs, min instances, custom domain). For each: what it would
   do for this app, rough monthly cost at this scale, effort (S/M/L), and your verdict: do / later / no.
3. **Features outside GCP** worth building (product features for the owner, or other services).
   Same format: value, cost, effort, verdict. Respect the rules in `CLAUDE.md`.
4. **Your top 5 in order**, with one line each on why.
5. **Risks or things you would NOT do**, and why.

Keep it under about 250 lines. Mark guesses as guesses (e.g. prices you cannot verify).

## Done when
- [ ] `docs/plans/codex-opinion.md` exists and covers sections 1–5
- [ ] `git status` shows no other changed files (no code changes, so no lint/test needed)

## Do not
- Anything in AGENTS.md section 3. Do not open GCP or Supabase consoles or change anything live.

## Notes from Codex
<!-- Codex fills this in. -->
- Created `docs/plans/codex-opinion.md` covering weaknesses, GCP/product options with cost/effort/verdict, five priorities, and risks. No application code changed.
- Read required local context and targeted server routes. The graph index points to an old workspace and reports missing freshness; used local source instead. Consulted public official Google documentation only; no consoles, secrets or live systems accessed.
- Highlighted conflicting cost-cap documentation, freshness versus liveness, process-local concurrency, backup enumeration/restore risks, and bounded deployment testing. Unverified prices are marked as guesses.
- PASS: lint, 368 tests, build, i18n (0 untranslated). Ran the four checks to satisfy AGENTS.md's mandatory workflow despite this task's documentation-only exemption. Build retains the >500 kB chunk warning.
- Existing untracked `.agents/`, `.codex/`, and `PROMPT_Lanjutan_AssetRadar.md` were left untouched; this task file was already untracked. Only the new plan and these notes were authored for this task. No commit.
- Not checked: live IAM/billing/caps, actual performance or freshness, restore execution, browser UI, and complete security/test coverage. These limitations are explicit in the plan.

## Review (Claude)
<!-- Claude fills this in. -->
PASS. Opinion is solid; claims verified in code (one was wrong on Cloud Run). Decisions in docs/plans/DECISIONS.md, plan in ROADMAP.md and TRD.md.
