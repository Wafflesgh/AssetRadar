# AssetRadar — Fresh UI Design Proposal ("Morning Ledger")

> **Scope note:** Designed from zero based only on what AssetRadar does (for one Indonesian owner on PC and phone), before looking at any existing component code or styles.

---

## 1. Design Idea & Mood: "Koran Pagi & Buku Catatan" (Calm Morning Ledger)

Most market apps copy stock-broker terminals or crypto exchanges: pitch-black screens, flashing neon green and red, tiny jargon (`SUE`, `HHI`, `OOS`), and dozens of scattered menu items. That style creates rush and anxiety—the exact opposite of an **information and education** tool for one thoughtful owner.

**"Morning Ledger"** treats AssetRadar like a calm, high-trust morning briefing and personal notebook:
- **Calm first, dense on demand:** Default screens breathe like a modern financial newspaper (warm paper tones in daytime, soft obsidian slate at night), while a 1-click **Terminal** button in the top bar still opens a compact, keyboard-driven monitor whenever desired.
- **Plain stories before raw formulas:** Every chart or score starts with a one-sentence human summary (*"Harga cabai naik minggu ini karena curah hujan tinggi di sentra Jawa Timur"* / *"BBCA bergerak tenang dalam rentang wajar 60 hari"*), with deeper numbers one tap below.
- **Honest when data is missing:** Missing feeds never show `Rp0` or fake numbers. They render a dedicated amber-tinted **"Unavailable"** card with the last good timestamp, the plain reason, and a clear **Retry** button.
- **Education-only by design:** No green "BUY" or red "SELL" action pills anywhere. Sentiment uses a balanced 5-step neutral-centered bar (*Strong Bearish · Bearish · Neutral · Bullish · Strong Bullish*), and disclaimers sit naturally inside decision zones rather than hiding only in tiny footer text.

---

## 2. Color System (Light & Dark Mode with WCAG AA+ Contrast)

Brand actions use **Archipelago Teal** so buttons, active tabs, and links are never confused with market "Up" green or "Down" red. Up and down states always pair color with `+▲` / `−▼` symbols so colorblind users or sunlit phone screens never rely on color alone.

| Token Role | CSS Variable | Light Mode ("Kertas Pagi") | Dark Mode ("Malam Tenang") | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Page Canvas** | `--bg-canvas` | `#F6F4EE` (Warm Limestone) | `#0C1116` (Deep Obsidian Slate) | Main app background — avoids harsh `#FFFFFF` glare and pure `#000000` halation |
| **Card Surface** | `--bg-card` | `#FFFFFF` (Crisp Paper) | `#141C24` (Elevated Slate) | Primary cards, tables, panels |
| **Subtle Surface** | `--bg-subtle` | `#EFECE4` (Sandstone Wash) | `#1B2631` (Muted Slate) | Table headers, segmented controls, secondary pills |
| **Border Subtle** | `--border-subtle` | `#E2DDD2` | `#263442` | Card outlines, row dividers |
| **Border Strong** | `--border-strong` | `#C8C1B2` | `#384B5E` | Input borders, active card frames |
| **Primary Text** | `--text-primary` | `#15191E` (15.4:1 contrast) | `#EFF3F6` (15.1:1 contrast) | Headings, asset names, primary prices |
| **Secondary Text** | `--text-secondary` | `#4E5863` (6.8:1 contrast) | `#9AA8B6` (6.3:1 contrast) | Timestamps, subtitles, explanations |
| **Brand Accent** | `--accent` | `#0F6A5B` (Archipelago Teal) | `#2DD4BF` (Seafoam Teal) | Active nav, primary buttons, focus rings, links |
| **Accent Wash** | `--accent-soft` | `#E3F3EF` | `#113232` | Active tab pill background, selected row tint |
| **Market Up** | `--up` / `--up-soft` | `#15803D` / `#DCFCE7` | `#34D399` / `#0F2E22` | Positive change (`+▲` required) |
| **Market Down** | `--down` / `--down-soft` | `#B91C1C` / `#FEE2E2` | `#F87171` / `#36171B` | Negative change (`−▼` required) |
| **Caution / Stale** | `--warn` / `--warn-soft` | `#B45309` / `#FEF3C7` | `#FBBF24` / `#332711` | Data unavailable, stale feed badge, disclaimers |
| **Sample / Info** | `--info` / `--info-soft` | `#3730A3` / `#E0E7FF` | `#818CF8` / `#1E2246` | Educational notes, mockup `(sample)` tags |

---

## 3. Typography & Hierarchy

Three Google Fonts, each with one strict job:

1. **Newsreader** (`500`, `600`) — *Editorial Display Serif*
   - Used **only** for page titles, Morning Brief lead sentences, and Stock Story chapter headings.
   - Gives calm authority and breaks up wall-of-numbers fatigue.
2. **Plus Jakarta Sans** (`400`, `500`, `600`, `700`) — *Primary UI & Body Sans*
   - Used for navigation, buttons, table labels, Indonesian/English explanations, alerts, and forms.
   - Base size **16px** (`1rem`), line-height `1.5`, minimum metadata/badge size **12px** (`0.75rem`). Mobile inputs stay at **16px** so iOS Safari never auto-zooms on tap.
