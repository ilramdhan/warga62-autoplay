/**
 * Konfigurasi bot: nilai bawaan, normalisasi (merge + coerce + clamp) dan validasi.
 * Kontrak bentuk config ada di docs/architecture.md.
 */

export const DEFAULT_CONFIG = {
  enabled: false,
  myName: '',
  role: 'host',
  mode: 'grind',
  accounts: ['ilramdhan.dev', 'JULE'],
  hostName: 'ilramdhan.dev',
  winnerName: 'JULE',
  room: {
    access: 'privat',
    mode: 'survival',
    rounds: 15,
    difficulty: 'normal',
    startingCash: 10,
    maxPlayers: 4,
    map: 'pulau',
    awards: false,
    autoByAchievement: true,
  },
  achievements: { enabled: true, targets: [] },
  strategy: { riskTolerance: 0.5, reserveRounds: 1.0, lendInterest: 'auto', usePinjol: 'auto' },
  chat: { enabled: true, stickers: true, quickPhrases: true, customPhrases: [] },
  timing: {
    tickMs: 350,
    actionDelayMs: [250, 700],
    buildDelayPerTileMs: 1200,
    watchdogMs: 180000,
    minStartPlayers: 2,
    inviteRetryMs: 45000,
  },
  debug: false,
};

export const ALLOWED_ACCESS = ['privat', 'teman'];
export const ROLES = ['host', 'guest'];
export const MODES = ['grind', 'arena'];
const ROOM_MODES = ['survival', 'ronde'];
const DIFFICULTIES = ['santai', 'normal', 'inflasi', 'krismon'];
const CASH_OPTIONS = [5, 10, 15];
const PLAYER_OPTIONS = [4, 6, 8];
const ROUND_OPTIONS = [10, 15, 20];
const MAPS = ['pulau', 'kota-banjir', 'ibu-kota-baru', 'desa-sawah', 'acak'];
const LEND_OPTIONS = [0, 10, 25, 50];
const PINJOL_OPTIONS = ['auto', 'never', 'always'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (o) => JSON.parse(JSON.stringify(o));

/** Deep-merge: objek digabung, array/skalar dari `patch` menggantikan. `undefined`/`null` diabaikan. */
export function deepMerge(base, patch) {
  const out = isObj(base) ? { ...base } : {};
  if (!isObj(patch)) return out;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    out[k] =
      isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : Array.isArray(v) ? v.slice() : isObj(v) ? deepMerge({}, v) : v;
  }
  return out;
}

