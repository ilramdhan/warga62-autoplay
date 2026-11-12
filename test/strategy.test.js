import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildView } from '../src/core/state/view.js';
import { createPolicy, SAFE_DEFAULTS } from '../src/core/strategy/index.js';
import { LOAN_INTEREST_OPTIONS } from '../src/core/data/board.js';

const GRIND = { mode: 'grind', winnerName: 'JULE', accounts: ['JULE', 'feed1', 'feed2'] };

function game(over = {}) {
  return {
    phase: 'pre_roll',
    round: 12,
    settings: { difficulty: 'medium', mode: 'survival' },
    players: {
      w: { id: 'w', name: 'JULE', cash: 8_000_000, position: 0, salary: 1_000_000 },
      f1: { id: 'f1', name: 'feed1', cash: 3_000_000, position: 10 },
      f2: { id: 'f2', name: 'feed2', cash: 50_000, position: 20 },
    },
    properties: {},
    ...over,
  };
}

test('grind: feeder mengirim semua kas ke pemenang', () => {
  const p = createPolicy(GRIND);
  const v = buildView(game(), 'f1', GRIND);
  assert.deepEqual(p.preRoll(v), [{ type: 'send', to: 'JULE', amount: 3_000_000 }]);
  assert.ok(p.lastReason.length > 0);
  // kas < 100rb: tidak kirim
  assert.deepEqual(p.preRoll(buildView(game(), 'f2', GRIND)), []);
});

test('grind: feeder menahan sebagian kas sebelum ronde target Juara 2', () => {
  const cfg = { ...GRIND, policyFlags: { holdBankruptUntilRound: 10 } };
  const v = buildView(game({ round: 4 }), 'f1', cfg);
  const [send] = createPolicy(cfg).preRoll(v);
  assert.equal(send.type, 'send');
  assert.ok(send.amount < 3_000_000 && send.amount % 100_000 === 0);
});

test('grind: feeder tidak beli/bangun, pilih opsi bayar, jual lalu bangkrut', () => {
  const p = createPolicy(GRIND);
  const v = buildView(game(), 'f1', GRIND);
  assert.equal(p.shouldBuy(v, { tile: 1, price: 500_000 }), false);
  assert.equal(p.shouldTakeover(v, { tile: 1, price: 1 }), false);
  assert.deepEqual(p.chooseUpgrades(v, [1, 2]), []);
  assert.equal(p.chooseOption(v, { options: ['Urus sesuai prosedur (lewati 2 giliran)', 'Bayar Rp500 rb'] }), 1);
  assert.deepEqual(p.debtStep(v, { owe: 1e6, canSell: [3], canMortgage: [], canLoan: true, canPinjol: true }), {
    type: 'sell',
    tile: 3,
  });
  assert.deepEqual(p.debtStep(v, { owe: 1e6, canSell: [], canMortgage: [], canLoan: true, canPinjol: true }), {
    type: 'bankrupt',
  });
  assert.equal(p.rollTarget(v), 'perfect');
  assert.equal(p.respondMoneyRequest(v, { fromId: 'w', amount: 1e6 }), true);
  assert.equal(p.respondMoneyRequest(v, { fromId: 'f2', amount: 1e6 }), false);
});

test('grind: feeder pinjam dulu saat hold aktif', () => {
  const cfg = { ...GRIND, policyFlags: { holdBankruptUntilRound: 10 } };
  const p = createPolicy(cfg);
  const v = buildView(game({ round: 5 }), 'f1', cfg);
  assert.deepEqual(p.debtStep(v, { owe: 1e6, canSell: [], canMortgage: [], canLoan: true, canPinjol: true }), {
    type: 'requestLoan',
  });
  const w = buildView(game({ round: 5 }), 'w', cfg);
  assert.equal(p.lendOffer(w, { borrowerId: 'f1', amount: 1e6 }), 0);
});

