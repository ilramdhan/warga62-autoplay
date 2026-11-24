import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildView } from '../src/core/state/view.js';
import { createPolicy } from '../src/core/strategy/index.js';
import { buildInsight } from '../src/core/strategy/insight.js';
import { expectedRentIncome, landingCost, policyReserve, recommendedReserve } from '../src/core/strategy/risk.js';

const ARENA = { mode: 'arena', strategy: { riskTolerance: 0.5 } };
const GRIND = { mode: 'grind', winnerName: 'JULE', accounts: ['JULE', 'f1', 'f2'] };

/** Semua kota milik `owner` kecuali yang ada di `except`. */
function allCities(owner, extra = {}, except = []) {
  const props = {};
  for (let i = 0; i < 48; i++) if (!except.includes(i)) props[i] = { owner, level: 0, ...extra };
  return props;
}

// ---------- 1. jaminan Lapas ----------
test('bail: tanpa kota, tak ada yang dibeli, biaya rendah -> tidak bayar jaminan', () => {
  for (const difficulty of ['medium', 'extreme']) {
    const g = {
      round: 10,
      settings: { difficulty },
      players: {
        me: { id: 'me', name: 'A', cash: 6e6, position: 12, inJail: true },
        op: { id: 'op', name: 'B', cash: 5e6, position: 30 },
      },
      properties: allCities('op', { mortgaged: true }),
    };
    const p = createPolicy(ARENA);
    assert.deepEqual(p.preRoll(buildView(g, 'me', ARENA)), [], difficulty);
  }
});

test('bail: provinsi lengkap berbangunan di depan lawan -> bayar jaminan', () => {
  const props = allCities('op', { mortgaged: true }, [1, 2, 3]);
  for (const t of [1, 2, 3]) props[t] = { owner: 'me', level: 3 };
  const g = {
    round: 10,
    settings: { difficulty: 'medium' },
    players: {
      me: { id: 'me', name: 'A', cash: 6e6, position: 12, inJail: true },
      op: { id: 'op', name: 'B', cash: 5e6, position: 46 },
      op2: { id: 'op2', name: 'C', cash: 5e6, position: 47 },
    },
    properties: props,
  };
  const p = createPolicy(ARENA);
  assert.deepEqual(p.preRoll(buildView(g, 'me', ARENA)), [{ type: 'payBail' }]);
});

// ---------- 2. distribusi Perfect ----------
test('cadangan memakai distribusi Perfect: lebih besar dengan Elit 2 petak di depan', () => {
  const g = {
    settings: { difficulty: 'medium' },
    players: { a: { id: 'a', cash: 3e6, position: 43 }, b: { id: 'b', cash: 3e6, position: 0 } },
    properties: { 45: { owner: 'b', level: 3 } },
  };
  const v = buildView(g, 'a');
  assert.ok(recommendedReserve(v, 'a', { target: 'perfect' }) > recommendedReserve(v, 'a', { target: 'biasa' }));
  // Cadangan policy dibatasi bawah oleh sewa terburuk, jadi minimal sama.
  assert.ok(policyReserve(v, { target: 'perfect' }) >= policyReserve(v, { target: 'biasa' }));
  assert.ok(
    expectedRentIncome(v, 45, { ownerId: 'b', horizon: 1, target: 'perfect' }) >
      expectedRentIncome(v, 45, { ownerId: 'b', horizon: 1, target: 'biasa' }),
  );
});

// ---------- 3. bangun saat kekayaan bersih negatif ----------
test('smart: tidak bangun kalau utang melebihi kas', () => {
  const g = {
    round: 5,
    settings: { difficulty: 'medium' },
    players: {
      me: { id: 'me', name: 'A', cash: 800_000, position: 0, debt: 5e6 },
      op: { id: 'op', name: 'B', cash: 5e6, position: 30 },
    },
    properties: { 1: { owner: 'me' }, 2: { owner: 'me' }, 3: { owner: 'me' }, 45: { owner: 'op', level: 3 } },
  };
  const p = createPolicy(ARENA);
  assert.deepEqual(p.chooseUpgrades(buildView(g, 'me', ARENA), [1, 2, 3]), []);
  assert.match(p.lastReason, /utang/);
});

