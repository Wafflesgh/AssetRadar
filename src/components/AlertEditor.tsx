/**
 * AlertEditor.tsx — Form to create or edit one alert: type (price above/below, daily move,
 * ex-dividend/earnings tomorrow, new headline, geopolitical), asset, level, once or repeating
 * with a minimum gap. Used on the Alerts page and in a dialog from the asset detail page (bell
 * button). Saving stores the alert locally (synced when logged in).
 */
import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { getAssetBySymbol, type AssetConfig, type PriceTick } from '../config/assets.ts';
import { ALERT_KIND_LABELS, alertKindLabel, validateAlert, type AlertKind, type UserAlert } from '../utils/alerts.ts';
import { formatAssetPrice } from '../utils/format.ts';
import { loadAlerts, newAlertId, primeAlertState, storeAlerts } from '../services/alertService.ts';
import { AssetSearch } from './AssetSearch.tsx';
import { useLang, useT } from '../i18n/index.ts';
import { assetShortName } from '../i18n/assetNames.ts';

const STOCK_GROUPS = ['idStock', 'usStock', 'globalStock'];

interface AlertEditorProps {
  /** Pre-selected asset (detail page). */
  asset?: AssetConfig;
  /** Existing alert to edit. */
  editing?: UserAlert;
  ticks: Record<string, PriceTick>;
  onDone: () => void;
}

