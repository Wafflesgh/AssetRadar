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
  assert.equal(parseTerminalCommand('DOGE')?.type, 'error');
  assert.equal(parseTerminalCommand('BTC XYZ')?.type, 'error');
  assert.equal(parseTerminalCommand('BTC GP N')?.type, 'error');
});

test('getCommandSuggestions returns prefix matches', () => {
  assert.deepEqual(getCommandSuggestions(''), []);
  assert.deepEqual(
    getCommandSuggestions('eth').map((s) => s.command),
    ['ETH GP', 'ETH N']
  );
  assert.deepEqual(
    getCommandSuggestions('c').map((s) => s.command),
    ['CORR']
  );
  assert.deepEqual(getCommandSuggestions('ec').map((s) => s.command), ['ECO']);
  assert.ok(getCommandSuggestions('G').some((s) => s.command === 'GOLD GP'));
  assert.ok(getCommandSuggestions('E').length <= 6);
});