// ---------- 5. feeder meminjamkan ke pemenang ----------
test('grind: feeder menawarkan 0% hanya ke pemenang', () => {
  const g = {
    round: 5,
    settings: { difficulty: 'medium' },
    players: {
      w: { id: 'w', name: 'JULE', cash: 0, position: 0 },
      f1: { id: 'f1', name: 'f1', cash: 3e6, position: 10 },
      f2: { id: 'f2', name: 'f2', cash: 3e6, position: 20 },
    },
  };
  const p = createPolicy(GRIND);
  const v = buildView(g, 'f1', GRIND);
  assert.equal(p.lendOffer(v, { borrowerId: 'w', amount: 500_000 }), 0);
  assert.equal(p.lendOffer(v, { borrowerId: 'f2', amount: 500_000 }), null);
});

// ---------- 6. ambil alih ----------
function takeoverGame(opCash) {
  return {
    round: 5,
    settings: { difficulty: 'medium' },
    players: {
      me: { id: 'me', name: 'A', cash: 6e6, position: 20 },
      op: { id: 'op', name: 'B', cash: opCash, position: 46 },
      th: { id: 'th', name: 'C', cash: 5e6, position: 47 },
    },
    properties: { 5: { owner: 'me' }, 6: { owner: 'me' }, 7: { owner: 'op' } },
  };
}

test('smart: ambil alih lebih ketat ke pemimpin, lebih longgar ke pemain terlemah', () => {
  const p = createPolicy(ARENA);
  assert.equal(p.shouldTakeover(buildView(takeoverGame(1e6), 'me', ARENA), { tile: 7 }), true);
  assert.match(p.lastReason, /terlemah/);
  assert.equal(p.shouldTakeover(buildView(takeoverGame(20e6), 'me', ARENA), { tile: 7 }), false);
  assert.match(p.lastReason, /pemimpin/);
  assert.equal(p.shouldTakeover(buildView(takeoverGame(5.5e6), 'me', ARENA), { tile: 7 }), false);
});

test('smart: menggagalkan provinsi tidak berlaku kalau kota ketiga sudah dimiliki', () => {
  const g = {
    round: 5,
    settings: { difficulty: 'medium' },
    players: {
      me: { id: 'me', name: 'A', cash: 20e6, position: 0 },
      op: { id: 'op', name: 'B', cash: 1e6, position: 46 },
      th: { id: 'th', name: 'C', cash: 1e6, position: 47 },
    },
    properties: { 5: { owner: 'op' }, 6: { owner: 'op' }, 7: { owner: 'th' } },
  };
  const p = createPolicy(ARENA);
  assert.equal(p.shouldTakeover(buildView(g, 'me', ARENA), { tile: 5 }), false);
  assert.match(p.lastReason, /tidak melengkapi\/menggagalkan/);
});

// ---------- 7. tukar tanah ----------
function tradeGame(props) {
  return {
    round: 5,
    settings: { difficulty: 'medium' },
    players: {
      me: { id: 'me', name: 'A', cash: 6e6, position: 20 },
      op: { id: 'op', name: 'B', cash: 5e6, position: 30 },
    },
    properties: props,
  };
}

test('respondTrade: kota tergadai dinilai harga × (1 − tebus)', () => {
  const p = createPolicy(ARENA);
  const v = buildView(tradeGame({ 45: { owner: 'op', mortgaged: true }, 33: { owner: 'me' } }), 'me', ARENA);
  // 1,8 jt × 0,4 = 720 rb < Bali 1,4 jt
  assert.equal(p.respondTrade(v, { from: 'op', offerTiles: [45], requestTiles: [33] }), false);
});

