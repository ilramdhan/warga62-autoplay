// Helper bersama untuk popup & options (di-bundle esbuild).
import {
  MAX_KNOWN_ACCOUNTS,
  normalizeConfig,
  validateConfig,
  validateConfigDetailed,
  configWarnings,
} from '../core/config.js';

export const KEYS = { config: 'w62.config', status: 'w62.status', logs: 'w62.logs', command: 'w62.command' };

/** Status lebih tua dari ini dianggap basi (tab game tertutup / tidak terhubung). */
export const STALE_MS = 15000;
/** Setelah MULAI, tunggu selama ini sebelum menyarankan membuka tab game. */
export const START_GRACE_MS = 5000;
export const GAME_URL = 'https://mainwarga62.id/';

// Halaman tetap bisa dirender walau dibuka sebagai file statis (tanpa API chrome.*).
const hasChrome = () => typeof chrome !== 'undefined' && Boolean(chrome?.storage?.local);

export async function loadConfig() {
  if (!hasChrome()) return normalizeConfig({});
  const r = await chrome.storage.local.get(KEYS.config);
  return normalizeConfig(r[KEYS.config] || {});
}

export async function saveConfig(cfg) {
  const normalized = normalizeConfig(cfg);
  if (hasChrome()) await chrome.storage.local.set({ [KEYS.config]: normalized });
  return normalized;
}

/** validateConfig bisa mengembalikan array, {errors}, atau {ok}; seragamkan ke array string. */
export function errorsOf(cfg) {
  let v;
  try {
    v = validateConfig(cfg);
  } catch (e) {
    return [String(e && e.message ? e.message : e)];
  }
  if (Array.isArray(v)) return v.map(String);
  if (v && Array.isArray(v.errors)) return v.errors.map(String);
  return [];
}

/** Galat beserta path field terkait: `[{ path, message }]`. */
export function detailedErrorsOf(cfg) {
  try {
    return validateConfigDetailed(cfg);
  } catch (e) {
    return [{ path: '', message: String(e && e.message ? e.message : e) }];
  }
}

/**
 * Isian otomatis untuk pemakaian pertama: host tanpa Nick host memakai nick sendiri,
 * mode grind tanpa Nick pemenang memakai nick sendiri. Fungsi murni; mengembalikan objek baru.
 */
export function fillOwnDefaults(cfg) {
  const next = { ...cfg };
  const me = typeof next.myName === 'string' ? next.myName.trim() : '';
  if (!me) return next;
  const empty = (v) => typeof v !== 'string' || !v.trim();
  if (next.role === 'host' && empty(next.hostName)) next.hostName = me;
  if (next.mode === 'grind' && empty(next.winnerName)) next.winnerName = me;
  return next;
}

/** Peringatan informatif (tidak memblokir): `[{ path, message }]`. */
export function warningsOf(cfg) {
  try {
    return configWarnings(cfg);
  } catch (_e) {
    return [];
  }
}

const lc = (s) => String(s).trim().toLowerCase();

/**
 * Tambah nama ke daftar akun milikmu (whitelist) SAJA, bukan ke Akun yang ikut main. Fungsi murni.
 * @returns {{accounts: string[], added: string[], error: string|null}}
 */
export function addKnownAccounts(cfg, names) {
  const accounts = [...(cfg?.accounts || [])];
  const added = [];
  for (const raw of names || []) {
    const n = String(raw).trim();
    if (!n || accounts.some((a) => lc(a) === lc(n))) continue;
    accounts.push(n);
    added.push(n);
  }
  if (accounts.length > MAX_KNOWN_ACCOUNTS) {
    return {
      accounts: [...(cfg?.accounts || [])],
      added: [],
      error: `Daftar akun milikmu melebihi ${MAX_KNOWN_ACCOUNTS} nick. Hapus nick lama di Pengaturan lengkap.`,
    };
  }
  return { accounts, added, error: null };
}

/** Batalkan addKnownAccounts: hapus `names` dari daftar akun milikmu, kecuali yang ikut main. Fungsi murni. */
export function removeKnownAccounts(cfg, names) {
  const drop = new Set((names || []).map(lc));
  const keep = new Set([...(cfg?.roster || []), cfg?.myName, cfg?.hostName, cfg?.winnerName].filter(Boolean).map(lc));
  return (cfg?.accounts || []).filter((a) => !drop.has(lc(a)) || keep.has(lc(a)));
}

export async function loadStatus() {
  if (!hasChrome()) return null;
  try {
    const r = await chrome.storage.session.get(KEYS.status);
    if (r[KEYS.status]) return r[KEYS.status];
  } catch (_e) {}
  const r = await chrome.storage.local.get(KEYS.status);
  return r[KEYS.status] || null;
}

export async function loadLogs() {
  if (!hasChrome()) return [];
  const r = await chrome.storage.local.get(KEYS.logs);
  return Array.isArray(r[KEYS.logs]) ? r[KEYS.logs] : [];
}

