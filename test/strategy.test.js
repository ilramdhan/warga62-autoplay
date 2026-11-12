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

// ---------- arena: perilaku baru (likuiditas, provinsi, bangun, ambil alih, utang) ----------

const DIFFS = ['santai', 'normal', 'inflasi', 'krismon'];
function arena3(diff, myCash, props = {}, over = {}) {
  return {
    round: 6,
    settings: { difficulty: diff, mode: 'survival' },
    players: {
      me: { id: 'me', name: 'A', cash: myCash, position: 20 },
      b: { id: 'b', name: 'B', cash: 3_000_000, position: 5 },
      h: { id: 'h', name: 'H', cash: 5_000_000, position: 30 },
    },
    properties: props,
    ...over,
  };
}

test('smart: ambil alih hanya untuk melengkapi/menggagalkan provinsi (semua tingkat)', () => {
  const p = createPolicy(ARENA);
  for (const diff of DIFFS) {
    // kota "nyasar": tidak melengkapi apa pun -> tolak walau kas melimpah
    const stray = buildView(arena3(diff, 30_000_000, { 25: { owner: 'b' }, 26: { owner: 'h' } }), 'me', ARENA);
    assert.equal(p.shouldTakeover(stray, { tile: 26, price: stray.takeoverPrice(26) }), false, diff);
    assert.match(p.lastReason, /tidak melengkapi/);
    // melengkapi provinsi tapi kas mepet -> tolak (cadangan + dana bangun)
    const props = { 25: { owner: 'me' }, 27: { owner: 'me' }, 26: { owner: 'h' } };
    const tight = buildView(arena3(diff, 2_500_000, props), 'me', ARENA);
    assert.equal(p.shouldTakeover(tight, { tile: 26, price: tight.takeoverPrice(26) }), false, diff);
  }
  // Krismon (pengali 1,5×) + kas longgar: melengkapi provinsi layak diambil alih
  const props = { 25: { owner: 'me' }, 27: { owner: 'me' }, 26: { owner: 'h' } };
  const rich = buildView(arena3('krismon', 10_000_000, props), 'me', ARENA);
  assert.equal(p.shouldTakeover(rich, { tile: 26, price: rich.takeoverPrice(26) }), true);
  // Mode Ronde, ronde hampir habis: premi tidak sempat kembali
  const ronde = arena3('krismon', 10_000_000, props, {
    round: 9,
    settings: { difficulty: 'krismon', mode: 'ronde', maxRounds: 10 },
  });
  assert.equal(p.shouldTakeover(buildView(ronde, 'me', ARENA), { tile: 26, price: 1_650_000 }), false);
});

test('smart: beli tanah menyisakan dana bangun; melengkapi provinsi tetap dibeli', () => {
  const p = createPolicy(ARENA);
  for (const diff of DIFFS) {
    // punya Aceh lengkap tanpa bangunan, kas 2,4 jt: kota acak ditolak supaya bisa bangun
    const props = { 1: { owner: 'me' }, 2: { owner: 'me' }, 3: { owner: 'me' } };
    const v = buildView(arena3(diff, 2_400_000, props), 'me', ARENA);
    assert.equal(p.shouldBuy(v, { tile: 45, price: 1_800_000 }), false, diff);
    // kota ketiga provinsi sendiri: dibeli walau kas tipis (cadangan 40%)
    const v2 = buildView(arena3(diff, 3_000_000, { 9: { owner: 'me' }, 10: { owner: 'me' } }), 'me', ARENA);
    assert.equal(p.shouldBuy(v2, { tile: 11, price: 700_000 }), true, diff);
    assert.match(p.lastReason, /melengkapi/);
  }
  // awal game, kas penuh: beli untuk membuka provinsi
  const start = buildView(arena3('normal', 10_000_000, {}, { round: 1 }), 'me', ARENA);
  assert.equal(p.shouldBuy(start, { tile: 25, price: 1_100_000 }), true);
});

