/** terminalCommands.test.ts — Tests for the Terminal command parser and autocomplete. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTerminalCommand, getCommandSuggestions } from './terminalCommands.ts';

test('parseTerminalCommand handles asset codes and functions', () => {
  assert.equal(parseTerminalCommand('   '), null);
  assert.deepEqual(parseTerminalCommand('btc'), {
    type: 'asset',
    symbol: 'BTC/IDR',
    code: 'BTC',
    panel: 'monitor',
  });
  assert.deepEqual(parseTerminalCommand(' eth   gp '), {
    type: 'asset',
    symbol: 'ETH/IDR',
    code: 'ETH',
    panel: 'chart',
  });
  assert.equal((parseTerminalCommand('JCI N') as { symbol: string }).symbol, '^JKSE');
  assert.equal((parseTerminalCommand('gold') as { symbol: string }).symbol, 'XAU/USD');
  assert.equal((parseTerminalCommand('XAU GP') as { symbol: string }).symbol, 'XAU/USD');
  assert.equal((parseTerminalCommand('usd') as { symbol: string }).symbol, 'USD/IDR');
  // Legacy Indonesian codes still work
  assert.equal((parseTerminalCommand('IHSG') as { symbol: string }).symbol, '^JKSE');
  assert.equal((parseTerminalCommand('emas') as { symbol: string }).symbol, 'XAU/USD');
});

test('parseTerminalCommand handles panel, help, radar and errors', () => {
  assert.deepEqual(parseTerminalCommand('hm'), { type: 'panel', panel: 'heatmap' });
  assert.deepEqual(parseTerminalCommand('ECO'), { type: 'panel', panel: 'eco' });
  assert.deepEqual(parseTerminalCommand('corr'), { type: 'panel', panel: 'corr' });
  assert.deepEqual(parseTerminalCommand('TOP'), { type: 'panel', panel: 'top' });
  assert.deepEqual(parseTerminalCommand('help'), { type: 'help' });
  assert.deepEqual(parseTerminalCommand('Radar'), { type: 'radar' });
  assert.deepEqual(parseTerminalCommand('ai'), { type: 'advisor' });
  assert.equal(parseTerminalCommand('NOTACODE')?.type, 'error');
  assert.equal(parseTerminalCommand('BTC XYZ')?.type, 'error');
  assert.equal(parseTerminalCommand('BTC GP N')?.type, 'error');
});

test('getCommandSuggestions returns prefix matches', () => {
  assert.deepEqual(getCommandSuggestions(''), []);
  assert.deepEqual(
    getCommandSuggestions('eth').map((s) => s.command),
    ['ETH GP', 'ETH N', 'ETH INTEL', 'ETH HP', 'ETH CAL']
  );
  assert.deepEqual(
    getCommandSuggestions('co').map((s) => s.command).slice(0, 2),
    ['CORR', 'COPPER']
  );
  assert.deepEqual(getCommandSuggestions('ec').map((s) => s.command), ['ECO']);
  assert.ok(getCommandSuggestions('G').some((s) => s.command === 'GOLD'));
  assert.deepEqual(getCommandSuggestions('gold g').map((s) => s.command), ['GOLD GP']);
  assert.ok(getCommandSuggestions('E').length <= 6);
});

test('parseTerminalCommand understands global indices and currencies', () => {
  assert.equal((parseTerminalCommand('spx gp') as { symbol: string }).symbol, '^GSPC');
  assert.equal((parseTerminalCommand('NASDAQ') as { symbol: string }).symbol, '^NDX');
  assert.equal((parseTerminalCommand('nikkei n') as { symbol: string }).symbol, '^N225');
  assert.equal((parseTerminalCommand('EUR') as { symbol: string }).symbol, 'EUR/IDR');
  assert.equal((parseTerminalCommand('jpyidr') as { symbol: string }).symbol, 'JPY/IDR');
  assert.equal((parseTerminalCommand('DXY') as { symbol: string }).symbol, 'DXY');
});

test('new market functions and asset analysis commands', () => {
  assert.deepEqual(parseTerminalCommand('mov'), { type: 'panel', panel: 'mov' });
  assert.deepEqual(parseTerminalCommand('WEI'), { type: 'panel', panel: 'wei' });
  assert.deepEqual(parseTerminalCommand('fxc'), { type: 'panel', panel: 'fxc' });
  assert.deepEqual(parseTerminalCommand('curv'), { type: 'panel', panel: 'curv' });
  assert.deepEqual(parseTerminalCommand('quant'), { type: 'quant' });
  assert.equal((parseTerminalCommand('bbca intel') as { panel: string }).panel, 'intel');
  assert.equal((parseTerminalCommand('NVDA TA') as { panel: string }).panel, 'intel');
  assert.equal((parseTerminalCommand('spx hp') as { panel: string }).panel, 'hp');
  assert.deepEqual(getCommandSuggestions('btc').map((s) => s.command), ['BTC GP', 'BTC N', 'BTC INTEL', 'BTC HP', 'BTC CAL']);
  assert.deepEqual(parseTerminalCommand('cal'), { type: 'panel', panel: 'cal' });
  assert.equal((parseTerminalCommand('bbca cal') as { panel: string }).panel, 'cal');
  assert.deepEqual(getCommandSuggestions('cu').map((s) => s.command)[0], 'CURV');
});
