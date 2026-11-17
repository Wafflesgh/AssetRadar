<!-- Independent engineering opinion for Claude's roadmap review; no implementation authorized here. -->
# AssetRadar: independent roadmap opinion

Date: 2026-11-17. Audience: Claude (planner) and Dilan (owner).

My recommendation is to make the existing app easier to trust and recover before adding more infrastructure or prediction features. Keep Cloud Run and Supabase. Spend the temporary credit on bounded experiments, not permanent commitments.

## Basis and limits

- Read CLAUDE.md, the Cloud Run setup guide, Dockerfile, runtime/store modules, the workflow, and the server route list plus targeted route bodies. This is an architecture opinion, not a security audit or a live health report.
- The codebase-memory project points to the old `D:/Asset Radar/assetradar` location, indexed 2026-10-21. Coverage reported missing freshness for the five infrastructure paths queried. Local source takes precedence; no reindex or configuration changes were made.
- Production settings, billing, backup availability, IAM and real latency were not inspected. The task's one-owner, one-instance, hourly-tick and credit-expiry facts are assumptions supplied by the project.
- Effort: S = roughly half to two engineering days; M = three to five; L = more than a week, including verification. These are estimates, not delivery promises.
- Monthly costs below are incremental planning estimates in USD, excluding tax, engineering time and promotional credits. Do not add mutually exclusive alternatives together. Free allowances may already be consumed by other projects. Unverified estimates are explicitly marked **guess**.
- Cost assumptions: one owner, a few devices, under 1 GiB of retained compressed backups, under 1 GiB/month of logs, fewer than 10,000 small queue operations, and limited builds. Actual traffic and source latency must be measured.

## 1. Current weak points

| Area / evidence | Why it matters | Smallest useful response |
|---|---|---|
| Cost: `server/runtime.ts` enables SSE on Cloud Run; open streams keep requests active. | One instance limits parallel capacity, not accumulated billed hours. A dashboard left open can dominate hourly-job costs. | Measure active instance time and browser idle behavior for a week; offer an explicit low-data mode if needed. |
| Cost documentation: CLAUDE.md records a Cloud Run spend cap, while `docs/SETUP_CloudRun.md` says no automatic cap exists. | The older guide can mislead the owner. Current Google docs distinguish real spend caps from alerts-only budgets. A Cloud Run cap does not establish a cap for every other service. | Claude should separately reconcile the guide and verify cap scope and enforcement behavior. A declined card is not a reliable spending limit. [Spend-cap documentation](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps). |
| Freshness: hourly tick, finite 300-second budget, many scan families; `server.ts` can record `no time left`. | HTTP success does not prove all datasets advanced. Missing observation dates can permanently weaken forward-test records. | Report per-dataset last successful update, progress and age against its own cadence; distinguish market closure from stale data. |
| Health: `/api/health` returns process status; `/api/cron/tick/last` exposes a separate persisted summary. | A healthy web process may serve old data or have a failing database. | Keep liveness cheap; add a separate sanitized freshness summary and an overdue-job alert. Avoid repeatedly invoking expensive diagnostics. |
| Persistence: `server/store.ts` falls back to memory when configuration is incomplete. | A deployment can appear functional while new durable state is lost after restart. | Surface `persistent=false` prominently and fail durable operations clearly in production; retain memory mode for tests/local work. |
| Store consistency: `KeyedMutex` and tick-running state are process-local. | They do not coordinate separate revisions, workers or future instances. Read-modify-write can lose updates under overlapping writers. This is a design risk, not a demonstrated incident. | Keep the present topology; require durable idempotency/concurrency design before adding workers or scaling. |
| Store enumeration: `SupabaseStore.keys()` has no pagination in the adapter. | Large key sets can be truncated by an API row limit, particularly in future backups. Actual configured limit was not checked. | A backup must use verified paginated enumeration and reconcile counts, not assume `keys()` is exhaustive. |
| Recovery: the reviewed deployment/runtime files do not establish a tested restore procedure. | Sync propagates changes, including mistakes; it is not an independent backup. | Establish private versioned exports and prove recovery in an isolated local store. Existing backup mechanisms elsewhere remain unverified. |
| Cold starts: Dockerfile installs all dependencies, copies the repository, builds in the same image, and starts TypeScript through `tsx`. | Image size and module initialization may increase startup delay; no timings measured. | Measure first-response time and image size, then consider a runtime image reduction only if significant. Do not turn on minimum instances first. |
| Reliability: `server.ts` contains route registration beyond line 6,000 plus orchestration and caches. | A change to one feature can affect scheduling, startup or shared state. | Extract a bounded route family only when a real task needs it, with contract tests. Avoid a wholesale rewrite. |
| Security/cost exposure: public market and compute routes coexist with authenticated cron and owner routes. | Expensive public reads may consume source quotas and compute. Route names alone cannot prove authorization bugs. | Review rate limits, input bounds, caching and authentication before enabling paid AI; preserve existing cron/owner checks. |
| Tests/deployment: 65 test files were found; the inspected workflow only calls daily jobs and retries HTTP failures. | Pure logic tests do not establish production restart/retry behavior. Docker build alone is not the four-check quality gate. Other remote CI was not inspected. | Add a pre-deploy gate and focused tests for duplicate cron, database timeout, stale data and restart recovery in separate tasks. |
| Scheduling: GitHub daily calls and Cloud Scheduler tick both exist; API middleware also checks due jobs. | Retries and overlapping triggers need safe deduplication. A 200 response may still contain failed substeps. | Test overlap and alert on substep failures; preserve the useful 07:35/16:20 timing until an equivalent schedule is demonstrated. |

