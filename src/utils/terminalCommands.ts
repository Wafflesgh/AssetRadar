/**
 * terminalCommands.ts — Parser and autocomplete for the Terminal command line
 * (Bloomberg style: "<CODE> <FUNCTION>", e.g. "ETH GP", "BBCA INTEL", "SPX HP"), the market
 * functions (MOV, WEI, FXC, CURV, HM, ECO, CORR, TOP) and the HELP command list.
 * Asset codes and aliases come from ASSETS (config/assets.ts).
 */
import { ASSETS, getAssetByCode } from '../config/assets.ts';

export type AssetPanel = 'monitor' | 'chart' | 'news' | 'intel' | 'hp';
export type MarketPanel = 'heatmap' | 'eco' | 'corr' | 'top' | 'mov' | 'wei' | 'fxc' | 'curv';
export type TerminalPanel = AssetPanel | MarketPanel;

export type TerminalCommand =
  | { type: 'asset'; symbol: string; code: string; panel: AssetPanel }
  | { type: 'panel'; panel: MarketPanel }
  | { type: 'help' }
  | { type: 'radar' }
  | { type: 'advisor' }
  | { type: 'quant' }
  | { type: 'error'; message: string };

/** Recognized asset codes (aliases are accepted but not suggested). Order = suggestion order. */
export const TERMINAL_ASSET_CODES: Array<{ code: string; symbol: string; label: string }> =
  ASSETS.map((a) => ({ code: a.code, symbol: a.symbol, label: a.name }));

export const PANEL_COMMANDS: Record<string, { panel: MarketPanel; description: string }> = {
  MOV: { panel: 'mov', description: 'Biggest movers (live 5m, 1H, 24H, 7D)' },
  WEI: { panel: 'wei', description: 'World equity indices' },
  FXC: { panel: 'fxc', description: 'Currency cross rates' },
  CURV: { panel: 'curv', description: 'US Treasury yield curve' },
  HM: { panel: 'heatmap', description: '24-hour change heatmap' },
  ECO: { panel: 'eco', description: 'Economic calendar' },
  CORR: { panel: 'corr', description: '30-day correlation' },
  TOP: { panel: 'top', description: 'Latest news feed' },
};

/** Asset functions: "<CODE> GP" etc. Aliases map to the same panel. */
const ASSET_FUNCTIONS: Record<string, { panel: AssetPanel; description: string }> = {
  GP: { panel: 'chart', description: 'chart' },
  N: { panel: 'news', description: 'news' },
  INTEL: { panel: 'intel', description: 'technical & fundamental analysis' },
  TA: { panel: 'intel', description: 'technical analysis' },
  FA: { panel: 'intel', description: 'fundamental analysis' },
  HP: { panel: 'hp', description: 'historical prices' },
};
const SUGGESTED_FUNCTIONS = ['GP', 'N', 'INTEL', 'HP'];

export interface CommandHelpItem {
  command: string;
  description: string;
}

export const TERMINAL_HELP: CommandHelpItem[] = [
  { command: '<CODE>', description: 'Select an asset, e.g. BTC, BBCA, NVDA, SPX, N225, GOLD, OIL, EUR' },
  { command: '<CODE> GP', description: 'Asset chart, e.g. ETH GP' },
  { command: '<CODE> N', description: 'Asset news, e.g. JCI N' },
  { command: '<CODE> INTEL', description: 'Technical patterns, scorecard and fundamentals (also TA / FA)' },
  { command: '<CODE> HP', description: 'Historical daily prices, e.g. SPX HP' },
  ...Object.entries(PANEL_COMMANDS).map(([command, p]) => ({ command, description: p.description })),
  { command: 'HELP', description: 'List of commands' },
  { command: 'AI', description: 'Open the AI Advisor (backtested outlook)' },
  { command: 'QUANT', description: 'Open the value/momentum portfolio simulator' },
  { command: 'RADAR', description: 'Back to the Radar page' },
];

function normalize(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Parses one command line. Returns null for empty input. */
export function parseTerminalCommand(input: string): TerminalCommand | null {
  const text = normalize(input);
  if (!text) return null;
  if (text === 'HELP' || text === '?') return { type: 'help' };
  if (text === 'RADAR') return { type: 'radar' };
  if (text === 'AI' || text === 'ADVISOR') return { type: 'advisor' };
  if (text === 'QUANT' || text === 'LAB') return { type: 'quant' };
  if (PANEL_COMMANDS[text]) return { type: 'panel', panel: PANEL_COMMANDS[text].panel };

  const [code, fn, ...rest] = text.split(' ');
  const asset = getAssetByCode(code);
  if (!asset) {
    return { type: 'error', message: `Unknown command: "${text}". Type HELP for the list of commands.` };
  }
  if (rest.length > 0 || (fn && !ASSET_FUNCTIONS[fn])) {
    return {
      type: 'error',
      message: `Unknown function "${[fn, ...rest].join(' ')}" for ${code}. Use GP (chart), N (news), INTEL (analysis) or HP (history).`,
    };
  }
  return { type: 'asset', symbol: asset.symbol, code, panel: fn ? ASSET_FUNCTIONS[fn].panel : 'monitor' };
}

const COMMAND_SUGGESTIONS: CommandHelpItem[] = [
  ...Object.entries(PANEL_COMMANDS).map(([command, p]) => ({ command, description: p.description })),
  { command: 'HELP', description: 'List of commands' },
  { command: 'AI', description: 'AI Advisor' },
  { command: 'QUANT', description: 'Portfolio simulator' },
  { command: 'RADAR', description: 'Back to Radar' },
];

/**
 * Autocomplete. Once the text names a full asset code ("ETH", "ETH G"), it suggests that
 * asset's functions; otherwise panel commands first, then asset codes that start with the text.
 */
export function getCommandSuggestions(input: string, limit = 6): CommandHelpItem[] {
  const text = normalize(input);
  if (!text) return [];
  const code = text.split(' ')[0];
  const asset = TERMINAL_ASSET_CODES.find((a) => a.code === code);
  if (asset) {
    return SUGGESTED_FUNCTIONS.map((fn) => ({
      command: `${code} ${fn}`,
      description: `${asset.label} ${ASSET_FUNCTIONS[fn].description}`,
    })).filter((s) => s.command.startsWith(text) && s.command !== text);
  }
  const commands = COMMAND_SUGGESTIONS.filter((s) => s.command.startsWith(text) && s.command !== text);
  const assets = TERMINAL_ASSET_CODES.filter((a) => a.code.startsWith(text) && a.code !== text).map((a) => ({
    command: a.code,
    description: a.label,
  }));
  return [...commands, ...assets].slice(0, limit);
}
