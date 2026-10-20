/**
 * SettingsView.tsx — Settings & About page: install card, cross-device sync, theme choice,
 * default chart timeframe, the "open in Terminal mode" switch, data sources and the disclaimer.
 */
import { Sun, Moon, Monitor, Clock, Info, Database, SquareTerminal } from 'lucide-react';
import { TIMEFRAME_OPTIONS, TimeframeInterval } from '../config/assets.ts';
import { ThemePreference } from '../utils/storage.ts';
import { InstallAppCard } from './InstallApp.tsx';
import { SyncCard } from './SyncCard.tsx';

interface SettingsViewProps {
  themePreference: ThemePreference;
  onChangeThemePreference: (theme: ThemePreference) => void;
  defaultTimeframe: TimeframeInterval;
  onChangeDefaultTimeframe: (interval: TimeframeInterval) => void;
  startInTerminal: boolean;
  onChangeStartInTerminal: (enabled: boolean) => void;
}

export function SettingsView({
  themePreference,
  onChangeThemePreference,
  defaultTimeframe,
  onChangeDefaultTimeframe,
  startInTerminal,
  onChangeStartInTerminal,
}: SettingsViewProps) {
  const themeOptions: { value: ThemePreference; label: string; desc: string; icon: typeof Sun }[] = [
    {
      value: 'light',
      label: 'Light',
      desc: 'Bright background (#F7F9FC) for daytime visibility',
      icon: Sun,
    },
    {
      value: 'dark',
      label: 'Dark',
      desc: 'Dark radar background (#0B1220), comfortable for watching charts',
      icon: Moon,
    },
    {
      value: 'system',
      label: 'Follow system',
      desc: 'Adjusts automatically to your device theme setting',
      icon: Monitor,
    },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <header className="space-y-1">
        <div
          className="flex items-center gap-2 text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span>Preferences & App Information</span>
          <span aria-hidden="true">·</span>
          <span>Saved Automatically</span>
        </div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Settings & About AssetRadar
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Adjust the color theme and the default time interval for the candlestick charts.
        </p>
      </header>

      <InstallAppCard />

      <SyncCard />

      {/* Theme Selection */}
      <section
        aria-labelledby="settings-theme-heading"
        className="p-5 md:p-6 rounded-xl border space-y-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div>
          <h2 id="settings-theme-heading" className="text-base font-bold">
            Display Theme
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            The chosen theme is also applied to the TradingView chart widget right away.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            const active = themePreference === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChangeThemePreference(opt.value)}
                aria-pressed={active}
                className="p-4 rounded-xl border text-left transition-colors flex flex-col justify-between gap-2"
                style={{
                  backgroundColor: active
                    ? 'var(--accent-radar-soft)'
                    : 'var(--bg-surface-subtle)',
                  borderColor: active ? 'var(--accent-radar)' : 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-sm font-bold"
                    style={{
                      color: active ? 'var(--accent-radar)' : 'var(--text-primary)',
                    }}
                  >
                    {opt.label}
                  </span>
                  <Icon
                    className="w-4 h-4"
                    style={{
                      color: active ? 'var(--accent-radar)' : 'var(--text-secondary)',
                    }}
                  />
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {opt.desc}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Default Timeframe Selection */}
      <section
        aria-labelledby="settings-timeframe-heading"
        className="p-5 md:p-6 rounded-xl border space-y-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-start gap-2.5">
          <Clock
            className="w-5 h-5 shrink-0 mt-0.5"
            style={{ color: 'var(--accent-radar)' }}
          />
          <div>
            <h2 id="settings-timeframe-heading" className="text-base font-bold">
              Default Chart Timeframe
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              The time interval selected automatically when you open an asset Detail page.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {TIMEFRAME_OPTIONS.map((tf) => {
            const active = defaultTimeframe === tf.interval;
            return (
              <button
                key={tf.interval}
                type="button"
                onClick={() => onChangeDefaultTimeframe(tf.interval)}
                aria-pressed={active}
                className="px-3.5 py-2 rounded-lg text-xs font-mono-num font-semibold border transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: active
                    ? 'var(--accent-radar)'
                    : 'var(--bg-surface-subtle)',
                  borderColor: active ? 'var(--accent-radar)' : 'var(--border-subtle)',
                  color: active ? '#0B1220' : 'var(--text-primary)',
                }}
              >
                {tf.label} ({tf.title})
              </button>
            );
          })}
        </div>
      </section>

      {/* Start in Terminal Mode */}
      <section
        aria-labelledby="settings-terminal-heading"
        className="p-5 md:p-6 rounded-xl border flex items-start justify-between gap-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-start gap-2.5">
          <SquareTerminal
            className="w-5 h-5 shrink-0 mt-0.5"
            style={{ color: 'var(--accent-radar)' }}
          />
          <div>
            <h2 id="settings-terminal-heading" className="text-base font-bold">
              Open the app in Terminal mode
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              When the app is opened without a specific page address, show Terminal mode (a dense,
              Bloomberg-style view) instead of the Radar.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={startInTerminal}
          aria-labelledby="settings-terminal-heading"
          onClick={() => onChangeStartInTerminal(!startInTerminal)}
          className="relative shrink-0 w-11 h-6 rounded-full border transition-colors"
          style={{
            backgroundColor: startInTerminal ? 'var(--accent-radar)' : 'var(--bg-surface-subtle)',
            borderColor: startInTerminal ? 'var(--accent-radar)' : 'var(--border-subtle)',
          }}
        >
          <span
            aria-hidden="true"
            className="absolute top-0.5 rounded-full transition-all"
            style={{
              left: startInTerminal ? 'calc(100% - 1.25rem)' : '0.125rem',
              width: '1.125rem',
              height: '1.125rem',
              backgroundColor: startInTerminal ? '#0B1220' : 'var(--text-secondary)',
            }}
          />
        </button>
      </section>

      {/* About Application, Data Sources & Disclaimer (Spec Section 5.5 & Section 9) */}
      <section
        aria-labelledby="settings-about-heading"
        className="p-5 md:p-6 rounded-xl border space-y-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} />
          <h2 id="settings-about-heading" className="text-base font-bold">
            About AssetRadar & Data Sources
          </h2>
        </div>

        <p className="text-xs md:text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>AssetRadar</strong> is a personal app
          for tracking more than 100 assets — the world's largest companies, Indonesian stocks,
          crypto, commodities, stock indices and currencies — in one radar view, with technical and
          fundamental analysis, an AI screen and a portfolio simulator. It does not handle buying or
          selling and does not require a login.
        </p>

        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t text-xs"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="space-y-1">
            <h3 className="font-bold">1. Crypto (20 coins)</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Live prices from the official <strong>Indodax</strong> public API &amp; WebSocket, in
              Rupiah (IDR). Market caps and 1h/7d changes from <strong>CoinGecko</strong>.
            </p>
          </div>
          <div className="space-y-1">
            <h3 className="font-bold">2. Stocks, indices, commodities &amp; currencies</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Quotes, history and annual reports (for the Piotroski F-score) from{' '}
              <strong>Yahoo Finance</strong>. The server fetches them once for everyone and pushes new
              prices to your browser (stream): about every 5 seconds for what you have open (Quick
              Chart, watchlist, portfolio, the detail page), 15 seconds for the rest, and every 5 minutes
              while a market is closed; it slows down automatically if Yahoo limits requests. If the
              stream drops, the app polls every 10 seconds ("Live · Polling"). Exchange data
              (including JCI and Indonesian stocks) is <strong>delayed</strong> and only moves during
              trading hours. Market cap = live price × shares outstanding.
            </p>
            <p style={{ color: 'var(--text-secondary)' }}>
              Optional: when the server has a <code>FINNHUB_API_KEY</code> (free plan, personal use), US
              stocks get real-time trades from <strong>Finnhub</strong> (source "Finnhub (real-time)"). The
              key stays on the server.
            </p>
            <p style={{ color: 'var(--text-secondary)' }}>
              Financial statements: <strong>SEC EDGAR</strong> filings (US companies) and Yahoo Finance.
            </p>
          </div>
          <div className="space-y-1">
            <h3 className="font-bold">3. Spot Gold (XAU/USD &amp; IDR/gram)</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Spot price from <strong>gold-api.com</strong> (XAU per troy ounce), converted to
              Rupiah per gram with the latest USD/IDR rate.
            </p>
          </div>
          <div className="space-y-1">
            <h3 className="font-bold">4. Candlestick Charts</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              The official <strong>TradingView</strong> Advanced Chart widget, plus a{' '}
              <code>lightweight-charts</code> alternative chart for symbols with embed limits.
            </p>
          </div>
          <div className="space-y-1">
            <h3 className="font-bold">5. News</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Headlines from <strong>Google News</strong> and publisher feeds (CNBC, CNBC Indonesia,
              ANTARA, CoinDesk, Cointelegraph, FXStreet, Investing.com, BBC, Al Jazeera), shown in the
              original language of each article (Indonesian or English).
            </p>
          </div>
          <div className="space-y-1">
            <h3 className="font-bold">6. Not available</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Crude palm oil (CPO) and coal have no free live price source, so they are not listed
              rather than showing stale numbers.
            </p>
          </div>
        </div>

        <div
          className="p-3.5 rounded-lg border text-xs flex items-start gap-2.5"
          style={{
            backgroundColor: 'var(--bg-surface-subtle)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent-radar)' }} />
          <p>
            <strong>Disclaimer:</strong> Data is for information only, not investment advice. All
            investment decisions and their risks rest entirely with the user.
          </p>
        </div>
      </section>
    </div>
  );
}