3. **IBM Plex Mono** (`400`, `500`, `600` with `font-variant-numeric: tabular-nums`) — *Data & Terminal Mono*
   - Used for every price, `%` move, lot count, ratio, timestamp, ticker code, and Terminal mode.
   - Guarantees vertical alignment down every table column without visual jitter when live prices update.

| Text Role | Font | Desktop (1440px) | Phone (375px) | Line Height |
| :--- | :--- | :--- | :--- | :--- |
| **Page Title / Hero Value** | Newsreader / IBM Plex Mono | `28px–32px` | `22px–24px` | `1.2` |
| **Section Heading (H2)** | Plus Jakarta Sans `600` | `18px` | `16px` | `1.3` |
| **Body & Table Asset Name** | Plus Jakarta Sans `500` | `15px–16px` | `15px` | `1.5` |
| **Numeric Cell / Price** | IBM Plex Mono `500` | `14px–15px` | `14px` | `1.35` |
| **Caption / Badge / Attribution** | Plus Jakarta Sans `500` | `12px` | `12px` | `1.4` |

---

## 4. Spacing, Density & Responsive Layout

Built on a strict **4px / 8px scale** (`4, 8, 12, 16, 24, 32, 48px`) with `14px` card corners (`--radius-card`) and `1px` crisp borders instead of heavy drop shadows.

- **Desktop (1440px):**
  - Left navigation rail (`232px` fixed) + Sticky utility top bar (`56px` height: global search `Ctrl+K`, connection/freshness pill, `ID | EN` switch, Light/Dark switch, and 1-click **Terminal** button) + Centered content workspace (`max-width: 1240px`, `24px–32px` gutters, 12-column CSS Grid).
- **Small Phone (375px, zero horizontal scroll):**
  - Top bar compacts to Logo + Search button + Live dot + Theme/Lang toggles.
  - Multi-column grids collapse cleanly into single-column cards.
  - Wide desktop market tables transform into **2-line mobile rows** (Left: Ticker + Name + Sparkline; Right: Tabular Price + `%` Pill) so the user never has to scroll sideways to read a price.
  - Fixed bottom navigation bar (`64px` + `env(safe-area-inset-bottom)`) with **4 primary destinations + "More" sheet**, every tap target at least `44×44px`.

---

## 5. Simplified Navigation Structure (4 Human Questions Instead of 27 Loose Pages)

Instead of making the owner remember 8 flyouts and ~27 separate routes, the app is organized around **4 daily destinations** plus 2 global utilities in the top bar:

1. **Hari Ini / Pulse (Home & Radar)**
   - Morning Brief card + Geopolitical/Macro status strip + "Since your last visit" summary + Watchlist strip + Full Market Radar (with inline **Table / Heatmap** switcher, category chips: *Semua, Saham BEI, Saham Dunia, Crypto, Emas & Kurs*, and Live News).
2. **Pasar & Riset / Explore**
   - Unified hub for **962 IDX Stocks**, **Crypto**, **Screener**, **Sector Rotation**, **Dividends & Calendar**, and **Compare**.
   - Clicking any asset opens the **Story-First Asset Detail** with 4 clean sub-tabs (*Ikhtisar & Grafik*, *Sentimen & Bukti*, *Cerita & Dividen*, *Bandingkan*) — keeping everything about BBCA or BTC in one place instead of jumping across 4 separate menus.
3. **Dapur & Ekonomi / Real Economy**
   - Combines **Kitchen Radar** (21 traditional market staples across 34 provinces, seasonal Lebaran chart, personal kitchen basket) with **Indonesia Macro & SBN Ritel**. Putting food prices next to inflation, BI-Rate, and Rupiah helps a non-programmer immediately see how macro numbers touch daily life.
4. **Milikku / My Space**
   - Personal hub with clean tabs: **Portofolio** (holdings, Antam gold buyback card, concentration meter, recorded fees), **Jurnal Keputusan** (notes + 1W/1M/3M review), **Latihan** (Paper Trading & DCA Simulator), and **Lab AI** (AI Advisor statistical screen, Fund Arena, Track Record).
- **Top-bar global utilities:**
  - **Terminal Mode (`>_`):** Dedicated focus mode switch for multi-panel dark monitoring.
  - **Status, Alerts & Settings:** One unified drawer/page showing Connection & Data Freshness (`OK / Late / Stale`), Price & SBN Alerts, Sync status, and Theme/Language preferences.

---

## 6. Why This Design Is Better for This Owner

1. **Zero hunting in menus:** Grouping 27 tools into 4 clear places (*Hari Ini, Pasar & Riset, Dapur & Ekonomi, Milikku*) cuts cognitive load in half, especially on a phone screen.
2. **Reads in plain Indonesian & English:** Every chart, ratio, and kitchen price mover leads with a plain sentence before showing technical metrics, respecting an owner who wants insight without programming or Wall Street jargon.
3. **No horizontal scrolling at 375px:** Responsive 2-line asset rows and stacked cards keep every number legible with one thumb on a small phone.
4. **Safer against misunderstandings:** Neutral 5-level sentiment bars, inline educational disclaimers, visible TradingView attribution, and explicit amber **"Unavailable + Retry"** cards make it impossible to confuse missing data with zero or statistical history with a profit promise.
5. **Restful day and night:** Warm paper light mode prevents eye strain during daytime reading, while slate dark mode and tabular monospace numbers keep live updates steady without casino flashiness.
