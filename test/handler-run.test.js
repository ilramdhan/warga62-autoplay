import { test } from 'node:test';
import assert from 'node:assert/strict';
import preRoll from '../src/core/handlers/pre-roll.js';
import lobbyConfigure from '../src/core/handlers/lobby-configure.js';
import { originFrom } from '../src/core/handlers/joki-dadu.js';
import { sanitizeGame } from '../src/core/state/reader.js';
import { matchLabel, norm } from '../src/core/dom/query.js';
import { normalizeConfig } from '../src/core/config.js';
import { BOARD_SIZE } from '../src/core/data/board.js';

// Handler memakai `document` sebagai root bawaan; stub minimal untuk Node.
globalThis.document ??= { body: {}, activeElement: null };

const btn = (label, extra = {}) => ({
  get textContent() {
    return typeof label === 'function' ? label() : label;
  },
  attrs: {},
  getAttribute(k) {
    return this.attrs[k] ?? null;
  },
  isConnected: true,
  disabled: false,
  clicks: 0,
  click() {
    this.clicks++;
    this.onClick?.();
  },
  ...extra,
});

/** dom palsu di atas daftar tombol datar. */
function fakeDom(list) {
  const labelOf = (b) => norm(b?.textContent ?? '');
  const visible = () => list.filter((b) => !b.hidden);
  const isDisabled = (b) => !!b?.disabled;
  const find = (m, opts = {}) =>
    visible().filter((b) => (opts.enabledOnly === false || !isDisabled(b)) && matchLabel(m, labelOf(b), b));
  return {
    norm,
    labelOf,
    textOf: labelOf,
    isDisabled,
    isVisible: () => true,
    buttons: () => visible(),
    findButtons: (m, _r, o) => find(m, o),
    findButton: (m, _r, o) => find(m, o)[0] ?? null,
    findButtonByAria: (m, _r, o = {}) =>
      visible().find(
        (b) => (o.enabledOnly === false || !isDisabled(b)) && matchLabel(m, norm(b.getAttribute('aria-label')), b),
      ) ?? null,
    climb: (el, t) => (t({}) ? {} : null),
    optionByText: () => null,
    optionChecked: () => null,
    findLeaf: () => null,
  };
}

const fakeAct = (onSleep = () => {}) => ({
  click: (b) => (b.click(), true),
  sleep: async (ms) => onSleep(ms),
  pause: async () => {},
  pressKey: () => {},
  waitFor: async (fn) => {
    for (let i = 0; i < 3; i++) {
      const v = fn();
      if (v) return v;
    }
    return null;
  },
});

const log = () => {
  const out = [];
  return { out, info: (m) => out.push(m), warn: (m) => out.push(m), error: (m) => out.push(m), debug: () => {} };
};

function sendCtx({ submitLabel, onSleep }) {
  const state = { amount: 100000 };
  const tutup = btn('Tutup');
  const plus = btn('', { onClick: () => (state.amount += 100000) });
  plus.attrs['aria-label'] = 'Tambah';
  const list = [btn('Kirim / minta uang'), btn('B'), btn(() => submitLabel(state)), plus, tutup];
  const ctx = {
    cfg: normalizeConfig({ myName: 'A', role: 'host', accounts: ['A', 'B'] }),
    game: {
      round: 1,
      players: [
        { id: 'a', name: 'A', cash: 10_000_000 },
        { id: 'b', name: 'B', cash: 1 },
      ],
    },
    me: { id: 'a', name: 'A', cash: 10_000_000 },
    dom: fakeDom(list),
    act: fakeAct((ms) => onSleep?.(ms, state)),
    log: log(),
    memo: {},
    now: () => 1_000_000,
  };
  return { ctx, plus, tutup, list, state };
}

test('pre-roll kirim: jumlah tidak terbaca -> batal, tidak menekan + sampai maksimum', async () => {
  const { ctx, plus, tutup } = sendCtx({ submitLabel: () => 'Kasmu kurang' });
  const ok = await preRoll.run(ctx, { action: { type: 'send', to: 'b', amount: 500000 } });
  assert.equal(ok, false);
  assert.equal(plus.clicks, 0);
  assert.equal(tutup.clicks, 1, 'modal ditutup');
});

test('pre-roll kirim: jumlah sesuai rencana -> kirim', async () => {
  const { ctx, plus, list } = sendCtx({ submitLabel: (s) => `Kirim Rp${s.amount / 1000} rb` });
  const ok = await preRoll.run(ctx, { action: { type: 'send', to: 'b', amount: 250000 } });
  assert.equal(ok, true);
  assert.equal(plus.clicks, 2);
  assert.equal(list[2].clicks, 1, 'tombol kirim diklik');
});

