import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildView } from '../src/core/state/view.js';
import { createPolicy } from '../src/core/strategy/index.js';
import { assessLoan, loanDefaultProbability } from '../src/core/strategy/risk.js';
import loanOffer, { loanAmountFromTexts, resolveBorrowerId } from '../src/core/handlers/loan-offer.js';
import { matchLabel, norm } from '../src/core/dom/query.js';

globalThis.document ??= { body: {}, activeElement: null };

const ARENA = { mode: 'arena', strategy: { riskTolerance: 0.5 } };
const GRIND = { mode: 'grind', winnerName: 'JULE', accounts: ['JULE', 'f1', 'f2'] };

/** Kita kaya, peminjam B kurang Rp200 rb tapi punya dua kota tak tergadai. */
function healthy(over = {}) {
  return {
    round: 5,
    settings: { difficulty: 'medium', mode: 'survival' },
    players: {
      me: { id: 'me', name: 'A', cash: 20e6, position: 0 },
      b: { id: 'b', name: 'B', cash: -200_000, position: 30 },
    },
    properties: { 45: { owner: 'b' }, 46: { owner: 'b' }, 1: { owner: 'me', level: 1 }, 2: { owner: 'me', level: 1 } },
    ...over,
  };
}

test('lendOffer: kondisi sehat → tawarkan bunga dengan EV positif', () => {
  const p = createPolicy(ARENA);
  const pct = p.lendOffer(buildView(healthy(), 'me', ARENA), { borrowerId: 'b', amount: 300_000 });
  assert.ok([10, 25, 50].includes(pct), `bunga ${pct}`);
});

test('lendOffer: kas tipis → null', () => {
  const p = createPolicy(ARENA);
  const g = healthy();
  g.players.me.cash = 800_000;
  assert.equal(p.lendOffer(buildView(g, 'me', ARENA), { borrowerId: 'b', amount: 300_000 }), null);
  // Lebih dari 25% kas di atas cadangan juga ditolak.
  g.players.me.cash = 3_000_000;
  assert.equal(p.lendOffer(buildView(g, 'me', ARENA), { borrowerId: 'b', amount: 1_500_000 }), null);
});

test('lendOffer: peminjam tidak dikenal / bangkrut / berutang → null', () => {
  const p = createPolicy(ARENA);
  const v = buildView(healthy(), 'me', ARENA);
  assert.equal(p.lendOffer(v, { borrowerId: null, amount: 300_000 }), null);
  assert.equal(p.lendOffer(v, { borrowerId: 'zzz', amount: 300_000 }), null);
  assert.equal(p.lendOffer(v, { borrowerId: 'me', amount: 300_000 }), null);
  const bk = healthy();
  bk.players.b.bankrupt = true;
  assert.equal(p.lendOffer(buildView(bk, 'me', ARENA), { borrowerId: 'b', amount: 300_000 }), null);
  const owing = healthy({ loans: [{ borrower: 'b', lender: 'pinjol', amount: 1e6, interest: 50 }] });
  assert.equal(p.lendOffer(buildView(owing, 'me', ARENA), { borrowerId: 'b', amount: 300_000 }), null);
});

test('lendOffer: kita sendiri berutang atau jumlah tak diketahui → null', () => {
  const p = createPolicy(ARENA);
  const g = healthy({ loans: [{ borrower: 'me', lender: 'pinjol', amount: 500_000, interest: 50 }] });
  assert.equal(p.lendOffer(buildView(g, 'me', ARENA), { borrowerId: 'b', amount: 300_000 }), null);
  assert.equal(p.lendOffer(buildView(healthy(), 'me', ARENA), { borrowerId: 'b' }), null);
});

