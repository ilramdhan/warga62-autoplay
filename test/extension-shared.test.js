import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fillOwnDefaults,
  stateLabel,
  handlerLabel,
  phaseLabel,
  isStale,
  STALE_MS,
  detailedErrorsOf,
  errorsOf,
  addKnownAccounts,
  removeKnownAccounts,
} from '../src/extension/shared.js';
import { normalizeConfig } from '../src/core/config.js';

test('fillOwnDefaults: host & grind kosong memakai nick sendiri', () => {
  const c = fillOwnDefaults({ myName: ' Aku ', role: 'host', mode: 'grind', hostName: '', winnerName: '' });
  assert.equal(c.hostName, 'Aku');
  assert.equal(c.winnerName, 'Aku');
});

test('fillOwnDefaults: tidak menimpa isian yang sudah ada / guest / arena', () => {
  const a = fillOwnDefaults({ myName: 'A', role: 'host', mode: 'grind', hostName: 'H', winnerName: 'W' });
  assert.equal(a.hostName, 'H');
  assert.equal(a.winnerName, 'W');
  const g = fillOwnDefaults({ myName: 'A', role: 'guest', mode: 'arena', hostName: '', winnerName: '' });
  assert.equal(g.hostName, '');
  assert.equal(g.winnerName, '');
  const none = fillOwnDefaults({ myName: '', role: 'host', mode: 'grind', hostName: '', winnerName: '' });
  assert.equal(none.hostName, '');
});

test('fillOwnDefaults: config pemakaian pertama jadi valid', () => {
  const first = normalizeConfig({
    myName: 'Solo',
    role: 'host',
    mode: 'grind',
    accounts: [],
    hostName: '',
    winnerName: '',
  });
  first.winnerName = '';
  assert.ok(errorsOf(first).length > 0);
  const filled = normalizeConfig(fillOwnDefaults(first));
  assert.deepEqual(errorsOf({ ...filled, timing: { ...filled.timing, minStartPlayers: 1 } }), []);
});

test('label status dalam Bahasa Indonesia', () => {
  assert.equal(stateLabel('acting'), 'Bertindak');
  assert.equal(stateLabel('waiting'), 'Menunggu');
  assert.equal(stateLabel('idle'), 'Siaga');
  assert.equal(stateLabel('paused', 'hidden'), 'Dijeda — tab game tidak aktif');
  assert.equal(stateLabel('paused', 'off'), 'Dijeda — bot dimatikan');
  assert.equal(stateLabel(null), '-');
  assert.equal(handlerLabel('buy'), 'Beli kota');
  assert.equal(handlerLabel('some-new'), 'some new');
  assert.equal(handlerLabel(null), '-');
  assert.equal(phaseLabel('awaiting_toll'), 'Bayar tol');
  assert.equal(phaseLabel('x_y'), 'x y');
});

test('isStale', () => {
  const now = 1_000_000;
  assert.equal(isStale(null, now), true);
  assert.equal(isStale(now - 1000, now), false);
  assert.equal(isStale(now - STALE_MS - 1, now), true);
});

test('detailedErrorsOf: galat memakai label UI dan path field', () => {
  const errs = detailedErrorsOf({ ...normalizeConfig({}), myName: '', role: 'host', hostName: '', winnerName: '' });
  const paths = errs.map((e) => e.path);
  assert.ok(paths.includes('myName'));
  assert.ok(paths.includes('hostName'));
  assert.ok(paths.includes('winnerName'));
  for (const e of errs) assert.doesNotMatch(e.message, /myName|hostName|winnerName/);
});

test('addKnownAccounts: "Semua pemain ini akun saya" hanya menambah akun dikenal, bukan roster; bisa dibatalkan', () => {
  const cfg = normalizeConfig({
    myName: 'H',
    hostName: 'H',
    role: 'host',
    mode: 'arena',
    accounts: ['H', 'B'],
    roster: ['H', 'B'],
  });
  const r = addKnownAccounts(cfg, ['b', 'Baru', 'Lain']);
  assert.equal(r.error, null);
  assert.deepEqual(r.added, ['Baru', 'Lain'], 'nama yang sudah ada (beda huruf) tidak ditambah ulang');
  const next = normalizeConfig({ ...cfg, accounts: r.accounts });
  assert.deepEqual(next.roster, ['H', 'B'], 'roster tidak berubah');
  assert.ok(next.accounts.includes('Baru'));
  const undone = removeKnownAccounts(next, r.added);
  assert.deepEqual(undone, ['H', 'B']);
  assert.deepEqual(removeKnownAccounts(next, ['B']), next.accounts, 'akun yang ikut main tidak dihapus');
  const full = addKnownAccounts({ accounts: Array.from({ length: 30 }, (_, i) => `x${i}`) }, ['satu-lagi']);
  assert.ok(full.error && /melebihi 30/.test(full.error));
  assert.deepEqual(full.added, []);
});
