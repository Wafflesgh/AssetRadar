<!-- Independent feature proposals grounded in the existing app; no implementation or live checks. -->
# Next-round feature ideas — Codex, 18 November 2026

These proposals extend existing pages for one Indonesian owner. They do not repeat freshness,
backups, export/import, concentration, the journal, portfolio tabs, sector 1M, or weekly digests.
Sources reviewed: `CLAUDE.md`, `docs/plans/ROADMAP.md`, `docs/plans/PLAN_MyPortfolio.md`,
`src/components/Navigation.tsx`, and the relevant source files named below.

All effort ratings are guesses: S = a small local addition; M = several calculations/UI states;
L = substantial new data handling. Priority is my judgment, pending the owner's preferences.
All proposals work without Gemini, paid feeds, new scraping, cron jobs, or new cloud services.
Prefer calculations on demand in existing pages, with cached requests only for selected assets.
Guess: incremental hosting cost should be small; total GCP cost below Rp50,000/month must still
be checked against actual billing. No live cost or provider availability was checked here.
All implementations must retain disclaimers, EN/ID text, missing-data states, and source dates.

## 1. Recorded transaction-cost summary
- **Owner problem:** Fees are entered per trade, but their accumulated cost is hard to see.
- **Feature:** In Portfolio, show monthly/yearly recorded fees, grouped by asset and currency,
  plus fees as a percentage of recorded traded value. Start with separate currency totals.
- **Reuse:** `PortfolioTx.fee`, quantity, price, date, and `tradeUnitOf` in
  `src/utils/portfolio.ts`; existing transactions displayed by `src/components/PortfolioView.tsx`.
  No endpoint needed and no change to existing profit/loss calculations.
- **New free data:** None; owner-entered fees already exist.
- **Effort / priority:** S / **high**.
- **Risks:** Zero fees may mean omitted input; say "recorded fees", not total actual costs.
  Never add different currencies together or invent tax rates. Browser-only, no new server cost.

## 2. Compare returns in Rupiah and explain the exchange-rate effect
- **Owner problem:** A foreign asset's quoted gain can differ from its Rupiah gain.
- **Feature:** Extend Compare with original-currency versus IDR performance, initially for USD
  assets with USD/IDR history. Show asset return, FX return, and their combined return separately.
- **Reuse:** `src/components/CompareView.tsx`, `src/utils/compare.ts`,
  `fetchDailyHistory` in `src/services/marketDataService.ts`, and `/api/market/daily?symbol=`.
  Reuse the historical FX approach in `src/components/PortfolioAnalytics.tsx`.
- **New free data:** None; existing asset and USD/IDR daily histories.
- **Effort / priority:** M / **high**.
- **Risks:** Combined return compounds asset and FX returns; it is not their simple sum.
  Align dates, normalize cents, and expose missing FX history; never substitute today's rate.
  This is price performance, not personal net profit or a buy/sell signal. Cache one FX request.

## 3. Side-by-side company financial trends
- **Owner problem:** Comparing two businesses requires switching between separate statements.
- **Feature:** Add a two-company panel to Compare: three reported annual periods of margins,
  ROE, debt/equity, and operating cash flow, with period dates and source/derived labels.
- **Reuse:** `src/components/CompareView.tsx`, `src/components/FinancialStatementsPanel.tsx`,
  `src/utils/statements.ts`, and `/api/fundamentals/statements?symbol=&period=annual`.
- **New free data:** None; already available statements, with gaps left empty.
- **Effort / priority:** M / **high**.
- **Risks:** Fiscal year ends, accounting definitions, and sectors differ; banks need appropriate
  metrics. Keep absolute cash flow in each reporting currency. Do not rank a "best investment".
  Load only the two selected companies through existing caches, never the whole market.

## 4. Drawdown duration and recovery history
- **Owner problem:** The deepest decline alone does not show how long past losses lasted.
- **Feature:** Extend Stock Story with the three deepest non-overlapping decline episodes:
  peak, trough, recovery date, and elapsed calendar days. Mark an ongoing episode "not recovered
  within available history", with the last observed date; never predict its recovery date.
- **Reuse:** `priceFacts` in `src/utils/stockStory.ts`, `src/components/StockStoryView.tsx`,
  and the daily history already loaded from `/api/market/daily?symbol=`.
- **New free data:** None.
- **Effort / priority:** M / **medium**.
- **Risks:** Short history misses earlier peaks; splits and price adjustments can distort results.
  State the observed window and price-only basis. Historical recovery is no promise of recovery.
  Browser calculation on an existing response adds no endpoint or scheduled work.

## 5. Trading-activity context for an individual IDX stock
- **Owner problem:** A visible price move says little about how actively that stock traded.
- **Feature:** On stock detail, show median daily share volume over 20 completed observed
  sessions, latest completed-session volume relative to that median, and reported zero-volume
  sessions. Show the observation count and date range alongside the numbers.
- **Reuse:** Daily OHLCV from `fetchDailyHistory` in `src/services/marketDataService.ts` via
  `/api/market/daily?symbol=`; display alongside `src/components/AssetDetailView.tsx`.
  This extends the single-day traded-value field already present in `src/utils/screener.ts`.
- **New free data:** None, if the existing history supplies usable volume; otherwise unavailable.
- **Effort / priority:** M / **medium**.
- **Risks:** Missing bars are not zero-volume sessions. Confirm share/lot units and exclude the
  unfinished session. Volume cannot prove executable liquidity, spread, or ability to sell.
  Request history only for the selected stock; do not add a market-wide scan.

## 6. Dividend-event price context
- **Owner problem:** A fall around an ex-dividend date can look like an unexplained loss.
- **Feature:** In Stock Story, select a past dividend event and see published dividend per share,
  the preceding session's close, and the ex-date session's close side by side. Explain the
  distinction between a price change and a cash distribution without claiming causation.
- **Reuse:** `src/utils/corporateCalendar.ts`, `src/components/StockStoryView.tsx`,
  `/api/idx/calendar?symbol=`, and `/api/market/daily?symbol=`; these already serve Stock Story.
- **New free data:** None; only published historical dividend events with matching price bars.
- **Effort / priority:** M / **low**.
- **Risks:** Verify dividend units, split adjustments, and whether close prices already incorporate
  distributions before showing any combined figure. First version shows separate facts only.
  Missing bars stay unavailable; exclude estimated dates. No dividend-capture advice or tax
  assumptions. Reuse the page's loaded responses, with no extra background requests.

## Top three, in order
1. **Recorded transaction-cost summary:** Immediate personal value from data already entered,
   with no additional server requests or changes to valuation.
2. **Rupiah return comparison:** Makes cross-currency comparisons more meaningful for this owner.
3. **Side-by-side financial trends:** Turns existing reports into a practical research comparison
   without another feed, model, or automatic investment recommendation.
