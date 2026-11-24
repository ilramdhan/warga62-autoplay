/**
 * Protokol host ⇄ bot lewat window.postMessage: penyaring pesan masuk (bot) dan event keluar (bridge).
 * Fungsi murni (tanpa DOM/chrome), dipakai oleh entry-page.js dan extension/bridge.js. Lihat docs/architecture.md.
 *
 * Catatan: pesan `postMessage` di MAIN world bisa dikirim oleh skrip halaman mana pun. Penyaring ini
 * membatasi BENTUK pesan (kunci, tipe, panjang), bukan asal-usulnya.
 */
import { DEFAULT_CONFIG, normalizeConfig, validateConfig } from './config.js';

export const HOST_SOURCE = 'w62-host';
export const BOT_SOURCE = 'w62-bot';
export const COMMANDS = ['start', 'stop', 'reset'];
export const EVENT_TYPES = ['log', 'status', 'error', 'game_over', 'achievement'];
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

/** Batas ukuran untuk event yang disimpan ke chrome.storage. */
export const LIMITS = { msg: 500, str: 200, arr: 50, keys: 40, depth: 5 };

/** Kunci tingkat atas yang dipertahankan per tipe event (selain `type` dan `ts`). */
const EVENT_FIELDS = {
  log: ['level', 'msg'],
  error: ['msg', 'message', 'stack', 'handler'],
  status: [
    'state',
    'handler',
    'reason',
    'round',
    'phase',
    'myCash',
    'lastAction',
    'players',
    'foreign',
    'insight',
    'decisions',
  ],
  game_over: ['round', 'ranking'],
  achievement: ['id', 'name', 'msg', 'progress', 'done'],
};
const MSG_FIELDS = new Set(['msg', 'message', 'stack']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cut = (s, max) => (s.length > max ? s.slice(0, max) : s);

/**
 * Salinan terbatas dari nilai JSON: string dipotong, array/objek dibatasi jumlah & kedalaman,
 * fungsi/simbol/undefined dibuang, angka non-finite jadi null.
 */
export function boundedClone(v, depth = 0, strMax = LIMITS.str) {
  if (v === null) return null;
  if (typeof v === 'string') return cut(v, strMax);
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'object' || depth >= LIMITS.depth) return undefined;
  if (Array.isArray(v)) {
    const out = [];
    for (const x of v.slice(0, LIMITS.arr)) {
      const c = boundedClone(x, depth + 1, strMax);
      if (c !== undefined) out.push(c);
    }
    return out;
  }
  const out = {};
  let n = 0;
  for (const [k, x] of Object.entries(v)) {
    if (n >= LIMITS.keys) break;
    const c = boundedClone(x, depth + 1, strMax);
    if (c === undefined) continue;
    out[cut(k, 60)] = c;
    n++;
  }
  return out;
}

/**
 * Saring event `w62-bot` sebelum ditulis ke chrome.storage. Mengembalikan event baru atau null bila ditolak.
 * @param {unknown} e
 * @param {number} [now]
 */
export function sanitizeBotEvent(e, now = Date.now()) {
  if (!isObj(e) || !EVENT_TYPES.includes(e.type)) return null;
  const out = { type: e.type, ts: typeof e.ts === 'number' && Number.isFinite(e.ts) ? e.ts : now };
  for (const key of EVENT_FIELDS[e.type]) {
    if (!(key in e)) continue;
    const c = boundedClone(e[key], 1, MSG_FIELDS.has(key) ? LIMITS.msg : LIMITS.str);
    if (c !== undefined) out[key] = c;
  }
  if (e.type === 'log') {
    if (!LOG_LEVELS.includes(out.level)) out.level = 'info';
    out.msg = typeof out.msg === 'string' ? out.msg : out.msg == null ? '' : cut(String(out.msg), LIMITS.msg);
  }
  return out;
}

/** Ambil hanya kunci tingkat atas yang dikenal DEFAULT_CONFIG. */
export function pickKnownConfig(raw) {
  if (!isObj(raw)) return {};
  const out = {};
  for (const k of Object.keys(DEFAULT_CONFIG)) if (k in raw) out[k] = raw[k];
  return out;
}

/**
 * Saring pesan `w62-host` yang diterima bot.
 * @param {unknown} msg data dari MessageEvent
 * @returns {null | {type:'config', config: object, errors: string[]} | {type:'command', command: 'start'|'stop'|'reset'}}
 */
export function filterHostMessage(msg) {
  if (!isObj(msg) || msg.source !== HOST_SOURCE) return null;
  if (msg.type === 'command') {
    return typeof msg.command === 'string' && COMMANDS.includes(msg.command)
      ? { type: 'command', command: msg.command }
      : null;
  }
  if (msg.type === 'config') {
    if (!isObj(msg.config)) return null;
    let config;
    try {
      config = normalizeConfig(pickKnownConfig(msg.config));
    } catch {
      return null;
    }
    return { type: 'config', config, errors: validateConfig(config) };
  }
  return null;
}
