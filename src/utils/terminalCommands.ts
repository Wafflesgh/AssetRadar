/**
 * terminalCommands.ts — Parser and autocomplete for the Terminal command line
 * (Bloomberg style: "<CODE> <FUNCTION>", e.g. "ETH GP", "BBCA INTEL", "SPX HP"), the market
 * functions (MOV, WEI, FXC, CURV, HM, ECO, CORR, TOP) and the HELP command list.
 * Asset codes and aliases come from ASSETS (config/assets.ts).
 */
import { ASSETS, getAssetByCode } from '../config/assets.ts';
import { translate, type AppLang, type TranslationKey } from '../i18n/core.ts';

export type AssetPanel = 'monitor' | 'chart' | 'news' | 'intel' | 'hp' | 'cal' | 'sent' | 'lvl';
export type MarketPanel = 'heatmap' | 'eco' | 'corr' | 'top' | 'mov' | 'wei' | 'fxc' | 'curv' | 'cal' | 'idmacro' | 'rank' | 'bnb';
export type TerminalPanel = AssetPanel | MarketPanel;

export type TerminalCommand =
  | { type: 'asset'; symbol: string; code: string; panel: TerminalPanel }
  | { type: 'panel'; panel: MarketPanel; market?: 'idx' | 'us'; horizon?: 'short' | 'medium' | 'long' }
  | { type: 'binancePair'; pair: string }
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
  RANK: { panel: 'rank' },
  BINANCE: { panel: 'bnb' },
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
  SENT: { panel: 'sent' },
  LVL: { panel: 'lvl' },
};
const SUGGESTED_FUNCTIONS = ['GP', 'N', 'INTEL', 'SENT', 'LVL', 'HP', 'CAL'];

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
    ...['GP', 'N', 'INTEL', 'SENT', 'LVL', 'HP', 'CAL'].map((fn) => ({ command: `<CODE> ${fn}`, description: tk(lang, `term.help.${fn}`) })),
    { command: 'BNB', description: tk(lang, 'term.help.BNB') },
    { command: 'SENT <CODE>', description: tk(lang, 'term.help.SENT') },
    { command: 'LVL <CODE>', description: tk(lang, 'term.help.LVL') },
    { command: 'RANK IDX|US SHORT|MEDIUM|LONG', description: tk(lang, 'term.help.RANK') },
    { command: 'BNB <PAIR>', description: tk(lang, 'term.help.BNBPAIR') },
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

  // Command-first forms: SENT <CODE>, LVL <CODE>, RANK IDX|US [SHORT|MEDIUM|LONG], BNB <PAIR>
  const [head, ...args] = text.split(' ');
  if ((head === 'SENT' || head === 'LVL') && args.length === 1) {
    const a = getAssetByCode(args[0]);
    if (a) return { type: 'asset', symbol: a.symbol, code: args[0], panel: head === 'SENT' ? 'sent' : 'lvl' };
    return { type: 'error', message: tk(lang, 'term.err.unknown', { text }) };
  }
  if (head === 'RANK' && args.length >= 1 && args.length <= 2) {
    const market = args[0] === 'IDX' || args[0] === 'BEI' ? 'idx' : args[0] === 'US' ? 'us' : null;
    const horizon = args[1] === undefined ? 'medium' : ({ SHORT: 'short', MEDIUM: 'medium', LONG: 'long' } as const)[args[1] as 'SHORT'];
    if (market && horizon) return { type: 'panel', panel: 'rank', market, horizon };
    return { type: 'error', message: tk(lang, 'term.err.rank') };
  }
  // "BNB GP" stays the BNB coin's chart; any other single word after BNB is a Binance pair
  if (head === 'BNB' && args.length === 1 && !ASSET_FUNCTIONS[args[0]]) {
    const pair = args[0].endsWith('USDT') ? args[0] : `${args[0]}USDT`;
    return { type: 'binancePair', pair };
  }
  // BNB is both the coin and the Binance panel: select the coin and open the Binance table
  if (text === 'BNB') {
    const bnb = getAssetByCode('BNB');
    if (bnb) return { type: 'asset', symbol: bnb.symbol, code: 'BNB', panel: 'bnb' };
  }

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
