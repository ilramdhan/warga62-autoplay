/**
 * Konfigurasi bot: nilai bawaan, normalisasi (merge + coerce + clamp) dan validasi.
 * Kontrak bentuk config ada di docs/architecture.md.
 */

export const DEFAULT_CONFIG = {
  enabled: false,
  myName: '',
  role: 'host',
  mode: 'grind',
  // Semua nick milik user (whitelist pengaman: pemain di luar daftar ini = bot dijeda). Boleh panjang.
  accounts: ['ilramdhan.dev', 'JULE'],
  // Akun yang ikut main sesi ini (diundang host, ditunggu sebelum mulai). Maks room.maxPlayers, termasuk diri sendiri.
  roster: ['ilramdhan.dev', 'JULE'],
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
    // Default mati: grinding XP jadi Survival cepat (host cepat bangkrut, game pendek, ulang).
    // Nyalakan di Pengaturan kalau mau mengejar pencapaian (sebagian memaksa mode Ronde yang lebih lama).
    autoByAchievement: false,
  },
  achievements: { enabled: false, targets: [] },
  strategy: { riskTolerance: 0.5, reserveRounds: 1.0, lendInterest: 'auto', usePinjol: 'auto' },
  chat: { enabled: true, stickers: true, quickPhrases: true, customPhrases: [] },
  timing: {
    tickMs: 350,
    actionDelayMs: [250, 700],
    buildDelayPerTileMs: 1200,
    watchdogMs: 180000,
    minStartPlayers: 2,
    inviteRetryMs: 20000,
  },
  debug: false,
};

/** Batas daftar akun dikenal (whitelist) dan daftar akun sesi (roster). */
export const MAX_KNOWN_ACCOUNTS = 30;
export const MAX_ROSTER = 8;

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

/** Nick sendiri, host, dan (mode grind) pemenang: selalu ikut main dan selalu akun milik user. */
function ownNames(src) {
  const out = [str(src.myName), str(src.hostName)];
  if (oneOf(src.mode, MODES, DEFAULT_CONFIG.mode) === 'grind') out.push(str(src.winnerName));
  return out.map((s) => s.slice(0, 60)).filter(Boolean);
}

/** Gabungkan daftar nama (urutan dipertahankan, tanpa duplikat beda huruf), maks `max`. */
function unionNames(lists, max) {
  const out = [];
  for (const list of lists) {
    for (const s of list) {
      if (out.length >= max) return out;
      if (s && !out.some((y) => y.toLowerCase() === s.toLowerCase())) out.push(s);
    }
  }
  return out;
}

/**
 * Roster (akun sesi) dan accounts (akun dikenal). Roster = nick sendiri/host/pemenang + roster tersimpan.
 * Migrasi config lama (tanpa `roster`): roster diturunkan dari `accounts` lama, nick sendiri dulu, dipotong
 * ke room.maxPlayers supaya nick basi tidak membuat daftar main melebihi kursi room.
 * accounts selalu memuat semua nama roster.
 */
