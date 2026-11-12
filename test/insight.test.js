import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildView } from '../src/core/state/view.js';
import { buildInsight } from '../src/core/strategy/insight.js';

const game = (over = {}) => ({
  phase: 'pre_roll',
  round: 4,
  settings: { difficulty: 'medium', mode: 'survival' },
  players: {
    a: { id: 'a', name: 'BOT', cash: 3_000_000, position: 0 },
    b: { id: 'b', name: 'LAWAN', cash: 2_000_000, position: 10 },
  },
  properties: { 1: { owner: 'b', level: 2 }, 2: { owner: 'b', level: 0 }, 3: { owner: 'b', level: 0 } },
  ...over,
});
const cfg = { mode: 'arena', accounts: ['BOT', 'LAWAN'], strategy: { riskTolerance: 0.5 } };

test('insight: null tanpa view, tidak melempar untuk game kosong', () => {
  assert.equal(buildInsight(null, cfg), null);
  assert.doesNotThrow(() => buildInsight(buildView({}, 'x', cfg), cfg));
});

test('insight: lawan dengan provinsi lengkap terdeteksi & jadi ancaman', () => {
  const v = buildView(game(), 'a', cfg);
  const ins = buildInsight(v, cfg, {});
  const op = ins.opponents.find((o) => o.name === 'LAWAN');
  assert.deepEqual(op.provinces, ['Aceh']);
  assert.equal(op.cities, 3);
  assert.equal(op.buildings, 2);
  assert.ok(op.threat > 0, 'saya di START, Aceh 1–3 petak di depan');
  assert.equal(op.own, true);
  assert.ok(['agresif', 'seimbang', 'bertahan'].includes(ins.me.stance));
  assert.ok(ins.strategy.length > 0);
});

test('insight: perubahan lawan antar panggilan tercatat', () => {
  const mem = {};
  buildInsight(buildView(game(), 'a', cfg), cfg, mem);
  const later = game();
  later.players.b.cash = 500_000;
  later.properties[1].level = 3;
  const op = buildInsight(buildView(later, 'a', cfg), cfg, mem).opponents[0];
  assert.ok(op.changes.some((c) => c.startsWith('kas -')));
  assert.ok(op.changes.includes('bangun +1'));
});
