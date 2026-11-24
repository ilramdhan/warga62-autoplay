import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildView } from '../src/core/state/view.js';
import { createPolicy } from '../src/core/strategy/index.js';
import { buildInsight } from '../src/core/strategy/insight.js';
import { jailCost, landingCost, singleDieOdds, visitProbabilities } from '../src/core/strategy/risk.js';
import stillHere from '../src/core/handlers/still-here.js';
import handlers from '../src/core/handlers/index.js';
import { matchLabel, norm } from '../src/core/dom/query.js';

const ARENA = { mode: 'arena', strategy: { riskTolerance: 0.5 } };
const GRIND = { mode: 'grind', winnerName: 'JULE', accounts: ['JULE', 'f1'] };
const RAID = 32;
const COURT = 36;
const JAIL = 12;
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

/** Lawan berbangunan di DKI supaya cadangan besar. */
const richOpponentProps = {
  45: { owner: 'op', level: 3 },
  46: { owner: 'op', level: 3 },
  47: { owner: 'op', level: 3 },
};

// ---------- 1. utang jatuh tempo ----------
test('preRoll: Pinjol/pinjaman jatuh tempo ≤ 1 giliran selalu dilunasi kalau kas cukup', () => {
  for (const kind of ['pinjol', 'player']) {
    const g = {
      round: 6,
      settings: { difficulty: 'medium' },
      players: {
        me: { id: 'me', name: 'A', cash: 1_100_000, position: 40 },
        op: { id: 'op', name: 'B', cash: 9e6, position: 0 },
      },
      properties: richOpponentProps,
      loans: [{ borrower: 'me', lender: kind === 'pinjol' ? 'pinjol' : 'op', kind, owed: 1_000_000, turnsLeft: 1 }],
    };
    const smart = createPolicy(ARENA).preRoll(buildView(g, 'me', ARENA));
    assert.ok(
      smart.some((a) => a.type === 'repay'),
      kind,
    );
    const gw = { ...g, players: { me: { ...g.players.me, name: 'JULE' }, op: g.players.op } };
    const win = createPolicy(GRIND).preRoll(buildView(gw, 'me', GRIND));
    assert.ok(
      win.some((a) => a.type === 'repay'),
      `grind ${kind}`,
    );
    // Kas kurang dari tagihan: tidak bisa melunasi.
    const poor = { ...g, players: { ...g.players, me: { ...g.players.me, cash: 900_000 } } };
    assert.ok(
      !createPolicy(ARENA)
        .preRoll(buildView(poor, 'me', ARENA))
        .some((a) => a.type === 'repay'),
    );
  }
});

// ---------- 2. dadu tunggal Perfect ----------
test('singleDieOdds: Perfect = maks dua dadu; Biasa/Cupu = 1/3 rata', () => {
  const p = singleDieOdds('perfect');
  close(p.low, 1 / 9);
  close(p.mid, 1 / 3);
  close(p.high, 5 / 9);
  for (const t of ['biasa', 'cupu']) {
    const o = singleDieOdds(t);
    close(o.low, 1 / 3);
    close(o.mid, 1 / 3);
    close(o.high, 1 / 3);
  }
  // Pengacara + Perfect: maks empat dadu.
  close(singleDieOdds('perfect', 2).low, 1 / 81);
});

test('landingCost/visit: Razia & Pengadilan lebih murah dengan Perfect, Lapas lebih jarang', () => {
  const v = buildView({ players: { a: { id: 'a', cash: 4e6, position: 30 } }, properties: {} }, 'a');
  const bail = v.fees.bail;
  close(landingCost(v, 'a', RAID, 'perfect'), (1 / 9) * bail + (8 / 9) * v.fees.raidFine, 1e-6);
  close(landingCost(v, 'a', RAID, 'biasa'), (1 / 3) * bail + (2 / 3) * v.fees.raidFine, 1e-6);
  const seize = 4e6 * v.fees.courtSeize;
  close(
    landingCost(v, 'a', COURT, 'perfect'),
    (-5 / 9) * v.fees.courtWin + (1 / 3) * (v.fees.courtFine + bail) + (1 / 9) * (seize + bail),
    1e-6,
  );
  // Dari petak 30 (2 langkah ke Razia), petak 14–24 di giliran kedua hanya terjangkau lewat Lapas.
  const jailVisit = (tgt) =>
    visitProbabilities(30, 2, tgt)
      .slice(14, 25)
      .reduce((s, x) => s + x, 0);
  assert.ok(jailVisit('perfect') < jailVisit('biasa'));
});