test('pre-roll kirim: jumlah melonjak melebihi rencana + satu langkah -> batal', async () => {
  const { ctx, list } = sendCtx({
    submitLabel: (s) => `Kirim Rp${s.amount / 1000} rb`,
    onSleep: (ms, s) => {
      if (ms === 250) s.amount += 600000; // render telat dari klik yang menumpuk
    },
  });
  const ok = await preRoll.run(ctx, { action: { type: 'send', to: 'b', amount: 250000 } });
  assert.equal(ok, false);
  assert.equal(list[2].clicks, 0, 'tombol kirim TIDAK diklik');
});

function configureCtx(options) {
  const opts = Object.fromEntries(Object.entries(options).map(([k, v]) => [k, { label: k, checked: v, clicks: 0 }]));
  const selesai = btn('Selesai');
  const dom = fakeDom([selesai]);
  dom.optionByText = (t) => opts[t] ?? null;
  dom.optionChecked = (el) => (el ? el.checked : null);
  return {
    cfg: normalizeConfig({ myName: 'A', role: 'host', accounts: ['A', 'B'] }),
    dom,
    act: { ...fakeAct(), click: (el) => ((el.clicks = (el.clicks ?? 0) + 1), true) },
    log: log(),
    memo: {},
  };
}

test('lobby-configure: status Privat tidak terbaca -> tidak aman (fail closed)', async () => {
  const ctx = configureCtx({ Privat: null, Publik: false, Survival: true });
  await lobbyConfigure.run(ctx);
  assert.equal(ctx.memo.accessUnsafe, true);
  assert.notEqual(ctx.memo.configured, 'ok');
});

test('lobby-configure: opsi Privat tidak ditemukan -> tidak aman', async () => {
  const ctx = configureCtx({ Survival: true });
  await lobbyConfigure.run(ctx);
  assert.equal(ctx.memo.accessUnsafe, true);
  assert.notEqual(ctx.memo.configured, 'ok');
});

test('lobby-configure: Privat terpilih, Publik tidak -> ok', async () => {
  const ctx = configureCtx({ Privat: true, Publik: false, Survival: true });
  await lobbyConfigure.run(ctx);
  assert.equal(ctx.memo.accessUnsafe, false);
  assert.equal(ctx.memo.configured, 'ok');
});

test('lobby-configure: Publik terpilih -> tidak aman', async () => {
  const ctx = configureCtx({ Privat: true, Publik: true });
  await lobbyConfigure.run(ctx);
  assert.equal(ctx.memo.accessUnsafe, true);
});

test('originFrom: asal = tujuan - langkah dengan wrap-around', () => {
  assert.equal(originFrom(10, 7), 3);
  assert.equal(originFrom(2, 5), BOARD_SIZE - 3);
  assert.equal(originFrom(0, 12), BOARD_SIZE - 12);
  assert.equal(originFrom(5, 5), 0);
  assert.equal(originFrom(null, 5), null);
  assert.equal(originFrom(3, null), null);
});

test('sanitizeGame: kunci seed/rng dibuang di level mana pun', () => {
  const g = {
    seed: 1,
    rngState: 2,
    round: 4,
    settings: { seed: 3, mode: 'ronde' },
    players: [{ id: 1, name: 'A', diceSeed: 9, stats: { rng: 1, wins: 2 } }],
    pending: { card: { deckRng: [1, 2], id: 'x' } },
  };
  const s = sanitizeGame(g);
  const keys = [];
  const walk = (v) => {
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) keys.push(k) && walk(x);
  };
  walk(s);
  assert.ok(!keys.some((k) => /seed|rng/i.test(k)), keys.join(','));
  assert.equal(s.round, 4);
  assert.equal(s.settings.mode, 'ronde');
  assert.ok(Array.isArray(s.players));
  assert.equal(s.players[0].stats.wins, 2);
  assert.equal(s.pending.card.id, 'x');
  assert.equal(g.settings.seed, 3, 'objek asli tidak diubah');
  assert.notEqual(s, g);
  const clean = { round: 1, players: [{ id: 1 }] };
  const sc = sanitizeGame(clean);
  assert.notEqual(sc, clean);
  assert.equal(sc.players, clean.players, 'bagian bersih tidak disalin (copy-on-write)');
  assert.equal(sanitizeGame(null), null);
});
