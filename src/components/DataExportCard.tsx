/** DataExportCard.tsx — Download owner data and preview a local merge or replacement import. */
import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { dateLocale, useLang, useT, type TranslationKey } from '../i18n/index.ts';
import { createDataExport, importData, parseDataExport, previewDataImport, type ImportMode, type ParsedExport } from '../utils/dataExport.ts';
import { formatNumber } from '../utils/format.ts';
import { wibDate } from '../utils/sync.ts';

const button = 'min-h-11 px-3 py-2 rounded-lg border text-sm font-semibold disabled:opacity-50';
const border = { borderColor: 'var(--border-subtle)' };
const errorKeys = ['export.invalid', 'export.adapterMissing', 'export.writeFailed', 'export.partial'] as const;

export function DataExportCard() {
  const t = useT();
  const lang = useLang();
  const [preview, setPreview] = useState<ParsedExport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [done, setDone] = useState(false);
  const showError = (err: unknown) => {
    const key = errorKeys.find(key => err instanceof Error && err.message === key);
    setError(key ?? 'export.failed');
  };

  const download = () => {
    setError(null);
    try {
      const data = createDataExport();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `assetradar-data-${wibDate(data.exportedAt)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) { showError(err); }
  };
  const readFile = async (file: File) => {
    setBusy(true);
    setPreview(null);
    setDone(false);
    setError(null);
    try { setPreview(parseDataExport(await file.text())); }
    catch (err) { showError(err); }
    finally { setBusy(false); }
  };
  const apply = (mode: ImportMode) => {
    if (!preview || (mode === 'replace' && !window.confirm(t('export.confirmReplace')))) return;
    setError(null);
    try {
      importData(preview.data, mode);
      setPreview(null);
      setDone(true);
    } catch (err) { showError(err); }
  };
  // Re-read counts when rendering; the import itself also reads current local values.
  const rows = preview ? previewDataImport(preview.data) : [];

  return (
    <section aria-labelledby="export-heading" className="p-5 md:p-6 rounded-xl border space-y-4 min-w-0"
      style={{ ...border, backgroundColor: 'var(--bg-surface)' }}>
      <h2 id="export-heading" className="text-base font-bold">{t('export.title')}</h2>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('export.description')}</p>
      <button type="button" className={`${button} inline-flex items-center gap-2`} style={border} onClick={download} disabled={busy}>
        <Download className="w-4 h-4" aria-hidden="true" />{t('export.download')}
      </button>
      <label className="block space-y-2 text-sm">
        <span className="flex items-center gap-2 font-semibold"><Upload className="w-4 h-4" aria-hidden="true" />{t('export.choose')}</span>
        <input type="file" accept="application/json,.json" disabled={busy} className="block w-full min-w-0 min-h-11 text-sm"
          onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void readFile(file); }} />
      </label>
      {busy && <p role="status" className="text-sm">{t('export.reading')}</p>}
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--color-down)' }}>{t(error)}</p>}
      {done && <p role="status" className="text-sm">{t('export.done')}</p>}
      {preview && (
        <div className="space-y-3">
          <h3 className="font-semibold">{t('export.preview')}</h3>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('export.date', {
            date: new Date(preview.data.exportedAt).toLocaleString(dateLocale(lang), { timeZone: 'Asia/Jakarta' }),
          })}</p>
          <table className="w-full table-fixed text-xs">
            <thead><tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
              <th scope="col" className="w-2/5 py-2 pr-2">{t('export.collection')}</th>
              <th scope="col" className="text-right p-1 break-words">{t('export.items')}</th>
              <th scope="col" className="text-right p-1 break-words">{t('export.new')}</th>
              <th scope="col" className="text-right p-1 break-words">{t('export.existing')}</th>
              <th scope="col" className="text-right p-1 break-words">{t('export.deleted')}</th>
            </tr></thead>
            <tbody>{rows.map(row => <tr key={row.collection} className="border-t" style={border}>
              <th scope="row" className="py-2 pr-2 text-left font-medium break-words">{t(`export.col.${row.collection}`)}</th>
              {[row.items, row.added, row.existing, row.deleted].map((n, i) => <td key={i} className="p-1 text-right font-mono-num break-all">{formatNumber(n, 0)}</td>)}
            </tr>)}</tbody>
          </table>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('export.countNote')}</p>
          {preview.ignored.length > 0 && <p className="text-sm break-words">{t('export.ignored', { names: preview.ignored.join(', ') })}</p>}
          <p className="text-sm">{t('export.mergeNote')}</p>
          <p className="text-sm">{t('export.replaceNote')}</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('export.settingsNote')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!rows.length} className={button} style={border} onClick={() => apply('merge')}>{t('export.merge')}</button>
            <button type="button" disabled={!rows.length} className={button} style={{ ...border, color: 'var(--color-down)' }} onClick={() => apply('replace')}>{t('export.replace')}</button>
            <button type="button" className={button} style={border} onClick={() => { setPreview(null); setError(null); }}>{t('export.cancel')}</button>
          </div>
        </div>
      )}
    </section>
  );
}
