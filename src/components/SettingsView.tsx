/**
 * SettingsView.tsx — Settings & About page: install card, cross-device sync, language and number
 * format, position-size target, theme choice, default chart timeframe, the "open in Terminal mode"
 * switch, data sources and the disclaimer.
 */
import { Sun, Moon, Monitor, Clock, Info, Database, SquareTerminal, Languages } from 'lucide-react';
import { getNumberFormat, setCryptoQuote, setLang, setNumberFormat, useCryptoQuote, useLang, useT, type TranslationKey } from '../i18n/index.ts';
import { Rich } from '../i18n/Rich.tsx';
import { TIMEFRAME_OPTIONS, TimeframeInterval } from '../config/assets.ts';
import { ThemePreference } from '../utils/storage.ts';
import { InstallAppCard } from './InstallApp.tsx';
import { SyncCard } from './SyncCard.tsx';
import { DiagnosticsCard } from './DiagnosticsCard.tsx';

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
  const t = useT();
  const lang = useLang();
  const numberFormat = getNumberFormat();
  const cryptoQuote = useCryptoQuote();
  const themeOptions: { value: ThemePreference; label: TranslationKey; desc: TranslationKey; icon: typeof Sun }[] = [
    { value: 'light', label: 'settings.theme.light', desc: 'settings.theme.lightDesc', icon: Sun },
    { value: 'dark', label: 'settings.theme.dark', desc: 'settings.theme.darkDesc', icon: Moon },
    { value: 'system', label: 'settings.theme.system', desc: 'settings.theme.systemDesc', icon: Monitor },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <header className="space-y-1">
        <div
          className="flex items-center gap-2 text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span>{t('settings.kicker')}</span>
          <span aria-hidden="true">·</span>
          <span>{t('settings.autoSaved')}</span>
        </div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          {t('settings.title')}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('settings.intro')}
        </p>
      </header>

      <InstallAppCard />

      <SyncCard />
      <DiagnosticsCard />
      {/* Language and number format */}
      <section
        aria-labelledby="settings-lang-heading"
        className="p-5 md:p-6 rounded-xl border space-y-4"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-start gap-2.5">
          <Languages className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--accent-radar)' }} />
          <div>
            <h2 id="settings-lang-heading" className="text-base font-bold">
              {t('settings.langTitle')}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {t('settings.langNote')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('settings.langTitle')}>
          {(['en', 'id'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold border"
              style={{
                backgroundColor: lang === l ? 'var(--accent-radar)' : 'var(--bg-surface-subtle)',
                borderColor: lang === l ? 'var(--accent-radar)' : 'var(--border-subtle)',
                color: lang === l ? '#0B1220' : 'var(--text-primary)',
              }}
            >
              {l === 'en' ? t('lang.en') : t('lang.id')}
            </button>
          ))}
        </div>
        <fieldset className="space-y-1.5 text-xs">
          <legend className="font-semibold mb-1">{t('settings.numberFormat')}</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="numfmt" checked={numberFormat === 'language'} onChange={() => setNumberFormat('language')} />
            {t('settings.numberFollow', { example: lang === 'id' ? 'Rp1.234.567 · 1,25%' : 'Rp1,234,567 · 1.25%' })}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="numfmt" checked={numberFormat === 'en-US'} onChange={() => setNumberFormat('en-US')} />
            {t('settings.numberEnUs')}
          </label>
        </fieldset>
        <fieldset className="space-y-1.5 text-xs">
          <legend className="font-semibold mb-1">{t('quote.settingsTitle')}</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="cryptoquote" checked={cryptoQuote === 'USD'} onChange={() => setCryptoQuote('USD')} />
            {t('quote.settingsUsd')}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="cryptoquote" checked={cryptoQuote === 'IDR'} onChange={() => setCryptoQuote('IDR')} />
            {t('quote.settingsIdr')}
          </label>
          <p style={{ color: 'var(--text-secondary)' }}>{t('quote.settingsHint')}</p>
        </fieldset>
      </section>

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
            {t('settings.themeTitle')}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {t('settings.themeNote')}
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
                    {t(opt.label)}
                  </span>
                  <Icon
                    className="w-4 h-4"
                    style={{
                      color: active ? 'var(--accent-radar)' : 'var(--text-secondary)',
                    }}
                  />
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {t(opt.desc)}
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
              {t('settings.tfTitle')}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {t('settings.tfNote')}
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
                {tf.label} ({t(`tf.${tf.interval}` as TranslationKey)})
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
              {t('settings.terminalTitle')}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {t('settings.terminalNote')}
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
            {t('settings.aboutTitle')}
          </h2>
        </div>

        <p className="text-xs md:text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <Rich text={t('settings.about')} strongStyle={{ color: 'var(--text-primary)' }} />
        </p>

        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t text-xs"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="space-y-1">
              <h3 className="font-bold">{t(`settings.src${n}.title` as TranslationKey)}</h3>
              <p style={{ color: 'var(--text-secondary)' }}>
                <Rich text={t(`settings.src${n}.text` as TranslationKey)} />
              </p>
              {n === 2 && (
                <>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    <Rich text={t('settings.src2.finnhub')} />
                  </p>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    <Rich text={t('settings.src2.statements')} />
                  </p>
                </>
              )}
            </div>
          ))}
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
            <Rich text={t('settings.disclaimer')} />
          </p>
        </div>
      </section>
    </div>
  );
}