## 2. GCP options

| Option | Concrete value for this app | Incremental monthly cost | Effort | Verdict |
|---|---|---|---|---|
| Secret Manager | Reference secret versions from the runtime service account; narrow IAM and make rotation deliberate. Never expose values in UI/logs. | About $0–0.36 for 6–12 active versions in one billed location and low access volume, if allowance remains; old retained versions add cost. [Pricing](https://cloud.google.com/secret-manager/pricing). | S | **Do** after checking whether already configured. |
| Monitoring uptime checks + freshness alerts | Check lightweight liveness every 10–15 minutes; separately alert on overdue successful tick/daily output. Send one failure and one recovery notification. | Monitoring checks likely $0 within allowance; **guess** $0–1 extra runtime from probes. Alerting pricing can change. [Pricing](https://cloud.google.com/products/observability/pricing). | M | **Do**; first ensure the health probe does not initiate expensive due work via API middleware. |
| Error Reporting + structured logs | Group recurring exceptions; log job name, duration and outcome without portfolio data, tokens or response bodies. | Error Reporting has no direct charge; logging likely $0 at assumed volume. [Pricing](https://cloud.google.com/products/observability/pricing). | S | **Do**, with bounded retention and no per-price-tick logs. |
| Cloud Storage backups | Private daily exports of durable user/history state, manifest/checksum and version; retain 7 daily + 4 weekly copies, restore locally. Skip reproducible market caches initially. | **Guess** $0.10–1 for under 1 GiB including small operations; Supabase egress/export compute extra. Singapore is not assumed to qualify for US storage free tier. [Pricing](https://cloud.google.com/storage/pricing). | M | **Do**, only with pagination, schema checks, restricted access and a restore drill. |
| Cloud Tasks | Bounded retries and pacing for a scan that demonstrably misses its deadline. | **Guess** queue $0 at under 10,000 small operations; worker CPU/egress additional. [Pricing](https://cloud.google.com/tasks/pricing). | L | **Later**, after durable idempotency and measured backlog. Delivery retries must not duplicate records or notifications. |
| Pub/Sub | Fan out one event to multiple independent consumers. | **Guess** $0–1 transport at tiny volume; consumers additional. | L | **No** now: one app has no demonstrated fan-out need. |
| Firestore | Alternative durable document database. | **Guess** $0–2 at small usage; migration/dual-write effort dominates. | L | **No**: Supabase already serves this role. |
| Memorystore | Shared hot cache across many workers. | **Guess** tens of dollars or more for a provisioned service; exact configuration unpriced. | M | **No**: one instance and a tiny budget do not justify it. |
| Cloud CDN + load balancer | Cache static assets closer to users. | **Guess** $20–30+ for a typical load-balancer-based setup before significant transfer. | M | **No**: few nearby devices; never cache owner APIs publicly. |
| Cloud Build / Artifact Registry hygiene | Keep the existing deployment approach; add test gating, retain a few rollback images, and clean old images. | **Guess** $0–2 at limited builds and a few GiB of images; measure actual image size. [Registry pricing](https://cloud.google.com/artifact-registry/pricing). | M | **Do** incrementally, not a second deployment pipeline. |
| Gemini / Vertex AI | Optional explanation of already-computed facts with source links and timestamps; no invented prices or changed statistical verdicts. | **Guess** $1–5 for a strictly bounded pilot, not a verified model quote. Reprice chosen model, tokens, retries and grounding before enabling. | M; Vertex migration L | **Later**: use existing Gemini abstraction first, cap requests/tokens, cache EN/ID separately, preserve non-AI fallback. |
| Cloud Run Jobs | Isolate genuinely long batch processing from interactive requests. | **Guess** $0–5 for short daily batches if allowances remain; compute is additional unless replacing existing work. [Run pricing](https://cloud.google.com/run/pricing). | L | **Later** only after deadline measurements; reuse job logic and make ownership explicit. |
| Minimum instances | Reduce cold-start waiting. | **Guess** several to tens of dollars, depending on memory/billing/active time. [Run pricing](https://cloud.google.com/run/pricing). | S | **No** now: retain zero minimum and measure latency first. |
| Custom domain | More memorable personal URL. | **Guess** $1–2/month equivalent for annual registration, potentially much more with a load balancer. | S–M | **Later**, purely optional; no reliability benefit. |

These ranges are screening estimates, not a promise that total spending stays below Rp50,000. Start with measurement and at most the small reliability additions. Review gross costs before the supplied 2027-02-12 credit expiry. Open SSE and hourly batches can share billed time, so do not blindly sum their durations. [Cloud Run billing](https://docs.cloud.google.com/run/docs/configuring/billing-settings).

## 3. Product features and services outside GCP

These extend existing features rather than duplicate Brief, Alerts, Portfolio, DCA, Paper Trading or the AI arena. Cost estimates assume existing data and hosting; engineering effort is separate.

| Feature | Owner value and minimal scope | Monthly cost | Effort | Verdict |
|---|---|---|---|---|
| Unified data-health view | Extend Settings diagnostics with dataset age, source, next expected update, market closure and last successful job. Link stale cards to it. | $0 new vendor fees; **guess** negligible added compute using stored status. | M | **Do** first. |
| Portable owner-data export/import | Versioned download, import preview, validation and explicit conflict choices for existing synced collections; exclude tokens and credentials. Complements server backups. | $0 vendor fees, browser work. | M | **Do** after recovery format is agreed. |
| Weekly watchlist change digest | Extend Brief with changes since last week, upcoming known events and stale-data omissions. Deterministic text first; existing notification channels only if owner enables them. | $0 new service fees; **guess** $0–1 compute. | M | **Do** after freshness checks; no new news provider. |
| Portfolio concentration view | Extend existing analytics with asset/sector/currency exposure and clearly identified unknown coverage; no target allocation or buy/sell instruction. | $0 new service fees, browser computation. | M | **Later**, validate classification and currency inputs first. |
| Decision journal | A short personal note attached to an asset and dated evidence snapshot, followed by a later review. Preserve snapshot date and data quality. | $0 new vendor fees; **guess** small storage growth. | M | **Later**, would need an explicitly approved synced collection. |
| Watchlist calendar digest | Reuse current calendar/dividend/SBN data for a weekly list with source dates and missing-data labels. Avoid duplicating alert delivery. | $0 new fees; **guess** negligible incremental processing. | S–M | **Later**, potentially merge into weekly digest. |
| GitHub CI quality gate | Run lint, tests, build and i18n checks before deployment; add a handful of orchestration failure tests, not hundreds of snapshot tests. | **Guess** $0 within account minutes, otherwise usage-based; quota unverified. | M | **Do**, coordinated with Cloud Build trigger so failures really block deployment. |
| Another external monitoring service | Independent outage notification. | **Guess** $0–5 depending on plan/interval. | S | **No** initially: duplicate alert systems increase owner noise; reconsider if GCP alerts prove insufficient. |

## 4. Top five, in order

1. **Freshness visibility and overdue-job alerting** — make stale or incomplete results obvious before adding more analysis.
2. **Recoverable private backups plus portable export** — prove the owner's history can survive accidental deletion or a bad deployment.
3. **Deployment gate and failure-path tests** — catch regressions before they reach the single live instance.
4. **Secret/IAM and cost-control verification** — confirm least privilege and the real cap scope; measure billed active time before the credit expires.
5. **Weekly watchlist change digest** — deliver a small, useful product improvement from data already collected.

Acceptance targets for the first phase: one deliberately stale fixture produces a clear warning; a failed job produces one alert; a backup restores matching record counts in isolation; a failing test blocks deployment; a week of measured usage supports a post-credit budget. All require separate implementation tasks and authorized configuration work.

## 5. Risks and things I would not do

- Do not treat a budget alert, one-instance setting or card limit as a global bill ceiling. Real Cloud Run spend caps are documented, but service scope and actual configuration need verification. Cap enforcement also means an availability tradeoff.
- Do not add Firestore, Redis, Pub/Sub or a second worker merely because credit is available. Credit expiry leaves ongoing maintenance and charges.
- Do not increase scan frequency before measuring provider errors, deadlines and durable progress; more retries can worsen free-source throttling.
- Do not reconstruct missed forward-test predictions using today's information. Mark gaps; keep out-of-sample evidence and sample-size requirements intact.
- Do not offer autonomous trading, unvalidated AI picks, investment promises or paid data feeds. Do not restore the removed position-size calculator or Monte Carlo historical drift.
- Do not scrape forbidden sources or invent replacement prices. Keep official TradingView attribution and existing disclaimers.
- Do not enable AI on every tick or send personal holdings/notes to an external model by default. Model fallback chains also need a shared usage budget.
- Do not claim backups are safe until restore, pagination, retention and access controls are tested. Scheduled exports can be inconsistent during writes; define snapshot semantics first.
- Do not claim this review proves endpoint security, production freshness or test coverage. Those require bounded follow-up tasks, not assumptions from architecture documentation.
- Keep every new UI string in EN and ID, preserve mobile/accessibility behavior, and use existing sync/storage patterns. Claude should turn selected items into small allowed-file tasks.
