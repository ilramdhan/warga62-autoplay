import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildView } from '../src/core/state/view.js';

const baseGame = () => ({
  phase: 'pre_roll',
  round: 3,
  settings: { difficulty: 'medium', mode: 'survival' },
  players: {
    a: { id: 'a', name: 'JULE', cash: 5_000_000, position: 0 },
    b: { id: 'b', name: 'ilramdhan.dev', cash: 2_000_000, position: 10 },
    c: { id: 'c', name: 'Gone', cash: 0, position: 5, bankrupt: true },
  },
  properties: {
    1: { owner: 'a', level: 0 },
    2: { owner: 'a', level: 0 },
    3: { owner: 'a', level: 2 },
    45: { owner: 'b', level: 1, mortgaged: false },
    46: { owner: 'b', level: 0, mortgaged: true },
  },
  loans: [{ borrower: 'b', lender: 'a', amount: 1_000_000, interestPercent: 25 }],
});

test('buildView tidak melempar untuk input kosong', () => {
  for (const g of [null, undefined, {}, { players: 5, properties: 'x' }]) {
    const v = buildView(g, 'x');
    assert.equal(v.properties.length, 48);
    assert.equal(v.difficultyKey, 'medium');
    assert.equal(typeof v.rentAt(1), 'number');
    assert.equal(typeof v.netWorth('x'), 'number');
  }
});

test('me, opponents, myTiles', () => {
  const v = buildView(baseGame(), 'a');
  assert.equal(v.me.name, 'JULE');
  assert.deepEqual(
    v.opponents.map((p) => p.id),
    ['b'],
  );
  assert.deepEqual(v.myTiles, [1, 2, 3]);
  assert.equal(buildView(baseGame(), 'JULE').me.id, 'a', 'cari juga lewat nama');
});

test('rentAt: provinsi penuh menggandakan sewa level 0, gadai = 0, multiplier tingkat', () => {
  const v = buildView(baseGame(), 'a');
  assert.equal(v.rentAt(1), 200_000); // 100rb x2
  assert.equal(v.rentAt(3), 600_000); // level 2
  assert.equal(v.rentAt(46), 0); // digadai
  assert.equal(v.rentAt(45), 1_080_000);
  const g = baseGame();
  g.settings.difficulty = 'krismon';
  assert.equal(buildView(g, 'a').rentAt(3), 900_000);
  g.rules = { rentMultiplier: 2 };
  assert.equal(buildView(g, 'a').rentAt(3), 1_200_000);
});

test('tileValue & netWorth (utang dikurangi)', () => {
  const v = buildView(baseGame(), 'a');
  assert.equal(v.tileValue(3), 500_000 + 2 * 250_000);
  assert.equal(v.netWorth('a'), 5_000_000 + 500_000 * 3 + 500_000);
  // b: cash 2jt + DKI 1.8jt + 900rb + gadai (1.8jt * 0.4) - utang 1.25jt
  assert.equal(v.netWorth('b'), 2_000_000 + 2_700_000 + 1_800_000 * 0.4 - 1_250_000);
});

test('takeover safety', () => {
  const v = buildView(baseGame(), 'b');
  assert.equal(v.isTakeoverSafe(1), true, 'provinsi penuh');
  assert.equal(v.isTakeoverSafe(45), false);
  assert.equal(v.isTakeoverSafe(46), true, 'digadai');
  assert.equal(v.takeoverPrice(45), (1_800_000 + 900_000) * 2);
});

test('isWinner / isFeeder hanya di mode grind', () => {
  const cfg = { mode: 'grind', winnerName: 'JULE', accounts: ['JULE', 'ilramdhan.dev'] };
  const v = buildView(baseGame(), 'b', cfg);
  assert.equal(v.isWinner('a'), true);
  assert.equal(v.isFeeder('b'), true);
  assert.equal(v.isFeeder('a'), false);
  assert.equal(v.winner.id, 'a');
  const arena = buildView(baseGame(), 'b', { mode: 'arena', winnerName: 'JULE' });
  assert.equal(arena.isWinner('a'), false);
  assert.equal(arena.isFeeder('b'), false);
});

test('properties juga bisa array & difficulty alias Indonesia', () => {
  const g = baseGame();
  g.properties = [];
  g.properties[5] = { owner: 'b', level: 3 };
  g.settings.difficulty = 'santai';
  const v = buildView(g, 'a');
  assert.equal(v.properties[5].owner, 'b');
  assert.equal(v.difficultyKey, 'easy');
  assert.equal(v.rentAt(5), 750_000);
});

test('ronde: roundsLeft', () => {
  const g = baseGame();
  g.settings = { mode: 'ronde', maxRounds: 10 };
  g.round = 10;
  assert.equal(buildView(g, 'a').roundsLeft, 1);
  assert.equal(buildView(baseGame(), 'a').roundsLeft, Infinity);
});
