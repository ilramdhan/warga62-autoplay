import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBot } from '../src/core/index.js';

/** Bot dibuat tanpa host; kita hanya periksa config yang dihasilkan withPlan(). */
function cfgOf(partial) {
  const bot = createBot(partial, { emit() {} });
  return bot.getConfig();
}

test('planner terpasang: policyFlags & roomPreset terisi (grind + pencapaian aktif)', () => {
  const cfg = cfgOf({ mode: 'grind', achievements: { enabled: true } });
  assert.ok(cfg.policyFlags && typeof cfg.policyFlags === 'object', 'policyFlags ada');
  assert.ok(cfg.roomPreset && typeof cfg.roomPreset === 'object', 'roomPreset ada');
  assert.ok(cfg.roomPreset.access === 'privat' || cfg.roomPreset.access === 'teman', 'akses aman');
});

test('pencapaian mati + tanpa auto room: flag kosong, akses tetap aman', () => {
  const cfg = cfgOf({
    achievements: { enabled: false },
    room: { autoByAchievement: false, access: 'publik' },
  });
  assert.deepEqual(cfg.policyFlags, {});
  assert.equal(cfg.roomPreset.access, 'privat', 'akses publik dijepit ke privat');
});

test('Ronde: roomPreset punya rounds; Survival: rounds null', () => {
  const ronde = cfgOf({
    achievements: { enabled: false },
    room: { autoByAchievement: false, mode: 'ronde', rounds: 20 },
  });
  assert.equal(ronde.roomPreset.rounds, 20);
  const surv = cfgOf({ achievements: { enabled: false }, room: { autoByAchievement: false, mode: 'survival' } });
  assert.equal(surv.roomPreset.rounds, null);
});

test('updateConfig menghitung ulang planner', () => {
  const bot = createBot({ achievements: { enabled: false }, room: { autoByAchievement: false } }, { emit() {} });
  assert.deepEqual(bot.getConfig().policyFlags, {});
  bot.updateConfig({ achievements: { enabled: true } });
  assert.ok(bot.getConfig().roomPreset, 'roomPreset tetap ada setelah update');
});