test('lendOffer: EV negatif (peminjam tanpa aset) → null; bunga tinggi menaikkan gagal bayar', () => {
  const p = createPolicy(ARENA);
  const g = healthy({ properties: {} });
  g.players.b.cash = -250_000;
  const v = buildView(g, 'me', ARENA);
  assert.equal(p.lendOffer(v, { borrowerId: 'b', amount: 300_000 }), null);
  assert.ok(loanDefaultProbability(v, 'b', 300_000, 50) > loanDefaultProbability(v, 'b', 300_000, 10));
  const a = assessLoan(v, 'b', 300_000, { reserve: 0 });
  assert.ok(a.ok && a.options.every((o) => o.ev <= 0));
});

test('lendOffer: hampir akhir game → null; bunga tetap tetap butuh EV positif', () => {
  const p = createPolicy(ARENA);
  const end = healthy({ round: 18, settings: { difficulty: 'medium', mode: 'ronde', maxRounds: 20 } });
  assert.equal(p.lendOffer(buildView(end, 'me', ARENA), { borrowerId: 'b', amount: 300_000 }), null);
  const fixed = createPolicy({ ...ARENA, strategy: { ...ARENA.strategy, lendInterest: 50 } });
  const bad = healthy({ properties: {} });
  assert.equal(fixed.lendOffer(buildView(bad, 'me', ARENA), { borrowerId: 'b', amount: 300_000 }), null);
});

test('view: pinjaman dengan peminjam/pemberi bangkrut tidak dihitung (utang & piutang hangus)', () => {
  const g = healthy({
    loans: [
      { borrower: 'x', lender: 'me', amount: 1e6, interest: 25 },
      { borrower: 'b', lender: 'x', amount: 1e6, interest: 25 },
    ],
  });
  g.players.x = { id: 'x', name: 'X', cash: 0, bankrupt: true };
  const v = buildView(g, 'me', ARENA);
  assert.equal(v.loans.length, 0);
  assert.equal(v.debtOf('b'), 0);
});

test('grind: pinjaman antar-akun tetap menjaga kas sendiri', () => {
  const g = {
    round: 5,
    settings: { difficulty: 'medium' },
    players: {
      w: { id: 'w', name: 'JULE', cash: -500_000, position: 0 },
      f1: { id: 'f1', name: 'f1', cash: 600_000, position: 10 },
      f2: { id: 'f2', name: 'f2', cash: 3e6, position: 20 },
    },
  };
  const p = createPolicy(GRIND);
  assert.equal(p.lendOffer(buildView(g, 'f2', GRIND), { borrowerId: 'w', amount: 500_000 }), 0);
  assert.equal(p.lendOffer(buildView(g, 'f1', GRIND), { borrowerId: 'w', amount: 700_000 }), null, 'kas minus');
  assert.equal(p.lendOffer(buildView(g, 'f2', GRIND), { borrowerId: 'w' }), null, 'jumlah tak diketahui');
  const hold = { ...GRIND, policyFlags: { holdBankruptUntilRound: 10 } };
  const poorWinner = { ...g, players: { ...g.players, w: { id: 'w', name: 'JULE', cash: 400_000 } } };
  const ph = createPolicy(hold);
  assert.equal(ph.lendOffer(buildView(poorWinner, 'w', hold), { borrowerId: 'f1', amount: 300_000 }), null);
});

test('loanAmountFromTexts: label diutamakan; ragu → null', () => {
  assert.equal(loanAmountFromTexts(['B minta pinjaman', 'Rp900 rb']), 900_000);
  assert.equal(loanAmountFromTexts(['Butuh Rp1,5 jt', 'Kas kamu Rp9,9 jt']), 1_500_000);
  assert.equal(loanAmountFromTexts(['Rp9,9 jt']), 9_900_000);
  assert.equal(loanAmountFromTexts(['Rp9,9 jt', 'Rp900 rb']), null);
  assert.equal(loanAmountFromTexts(['−Rp1 jt']), null);
  assert.equal(loanAmountFromTexts([]), null);
});