// ---------- 3. biaya Lapas ----------
test('jailCost: jaminan + sewa kota sendiri yang masuk Negara', () => {
  const base = {
    players: { a: { id: 'a', cash: 4e6, position: 30 }, b: { id: 'b', cash: 4e6, position: 40 } },
  };
  const none = buildView({ ...base, properties: {} }, 'a');
  const owner = buildView({ ...base, properties: { 45: { owner: 'a', level: 3 }, 46: { owner: 'a', level: 3 } } }, 'a');
  assert.equal(jailCost(none, 'a'), none.fees.bail);
  assert.ok(jailCost(owner, 'a') > owner.fees.bail);
  assert.ok(landingCost(owner, 'a', RAID, 'perfect') > landingCost(none, 'a', RAID, 'perfect'));
});

// ---------- 4. jaminan & giliran wajib bayar ----------
test('bail: giliran Lapas ke-3 (tak ada percobaan gratis) -> bayar walau tanpa sewa', () => {
  const mk = (jailTurns) => ({
    round: 10,
    settings: { difficulty: 'medium' },
    players: {
      me: { id: 'me', name: 'A', cash: 6e6, position: JAIL, inJail: true, jailTurns },
      op: { id: 'op', name: 'B', cash: 5e6, position: 30 },
    },
    properties: Object.fromEntries([...Array(48).keys()].map((i) => [i, { owner: 'op', mortgaged: true }])),
  });
  const p = createPolicy(ARENA);
  assert.ok(!p.preRoll(buildView(mk(1), 'me', ARENA)).some((a) => a.type === 'payBail'));
  assert.ok(p.preRoll(buildView(mk(3), 'me', ARENA)).some((a) => a.type === 'payBail'));
});

// ---------- 5. kekayaan bersih + piutang ----------
test('netWorth: piutang pemberi pinjaman ditambahkan, utang peminjam dikurangi', () => {
  const g = {
    players: { a: { id: 'a', cash: 1e6 }, b: { id: 'b', cash: 1e6 } },
    loans: [
      { borrower: 'b', lender: 'a', principal: 500_000, owed: 600_000 },
      { borrower: 'a', lender: 'pinjol', kind: 'pinjol', owed: 300_000 },
    ],
  };
  const v = buildView(g, 'a');
  assert.equal(v.receivablesOf('a'), 600_000);
  assert.equal(v.netWorth('a'), 1e6 + 600_000 - 300_000);
  assert.equal(v.netWorth('b'), 1e6 - 600_000);
});

// ---------- 6. Negara sebagai pesaing ----------
test('Negara: Ronde akhir tahan jaminan kalau membayar membuat kita di bawah Kas Negara; Monitor memberi sinyal', () => {
  const mk = (treasury) => ({
    round: 10,
    stateTreasury: treasury,
    settings: { difficulty: 'medium', mode: 'ronde', maxRounds: 10 },
    players: {
      me: { id: 'me', name: 'A', cash: 6e6, position: JAIL, inJail: true, jailTurns: 1 },
      op: { id: 'op', name: 'B', cash: 5e6, position: 30 },
    },
    properties: {}, // banyak kota kosong = "awal game" -> biasanya bayar jaminan
  });
  const p = createPolicy(ARENA);
  assert.ok(p.preRoll(buildView(mk(1e6), 'me', ARENA)).some((a) => a.type === 'payBail'));
  assert.ok(!p.preRoll(buildView(mk(5.8e6), 'me', ARENA)).some((a) => a.type === 'payBail'));
  const ins = buildInsight(buildView(mk(5.8e6), 'me', ARENA), ARENA, {});
  assert.equal(ins.me.vsNegara, 'di atas Kas Negara');
  assert.equal(buildInsight(buildView(mk(9e6), 'me', ARENA), ARENA, {}).me.vsNegara, 'di bawah Kas Negara');
});

// ---------- 7. pinjaman pemain sekali per game ----------
test('debtStep: pinjaman pemain disimpan sebagai penyelamat kecuali game hampir selesai', () => {
  const mk = (settings) => ({
    round: 5,
    settings: { difficulty: 'medium', ...settings },
    players: {
      me: { id: 'me', name: 'A', cash: -200_000, position: 20 },
      op: { id: 'op', name: 'B', cash: 9e6, position: 0 },
    },
    properties: { 1: { owner: 'me' }, 2: { owner: 'me' }, 3: { owner: 'me' } },
  });
  const args = { owe: 200_000, canMortgage: [1, 2, 3], canLoan: true };
  const p = createPolicy(ARENA);
  assert.equal(p.debtStep(buildView(mk({}), 'me', ARENA), args).type, 'mortgage');
  const end = buildView(mk({ mode: 'ronde', maxRounds: 6 }), 'me', ARENA);
  assert.equal(p.debtStep(end, args).type, 'requestLoan');
});

