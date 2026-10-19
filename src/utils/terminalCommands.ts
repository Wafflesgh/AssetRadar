/**
 * terminalCommands.ts — Parser and autocomplete for the Terminal command line
 * (Bloomberg style: "<CODE> <FUNCTION>", e.g. "ETH GP"), plus the HELP command list.
 */

export type TerminalPanel = 'monitor' | 'chart' | 'news' | 'heatmap' | 'eco' | 'corr' | 'top';

export type TerminalCommand =
  | { type: 'asset'; symbol: string; code: string; panel: 'monitor' | 'chart' | 'news' }
  | { type: 'panel'; panel: 'heatmap' | 'eco' | 'corr' | 'top' }
  | { type: 'help' }
  | { type: 'radar' }
  | { type: 'error'; message: string };

/** Recognized asset codes → app symbol. Order = suggestion order. */
export const TERMINAL_ASSET_CODES: Array<{ code: string; symbol: string; label: string }> = [
  { code: 'BTC', symbol: 'BTC/IDR', label: 'Bitcoin' },
  { code: 'ETH', symbol: 'ETH/IDR', label: 'Ethereum' },
  { code: 'SOL', symbol: 'SOL/IDR', label: 'Solana' },
  { code: 'JCI', symbol: '^JKSE', label: 'Jakarta Composite Index' },
  { code: 'GOLD', symbol: 'XAU/USD', label: 'Spot gold' },
  { code: 'XAU', symbol: 'XAU/USD', label: 'Spot gold' },
  { code: 'USD', symbol: 'USD/IDR', label: 'USD/IDR rate' },
];

// Extra aliases that are accepted but not shown in suggestions (incl. legacy Indonesian codes)
const EXTRA_ALIASES: Record<string, string> = {
  IHSG: '^JKSE',
  JKSE: '^JKSE',
  EMAS: 'XAU/USD',
  USDIDR: 'USD/IDR',
};

const PANEL_COMMANDS: Record<string, { panel: 'heatmap' | 'eco' | 'corr' | 'top'; description: string }> = {
  HM: { panel: 'heatmap', description: '24-hour change heatmap' },
  ECO: { panel: 'eco', description: 'Economic calendar' },
  CORR: { panel: 'corr', description: '30-day correlation' },
  TOP: { panel: 'top', description: 'Latest news feed' },
};

export interface CommandHelpItem {
  command: string;
  description: string;
}

export const TERMINAL_HELP: CommandHelpItem[] = [
  { command: '<CODE>', description: 'Select an asset: BTC, ETH, SOL, JCI, GOLD/XAU, USD' },
  { command: '<CODE> GP', description: 'Asset chart, e.g. ETH GP' },
  { command: '<CODE> N', description: 'Asset news, e.g. JCI N' },
  ...Object.entries(PANEL_COMMANDS).map(([command, p]) => ({ command, description: p.description })),
  { command: 'HELP', description: 'List of commands' },
  { command: 'RADAR', description: 'Back to the Radar page' },
];

function normalize(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, ' ');
}

function lookupAsset(code: string): string | undefined {
  return TERMINAL_ASSET_CODES.find((a) => a.code === code)?.symbol ?? EXTRA_ALIASES[code];
}

/** Parses one command line. Returns null for empty input. */
export function parseTerminalCommand(input: string): TerminalCommand | null {
  const text = normalize(input);
  if (!text) return null;
  if (text === 'HELP' || text === '?') return { type: 'help' };
  if (text === 'RADAR') return { type: 'radar' };
  if (PANEL_COMMANDS[text]) return { type: 'panel', panel: PANEL_COMMANDS[text].panel };

  const [code, fn, ...rest] = text.split(' ');
  const symbol = lookupAsset(code);
  if (!symbol) {
    return { type: 'error', message: `Unknown command: "${text}". Type HELP for the list of commands.` };
  }
  if (rest.length > 0 || (fn && fn !== 'GP' && fn !== 'N')) {
    return {
      type: 'error',
      message: `Unknown function "${[fn, ...rest].join(' ')}" for ${code}. Use GP (chart) or N (news).`,
    };
  }
  return { type: 'asset', symbol, code, panel: fn === 'GP' ? 'chart' : fn === 'N' ? 'news' : 'monitor' };
}

const ALL_SUGGESTIONS: CommandHelpItem[] = [
  ...TERMINAL_ASSET_CODES.flatMap(({ code, label }) => [
    { command: code, description: label },
    { command: `${code} GP`, description: `${label} chart` },
    { command: `${code} N`, description: `${label} news` },
  ]),
  ...Object.entries(PANEL_COMMANDS).map(([command, p]) => ({ command, description: p.description })),
  { command: 'HELP', description: 'List of commands' },
  { command: 'RADAR', description: 'Back to Radar' },
];

/** Autocomplete: commands that start with the text being typed. */
export function getCommandSuggestions(input: string, limit = 6): CommandHelpItem[] {
  const text = normalize(input);
  if (!text) return [];
  return ALL_SUGGESTIONS.filter((s) => s.command.startsWith(text) && s.command !== text).slice(0, limit);
}