function accountLists(src, partial, maxPlayers) {
  const own = ownNames(src);
  const known = strList(src.accounts, MAX_KNOWN_ACCOUNTS, 60);
  const hasRoster = isObj(partial) && Array.isArray(partial.roster);
  const roster = hasRoster
    ? unionNames([own, strList(src.roster, MAX_ROSTER, 60)], MAX_ROSTER)
    : unionNames([own, known], Math.max(maxPlayers, own.length));
  return { roster, accounts: unionNames([roster, known], MAX_KNOWN_ACCOUNTS) };
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

  const maxPlayers = nearest(room.maxPlayers, PLAYER_OPTIONS, d.room.maxPlayers);
  const lists = accountLists(src, partial, maxPlayers);

  const lend =
    typeof st.lendInterest === 'string' && st.lendInterest !== 'auto' ? Number(st.lendInterest) : st.lendInterest;

  return {
    enabled: bool(src.enabled, d.enabled),
    myName: str(src.myName),
    role: oneOf(src.role, ROLES, d.role),
    mode: oneOf(src.mode, MODES, d.mode),
    accounts: lists.accounts,
    roster: lists.roster,
    hostName: str(src.hostName) || (oneOf(src.role, ROLES, d.role) === 'host' ? str(src.myName) : ''),
    winnerName: str(src.winnerName),
    room: {
      access: typeof room.access === 'string' ? room.access.trim().toLowerCase() : d.room.access,
      mode: oneOf(room.mode, ROOM_MODES, d.room.mode),
      rounds: nearest(room.rounds, ROUND_OPTIONS, d.room.rounds),
      difficulty: oneOf(room.difficulty, DIFFICULTIES, d.room.difficulty),
      startingCash: nearest(room.startingCash, CASH_OPTIONS, d.room.startingCash),
      maxPlayers,
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
 * Validasi config dengan path field terkait (untuk menandai field di halaman Pengaturan).
 * Pesan memakai label yang terlihat di UI, bukan nama identifier.
 * @param {object} cfg
 * @returns {{path: string, message: string}[]}
 */
export function validateConfigDetailed(cfg) {
  const errors = [];
  const add = (path, message) => errors.push({ path, message });
  const c = isObj(cfg) ? cfg : {};
  const accounts = Array.isArray(c.accounts) ? c.accounts : [];
  // Config tanpa roster (bentuk lama yang belum dinormalisasi): roster = accounts.
  const roster = Array.isArray(c.roster) ? c.roster : accounts;
  const myName = typeof c.myName === 'string' ? c.myName.trim() : '';

  if (!myName) add('myName', 'Nick kamu belum diisi.');
  if (accounts.length < 1 || accounts.length > MAX_KNOWN_ACCOUNTS) {
    add(
      'accounts',
      `Daftar akun milikmu harus berisi 1 sampai ${MAX_KNOWN_ACCOUNTS} nick (sekarang ${accounts.length}).`,
    );
  }
  if (myName && !hasName(accounts, myName)) add('accounts', `Nick kamu "${myName}" tidak ada di daftar akun milikmu.`);
  if (roster.length < 1 || roster.length > MAX_ROSTER) {
    add('roster', `Akun yang ikut main harus 1 sampai ${MAX_ROSTER} nick (sekarang ${roster.length}).`);
  }
  if (myName && !hasName(roster, myName)) {
    add('roster', `Nick kamu "${myName}" tidak dicentang di Akun yang ikut main.`);
  }
  const notKnown = roster.filter((n) => !hasName(accounts, n));
  if (notKnown.length) add('roster', `Akun yang ikut main belum ada di daftar akun milikmu: ${notKnown.join(', ')}.`);
  if (!ROLES.includes(c.role)) add('role', 'Peran harus Host atau Guest.');
  if (!MODES.includes(c.mode)) add('mode', 'Mode harus Grinding XP atau Arena pintar.');

  const hostName = typeof c.hostName === 'string' ? c.hostName.trim() : '';
  // Guest tanpa hostName tetap boleh jalan (mis. bergabung manual ke game yang sudah dimulai);
  // hanya saja undangan tidak akan diterima otomatis.
  if (!hostName && c.role === 'host') add('hostName', 'Nick host belum diisi.');
  else if (hostName && !hasName(roster, hostName)) {
    add('hostName', `Host "${hostName}" tidak ada di Akun yang ikut main.`);
  }
  if (c.role === 'host' && hostName && myName && !sameName(hostName, myName)) {
    add('hostName', 'Peran Host, tetapi Nick kamu berbeda dari Nick host.');
  }
  if (c.role === 'guest' && hostName && myName && sameName(hostName, myName)) {
    add('hostName', 'Peran guest, tetapi Nick kamu sama dengan Nick host.');
  }

  const winnerName = typeof c.winnerName === 'string' ? c.winnerName.trim() : '';
  if (c.mode === 'grind' && !winnerName) {
    add('winnerName', 'Mode Grinding XP butuh Nick pemenang (akun yang dibuat menang).');
  } else if (c.mode === 'grind' && winnerName && !hasName(roster, winnerName)) {
    add('winnerName', `Pemenang "${winnerName}" tidak ada di Akun yang ikut main.`);
  }

  const room = isObj(c.room) ? c.room : {};
  if (!ALLOWED_ACCESS.includes(room.access)) {
    add('room.access', 'Akses room harus Privat atau Teman (room publik tidak diizinkan).');
  }
  if (Number.isFinite(room.maxPlayers) && roster.length > room.maxPlayers) {
    add(
      'roster',
      `Akun yang ikut main (${roster.length}) melebihi Maks. pemain room (${room.maxPlayers}). ` +
        'Kurangi centang di Akun yang ikut main atau naikkan Maks. pemain.',
    );
  }
  const minStart = c.timing?.minStartPlayers;
  if (c.role === 'host' && Number.isFinite(minStart) && minStart > roster.length) {
    add(
      'timing.minStartPlayers',
      `Minimal pemain untuk mulai (${minStart}) melebihi Akun yang ikut main (${roster.length}).`,
    );
  }
  return errors;
}

/**
 * Peringatan informatif (tidak memblokir MULAI), mis. roster kecil. Format sama dengan validateConfigDetailed.
 * @param {object} cfg
 * @returns {{path: string, message: string}[]}
 */
export function configWarnings(cfg) {
  const c = isObj(cfg) ? cfg : {};
  const roster = Array.isArray(c.roster) ? c.roster : Array.isArray(c.accounts) ? c.accounts : [];
  const out = [];
  if (roster.length > 0 && roster.length < 3) {
    out.push({
      path: 'roster',
      message:
        `Hanya ${roster.length} akun yang ikut main. Catatan: papan peringkat hanya menghitung game ≥10 ronde ` +
        'dengan ≥3 pemain.',
    });
  }
  return out;
}

/**
 * Validasi config. Mengembalikan array pesan galat (Bahasa Indonesia); array kosong = valid.
 * @param {object} cfg
 * @returns {string[]}
 */
export function validateConfig(cfg) {
  return validateConfigDetailed(cfg).map((e) => e.message);
}