test('smart: bangun provinsi lengkap lebih dulu dan dengan cadangan lebih longgar', () => {
  const p = createPolicy(ARENA);
  for (const diff of DIFFS) {
    const props = {
      1: { owner: 'me' },
      2: { owner: 'me' },
      3: { owner: 'me' },
      25: { owner: 'me' },
      26: { owner: 'b' },
    };
    const v = buildView(
      arena3(diff, 4_000_000, props, { players: { me: { id: 'me', cash: 4e6, position: 0 } } }),
      'me',
      ARENA,
    );
    const picked = p.chooseUpgrades(v, [1, 2, 3, 25]);
    assert.ok(picked.length >= 1, `${diff}: ${p.lastReason}`);
    assert.ok([1, 2, 3].includes(picked[0]), `${diff}: provinsi lengkap dulu`);
    // kota tergadai tidak dibangun
    const m = buildView(arena3(diff, 20e6, { 1: { owner: 'me', mortgaged: true } }), 'me', ARENA);
    assert.deepEqual(p.chooseUpgrades(m, [1]), []);
  }
});

test('smart: ronde terakhir tidak bangun & tidak tebus (semua tingkat, Ronde 10/15/20)', () => {
  const p = createPolicy(ARENA);
  for (const diff of DIFFS) {
    for (const rounds of [10, 15, 20]) {
      const g = arena3(
        diff,
        30_000_000,
        { 1: { owner: 'me' }, 2: { owner: 'me' }, 3: { owner: 'me' }, 9: { owner: 'me', mortgaged: true } },
        {
          round: rounds,
          settings: { difficulty: diff, mode: 'ronde', maxRounds: rounds },
        },
      );
      const v = buildView(g, 'me', ARENA);
      assert.deepEqual(p.chooseUpgrades(v, [1, 2, 3]), [], `${diff}/${rounds}`);
      assert.ok(!p.preRoll(v).some((a) => a.type === 'redeem'), `${diff}/${rounds}`);
    }
  }
});

test('smart: gali lubang — Pinjol lebih murah daripada menjual bangunan provinsi lengkap', () => {
  const p = createPolicy(ARENA);
  const props = { 1: { owner: 'me', level: 2 }, 2: { owner: 'me', level: 2 }, 3: { owner: 'me', level: 2 } };
  for (const diff of ['santai', 'normal', 'inflasi']) {
    const v = buildView(arena3(diff, -600_000, props), 'me', ARENA);
    assert.deepEqual(p.debtStep(v, { owe: 600_000, canSell: [1, 2, 3], canMortgage: [], canPinjol: true }), {
      type: 'pinjol',
    });
    // Pinjol tidak cukup menutup utang -> tetap jual
    assert.equal(p.debtStep(v, { owe: 9_000_000, canSell: [1, 2, 3], canPinjol: true }).type, 'sell');
  }
  // Krismon: tidak ada Pinjol; tanpa pinjaman tersisa -> jual, bukan bangkrut
  const k = buildView(arena3('krismon', -600_000, props), 'me', ARENA);
  assert.equal(p.debtStep(k, { owe: 600_000, canSell: [1, 2, 3], canPinjol: false }).type, 'sell');
  // aset habis: tidak pernah bangkrut selama pinjaman/Pinjol masih ada
  const empty = buildView(arena3('normal', -600_000, {}), 'me', ARENA);
  assert.deepEqual(p.debtStep(empty, { owe: 600_000, canSell: [], canMortgage: [], canLoan: false, canPinjol: true }), {
    type: 'pinjol',
  });
  assert.deepEqual(
    p.debtStep(empty, { owe: 600_000, canSell: [], canMortgage: [], canLoan: true, triedLoan: true, canPinjol: true }),
    { type: 'pinjol' },
  );
});

