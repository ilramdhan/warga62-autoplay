/**
 * createBot(config, host) -> { start, stop, reset, updateConfig, getStatus, getConfig }
 * host = { emit(event) }
 */
import { deepMerge, normalizeConfig, validateConfig } from './config.js';
import { createLogger } from './log.js';
import { createEngine } from './engine.js';
import { planAchievements } from './strategy/index.js';
import { ACHIEVEMENTS } from './data/achievements.js';

const ROUND_FOR = (r) => (r <= 10 ? 10 : r <= 15 ? 15 : 20);

/** roomPreset dasar dari cfg.room (tanpa pencapaian): akses dijepit, rounds hanya untuk Ronde. */
function baseRoomPreset(room = {}) {
  const preset = { ...room };
  preset.access = room.access === 'teman' ? 'teman' : 'privat';
  preset.rounds = room.mode === 'ronde' ? ROUND_FOR(room.rounds ?? 15) : null;
  return preset;
}

/**
 * Isi cfg.policyFlags dan cfg.roomPreset dari perencana pencapaian.
 * Perencana hanya dijalankan kalau pencapaian diaktifkan atau room diatur otomatis;
 * kalau tidak, flag kosong dan room apa adanya (hanya ditambah `rounds`).
 */
function withPlan(cfg) {
  const roomPreset = baseRoomPreset(cfg.room);
  const usePlanner = cfg.achievements?.enabled === true || cfg.room?.autoByAchievement === true;
  if (!usePlanner) return { ...cfg, policyFlags: {}, roomPreset };
  try {
    const plan = planAchievements(ACHIEVEMENTS, {}, cfg);
    return {
      ...cfg,
      policyFlags: plan.policyFlags ?? {},
      roomPreset: plan.roomPreset ?? roomPreset,
      plan: { targetIds: plan.targetIds, manual: plan.manual, weekly: plan.weekly, notes: plan.notes },
    };
  } catch {
    return { ...cfg, policyFlags: {}, roomPreset };
  }
}

export function createBot(config, host) {
  let cfg = withPlan(normalizeConfig(config));
  const emit = (event) => {
    try {
      host?.emit?.({ ts: Date.now(), ...event });
    } catch {
      // host bermasalah tidak boleh menghentikan bot
    }
  };
  const log = createLogger(emit, { debug: cfg.debug });
  const engine = createEngine({ getConfig: () => cfg, emit, log });
  return {
    start: () => engine.start(),
    stop: () => engine.stop(),
    reset: () => engine.reset(),
    getStatus: () => engine.getStatus(),
    getConfig: () => cfg,
    /** Gabungkan perubahan ke config aktif. Mengembalikan daftar galat validasi (kosong = valid). */
    updateConfig(partial) {
      cfg = withPlan(normalizeConfig(deepMerge(cfg, partial ?? {})));
      log.setDebug(cfg.debug);
      return validateConfig(cfg);
    },
  };
}

export { DEFAULT_CONFIG, normalizeConfig, validateConfig } from './config.js';