// ---------- 8. Joki Dadu keluar Lapas ----------
test('jokiDadu: kembar untuk keluar Lapas tidak diberi bonus kartu Takdir', () => {
  // Dadu [1,2] di Lapas; satu-satunya kembar yang terjangkau: [1,1] -> 14 (sewa ≈ 224 rb) atau [2,2] -> Musibah.
  const g = {
    round: 5,
    rules: { rentMultiplier: 0.8 },
    settings: { difficulty: 'medium' },
    players: {
      me: { id: 'me', name: 'A', cash: 5e6, position: JAIL, inJail: true, jailTurns: 1 },
      op: { id: 'op', name: 'B', cash: 5e6, position: 0 },
    },
    properties: { 13: { owner: 'op' }, 14: { owner: 'op' }, 15: { owner: 'op' } },
  };
  const v = buildView(g, 'me', ARENA);
  assert.ok(v.rentAt(14) > 200_000 && v.rentAt(14) < 250_000, String(v.rentAt(14)));
  assert.equal(createPolicy(ARENA).jokiDadu(v, { dice: [1, 2] }), null);
});

// ---------- 9. beli di giliran gajian ----------
test('shouldBuy: giliran gajian + kembar -> jangan beli kalau sisa kas bisa memaksa Gali Lubang', () => {
  const g = {
    round: 5,
    settings: { difficulty: 'medium' },
    players: {
      me: { id: 'me', name: 'A', cash: 600_000, position: 3 },
      op: { id: 'op', name: 'B', cash: 5e6, position: 20 },
    },
    // Kota 7 menggagalkan NTT milik lawan (syarat cadangan longgar).
    properties: { 1: { owner: 'me' }, 5: { owner: 'op' }, 6: { owner: 'op' } },
  };
  const v = buildView(g, 'me', ARENA);
  const p = createPolicy({ ...ARENA, policyFlags: { reserveOverride: 0 } });
  assert.equal(p.shouldBuy(v, { tile: 7, price: 500_000 }), true);
  assert.equal(p.shouldBuy(v, { tile: 7, price: 500_000, salaryTurn: true, doubles: true }), false);
  assert.equal(p.shouldBuy(v, { tile: 7, price: 500_000, salaryTurn: true, doubles: false }), true);
  // Dari state game (bentuk belum diverifikasi): lastDice kembar + salaryThisTurn.
  const v2 = buildView({ ...g, lastDice: [3, 3], salaryThisTurn: true }, 'me', ARENA);
  assert.equal(v2.turn.doubles, true);
  assert.equal(p.shouldBuy(v2, { tile: 7, price: 500_000 }), false);
});

// ---------- 10. handler "Masih ikut?" ----------
globalThis.document ??= { body: {}, activeElement: null };

function stillHereCtx(labels, { title = true } = {}) {
  const list = labels.map((label) => ({
    textContent: label,
    disabled: false,
    clicks: 0,
    click() {
      this.clicks++;
    },
  }));
  const labelOf = (b) => norm(b?.textContent ?? '');
  const find = (m) => list.filter((b) => matchLabel(m, labelOf(b), b));
  const out = [];
  return {
    list,
    out,
    ctx: {
      memo: {},
      now: 10_000,
      cfg: { timing: {} },
      dom: {
        norm,
        labelOf,
        findButton: (m) => find(m)[0] ?? null,
        findLeaf: (m) => (title && matchLabel(m, 'masih ikut?') ? { title: true } : null),
        climb: (el, t) => (t({}) ? {} : null),
      },
      act: { click: (b) => (b.click(), true), sleep: async () => {}, pause: async () => {} },
      log: { info: (m) => out.push(m), warn: (m) => out.push(m), error: () => {}, debug: () => {} },
    },
  };
}

test('still-here: klik konfirmasi, tidak pernah klik tombol keluar', async () => {
  assert.ok(handlers.includes(stillHere));
  assert.ok(stillHere.priority < 20);
  const { ctx, list, out } = stillHereCtx(['Keluar room', 'Masih ikut']);
  const btn = stillHere.detect(ctx);
  assert.equal(btn, list[1]);
  assert.equal(await stillHere.run(ctx, btn), true);
  assert.equal(list[1].clicks, 1);
  assert.equal(list[0].clicks, 0);
  assert.match(out[0], /masih ikut/);

  const ya = stillHereCtx(['Tidak', 'Ya']);
  assert.equal(stillHere.detect(ya.ctx), ya.list[1]);
  // Tanpa judul "Masih ikut?", "Ya" polos tidak diklik.
  assert.equal(stillHere.detect(stillHereCtx(['Ya'], { title: false }).ctx), null);
  // Hanya tombol keluar/tolak -> tidak ada yang diklik.
  assert.equal(stillHere.detect(stillHereCtx(['Keluar', 'Nggak ikut', 'Tinggalkan room']).ctx), null);
});