const str = (v, d = '') => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : d);
const bool = (v, d) => {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return d;
};
const num = (v, d, min, max) => {
  const n = typeof v === 'string' ? Number(v) : v;
  const x = typeof n === 'number' && Number.isFinite(n) ? n : d;
  return Math.min(max, Math.max(min, x));
};
const oneOf = (v, list, d) => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : v;
  return list.includes(s) ? s : d;
};
const nearest = (v, list, d) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return list.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best), list[0]);
};
function strList(v, max, maxLen = 200) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const x of v) {
    const s = str(x).slice(0, maxLen);
    if (s && !out.some((y) => y.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Gabungkan dengan nilai bawaan, paksa tipe, dan batasi rentang. Selalu mengembalikan objek baru.
 * Catatan: `room.access` yang tidak valid sengaja TIDAK diganti (hanya di-lowercase) supaya
 * `validateConfig` bisa melaporkannya; handler tetap menolak nilai selain privat/teman.
 * @param {object} [partial]
 */
export function normalizeConfig(partial = {}) {
  const src = deepMerge(clone(DEFAULT_CONFIG), isObj(partial) ? partial : {});
  const d = DEFAULT_CONFIG;
  const room = isObj(src.room) ? src.room : {};
  const ach = isObj(src.achievements) ? src.achievements : {};
  const st = isObj(src.strategy) ? src.strategy : {};
  const ch = isObj(src.chat) ? src.chat : {};
  const tm = isObj(src.timing) ? src.timing : {};

  let delay = tm.actionDelayMs;
  if (typeof delay === 'number') delay = [delay, delay];
  if (!Array.isArray(delay) || delay.length < 2) delay = d.timing.actionDelayMs;
  let dMin = num(delay[0], d.timing.actionDelayMs[0], 0, 10000);
  let dMax = num(delay[1], d.timing.actionDelayMs[1], 0, 10000);
  if (dMin > dMax) [dMin, dMax] = [dMax, dMin];

  const lend =
    typeof st.lendInterest === 'string' && st.lendInterest !== 'auto' ? Number(st.lendInterest) : st.lendInterest;

  return {
    enabled: bool(src.enabled, d.enabled),
    myName: str(src.myName),
    role: oneOf(src.role, ROLES, d.role),
    mode: oneOf(src.mode, MODES, d.mode),
    accounts: strList(src.accounts, 8, 60),
    hostName: str(src.hostName),
    winnerName: str(src.winnerName),
    room: {
      access: typeof room.access === 'string' ? room.access.trim().toLowerCase() : d.room.access,
      mode: oneOf(room.mode, ROOM_MODES, d.room.mode),
      rounds: nearest(room.rounds, ROUND_OPTIONS, d.room.rounds),
      difficulty: oneOf(room.difficulty, DIFFICULTIES, d.room.difficulty),
      startingCash: nearest(room.startingCash, CASH_OPTIONS, d.room.startingCash),
      maxPlayers: nearest(room.maxPlayers, PLAYER_OPTIONS, d.room.maxPlayers),
      map: oneOf(room.map, MAPS, d.room.map),
      awards: bool(room.awards, d.room.awards),
      autoByAchievement: bool(room.autoByAchievement, d.room.autoByAchievement),
    },
    achievements: { enabled: bool(ach.enabled, true), targets: strList(ach.targets, 50, 80) },
    strategy: {
      riskTolerance: num(st.riskTolerance, 0.5, 0, 1),
      reserveRounds: num(st.reserveRounds, 1, 0, 5),
      lendInterest:
        st.lendInterest === 'auto' || LEND_OPTIONS.includes(lend)
          ? LEND_OPTIONS.includes(lend)
            ? lend
            : 'auto'
          : 'auto',
      usePinjol: oneOf(st.usePinjol, PINJOL_OPTIONS, 'auto'),
    },
    chat: {
      enabled: bool(ch.enabled, true),
      stickers: bool(ch.stickers, true),
      quickPhrases: bool(ch.quickPhrases, true),
      customPhrases: strList(ch.customPhrases, 20, 120),
    },
    timing: {
      tickMs: num(tm.tickMs, d.timing.tickMs, 100, 5000),
      actionDelayMs: [dMin, dMax],
      buildDelayPerTileMs: num(tm.buildDelayPerTileMs, d.timing.buildDelayPerTileMs, 200, 10000),
      watchdogMs: num(tm.watchdogMs, d.timing.watchdogMs, 20000, 3600000),
      minStartPlayers: Math.round(num(tm.minStartPlayers, d.timing.minStartPlayers, 2, 8)),
      inviteRetryMs: num(tm.inviteRetryMs, d.timing.inviteRetryMs, 5000, 600000),
    },
    debug: bool(src.debug, d.debug),
  };
}

const sameName = (a, b) =>
  typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();
const hasName = (list, name) => Array.isArray(list) && list.some((n) => sameName(n, name));

/**
 * Validasi config. Mengembalikan array pesan galat (Bahasa Indonesia); array kosong = valid.
 * @param {object} cfg
 * @returns {string[]}
 */
export function validateConfig(cfg) {
  const errors = [];
  const c = isObj(cfg) ? cfg : {};
  const accounts = Array.isArray(c.accounts) ? c.accounts : [];
  const myName = typeof c.myName === 'string' ? c.myName.trim() : '';

  if (!myName) errors.push('Nama akun (myName) belum diisi.');
  if (accounts.length < 2 || accounts.length > 8) {
    errors.push(`Daftar akun harus berisi 2 sampai 8 nama (sekarang ${accounts.length}).`);
  }
  if (myName && !hasName(accounts, myName)) errors.push(`Nama akun "${myName}" tidak ada di daftar akun.`);
  if (!ROLES.includes(c.role)) errors.push('Peran (role) harus "host" atau "guest".');
  if (!MODES.includes(c.mode)) errors.push('Mode harus "grind" atau "arena".');

  const hostName = typeof c.hostName === 'string' ? c.hostName.trim() : '';
  if (!hostName) errors.push('Nama host (hostName) belum diisi.');
  else if (!hasName(accounts, hostName)) errors.push(`Host "${hostName}" tidak ada di daftar akun.`);
  if (c.role === 'host' && hostName && myName && !sameName(hostName, myName)) {
    errors.push('Peran host, tetapi nama akun berbeda dari hostName.');
  }
  if (c.role === 'guest' && hostName && myName && sameName(hostName, myName)) {
    errors.push('Peran guest, tetapi nama akun sama dengan hostName.');
  }

  const winnerName = typeof c.winnerName === 'string' ? c.winnerName.trim() : '';
  if (c.mode === 'grind' && !winnerName) errors.push('Mode grind butuh winnerName (akun yang dibuat menang).');
  else if (winnerName && !hasName(accounts, winnerName)) {
    errors.push(`Pemenang "${winnerName}" tidak ada di daftar akun.`);
  }

  const room = isObj(c.room) ? c.room : {};
  if (!ALLOWED_ACCESS.includes(room.access)) {
    errors.push('Akses room harus "privat" atau "teman" (room publik tidak diizinkan).');
  }
  if (Number.isFinite(room.maxPlayers) && accounts.length > room.maxPlayers) {
    errors.push(`Jumlah akun (${accounts.length}) melebihi maksimal pemain room (${room.maxPlayers}).`);
  }
  const minStart = c.timing?.minStartPlayers;
  if (Number.isFinite(minStart) && minStart > accounts.length) {
    errors.push('Minimal pemain untuk mulai melebihi jumlah akun.');
  }
  return errors;
}
