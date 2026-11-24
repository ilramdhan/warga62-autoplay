import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  MAX_KNOWN_ACCOUNTS,
  configWarnings,
  normalizeConfig,
  validateConfig,
  validateConfigDetailed,
} from '../src/core/config.js';

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

test('normalizeConfig: akun dikenal unik dan dibatasi, roster dibatasi 8', () => {
  const many = Array.from({ length: 40 }, (_, i) => `n${i}`);
  const c = normalizeConfig({ accounts: ['a', 'A', 'b', ...many], roster: ['a', 'b', ...many] });
  assert.equal(c.accounts.length, MAX_KNOWN_ACCOUNTS);
  assert.equal(c.accounts.filter((n) => n.toLowerCase() === 'a').length, 1);
  assert.equal(c.roster.length, 8);
  assert.ok(
    c.roster.every((n) => c.accounts.includes(n)),
    'semua roster ada di akun dikenal',
  );
});

test('validateConfig: config valid', () => {
  assert.deepEqual(validateConfig(valid()), []);
});

test('validateConfig: galat umum', () => {
  assert.ok(validateConfig({ ...valid(), myName: '' }).some((e) => /Nick kamu belum diisi/.test(e)));
  assert.ok(validateConfig({ ...valid(), accounts: [] }).some((e) => /1 sampai 30/.test(e)));
  assert.ok(validateConfig({ ...valid(), roster: [] }).some((e) => /ikut main harus 1 sampai 8/.test(e)));
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
      roster: ['a', 'b', 'c', 'd', 'e'],
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

test('normalizeConfig: migrasi config lama (tanpa roster) -> roster dari accounts, dipotong ke maks. pemain', () => {
  const old = normalizeConfig({
    myName: 'H',
    role: 'host',
    mode: 'grind',
    hostName: 'H',
    winnerName: 'W',
    accounts: ['lama1', 'lama2', 'W', 'lama3', 'lama4', 'H'],
    room: { maxPlayers: 4 },
  });
  assert.deepEqual(old.roster, ['H', 'W', 'lama1', 'lama2'], 'nick sendiri dulu, lalu urutan lama, maks 4');
  assert.deepEqual(old.accounts.slice().sort(), ['H', 'W', 'lama1', 'lama2', 'lama3', 'lama4'].sort());
  assert.deepEqual(validateConfig(old), []);
  // Sudah tersimpan dengan roster: tidak dimigrasi ulang.
  const again = normalizeConfig({ ...old, roster: ['H', 'W'] });
  assert.deepEqual(again.roster, ['H', 'W']);
  assert.ok(again.accounts.includes('lama4'), 'nick dikenal tetap ada');
});

test('normalizeConfig: nick sendiri/host/pemenang selalu di roster dan akun dikenal', () => {
  const c = normalizeConfig({
    myName: 'B',
    role: 'guest',
    mode: 'grind',
    hostName: 'A',
    winnerName: 'C',
    accounts: ['X'],
    roster: [],
  });
  assert.deepEqual(c.roster, ['B', 'A', 'C']);
  assert.deepEqual(c.accounts, ['B', 'A', 'C', 'X']);
});

test('validateConfig: roster melebihi Maks. pemain dan minimal mulai melebihi roster', () => {
  const base = normalizeConfig({
    myName: 'H',
    role: 'host',
    mode: 'arena',
    hostName: 'H',
    accounts: ['H', 'a', 'b', 'c', 'd', 'e'],
    roster: ['H', 'a', 'b', 'c', 'd'],
    room: { maxPlayers: 4 },
  });
  const errs = validateConfigDetailed(base);
  assert.ok(errs.some((e) => e.path === 'roster' && /melebihi Maks\. pemain room \(4\)/.test(e.message)));
  const ok = normalizeConfig({ ...base, roster: ['H', 'a', 'b'] });
  assert.deepEqual(validateConfig(ok), [], 'akun dikenal boleh lebih banyak dari kursi');
  const small = normalizeConfig({ ...ok, timing: { ...ok.timing, minStartPlayers: 4 } });
  assert.ok(
    validateConfig(small).some((e) => /Minimal pemain untuk mulai \(4\) melebihi Akun yang ikut main \(3\)/.test(e)),
  );
  assert.ok(
    validateConfig({ ...ok, roster: ['H', 'asing'] }).some((e) => /belum ada di daftar akun milikmu: asing/.test(e)),
  );
});

test('configWarnings: roster < 3 hanya informasi', () => {
  const two = normalizeConfig({
    myName: 'H',
    hostName: 'H',
    role: 'host',
    mode: 'arena',
    accounts: ['H', 'B'],
    roster: ['H', 'B'],
  });
  assert.deepEqual(validateConfig(two), []);
  assert.ok(configWarnings(two).some((w) => /papan peringkat/.test(w.message)));
  assert.deepEqual(configWarnings({ ...two, roster: ['H', 'B', 'C'] }), []);
});
