# Decision log — roadmap after Codex review (2026-11-17)

Planner and decision owner: Claude. Input: `docs/plans/codex-opinion.md` (Codex, independent view).
Every Codex claim below was checked against the code before deciding.

## Verified claims

| Codex claim | Check | Result |
|---|---|---|
| `SupabaseStore.keys()` has no pagination | `server/store.ts:91-95`: one GET, no `Range`/`limit` | **True.** PostgREST returns at most its max-rows (default 1000). Today keys are per day/month (`snap:`, `analysis:`, `brief:`, `sentcalls:`, `arena:`, `forward:`); `snap:` reaches 1000 in ~2.7 years, then date lists silently truncate. Latent bug → fix (T2). |
| Cost docs conflict | `docs/SETUP_CloudRun.md:13` says "no automatic cap"; CLAUDE.md says spend cap Rp50.000 | **True.** Owner must confirm in console which is real; fix the doc (Phase 0). |
| Health probe may trigger expensive due jobs | `server.ts` `checkDueJobsSoon` returns at once when `CLOUD_RUN` | **False on Cloud Run.** Uptime check on `/api/health` is safe. |
| No owner data export | `PortfolioView` already has JSON export/import | **Partly false.** Only portfolio. Extend to all synced collections (T6). |
| No deploy gate | Cloud Build builds the Dockerfile on push; Dockerfile only runs `npm run build` | **True.** Tests and lint do not block a deploy. |
| No backup / restore drill | grep: no server backup code | **True.** |
| SSE keeps Cloud Run billed while a tab is open | `server/runtime.ts` streams on Cloud Run | **True by design** (known since 13 Nov). Measure, do not change yet. |

## Decisions

| # | Item | Codex | Claude decision | Why |
|---|---|---|---|---|
| D1 | Data freshness view + overdue alert | Do, #1 | **Accept, Phase 1** | Stale data shown as live is the biggest trust risk. Reuse `/api/diagnostics` and `jobs:state`. |
| D2 | Backups to Cloud Storage + restore drill | Do, #2 | **Accept, Phase 1**, only user data (synced collections, trace, arena, analyst) | Sync copies mistakes too; history (trace, arena) cannot be rebuilt. Market caches are reproducible → skip. |
| D3 | Deploy gate | Do via GitHub CI + Cloud Build coordination | **Accept, smaller form**: run `npm run lint && npm test` inside the Dockerfile before build | One line; a failing test fails the Cloud Build, so the live app keeps the old revision. No second pipeline. |
| D4 | Fix `keys()` pagination | Mentioned as backup risk | **Accept, Phase 1** (small, do first) | Real latent bug, independent of backups. |
| D5 | Secret Manager | Do after checking | **Accept, Phase 0 check only** | Move secrets only if they are plain env vars now; no code change needed. |
| D6 | Uptime check + alerting | Do | **Accept, Phase 0 (console)** + freshness alert in Phase 1 | Free at this scale, owner clicks only. |
| D7 | Error Reporting + structured logs | Do | **Accept, light**: Cloud Run already sends stderr; only make job failures log one structured line | Avoid a logging framework. |
| D8 | Gemini pilot | Later | **Move up to Phase 2** with hard caps | Code is ready (`server/gemini.ts`, non-AI fallback), owner asked, credit expires Feb 2027. Cap calls per day; never send portfolio/notes. |
| D9 | Weekly watchlist digest | Do (#5) | **Accept, Phase 2** as part of Brief | Uses existing data, no new source. |
| D10 | Full owner export/import | Do | **Accept, Phase 2**, extend existing portfolio export | Complements server backup; owner-controlled. |
| D11 | Portfolio concentration view | Later | **Later** | Needs sector/currency classification check first. |
| D12 | Decision journal | Later | **Later** (needs new sync collection) | Nice, not urgent. |
| D13 | Cloud Tasks, Cloud Run Jobs | Later | **Later**, only if freshness view proves ticks miss deadlines | Measure first. |
| D14 | Pub/Sub, Firestore, Memorystore, CDN, min instances, extra monitoring vendor | No | **Reject** | Cost or complexity without a need at one owner / one instance. |
| D15 | Custom domain | Later, optional | **Later, owner's choice** | No reliability gain. |
| D16 | Split `server.ts` | Only when a task needs it | **Agree** | No big rewrite. New code for T1–T3 goes in new `server/` modules. |

## Where I disagreed with Codex
1. The health-probe risk does not apply on Cloud Run (D6).
2. Owner export partly exists (D10).
3. The deploy gate is simpler inside the Dockerfile than a second CI pipeline (D3).
4. Gemini earlier than Codex suggested, because the owner wants it and the credit expires (D8).

## Update 2026-11-17 — Gemini parked
T5 (daily cap) is live and verified (count persists across restarts). Both keys tried (a service-account
bound Cloud key and an AI Studio key) were rejected with an auth error. Owner decided to park Gemini:
it only rewrites summaries; all scores are rule-based. Remove the `GEMINI_API_KEY` reference from
Cloud Run; the code keeps the non-AI text. Retry later by checking `gemini.lastError.reason` in
`/api/diagnostics` after attaching a key.
