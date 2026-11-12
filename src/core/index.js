/**
 * createBot(config, host) -> { start, stop, reset, updateConfig, getStatus, getConfig }
 * host = { emit(event) }
 */
import { deepMerge, normalizeConfig, validateConfig } from './config.js';
import { createLogger } from './log.js';
import { createEngine } from './engine.js';

export function createBot(config, host) {
  let cfg = normalizeConfig(config);
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
      cfg = normalizeConfig(deepMerge(cfg, partial ?? {}));
      log.setDebug(cfg.debug);
      return validateConfig(cfg);
    },
  };
}

export { DEFAULT_CONFIG, normalizeConfig, validateConfig } from './config.js';