test('smart: acceptLoan menolak demi Pinjol hanya kalau Pinjol benar-benar bisa', () => {
  const p = createPolicy(ARENA);
  const v = buildView(arena3('normal', -600_000, {}), 'me', ARENA);
  const offers = [
    { lender: 'h', interestPercent: 50 },
    { lender: 'b', interestPercent: 25 },
  ];
  assert.equal(p.acceptLoan(v, { offers, canPinjol: true, owe: 600_000 }), 'b');
  const pricey = [{ lender: 'h', interestPercent: 50 }];
  // bunga 50% = Pinjol Normal 50%: tidak lebih murah -> terima
  assert.equal(p.acceptLoan(v, { offers: pricey, canPinjol: true, owe: 600_000 }), 'h');
  const inflasi = buildView(arena3('santai', -600_000, {}), 'me', ARENA); // Pinjol 30%
  assert.equal(p.acceptLoan(inflasi, { offers: pricey, canPinjol: true, owe: 600_000 }), null);
  assert.equal(
    p.acceptLoan(inflasi, { offers: pricey, canPinjol: false, owe: 600_000 }),
    'h',
    'tombol Pinjol nonaktif',
  );
  assert.equal(p.acceptLoan(inflasi, { offers: pricey, owe: 5_000_000 }), 'h', 'plafon Pinjol kurang');
  const krismon = buildView(arena3('krismon', -600_000, {}), 'me', ARENA);
  assert.equal(p.acceptLoan(krismon, { offers: pricey }), 'h', 'Krismon tanpa Pinjol');
});

test('smart: lunasi utang mahal lebih awal kalau kas aman', () => {
  const p = createPolicy(ARENA);
  const loans = [{ borrower: 'me', lender: 'h', amount: 1_000_000, interestPercent: 50, turnsLeft: 2 }];
  const rich = buildView(arena3('normal', 10_000_000, {}, { loans }), 'me', ARENA);
  assert.ok(p.preRoll(rich).some((a) => a.type === 'repay'));
  const poor = buildView(arena3('normal', 1_600_000, {}, { loans }), 'me', ARENA);
  assert.ok(!p.preRoll(poor).some((a) => a.type === 'repay'), 'kas tidak aman');
  const cheap = [{ borrower: 'me', lender: 'h', amount: 1_000_000, interestPercent: 0, turnsLeft: 3 }];
  const v0 = buildView(arena3('normal', 10_000_000, {}, { loans: cheap }), 'me', ARENA);
  assert.ok(!p.preRoll(v0).some((a) => a.type === 'repay'), 'bunga 0% & belum jatuh tempo');
});

test('smart: cadangan naik saat Krisis & sesuai tingkat', () => {
  const p = createPolicy(ARENA);
  const props = { 33: { owner: 'h', level: 2 }, 34: { owner: 'h', level: 2 }, 35: { owner: 'h', level: 2 } };
  const reserveOf = (diff, crisis) => {
    const v = buildView(arena3(diff, 2_500_000, props, { crisisActive: crisis }), 'me', ARENA);
    p.shouldBuy(v, { tile: 45, price: 1_800_000 });
    return Number(/cadangan (\d+)/.exec(p.lastReason)?.[1] ?? 0);
  };
  for (const diff of DIFFS) assert.ok(reserveOf(diff, true) > reserveOf(diff, false), diff);
  assert.ok(reserveOf('krismon', false) > reserveOf('santai', false));
});

test('smart: tidak meminjamkan ke pemain yang lebih kaya (mode Ronde juga)', () => {
  const p = createPolicy(ARENA);
  const g = arena3(
    'normal',
    8_000_000,
    { 45: { owner: 'h', level: 3 }, 46: { owner: 'h', level: 3 } },
    {
      settings: { difficulty: 'normal', mode: 'ronde', maxRounds: 20 },
    },
  );
  g.players.h.cash = 9_000_000;
  assert.equal(p.lendOffer(buildView(g, 'me', ARENA), { borrowerId: 'h', amount: 300_000 }), null);
});
