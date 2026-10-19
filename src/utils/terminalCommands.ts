/** Parser baris perintah mode Terminal (gaya Bloomberg: "<KODE> <FUNGSI>"). */

export type TerminalPanel = 'monitor' | 'chart' | 'news' | 'heatmap' | 'eco' | 'corr' | 'top';

export type TerminalCommand =
  | { type: 'asset'; symbol: string; code: string; panel: 'monitor' | 'chart' | 'news' }
  | { type: 'panel'; panel: 'heatmap' | 'eco' | 'corr' | 'top' }
  | { type: 'help' }
  | { type: 'radar' }
  | { type: 'error'; message: string };

/** Kode aset yang dikenali → simbol aplikasi. Urutan = urutan saran. */
export const TERMINAL_ASSET_CODES: Array<{ code: string; symbol: string; label: string }> = [
  { code: 'BTC', symbol: 'BTC/IDR', label: 'Bitcoin' },
  { code: 'ETH', symbol: 'ETH/IDR', label: 'Ethereum' },
  { code: 'SOL', symbol: 'SOL/IDR', label: 'Solana' },
  { code: 'IHSG', symbol: '^JKSE', label: 'IHSG' },
  { code: 'EMAS', symbol: 'XAU/USD', label: 'Emas spot' },
  { code: 'XAU', symbol: 'XAU/USD', label: 'Emas spot' },
  { code: 'USD', symbol: 'USD/IDR', label: 'Kurs USD/IDR' },
];

// Alias tambahan yang diterima tetapi tidak ditampilkan di saran
const EXTRA_ALIASES: Record<string, string> = {
  JKSE: '^JKSE',
  GOLD: 'XAU/USD',
  USDIDR: 'USD/IDR',
};

const PANEL_COMMANDS: Record<string, { panel: 'heatmap' | 'eco' | 'corr' | 'top'; description: string }> = {
  HM: { panel: 'heatmap', description: 'Heatmap perubahan 24 jam' },
  ECO: { panel: 'eco', description: 'Kalender ekonomi' },
  CORR: { panel: 'corr', description: 'Korelasi 30 hari' },
  TOP: { panel: 'top', description: 'Umpan berita terbaru' },
};

export interface CommandHelpItem {
  command: string;
  description: string;
}

export const TERMINAL_HELP: CommandHelpItem[] = [
  { command: '<KODE>', description: 'Pilih aset: BTC, ETH, SOL, IHSG, EMAS/XAU, USD' },
  { command: '<KODE> GP', description: 'Grafik aset, contoh: ETH GP' },
  { command: '<KODE> N', description: 'Berita aset, contoh: IHSG N' },
  ...Object.entries(PANEL_COMMANDS).map(([command, p]) => ({ command, description: p.description })),
  { command: 'HELP', description: 'Daftar perintah' },
  { command: 'RADAR', description: 'Kembali ke halaman Radar' },
];

function normalize(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, ' ');
}

function lookupAsset(code: string): string | undefined {
  return TERMINAL_ASSET_CODES.find((a) => a.code === code)?.symbol ?? EXTRA_ALIASES[code];
}

/** Mengurai satu baris perintah. Mengembalikan null untuk input kosong. */
export function parseTerminalCommand(input: string): TerminalCommand | null {
  const text = normalize(input);
  if (!text) return null;
  if (text === 'HELP' || text === '?') return { type: 'help' };
  if (text === 'RADAR') return { type: 'radar' };
  if (PANEL_COMMANDS[text]) return { type: 'panel', panel: PANEL_COMMANDS[text].panel };

  const [code, fn, ...rest] = text.split(' ');
  const symbol = lookupAsset(code);
  if (!symbol) {
    return { type: 'error', message: `Perintah tidak dikenal: "${text}". Ketik HELP untuk daftar perintah.` };
  }
  if (rest.length > 0 || (fn && fn !== 'GP' && fn !== 'N')) {
    return {
      type: 'error',
      message: `Fungsi "${[fn, ...rest].join(' ')}" tidak dikenal untuk ${code}. Gunakan GP (grafik) atau N (berita).`,
    };
  }
  return { type: 'asset', symbol, code, panel: fn === 'GP' ? 'chart' : fn === 'N' ? 'news' : 'monitor' };
}

const ALL_SUGGESTIONS: CommandHelpItem[] = [
  ...TERMINAL_ASSET_CODES.flatMap(({ code, label }) => [
    { command: code, description: label },
    { command: `${code} GP`, description: `Grafik ${label}` },
    { command: `${code} N`, description: `Berita ${label}` },
  ]),
  ...Object.entries(PANEL_COMMANDS).map(([command, p]) => ({ command, description: p.description })),
  { command: 'HELP', description: 'Daftar perintah' },
  { command: 'RADAR', description: 'Kembali ke Radar' },
];

/** Saran otomatis: perintah yang diawali teks yang sedang diketik. */
export function getCommandSuggestions(input: string, limit = 6): CommandHelpItem[] {
  const text = normalize(input);
  if (!text) return [];
  return ALL_SUGGESTIONS.filter((s) => s.command.startsWith(text) && s.command !== text).slice(0, limit);
}
