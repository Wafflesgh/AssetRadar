/**
 * terminalCommands.ts — Parser and autocomplete for the Terminal command line
 * (Bloomberg style: "<CODE> <FUNCTION>", e.g. "ETH GP", "BBCA INTEL", "SPX HP"), the market
 * functions (MOV, WEI, FXC, CURV, HM, ECO, CORR, TOP) and the HELP command list.
 * Asset codes and aliases come from ASSETS (config/assets.ts).
 */
import { ASSETS, getAssetByCode } from '../config/assets.ts';
import { translate, type AppLang, type TranslationKey } from '../i18n/core.ts';

export type AssetPanel = 'monitor' | 'chart' | 'news' | 'intel' | 'hp' | 'cal';
export type MarketPanel = 'heatmap' | 'eco' | 'corr' | 'top' | 'mov' | 'wei' | 'fxc' | 'curv' | 'cal' | 'idmacro';
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

/** Market-wide panel commands. Descriptions are translation keys term.panel.<CMD>. */
export const PANEL_COMMANDS: Record<string, { panel: MarketPanel }> = {
  MOV: { panel: 'mov' },
  WEI: { panel: 'wei' },
  FXC: { panel: 'fxc' },
  CURV: { panel: 'curv' },
  CAL: { panel: 'cal' },
  IDMACRO: { panel: 'idmacro' },
  HM: { panel: 'heatmap' },
  ECO: { panel: 'eco' },
  CORR: { panel: 'corr' },
  TOP: { panel: 'top' },
};

/** Functions after an asset code: "ETH GP". Descriptions are translation keys term.fn.<FN>. */
const ASSET_FUNCTIONS: Record<string, { panel: AssetPanel }> = {
  GP: { panel: 'chart' },
  N: { panel: 'news' },
  INTEL: { panel: 'intel' },
  TA: { panel: 'intel' },
  FA: { panel: 'intel' },
  HP: { panel: 'hp' },
  CAL: { panel: 'cal' },
};
const SUGGESTED_FUNCTIONS = ['GP', 'N', 'INTEL', 'HP', 'CAL'];

export interface CommandHelpItem {
  command: string;
  description: string;
}

const tk = (lang: AppLang, key: string, params?: Record<string, string | number>) =>
  translate(lang, key as TranslationKey, params);

/** The HELP table in the chosen language (commands themselves stay English codes). */
export function terminalHelp(lang: AppLang = 'en'): CommandHelpItem[] {
  return [
    { command: '<CODE>', description: tk(lang, 'term.help.code') },
    ...['GP', 'N', 'INTEL', 'HP', 'CAL'].map((fn) => ({ command: `<CODE> ${fn}`, description: tk(lang, `term.help.${fn}`) })),
    ...Object.keys(PANEL_COMMANDS).map((command) => ({ command, description: tk(lang, `term.panel.${command}`) })),
    ...['HELP', 'AI', 'QUANT', 'RADAR'].map((command) => ({ command, description: tk(lang, `term.help.${command}`) })),
  ];
}

export const TERMINAL_HELP: CommandHelpItem[] = terminalHelp('en');

function normalize(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Parses one command line. Returns null for empty input. */
export function parseTerminalCommand(input: string, lang: AppLang = 'en'): TerminalCommand | null {
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
    return { type: 'error', message: tk(lang, 'term.err.unknown', { text }) };
  }
  if (rest.length > 0 || (fn && !ASSET_FUNCTIONS[fn])) {
    return {
      type: 'error',
      message: tk(lang, 'term.err.function', { fn: [fn, ...rest].join(' '), code }),
    };
  }
  return { type: 'asset', symbol: asset.symbol, code, panel: fn ? ASSET_FUNCTIONS[fn].panel : 'monitor' };
}

function commandSuggestions(lang: AppLang): CommandHelpItem[] {
  return [
    ...Object.keys(PANEL_COMMANDS).map((command) => ({ command, description: tk(lang, `term.panel.${command}`) })),
    { command: 'HELP', description: tk(lang, 'term.help.HELP') },
    ...['AI', 'QUANT', 'RADAR'].map((command) => ({ command, description: tk(lang, `term.sug.${command}`) })),
  ];
}

/**
 * Autocomplete. Once the text names a full asset code ("ETH", "ETH G"), it suggests that
 * asset's functions; otherwise panel commands first, then asset codes that start with the text.
 */
export function getCommandSuggestions(input: string, limit = 6, lang: AppLang = 'en'): CommandHelpItem[] {
  const text = normalize(input);
  if (!text) return [];
  const code = text.split(' ')[0];
  const asset = TERMINAL_ASSET_CODES.find((a) => a.code === code);
  if (asset) {
    return SUGGESTED_FUNCTIONS.map((fn) => ({
      command: `${code} ${fn}`,
      description: `${asset.label} ${tk(lang, `term.fn.${fn}`)}`,
    })).filter((s) => s.command.startsWith(text) && s.command !== text);
  }
  const commands = commandSuggestions(lang).filter((s) => s.command.startsWith(text) && s.command !== text);
  const assets = TERMINAL_ASSET_CODES.filter((a) => a.code.startsWith(text) && a.code !== text).map((a) => ({
    command: a.code,
    description: a.label,
  }));
  return [...commands, ...assets].slice(0, limit);
}