const inputStyle = { backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' };

export function AlertEditor({ asset, editing, ticks, onDone }: AlertEditorProps) {
  const t = useT();
  const lang = useLang();
  const [kind, setKind] = useState<AlertKind>(editing?.kind ?? 'priceAbove');
  const [symbol, setSymbol] = useState<string | undefined>(editing?.symbol ?? asset?.symbol);
  const [value, setValue] = useState<string>(editing?.value !== undefined ? String(editing.value) : '');
  const [repeat, setRepeat] = useState<boolean>(editing?.repeat ?? false);
  const [cooldownMin, setCooldownMin] = useState<number>(editing?.cooldownMin ?? 60);
  const [note, setNote] = useState(editing?.note ?? '');
  const [errors, setErrors] = useState<string[]>([]);

  const selected = symbol ? getAssetBySymbol(symbol) : undefined;
  const tick = symbol ? ticks[symbol] : undefined;
  const live = tick && tick.status !== 'error' && Number.isFinite(tick.price) ? tick.price : undefined;
  const numeric = Number(value.replace(/,/g, ''));
  const isPrice = kind === 'priceAbove' || kind === 'priceBelow';
  const calendarOk = !selected || STOCK_GROUPS.includes(selected.group);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const draft: Partial<UserAlert> = {
      kind,
      symbol: kind === 'geo' ? undefined : symbol,
      value: isPrice || kind === 'dailyMove' ? numeric : undefined,
    };
    const errs = validateAlert(draft, lang);
    if (kind === 'calendar' && !calendarOk) errs.push(t('alerts.ed.stocksOnlyErr'));
    if (errs.length) {
      setErrors(errs);
      return;
    }
    const alert: UserAlert = {
      id: editing?.id ?? newAlertId(),
      kind,
      symbol: draft.symbol,
      value: draft.value,
      repeat,
      cooldownMin: Math.max(60, cooldownMin),
      active: true,
      createdAt: editing?.createdAt ?? Date.now(),
      note: note.trim() || undefined,
    };
    const list = loadAlerts();
    storeAlerts(editing ? list.map((a) => (a.id === alert.id ? alert : a)) : [...list, alert]);
    if (isPrice) primeAlertState(alert, tick);
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1 block">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {t('alerts.ed.type')}
          </span>
          <select value={kind} onChange={(e) => setKind(e.target.value as AlertKind)} className="w-full px-3 py-2 rounded-lg border" style={inputStyle}>
            {(Object.keys(ALERT_KIND_LABELS) as AlertKind[]).map((k) => (
              <option key={k} value={k}>
                {alertKindLabel(k, lang)}
              </option>
            ))}
          </select>
        </label>
        {kind !== 'geo' && (
          <div className="space-y-1">
            <span className="text-xs font-semibold block" style={{ color: 'var(--text-secondary)' }}>
              {t('alerts.ed.asset')}
            </span>
            <AssetSearch
              onSelect={(a) => setSymbol(a.symbol)}
              selected={selected}
              ticks={ticks}
              label={t('alerts.ed.assetLabel')}
              placeholder={t('alerts.ed.assetPh')}
              limit={6}
            />
          </div>
        )}
      </div>

      {(isPrice || kind === 'dailyMove') && (
        <label className="space-y-1 block">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {isPrice
              ? t('alerts.ed.level') + (selected ? ` (${selected.currency === 'IDR' ? 'Rp' : selected.currency})` : '')
              : t('alerts.ed.move')}
          </span>
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={isPrice ? (live !== undefined ? String(live) : t('alerts.ed.egPrice')) : t('alerts.ed.egMove')}
            className="w-full px-3 py-2 rounded-lg border font-mono-num"
            style={inputStyle}
          />
          {isPrice && selected && live !== undefined && (
            <span className="text-xs block" style={{ color: 'var(--text-secondary)' }}>
              {t('alerts.ed.now', { price: formatAssetPrice(live, selected, { native: true }) })}{' '}
              {Number.isFinite(numeric) && numeric > 0 && ((kind === 'priceAbove' && live >= numeric) || (kind === 'priceBelow' && live <= numeric))
                ? t('alerts.ed.firesBeyond')
                : t('alerts.ed.fires')}
            </span>
          )}
        </label>
      )}
      {kind === 'calendar' && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('alerts.ed.calHelp')} {!calendarOk && <strong>{t('alerts.ed.stocksOnly')}</strong>}
        </p>
      )}
      {kind === 'news' && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('alerts.ed.newsHelp')}
        </p>
      )}
      {kind === 'geo' && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('alerts.ed.geoHelp')}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 text-xs font-semibold">
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> {t('alerts.ed.repeat')}
        </label>
        {repeat && (
          <label className="inline-flex items-center gap-2 text-xs">
            {t('alerts.ed.atMost')}
            <select value={cooldownMin} onChange={(e) => setCooldownMin(Number(e.target.value))} className="px-2 py-1 rounded border" style={inputStyle}>
              <option value={60}>{t('alerts.ed.h1')}</option>
              <option value={240}>{t('alerts.ed.h4')}</option>
              <option value={720}>{t('alerts.ed.h12')}</option>
              <option value={1440}>{t('alerts.ed.d1')}</option>
            </select>
          </label>
        )}
      </div>

      <label className="space-y-1 block">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          {t('alerts.ed.note')}
        </span>
        <input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} className="w-full px-3 py-2 rounded-lg border" style={inputStyle} />
      </label>

      {errors.length > 0 && (
        <ul className="text-xs font-semibold space-y-0.5" role="alert" style={{ color: 'var(--color-down)' }}>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}>
          {editing ? t('alerts.ed.save') : t('alerts.ed.create')}
        </button>
        <button type="button" onClick={onDone} className="px-4 py-2 rounded-lg text-sm font-semibold border" style={{ borderColor: 'var(--border-subtle)' }}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

/** The editor in a dialog (asset detail page). */
export function AlertDialog({ asset, ticks, onClose }: { asset: AssetConfig; ticks: Record<string, PriceTick>; onClose: () => void }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="alert-dialog-title">
      <button type="button" aria-label={t('common.close')} className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border p-4 md:p-5 space-y-3"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="alert-dialog-title" className="text-base font-bold">
            {t('alerts.ed.dialogTitle', { name: assetShortName(asset) })}
          </h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="p-1.5 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
        <AlertEditor asset={asset} ticks={ticks} onDone={onClose} />
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {t('alerts.ed.dialogNote')}
        </p>
      </div>
    </div>
  );
}
