/**
 * terminalCommands.ts — Parser and autocomplete for the Terminal command line
 * (Bloomberg style: "<CODE> <FUNCTION>", e.g. "ETH GP", "SPX N"), plus the HELP command list.
 * Asset codes and aliases come from ASSETS (config/assets.ts).
 */
import { ASSETS, getAssetByCode } from '../config/assets.ts';

export type TerminalPanel = 'monitor' | 'chart' | 'news' | 'heatmap' | 'eco' | 'corr' | 'top';

export type TerminalCommand =
  | { type: 'asset'; symbol: string; code: string; panel: 'monitor' | 'chart' | 'news' }
  | { type: 'panel'; panel: 'heatmap' | 'eco' | 'corr' | 'top' }
  | { type: 'help' }
  | { type: 'radar' }
  | { type: 'advisor' }
  | { type: 'error'; message: string };

/** Recognized asset codes (aliases are accepted but not suggested). Order = suggestion order. */
export const TERMINAL_ASSET_CODES: Array<{ code: string; symbol: string; label: string }> =
  ASSETS.map((a) => ({ code: a.code, symbol: a.symbol, label: a.name }));

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
  { command: '<CODE>', description: 'Select an asset, e.g. BTC, JCI, SPX, NDX, N225, FTSE, GOLD, EUR, JPY' },
  { command: '<CODE> GP', description: 'Asset chart, e.g. ETH GP' },
  { command: '<CODE> N', description: 'Asset news, e.g. JCI N' },
  ...Object.entries(PANEL_COMMANDS).map(([command, p]) => ({ command, description: p.description })),
  { command: 'HELP', description: 'List of commands' },
  { command: 'AI', description: 'Open the AI Advisor (backtested outlook)' },
  { command: 'RADAR', description: 'Back to the Radar page' },
];

function normalize(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, ' ');
}

function lookupAsset(code: string): string | undefined {
  return getAssetByCode(code)?.symbol;
}

/** Parses one command line. Returns null for empty input. */
export function parseTerminalCommand(input: string): TerminalCommand | null {
  const text = normalize(input);
  if (!text) return null;
  if (text === 'HELP' || text === '?') return { type: 'help' };
  if (text === 'RADAR') return { type: 'radar' };
  if (text === 'AI' || text === 'ADVISOR') return { type: 'advisor' };
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
  { command: 'AI', description: 'AI Advisor' },
  { command: 'RADAR', description: 'Back to Radar' },
];

/** Autocomplete: commands that start with the text being typed. */
export function getCommandSuggestions(input: string, limit = 6): CommandHelpItem[] {
  const text = normalize(input);
  if (!text) return [];
  return ALL_SUGGESTIONS.filter((s) => s.command.startsWith(text) && s.command !== text).slice(0, limit);
}
