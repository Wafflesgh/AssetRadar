import { Sun, Moon, Monitor, Clock, Info, Database, SquareTerminal } from 'lucide-react';
import { TIMEFRAME_OPTIONS, TimeframeInterval } from '../config/assets.ts';
import { ThemePreference } from '../utils/storage.ts';

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
      label: 'Terang',
      desc: 'Latar cerah (#F7F9FC) untuk visibilitas siang hari',
      icon: Sun,
    },
    {
      value: 'dark',
      label: 'Gelap',
      desc: 'Latar radar gelap (#0B1220) nyaman untuk pemantauan grafik',
      icon: Moon,
    },
    {
      value: 'system',
      label: 'Ikuti sistem',
      desc: 'Menyesuaikan otomatis dengan pengaturan tema perangkat Anda',
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
          <span>Preferensi & Informasi Aplikasi</span>
          <span aria-hidden="true">·</span>
          <span>Tersimpan Otomatis</span>
        </div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Pengaturan & Tentang AssetRadar
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Sesuaikan tampilan tema warna dan interval waktu default untuk grafik candlestick
          TradingView.
        </p>
      </header>

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
            Tema Tampilan
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Pilihan tema juga langsung diterapkan pada widget grafik TradingView.
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
              Timeframe Default Grafik
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Interval waktu yang otomatis dipilih saat membuka halaman Detail aset.
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
              Buka aplikasi di mode Terminal
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Saat aplikasi dibuka tanpa alamat halaman tertentu, langsung tampilkan mode Terminal
              (tampilan padat ala Bloomberg) alih-alih Radar.
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
            Tentang AssetRadar & Sumber Data
          </h2>
        </div>

        <p className="text-xs md:text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>AssetRadar</strong> adalah aplikasi
          pemantau instrumen investasi pribadi untuk memantau pergerakan harga emas, saham (IHSG),
          nilai tukar USD/IDR, dan aset crypto dalam satu tampilan radar yang terpadu. Aplikasi ini
          tidak melayani transaksi jual-beli dan tidak memerlukan akun login.
        </p>

        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t text-xs"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="space-y-1">
            <h3 className="font-bold">1. Crypto (BTC, ETH, SOL)</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Sumber data dari API publik &amp; WebSocket resmi <strong>Indodax</strong> dalam
              mata uang Rupiah (IDR).
            </p>
          </div>
          <div className="space-y-1">
            <h3 className="font-bold">2. Saham IHSG (^JKSE) &amp; Kurs (USD/IDR)</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Sumber data dari <strong>Yahoo Finance</strong>. Perhatian: data indeks IHSG
              bersifat <strong>tertunda (delayed)</strong> dan hanya diperbarui saat jam perdagangan
              Bursa Efek Indonesia (Senin–Jumat 09:00–16:00 WIB).
            </p>
          </div>
          <div className="space-y-1">
            <h3 className="font-bold">3. Emas Spot (XAU/USD &amp; IDR/gram)</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Sumber data dari penyedia API harga emas spot gratis (XAU per troy ounce) yang
              dikonversi ke Rupiah per gram memakai kurs USD/IDR terkini.
            </p>
          </div>
          <div className="space-y-1">
            <h3 className="font-bold">4. Grafik Candlestick</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Menggunakan widget Advanced Chart resmi oleh <strong>TradingView</strong> serta
              grafik cadangan <code>lightweight-charts</code> untuk simbol yang memiliki batasan
              embed.
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
            <strong>Pernyataan Penyangkalan (Disclaimer):</strong> Data hanya untuk informasi,
            bukan saran investasi. Segala keputusan investasi beserta risikonya sepenuhnya berada di
            tangan pengguna.
          </p>
        </div>
      </section>
    </div>
  );
}
