import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, WEEKLY_TASK_PATTERNS, matchWeeklyTask } from '../src/core/data/achievements.js';
import { planAchievements, flagsForRole } from '../src/core/strategy/planner.js';
import { createPolicy } from '../src/core/strategy/index.js';
import { buildView } from '../src/core/state/view.js';

const GRIND = { mode: 'grind', winnerName: 'JULE', accounts: ['JULE', 'a2', 'a3'] };

test('katalog berisi 51 pencapaian unik dengan field wajib', () => {
  assert.equal(ACHIEVEMENTS.length, 51);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, 51);
  for (const a of ACHIEVEMENTS) {
    assert.match(a.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(['grind', 'arena', 'both', 'manual'].includes(a.automatable), a.id);
    assert.ok(['juara2', 'count', 'single-game', 'total', 'social', 'manual', 'weekly'].includes(a.kind), a.id);
  }
  assert.equal(ACHIEVEMENTS.find((a) => a.id === 'tim-sukses').automatable, 'manual');
  assert.equal(ACHIEVEMENTS.find((a) => a.id === 'rebut-dadu-developer').automatable, 'manual');
});

test('selamat-dari-krismon -> tingkat krismon + tahan bangkrut sampai ronde 10', () => {
  const plan = planAchievements(ACHIEVEMENTS, {}, { ...GRIND, achievements: { targets: ['selamat-dari-krismon'] } });
  assert.deepEqual(plan.targetIds, ['selamat-dari-krismon']);
  assert.equal(plan.roomPreset.difficulty, 'krismon');
  assert.equal(plan.roomPreset.mode, 'ronde');
  assert.ok(plan.roomPreset.rounds >= 10);
  assert.equal(plan.policyFlags.holdBankruptUntilRound, 10);
  assert.equal(plan.roomPreset.access, 'privat');
});

test('menang-di-kondangan butuh 8 akun', () => {
  const few = planAchievements(ACHIEVEMENTS, {}, GRIND);
  assert.ok(!few.targetIds.includes('menang-di-kondangan'));
  const eight = planAchievements(
    ACHIEVEMENTS,
    {},
    {
      ...GRIND,
      accounts: Array.from({ length: 8 }, (_, i) => `x${i}`),
      achievements: { targets: ['menang-di-kondangan'] },
    },
  );
  assert.equal(eight.roomPreset.maxPlayers, 8);
});

test('flag per peran & mode arena', () => {
  const plan = planAchievements(ACHIEVEMENTS, {}, { ...GRIND, achievements: { targets: ['tuan-tanah-ibu-kota'] } });
  assert.deepEqual(plan.policyFlags.winner.wantProvinces, ['dki']);
  assert.deepEqual(flagsForRole(plan.policyFlags, 'winner').wantProvinces, ['dki']);
  const cupu = planAchievements(
    ACHIEVEMENTS,
    {},
    { mode: 'arena', achievements: { targets: ['rahasia-lemparan-cupu'] } },
  );
  assert.equal(cupu.policyFlags.rollTarget, 'cupu');
  assert.equal(createPolicy({ mode: 'arena', policyFlags: cupu.policyFlags }).rollTarget(buildView({}, 'x')), 'cupu');
});

test('turis domestik memutar peta yang belum', () => {
  const plan = planAchievements(
    ACHIEVEMENTS,
    { 'turis-domestik': { mapsDone: ['pulau', 'kota-banjir'] } },
    { mode: 'arena', achievements: { targets: ['turis-domestik'] } },
  );
  assert.equal(plan.roomPreset.map, 'ibu-kota-baru');
});

test('pinjol tidak digabung dengan krismon', () => {
  const plan = planAchievements(
    ACHIEVEMENTS,
    {},
    { ...GRIND, achievements: { targets: ['selamat-dari-krismon', 'lunas-sebelum-lebaran'] } },
  );
  assert.deepEqual(plan.targetIds, ['selamat-dari-krismon']);
  assert.ok(plan.notes.some((n) => n.includes('lunas-sebelum-lebaran')));
});

test('auto: pilih yang belum selesai, manual dilaporkan', () => {
  const progress = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, { done: a.kind !== 'juara2' }]));
  const plan = planAchievements(ACHIEVEMENTS, progress, GRIND);
  assert.ok(plan.targetIds.length > 0 && plan.targetIds.length <= 3);
  assert.ok(plan.targetIds.every((id) => ACHIEVEMENTS.find((a) => a.id === id).kind === 'juara2'));
  assert.equal(plan.policyFlags.holdBankruptUntilRound, 10);
  assert.ok(Array.isArray(plan.manual));
});

test('tugas mingguan dipetakan ke flag', () => {
  assert.deepEqual(matchWeeklyTask('Ambil Pinjol 2 kali').flags, { wantPinjol: true });
  assert.equal(matchWeeklyTask('Lempar Perfect 5 kali').flags.rollTarget, 'perfect');
  assert.equal(matchWeeklyTask('Masuk Lapas 3 kali').count, 3);
  assert.equal(matchWeeklyTask('Sesuatu yang aneh'), null);
  assert.ok(WEEKLY_TASK_PATTERNS.length > 5);
  const plan = planAchievements(
    ACHIEVEMENTS,
    {},
    {
      mode: 'arena',
      achievements: { targets: ['ktp-jadi-juga'], weekly: ['Masuk Lapas 3 kali', 'Lempar Perfect 5 kali'] },
    },
  );
  assert.equal(plan.policyFlags.wantJail, true);
  assert.equal(plan.policyFlags.rollTarget, 'perfect');
});