export function onStorageChange(cb) {
  if (!hasChrome() || !chrome.storage.onChanged) return;
  chrome.storage.onChanged.addListener((changes, area) => cb(changes, area));
}

/** Buka URL di tab baru (fallback window.open bila API chrome tidak ada). */
export function openTab(url) {
  if (typeof chrome !== 'undefined' && chrome?.tabs?.create) chrome.tabs.create({ url });
  else window.open(url, '_blank', 'noopener');
}

/** URL halaman extension (fallback relatif untuk pratinjau statis). */
export function extensionUrl(path) {
  if (typeof chrome !== 'undefined' && chrome?.runtime?.getURL) return chrome.runtime.getURL(path);
  return `../${path}`;
}

export function formatRupiah(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '-';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

export function logLine(l) {
  const t = l.ts ? new Date(l.ts).toLocaleTimeString('id-ID', { hour12: false }) : '--:--:--';
  const msg = l.msg ?? l.message ?? (typeof l.text === 'string' ? l.text : JSON.stringify(l));
  return `${t} ${msg}`;
}

export function statusFields(s) {
  const src = s && typeof s === 'object' ? (s.status && typeof s.status === 'object' ? s.status : s) : {};
  const me = src.me && typeof src.me === 'object' ? src.me : {};
  return {
    state: src.state ?? src.engineState ?? null,
    handler: src.handler ?? src.lastHandler ?? null,
    round: src.round ?? null,
    phase: src.phase ?? null,
    reason: src.reason ?? null,
    players: Array.isArray(src.players) ? src.players.map(String) : [],
    foreign: Array.isArray(src.foreign) ? src.foreign.map(String) : [],
    cash: src.cash ?? me.cash ?? null,
    insight: src.insight && typeof src.insight === 'object' ? src.insight : null,
    decisions: Array.isArray(src.decisions) ? src.decisions : [],
    at: (s && (s.receivedAt || s.ts)) || null,
  };
}

// ---- label status untuk pengguna ---------------------------------------------
const STATE_LABELS = { acting: 'Bertindak', waiting: 'Menunggu', paused: 'Dijeda', idle: 'Siaga' };
const REASON_LABELS = {
  off: 'bot dimatikan',
  config: 'pengaturan belum lengkap',
  hidden: 'tab game tidak aktif',
  foreign: 'ada pemain yang bukan akunmu',
};
const HANDLER_LABELS = {
  afk: 'Cek AFK',
  buy: 'Beli kota',
  'card-continue': 'Lanjut kartu',
  choice: 'Pilih kartu',
  court: 'Pengadilan',
  debt: 'Bayar utang',
  endgame: 'Akhir game',
  error: 'Pulihkan galat',
  home: 'Beranda',
  'invite-incoming': 'Terima undangan',
  'join-page': 'Gabung room',
  'joki-dadu': 'Joki dadu',
  keep: 'Simpan kartu',
  'loan-offer': 'Tawaran pinjaman',
  'lobby-configure': 'Atur room',
  'lobby-invite': 'Undang akun',
  'lobby-start': 'Mulai game',
  'money-request': 'Permintaan uang',
  online: 'Halaman online',
  order: 'Urutan main',
  pick: 'Pilih petak',
  'pre-roll': 'Sebelum kocok',
  roll: 'Kocok dadu',
  takeover: 'Ambil alih',
  toll: 'Bayar tol',
  trade: 'Tukar aset',
  upgrade: 'Bangun',
};
const PHASE_LABELS = {
  lobby: 'Ruang tunggu',
  order_roll: 'Urutan main',
  pre_roll: 'Sebelum kocok',
  awaiting_dice: 'Menunggu dadu',
  awaiting_buy: 'Beli kota',
  awaiting_takeover: 'Ambil alih',
  awaiting_toll: 'Bayar tol',
  awaiting_upgrade: 'Bangun',
  awaiting_choice: 'Pilih kartu',
  awaiting_keep: 'Simpan kartu',
  awaiting_pick: 'Pilih petak',
  awaiting_loan: 'Pinjaman',
  debt: 'Utang',
  game_over: 'Game selesai',
};
const humanize = (v) => String(v).replace(/[_-]+/g, ' ').trim();

/** Teks status yang mudah dibaca, mis. "Dijeda — tab game tidak aktif". */
export function stateLabel(state, reason) {
  if (state === null || state === undefined || state === '') return '-';
  const base = STATE_LABELS[state] || humanize(state);
  const why = reason ? REASON_LABELS[reason] : null;
  return why ? `${base} — ${why}` : base;
}
export function handlerLabel(id) {
  if (id === null || id === undefined || id === '') return '-';
  return HANDLER_LABELS[id] || humanize(id);
}
export function phaseLabel(phase) {
  if (phase === null || phase === undefined || phase === '') return '-';
  return PHASE_LABELS[phase] || humanize(phase);
}

/** true bila status tidak ada atau lebih tua dari STALE_MS. */
export function isStale(at, now = Date.now()) {
  return !Number.isFinite(at) || now - at > STALE_MS;
}
