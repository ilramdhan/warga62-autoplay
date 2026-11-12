import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, validateConfig } from '../src/core/config.js';

const valid = () => normalizeConfig({ myName: 'ilramdhan.dev', role: 'host' });

test('normalizeConfig: bawaan lengkap dan tidak berbagi referensi', () => {
  const a = normalizeConfig();
  a.accounts.push('x');
  assert.deepEqual(DEFAULT_CONFIG.accounts, ['ilramdhan.dev', 'JULE']);
  assert.equal(a.timing.tickMs, 350);
  assert.deepEqual(normalizeConfig().accounts, ['ilramdhan.dev', 'JULE']);
});

test('normalizeConfig: deep-merge dan coerce', () => {
  const c = normalizeConfig({
    enabled: 'true',
    myName: '  JULE ',
    role: 'GUEST',
    mode: 'salah',
    room: { startingCash: '12', maxPlayers: 5, difficulty: 'KRISMON', awards: 'false' },
    timing: { tickMs: 5, actionDelayMs: [900, 100], minStartPlayers: 99 },
    strategy: { riskTolerance: 7, lendInterest: '25' },
    chat: { customPhrases: ['  halo ', '', 'halo', 5] },
  });
  assert.equal(c.enabled, true);
  assert.equal(c.myName, 'JULE');
  assert.equal(c.role, 'guest');
  assert.equal(c.mode, 'grind');
  assert.equal(c.room.startingCash, 10);
  assert.equal(c.room.maxPlayers, 4);
  assert.equal(c.room.difficulty, 'krismon');
  assert.equal(c.room.awards, false);
  assert.equal(c.room.map, 'pulau');
  assert.equal(c.timing.tickMs, 100);
  assert.deepEqual(c.timing.actionDelayMs, [100, 900]);
  assert.equal(c.timing.minStartPlayers, 8);
  assert.equal(c.strategy.riskTolerance, 1);
  assert.equal(c.strategy.lendInterest, 25);
  assert.deepEqual(c.chat.customPhrases, ['halo', '5']);
});

test('normalizeConfig: akun dibatasi 8 dan unik', () => {
  const c = normalizeConfig({ accounts: ['a', 'A', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] });
  assert.equal(c.accounts.length, 8);
  assert.equal(c.accounts[1], 'b');
});

test('validateConfig: config valid', () => {
  assert.deepEqual(validateConfig(valid()), []);
});

test('validateConfig: galat umum', () => {
  assert.ok(validateConfig({ ...valid(), myName: '' }).some((e) => /myName/.test(e)));
  assert.ok(validateConfig({ ...valid(), accounts: [] }).some((e) => /1 sampai 8/.test(e)));
  assert.ok(validateConfig({ ...valid(), hostName: 'orang' }).some((e) => /Host/.test(e)));
  assert.ok(validateConfig({ ...valid(), winnerName: 'orang' }).some((e) => /Pemenang/.test(e)));
  assert.ok(validateConfig({ ...valid(), role: 'guest' }).some((e) => /guest/.test(e)));
});

test('validateConfig: akses room hanya privat/teman', () => {
  const c = valid();
  c.room.access = 'publik';
  assert.ok(validateConfig(c).some((e) => /publik/i.test(e)));
  c.room.access = 'teman';
  assert.deepEqual(validateConfig(c), []);
  assert.ok(
    validateConfig({
      ...c,
      room: { ...c.room, maxPlayers: 4 },
      accounts: ['a', 'b', 'c', 'd', 'e'],
      myName: 'a',
      hostName: 'a',
      winnerName: 'b',
    }).some((e) => /melebihi/.test(e)),
  );
});

test('validateConfig: tahan input aneh', () => {
  assert.ok(validateConfig(null).length > 0);
  assert.ok(validateConfig({}).length > 0);
});

test('normalizeConfig: nick sendiri, host, pemenang otomatis masuk daftar akun', () => {
  const c = normalizeConfig({
    myName: 'B',
    role: 'guest',
    mode: 'grind',
    hostName: 'A',
    winnerName: 'C',
    accounts: [],
  });
  assert.deepEqual(c.accounts, ['B', 'A', 'C']);
  const arena = normalizeConfig({
    myName: 'B',
    role: 'guest',
    mode: 'arena',
    hostName: 'A',
    winnerName: 'C',
    accounts: [],
  });
  assert.deepEqual(arena.accounts, ['B', 'A'], 'pemenang tidak ditambahkan di mode arena');
  assert.equal(normalizeConfig({ myName: 'H', role: 'host', hostName: '' }).hostName, 'H', 'host: hostName = myName');
});

test('validateConfig: guest arena cukup nick sendiri (gabung manual di tengah game)', () => {
  const c = normalizeConfig({ myName: 'B', role: 'guest', mode: 'arena', hostName: '', accounts: [] });
  assert.deepEqual(validateConfig(c), []);
  const host = normalizeConfig({
    myName: 'H',
    hostName: 'H',
    role: 'host',
    mode: 'arena',
    accounts: [],
    timing: { minStartPlayers: 2 },
  });
  assert.ok(
    validateConfig(host).some((e) => /Minimal pemain/.test(e)),
    'host tetap butuh akun untuk diundang',
  );
});