test('grind: pemenang membeli, bangun, menolak bayar feeder', () => {
  const p = createPolicy(GRIND);
  const v = buildView(game({ properties: { 1: { owner: 'w' }, 2: { owner: 'w' }, 3: { owner: 'w' } } }), 'w', GRIND);
  assert.equal(p.shouldBuy(v, { tile: 45, price: 1_800_000 }), true);
  assert.deepEqual(p.chooseUpgrades(v, [1, 2, 3]).sort(), [1, 2, 3]);
  assert.equal(p.respondMoneyRequest(v, { fromId: 'f1', amount: 100_000 }), false);
  assert.equal(p.lendOffer(v, { borrowerId: 'f1', amount: 500_000 }), null);
  assert.equal(
    p.acceptLoan(v, {
      offers: [
        { lender: 'f1', interestPercent: 25 },
        { lender: 'f2', interestPercent: 10 },
      ],
    }),
    'f2',
  );
  assert.deepEqual(p.debtStep(v, { owe: 1e6, canSell: [], canMortgage: [], canLoan: true, canPinjol: true }), {
    type: 'requestLoan',
  });
});

test('grind: pemenang jual bangunan termurah dulu', () => {
  const p = createPolicy(GRIND);
  const props = { 3: { owner: 'w', level: 2 }, 47: { owner: 'w', level: 1 } };
  const v = buildView(game({ properties: props }), 'w', GRIND);
  assert.deepEqual(p.debtStep(v, { owe: 1e6, canSell: [47, 3], canMortgage: [] }), { type: 'sell', tile: 3 });
});

const ARENA = { mode: 'arena', strategy: { riskTolerance: 0.5 } };
function arenaGame(myCash, over = {}) {
  return {
    round: 5,
    settings: { difficulty: 'medium', mode: 'survival' },
    players: {
      me: { id: 'me', name: 'A', cash: myCash, position: 0 },
      op: { id: 'op', name: 'B', cash: 6_000_000, position: 30 },
    },
    properties: {
      21: { owner: 'op', level: 3 },
      22: { owner: 'op', level: 3 },
      23: { owner: 'op', level: 3 },
      9: { owner: 'op', level: 2 },
      10: { owner: 'op', level: 2 },
    },
    ...over,
  };
}

test('smart: beli saat kas cukup, lewati saat kas tipis', () => {
  const p = createPolicy(ARENA);
  const rich = buildView(arenaGame(10_000_000), 'me', ARENA);
  assert.equal(p.shouldBuy(rich, { tile: 5, price: 500_000 }), true);
  const poor = buildView(arenaGame(700_000), 'me', ARENA);
  assert.equal(p.shouldBuy(poor, { tile: 5, price: 500_000 }), false);
  assert.match(p.lastReason, /lewati|kas/);
  assert.equal(p.shouldBuy(poor, { tile: 5, price: 900_000 }), false);
});

test('smart: menggagalkan provinsi lawan dengan cadangan lebih longgar', () => {
  const p = createPolicy(ARENA);
  // lawan punya 9 & 10 (Sumbar); 11 masih kosong
  const v = buildView(arenaGame(10_000_000), 'me', ARENA);
  assert.equal(p.shouldBuy(v, { tile: 11, price: 700_000 }), true);
  assert.match(p.lastReason, /gagal/);
});

test('smart: takeover menolak kota aman', () => {
  const p = createPolicy(ARENA);
  const v = buildView(arenaGame(20_000_000), 'me', ARENA);
  assert.equal(p.shouldTakeover(v, { tile: 21, price: 1 }), false);
});

test('smart: urutan gali lubang — jual bangunan berdampak kecil dulu, provinsi lengkap digadai terakhir', () => {
  const p = createPolicy(ARENA);
  const props = {
    ...arenaGame(0).properties,
    1: { owner: 'me', level: 0 },
    2: { owner: 'me', level: 0 },
    3: { owner: 'me', level: 0 },
    13: { owner: 'me', level: 0 },
    45: { owner: 'me', level: 1 },
  };
  const v = buildView(arenaGame(-300_000, { properties: props }), 'me', ARENA);
  const m = p.debtStep(v, { owe: 300_000, canSell: [], canMortgage: [1, 2, 3, 13] });
  assert.deepEqual(m, { type: 'mortgage', tile: 13 });
  const s = p.debtStep(v, { owe: 300_000, canSell: [45], canMortgage: [1, 13] });
  assert.ok(['sell', 'mortgage'].includes(s.type));
  assert.deepEqual(p.debtStep(v, { owe: 300_000, canSell: [], canMortgage: [], canLoan: true, canPinjol: true }), {
    type: 'requestLoan',
  });
  assert.deepEqual(p.debtStep(v, { owe: 300_000, canSell: [], canMortgage: [], canLoan: false, canPinjol: false }), {
    type: 'bankrupt',
  });
});