test('resolveBorrowerId: pending → nama di modal → pemain giliran', () => {
  const players = { me: { id: 'me', name: 'A' }, b: { id: 'b', name: 'Budi' }, c: { id: 'c', name: 'Cici' } };
  assert.equal(resolveBorrowerId({ players, pending: { borrowerId: 'c' } }, 'me'), 'c');
  assert.equal(resolveBorrowerId({ players, pending: { borrower: 'Cici' } }, 'me'), 'c');
  assert.equal(resolveBorrowerId({ players }, 'me', ['Budi minta pinjaman']), 'b');
  assert.equal(resolveBorrowerId({ players }, 'me', ['Budi', 'Cici']), null);
  assert.equal(resolveBorrowerId({ players, phase: 'awaiting_loan', currentPlayer: 'b' }, 'me'), 'b');
  assert.equal(resolveBorrowerId({ players, phase: 'awaiting_loan', currentPlayer: 'me' }, 'me'), null);
  assert.equal(resolveBorrowerId({ players }, 'me'), null);
});

// ---------- handler: tidak pernah klik "Tawarkan" kalau policy menolak ----------
const btn = (label) => ({
  textContent: label,
  attrs: {},
  getAttribute(k) {
    return this.attrs[k] ?? null;
  },
  disabled: false,
  clicks: 0,
  click() {
    this.clicks++;
  },
});

function lenderCtx({ policy, game, extra = [] }) {
  const modal = {};
  const tawarkan = btn('Tawarkan');
  const pcts = ['0%', '10%', '25%', '50%'].map(btn);
  const list = [...pcts, tawarkan, ...extra];
  const labelOf = (b) => norm(b?.textContent ?? '');
  const find = (m) => list.filter((b) => matchLabel(m, labelOf(b), b));
  const out = [];
  const ctx = {
    cfg: { timing: { actionDelayMs: 0 } },
    game,
    me: { id: 'me' },
    view: {},
    policy,
    memo: {},
    now: () => 10_000,
    log: { info: (m) => out.push(m), warn: (m) => out.push(m), error: () => {}, debug: () => {} },
    dom: {
      labelOf,
      findButtons: (m) => find(m),
      findButton: (m) => find(m)[0] ?? null,
      findButtonByAria: () => null,
      boxOf: () => modal,
      isSelected: () => false,
      climb: () => null,
    },
    act: {
      click: (b) => (b.click(), true),
      sleep: async () => {},
      pause: async () => {},
      pressKey: () => {},
      waitFor: async (fn) => fn() || null,
    },
  };
  return { ctx, tawarkan, pcts, out };
}

test('loan-offer handler: policy null + tanpa tombol tolak → tidak klik Tawarkan', async () => {
  const game = { phase: 'awaiting_loan', currentPlayer: 'b', pending: { amount: 300_000 }, players: {} };
  const { ctx, tawarkan, pcts } = lenderCtx({ policy: { lendOffer: () => null }, game });
  const d = loanOffer.detect(ctx);
  assert.equal(d?.side, 'lender');
  assert.equal(await loanOffer.run(ctx, d), false);
  assert.equal(tawarkan.clicks, 0);
  assert.ok(pcts.every((b) => b.clicks === 0));
});

test('loan-offer handler: peminjam/jumlah tak diketahui → tolak tanpa tanya policy', async () => {
  let asked = 0;
  const policy = { lendOffer: () => (asked++, 50) };
  const tolak = btn('Tolak');
  const { ctx, tawarkan } = lenderCtx({ policy, game: { players: {} }, extra: [tolak] });
  assert.equal(await loanOffer.run(ctx, loanOffer.detect(ctx)), true);
  assert.equal(asked, 0);
  assert.equal(tawarkan.clicks, 0);
  assert.equal(tolak.clicks, 1);
});

test('loan-offer handler: policy setuju → pilih bunga lalu Tawarkan', async () => {
  const game = { phase: 'awaiting_loan', currentPlayer: 'b', pending: { amount: 300_000 }, players: {} };
  const { ctx, tawarkan, pcts } = lenderCtx({ policy: { lendOffer: () => 25 }, game });
  assert.equal(await loanOffer.run(ctx, loanOffer.detect(ctx)), true);
  assert.equal(pcts[2].clicks, 1);
  assert.equal(tawarkan.clicks, 1);
});