test('respondTrade: tolak kalau kota bukan milik pihak yang benar', () => {
  const p = createPolicy(ARENA);
  const v = buildView(tradeGame({ 45: { owner: 'op' }, 33: { owner: 'op' }, 1: { owner: 'me' } }), 'me', ARENA);
  assert.equal(p.respondTrade(v, { from: 'op', offerCash: 5e6, requestTiles: [33] }), false);
  assert.match(p.lastReason, /bukan milik kita/);
  assert.equal(p.respondTrade(v, { from: 'op', offerTiles: [2], requestTiles: [1] }), false);
  assert.match(p.lastReason, /bukan milik pengusul/);
  assert.equal(p.respondTrade(v, { from: 'op', offerTiles: [45], requestTiles: [1] }), true);
});

test('respondTrade: penalti kalau lawan jadi tinggal butuh satu kota', () => {
  const p = createPolicy(ARENA);
  const v = buildView(tradeGame({ 41: { owner: 'op' }, 42: { owner: 'me' } }), 'me', ARENA);
  // Tanpa penalti 1,8 jt − 1,6 jt = +200 rb; lawan jadi punya 2/3 Jabar dengan 43 masih kosong.
  assert.equal(p.respondTrade(v, { from: 'op', offerCash: 1.8e6, requestTiles: [42] }), false);
  assert.equal(p.respondTrade(v, { from: 'op', offerCash: 3e6, requestTiles: [42] }), true);
});

// ---------- 8. pemenang: lunasi & tebus provinsi lengkap dulu ----------
test('grind: pemenang melunasi Pinjol & menebus provinsi lengkap dulu', () => {
  const cfg = { ...GRIND, policyFlags: { winner: { reserveOverride: 1_000_000 } } };
  const g = {
    round: 5,
    settings: { difficulty: 'medium' },
    players: {
      w: { id: 'w', name: 'JULE', cash: 2_500_000, position: 0 },
      f1: { id: 'f1', name: 'f1', cash: 0, position: 10 },
    },
    loans: [{ borrower: 'w', lender: 'pinjol', kind: 'pinjol', principal: 500_000, owed: 500_000 }],
    properties: {
      3: { owner: 'w', mortgaged: true },
      41: { owner: 'w', mortgaged: true },
      42: { owner: 'w' },
      43: { owner: 'w' },
    },
  };
  const acts = createPolicy(cfg).preRoll(buildView(g, 'w', cfg));
  // 2,5 jt − 500 rb utang = 2 jt; tebus 41 (960 rb) dulu, sisa 1,04 jt < 1 jt + 300 rb untuk kota 3.
  assert.deepEqual(acts, [{ type: 'repay' }, { type: 'redeem', tile: 41 }]);
});

test('grind: pemenang tidak membangun kota tergadai', () => {
  const g = {
    round: 5,
    settings: { difficulty: 'medium' },
    players: { w: { id: 'w', name: 'JULE', cash: 20e6, position: 0 }, f1: { id: 'f1', name: 'f1', position: 10 } },
    properties: { 1: { owner: 'w', mortgaged: true }, 2: { owner: 'w' }, 3: { owner: 'w' } },
  };
  assert.deepEqual(
    createPolicy(GRIND)
      .chooseUpgrades(buildView(g, 'w', GRIND), [1, 2, 3])
      .includes(1),
    false,
  );
});

// ---------- 10. opsi sita kota termurah ----------
test('chooseOption: sita kota termurah di provinsi lengkap dibobot ×3', () => {
  const g = {
    round: 5,
    settings: { difficulty: 'medium' },
    players: { me: { id: 'me', name: 'A', cash: 5e6, position: 20 }, op: { id: 'op', name: 'B', position: 30 } },
    properties: { 1: { owner: 'me' }, 2: { owner: 'me' }, 3: { owner: 'me' } },
  };
  const p = createPolicy(ARENA);
  assert.equal(p.chooseOption(buildView(g, 'me', ARENA), { options: ['Bayar Rp700 rb', 'Kota termurah disita'] }), 0);
  const lone = { ...g, properties: { 1: { owner: 'me' } } };
  assert.equal(
    p.chooseOption(buildView(lone, 'me', ARENA), { options: ['Bayar Rp700 rb', 'Kota termurah disita'] }),
    1,
  );
});