test('smart: bunga pinjaman sesuai risiko', () => {
  const p = createPolicy(ARENA);
  const g = arenaGame(20_000_000);
  g.players.op = { id: 'op', name: 'B', cash: -500_000, position: 30 };
  g.properties = { 45: { owner: 'op', level: 0 } };
  const v = buildView(g, 'me', ARENA);
  const small = p.lendOffer(v, { borrowerId: 'op', amount: 200_000 });
  const big = p.lendOffer(v, { borrowerId: 'op', amount: 900_000 });
  assert.ok(LOAN_INTEREST_OPTIONS.includes(small));
  assert.ok(LOAN_INTEREST_OPTIONS.includes(big));
  assert.ok(big > small);
  assert.equal(p.lendOffer(v, { borrowerId: 'op', amount: 5_000_000 }), null, 'hampir bangkrut');
  const poor = buildView({ ...g, players: { ...g.players, me: { id: 'me', cash: 300_000 } } }, 'me', ARENA);
  assert.equal(p.lendOffer(poor, { borrowerId: 'op', amount: 200_000 }), null);
});

test('smart: pilihan tol selalu salah satu opsi', () => {
  const p = createPolicy(ARENA);
  const v = buildView(arenaGame(5_000_000, { players: { me: { id: 'me', cash: 5e6, position: 20 } } }), 'me', ARENA);
  const d = p.chooseToll(v, [44, 2]);
  assert.ok([44, 2].includes(d));
  assert.equal(p.chooseToll(v, [44]), 44);
});

test('smart: joki dadu menghindari kota lawan mahal', () => {
  const p = createPolicy(ARENA);
  const g = arenaGame(5_000_000);
  g.players.me.position = 16; // 16+5=21 (Elit lawan)
  const v = buildView(g, 'me', ARENA);
  const r = p.jokiDadu(v, { dice: [2, 3] });
  assert.ok(r && [0, 1].includes(r.dieIndex) && r.value >= 1 && r.value <= 6);
  const dest = (16 + (r.dieIndex === 0 ? r.value + 3 : 2 + r.value)) % 48;
  assert.ok(![21, 22, 23].includes(dest));
});

test('smart: kartu simpanan & permintaan uang', () => {
  const p = createPolicy(ARENA);
  const v = buildView(arenaGame(2_000_000), 'me', ARENA);
  assert.equal(p.useKeepCard(v, { cardId: 'numpang-dulu', situation: { kind: 'rent', amount: 1_800_000 } }), true);
  assert.equal(p.useKeepCard(v, { cardId: 'numpang-dulu', situation: { kind: 'rent', amount: 100_000 } }), false);
  assert.equal(p.useKeepCard(v, { cardId: 'orang-dalam', situation: { kind: 'court', verdict: 'sita' } }), true);
  assert.equal(p.respondMoneyRequest(v, { fromId: 'op', amount: 1_000_000 }), false);
  assert.equal(
    p.chooseOption(v, { options: ['Bayar Rp800 rb ke Negara', 'Kota termurahmu disita Negara'] }),
    1,
    'tanpa kota, opsi sita gratis',
  );
});

test('smart: ronde terakhir tidak bangun', () => {
  const p = createPolicy(ARENA);
  const g = arenaGame(20_000_000, { settings: { mode: 'ronde', maxRounds: 10 }, round: 10 });
  g.properties[1] = { owner: 'me' };
  assert.deepEqual(p.chooseUpgrades(buildView(g, 'me', ARENA), [1]), []);
});

test('createPolicy tidak pernah melempar (view null)', () => {
  for (const cfg of [ARENA, GRIND, {}]) {
    const p = createPolicy(cfg);
    for (const name of Object.keys(SAFE_DEFAULTS)) {
      assert.doesNotThrow(() => p[name](null, {}));
      assert.doesNotThrow(() => p[name](undefined, undefined));
    }
  }
});
