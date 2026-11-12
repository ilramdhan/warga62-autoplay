import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diceSumDistribution,
  distanceForward,
  expectedRentExposure,
  landingProbabilities,
  parseRupiahText,
  passStartProbability,
  propertyEV,
  recommendedReserve,
  specialLandingRisks,
  visitProbabilities,
} from '../src/core/strategy/risk.js';
import { buildView } from '../src/core/state/view.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('distribusi 2d6 berjumlah 1 & peluang kembar per zona', () => {
  for (const t of ['biasa', 'perfect', 'cupu']) {
    const d = diceSumDistribution(t);
    close(
      d.sum.reduce((s, x) => s + x, 0),
      1,
    );
  }
  close(diceSumDistribution('biasa').sum[7], 6 / 36);
  close(diceSumDistribution('perfect').pDouble, 2 * diceSumDistribution('biasa').pDouble);
  close(diceSumDistribution('cupu').pDouble, diceSumDistribution('biasa').pDouble / 2);
});

test('landingProbabilities total 1 & visit multi-giliran', () => {
  const p = landingProbabilities(0);
  close(
    p.reduce((s, x) => s + x, 0),
    1,
  );
  close(p[7], 6 / 36);
  const v = visitProbabilities(40, 3);
  close(
    v.reduce((s, x) => s + x, 0),
    3,
  );
});

test('distanceForward melingkar 48 petak', () => {
  assert.equal(distanceForward(40, 2), 10);
  assert.equal(distanceForward(2, 40), 38);
  assert.equal(distanceForward(5, 5), 0);
});

test('passStartProbability & specialLandingRisks', () => {
  assert.equal(passStartProbability(10), 0);
  close(passStartProbability(46), 1);
  const r = specialLandingRisks(0);
  close(r.tax, 5 / 36); // petak 8
  assert.ok(r.parking === 0);
});

test('exposure & cadangan naik kalau lawan punya kota mahal di depan', () => {
  const game = {
    settings: { difficulty: 'medium' },
    players: { a: { id: 'a', cash: 3e6, position: 38 }, b: { id: 'b', cash: 3e6, position: 0 } },
    properties: { 45: { owner: 'b', level: 3 }, 46: { owner: 'b', level: 3 }, 47: { owner: 'b', level: 3 } },
  };
  const v = buildView(game, 'a');
  const exp = expectedRentExposure(v, 'a', 1);
  assert.ok(exp.rent > 0);
  assert.equal(exp.worst, 3_600_000);
  const empty = buildView({ ...game, properties: {} }, 'a');
  assert.ok(recommendedReserve(v, 'a') > recommendedReserve(empty, 'a'));
  assert.ok(recommendedReserve(v, 'a', { riskTolerance: 0 }) > recommendedReserve(v, 'a', { riskTolerance: 1 }));
});

test('propertyEV positif dan parseRupiahText', () => {
  const v = buildView(
    { players: { a: { id: 'a', position: 0 }, b: { id: 'b', position: 40 } }, properties: { 1: { owner: 'a' } } },
    'a',
  );
  const ev = propertyEV(v, 1, { ownerId: 'a', horizon: 10 });
  assert.ok(ev.income > 0);
  assert.equal(ev.cost, 500_000);
  assert.equal(parseRupiahText('Bayar Rp500 rb'), 500_000);
  assert.equal(parseRupiahText('Rp1,5 jt'), 1_500_000);
  assert.equal(parseRupiahText('Rp 1.200.000'), 1_200_000);
  assert.equal(parseRupiahText('lewati 2 giliran'), null);
});