// ---------- 11. Monitor = cadangan policy ----------
test('insight: cadangan Monitor sama dengan cadangan policy smart', () => {
  const cfg = { ...ARENA, accounts: ['A', 'B'] };
  const g = {
    round: 5,
    settings: { difficulty: 'medium' },
    players: { me: { id: 'me', name: 'A', cash: 3e6, position: 43 }, op: { id: 'op', name: 'B', position: 0 } },
    properties: { 45: { owner: 'op', level: 3 }, 46: { owner: 'op', level: 3 } },
    loans: [{ borrower: 'me', lender: 'op', principal: 400_000, owed: 400_000, turnsLeft: 1 }],
  };
  const v = buildView(g, 'me', cfg);
  const ins = buildInsight(v, cfg, {});
  assert.equal(ins.me.reserve, policyReserve(v, { riskTolerance: 0.5, target: 'perfect' }));
  assert.ok(ins.me.reserve > recommendedReserve(v, 'me', { riskTolerance: 0.5 }));
});

// ---------- 12. perbaikan kecil ----------
test('landingCost: Musibah ikut pengali biaya, Pengadilan memperhitungkan kartu simpanan', () => {
  const mk = (difficulty, keepCards = []) =>
    buildView(
      { settings: { difficulty }, players: { a: { id: 'a', cash: 4e6, position: 0, keepCards } }, properties: {} },
      'a',
    );
  assert.equal(landingCost(mk('hard'), 'a', 16), (2 * landingCost(mk('easy'), 'a', 16) * (1.5 / 0.5)) / 2);
  assert.equal(landingCost(mk('medium'), 'a', 16), 300_000);
  const plain = landingCost(mk('medium'), 'a', 36);
  const lawyer = landingCost(mk('medium', ['pengacara']), 'a', 36);
  const insider = landingCost(mk('medium', ['orang-dalam']), 'a', 36);
  assert.ok(lawyer < plain && insider < lawyer, `${plain} ${lawyer} ${insider}`);
});

test('lendOffer: tolak peminjam bangkrut, jumlah kosong, dan pinjaman yang tak menutup kekurangan', () => {
  const g = {
    round: 5,
    settings: { difficulty: 'medium' },
    players: {
      me: { id: 'me', name: 'A', cash: 20e6, position: 0 },
      b: { id: 'b', name: 'B', cash: -5e6, position: 10 },
      x: { id: 'x', name: 'X', cash: 0, position: 12, bankrupt: true },
    },
  };
  const p = createPolicy(ARENA);
  const v = buildView(g, 'me', ARENA);
  assert.equal(p.lendOffer(v, { borrowerId: 'x', amount: 100_000 }), null);
  // Kekurangan Rp5 jt tidak tertutup pinjaman Rp100 rb → peminjam tetap bangkrut → tidak meminjamkan.
  assert.equal(p.lendOffer(v, { borrowerId: 'b', amount: 100_000 }), null);
  assert.equal(p.lendOffer(v, { borrowerId: 'b' }), null);
});

test('Orang Dalam di Pengadilan hanya dipakai kalau putusan diketahui & buruk', () => {
  const p = createPolicy(ARENA);
  const v = buildView({ players: { a: { id: 'a', cash: 1e6 } } }, 'a', ARENA);
  assert.equal(p.useKeepCard(v, { cardId: 'orang-dalam', situation: { kind: 'court' } }), false);
  assert.equal(p.useKeepCard(v, { cardId: 'orang-dalam', situation: { kind: 'court', verdict: 'sita aset' } }), true);
  assert.equal(p.useKeepCard(v, { cardId: 'orang-dalam', situation: { kind: 'court', verdict: 'menang' } }), false);
});
