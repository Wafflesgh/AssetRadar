/**
 * arena.test.ts — Tests for the model arena: naive Bayes, walk-forward blocks, the per-asset
 * contest on synthetic data, the leaderboard and the live log (record, score, board, parse).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_MODELS,
  arenaLeaderboard,
  arenaLiveBoard,
  emptyArenaLog,
  evaluateArenaLog,
  parseArenaLog,
  pendingArenaSymbols,
  predictNaiveBayes,
  recordArenaDay,
  runArena,
  trainNaiveBayes,
  walkForwardWith,
} from './arena.ts';
import { trainLogistic, walkForwardPredictions, type Sample } from './model.ts';

/** Deterministic samples where feature 0 predicts the label most of the time. */
function synthetic(n: number): Sample[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, (_, t) => {
    const x = Array.from({ length: 13 }, () => rnd() * 2 - 1);
    const y = (x[0] > 0 ? 0.8 : 0.25) > rnd() ? 1 : 0;
    return { t, x, y, fwdReturn: y ? 0.02 : -0.02 };
  });
}

test('naive Bayes learns an informative feature', () => {
  const s = synthetic(600);
  const m = trainNaiveBayes(s.map((q) => q.x), s.map((q) => q.y));
  const hi = predictNaiveBayes(m, [0.9, ...Array(12).fill(0)]);
  const lo = predictNaiveBayes(m, [-0.9, ...Array(12).fill(0)]);
  assert.ok(hi > 0.5 && lo < 0.5, `${hi} ${lo}`);
});

test('walk-forward never trains on labels from the future', () => {
  const s = synthetic(400);
  let violations = 0;
  walkForwardWith(
    s,
    20,
    (train) => train,
    (train, x) => {
      const t = s.find((q) => q.x === x)!.t;
      if (train.some((q) => q.t + 20 >= t)) violations++;
      return 0.5;
    },
    { minTrain: 250, step: 42 }
  );
  assert.equal(violations, 0);
});

test('every model is scored on the same days; the informative ones beat the base rate', () => {
  const s = synthetic(900);
  const preds = walkForwardPredictions(s, 1, { minTrain: 250, step: 42 });
  const a = runArena({ samples: s, horizon: 1, current: s[s.length - 1].x, logisticPreds: preds, logistic: trainLogistic(s.map((q) => q.x), s.map((q) => q.y)) });
  assert.ok(a);
  assert.deepEqual(a.models.map((m) => m.id), [...ARENA_MODELS]);
  const by = Object.fromEntries(a.models.map((m) => [m.id, m]));
  assert.equal(by.logistic.oos?.predictions, by.baseRate.oos?.predictions);
  assert.ok((by.logistic.brierSkill ?? 0) > 0.05);
  assert.ok((by.naiveBayes.brierSkill ?? 0) > 0.05);
  assert.ok(Math.abs(by.baseRate.brierSkill ?? 1) < 1e-9);
  assert.ok(['logistic', 'naiveBayes', 'ensemble'].includes(a.best as string));
  assert.equal(a.votes.up + a.votes.down + a.votes.none, ARENA_MODELS.length - 1);

  const board = arenaLeaderboard([{ arena: a }, { arena: null }]);
  assert.equal(board.length, ARENA_MODELS.length);
  assert.ok((board[0].brierSkill ?? 0) >= (board[board.length - 1].brierSkill ?? 0));
  assert.equal(board.reduce((n, r) => n + r.wins, 0), 1);
});

test('live log: record once, score when due, board and parse', () => {
  const arena = { models: [{ id: 'logistic', pNow: 0.7 }, { id: 'baseRate', pNow: 0.52 }], best: 'logistic', votes: { up: 1, down: 0, none: 0 } } as never;
  let log = recordArenaDay(emptyArenaLog(), '2026-10-21', 2, [{ symbol: 'A', arena }, { symbol: 'B', arena: null }]);
  assert.equal(log.entries.length, 1);
  assert.equal(recordArenaDay(log, '2026-10-21', 2, [{ symbol: 'A', arena }]), log);
  assert.deepEqual(pendingArenaSymbols(log), ['A']);
  const bars = [
    { date: '2026-10-21', close: 100 },
    { date: '2026-10-22', close: 99 },
  ];
  assert.equal(evaluateArenaLog(log, new Map([['A', bars]])), log); // not due yet
  log = evaluateArenaLog(log, new Map([['A', [...bars, { date: '2026-10-23', close: 105 }]]]));
  assert.equal(log.entries[0].outcome?.up, true);
  const board = arenaLiveBoard(log, 2);
  assert.equal(board.evaluated, 1);
  assert.equal(board.rows[0].id, 'logistic');
  assert.ok(Math.abs((board.rows[0].brier ?? 0) - 0.09) < 1e-9);
  assert.deepEqual(parseArenaLog(JSON.parse(JSON.stringify(log))), log);
  assert.equal(parseArenaLog({ version: 2 }), null);
});
