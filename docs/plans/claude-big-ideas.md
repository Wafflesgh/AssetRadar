# Big feature ideas — Claude (18 Nov 2026)

Bigger than waves 1–3 (each M–L). Same hard rules: free data only, never dummy prices,
information/education only, no buy/sell advice, works without Gemini, GCP under Rp50.000/month.

## B1 Portfolio stress test (crisis replay) — L, priority high
Problem: "what would my current holdings have done in a crash?" Replays today's portfolio through
past episodes (2008 GFC, 2013 taper tantrum, 2015 China, 2018 rupiah, Mar 2020 COVID, 2022 rates) with
each asset's real daily history (`/api/market/daily`, `portfolio.ts`, USD/IDR history as in Compare in
Rupiah). Shows depth, days to bottom, days to recover, which holding hurt most. Assets without history
for an episode are listed as "not covered", never estimated. Browser only.
Risk: survivorship (today's holdings, old prices) — must be stated.

## B2 Annual portfolio report (for my own records / SPT) — M–L, priority high
Problem: once a year the owner needs realized gains, dividends received, fees and year-end values.
One page per year from `portfolio.ts` transactions, `dividends` collection, `txCosts.ts`: realized P/L
(average-cost method, as the app already uses), dividends, fees, year-end holdings and prices, per
currency. Export CSV + printable page (browser print to PDF). No tax rates in code; a note says
"check with the tax rules / your advisor".
Risk: year-end price must be a real close (last session of the year), else "unavailable".

## B3 Earnings reaction history per stock — M, priority medium
Problem: "how does this stock usually move around its earnings report?" From past earnings dates
(`/api/idx/calendar?symbol=`, Yahoo calendar) and daily bars: move from the day before to +1/+5
sessions for each past report, median and spread. Panel in Stock Story / asset page.
Risk: IDX earnings dates from Yahoo can be missing or late — show coverage count.

## B4 Broker statement import (CSV) — L, priority medium
Problem: typing every trade by hand. Import a CSV/Excel trade history into the portfolio with a
preview table, duplicate detection and a column-mapping step (generic, so any broker export works;
presets added later). Reuses the existing data import in `src/utils/backup.ts` patterns and
`server/xlsx.ts` reader if needed (browser copy).
Risk: wrong mapping corrupts the portfolio → preview + undo (keep a backup before import).

## B5 Goals & target allocation (C2 grown) — M, priority medium
Problem: "am I on track, and is my mix drifting?" Goals (amount, date) synced via the `tracked()`
pattern; progress from live portfolio value (no projection of returns). Target mix per group, with
drift vs Risk Profile result and a plain "how much to add to which group to get back to target"
calculation (arithmetic only, no recommendation of specific assets).
Risk: must not read as advice — wording reviewed.

## B6 Personal market calendar & reminders — M, priority low
Problem: events are scattered (FOMC, BI rate days, earnings of my stocks, ex-dates, SBN offers).
One calendar view merging existing sources (`/api/idx/calendar`, FOMC list in `events.ts`, SBN, macro
`calendar`) filtered to watchlist/portfolio, with optional push the day before via existing alerts.

## My top 3
1. B1 — biggest new insight from data we already have.
2. B2 — saves real work every year.
3. B4 — removes the most manual typing (needs care).
