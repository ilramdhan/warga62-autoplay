/**
 * Planner pencapaian: pilih target -> preset room + flag policy.
 *
 * planAchievements(catalog, progress, cfg) -> {
 *   targetIds, roomPreset: {access, mode, rounds, difficulty, startingCash, maxPlayers, map, awards},
 *   policyFlags: { ...umum, winner: {...}, feeder: {...} }, weekly: [...], manual: [...], notes: [...]
 * }
 *
 * progress: { [achievementId]: { done:boolean, progress?:number, mapsDone?:string[] }, weekly?: Array<string|{text,done}> }
 * Fungsi murni; tidak pernah melempar.
 */
import { ACHIEVEMENTS, JUARA2_MIN_ROUNDS, MAPS, matchWeeklyTask } from '../data/achievements.js';

export const DEFAULT_ROOM = {
  access: 'privat',
  mode: 'survival',
  rounds: null,
  difficulty: 'normal',
  startingCash: 10,
  maxPlayers: 4,
  map: 'acak',
  awards: false,
};

const KIND_PRIORITY = { juara2: 0, 'single-game': 1, count: 2, total: 3, social: 4, weekly: 5, manual: 9 };
const ROLE_KEYS = ['winner', 'feeder'];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Gabungkan flag; array digabung unik, angka holdBankruptUntilRound diambil maksimum. */
function mergeFlags(into, add) {
  for (const [k, v] of Object.entries(add ?? {})) {
    if (ROLE_KEYS.includes(k) && isObj(v)) {
      into[k] = mergeFlags(into[k] ?? {}, v);
    } else if (Array.isArray(v)) {
      into[k] = [...new Set([...(Array.isArray(into[k]) ? into[k] : []), ...v])];
    } else if (k === 'holdBankruptUntilRound') {
      into[k] = Math.max(into[k] ?? 0, v);
    } else {
      into[k] = v;
    }
  }
  return into;
}

const flagValues = (flags, key) =>
  [flags?.[key], ...ROLE_KEYS.map((r) => flags?.[r]?.[key])].filter((v) => v !== undefined);

/** Apakah kandidat bentrok dengan preset/flag yang sudah dipilih. */
function conflicts(preset, flags, cand) {
  const cp = cand.roomPreset ?? {};
  for (const [k, v] of Object.entries(cp)) {
    if (k === 'rounds') continue; // ronde diambil maksimum
    if (preset[k] !== undefined && preset[k] !== v) return `roomPreset.${k}`;
  }
  const cf = cand.flags ?? {};
  const rt = flagValues(flags, 'rollTarget')[0];
  const crt = flagValues(cf, 'rollTarget')[0];
  if (rt && crt && rt !== crt) return 'rollTarget';
  const hold = flagValues(flags, 'holdBankruptUntilRound');
  const chold = flagValues(cf, 'holdBankruptUntilRound');
  if (hold.length && chold.length && (Math.max(...hold) === 0) !== (Math.max(...chold) === 0)) return 'holdBankrupt';
  const wantsPinjol = flagValues(flags, 'wantPinjol').some(Boolean) || flagValues(cf, 'wantPinjol').some(Boolean);
  const diff = cp.difficulty ?? preset.difficulty;
  if (wantsPinjol && diff === 'krismon') return 'pinjol-krismon';
  const wantJail = flagValues(flags, 'wantJail').some(Boolean) || flagValues(cf, 'wantJail').some(Boolean);
  const wantBail = flagValues(flags, 'wantBail').some(Boolean) || flagValues(cf, 'wantBail').some(Boolean);
  if (wantJail && wantBail) return 'jail-vs-bail';
  return null;
}

function pickMap(progress) {
  const p = progress?.['turis-domestik'] ?? {};
  if (Array.isArray(p.mapsDone)) {
    const next = MAPS.find((m) => !p.mapsDone.includes(m));
    if (next) return next;
  }
  const n = Number.isFinite(p.progress) ? p.progress : 0;
  return MAPS[n % MAPS.length];
}

const seatsFor = (n) => (n > 6 ? 8 : n > 4 ? 6 : 4);

/**
 * @param {Array} [catalog]
 * @param {object} [progress]
 * @param {object} [cfg] config bot (mode, accounts, myName, winnerName, room, achievements)
 */
export function planAchievements(catalog = ACHIEVEMENTS, progress = {}, cfg = {}) {
  const list = Array.isArray(catalog) ? catalog : ACHIEVEMENTS;
  const prog = isObj(progress) ? progress : {};
  const c = isObj(cfg) ? cfg : {};
  const mode = c.mode === 'grind' ? 'grind' : 'arena';
  const accounts = Array.isArray(c.accounts) ? c.accounts : [];
  const achCfg = isObj(c.achievements) ? c.achievements : {};
  const maxTargets = Number.isInteger(achCfg.maxTargets) ? achCfg.maxTargets : 3;
  const notes = [];
  const done = (id) => Boolean(prog[id]?.done);
  const byId = new Map(list.map((a) => [a.id, a]));

  const usable = (a) => {
    if (!a || a.automatable === 'manual') return false;
    if (a.automatable !== 'both' && a.automatable !== mode) return false;
    const players = a.requirement?.players;
    if (players && accounts.length < players) {
      notes.push(`${a.id}: butuh ${players} akun (punya ${accounts.length})`);
      return false;
    }
    return true;
  };

  let candidates;
  const explicit = Array.isArray(achCfg.targets) ? achCfg.targets.filter((id) => byId.has(id)) : [];
  if (explicit.length) {
    candidates = explicit.map((id) => byId.get(id));
  } else {
    candidates = list
      .filter((a) => !done(a.id) && usable(a))
      .sort((a, b) => (KIND_PRIORITY[a.kind] ?? 5) - (KIND_PRIORITY[b.kind] ?? 5));
  }

  const preset = {};
  const flags = {};
  const targetIds = [];
  for (const a of candidates) {
    if (targetIds.length >= (explicit.length || maxTargets)) break;
    const why = conflicts(preset, flags, a);
    if (why) {
      notes.push(`${a.id} ditunda (bentrok ${why})`);
      continue;
    }
    for (const [k, v] of Object.entries(a.roomPreset ?? {})) {
      preset[k] = k === 'rounds' ? Math.max(preset.rounds ?? 0, v) : v;
    }
    mergeFlags(flags, a.flags);
    targetIds.push(a.id);
  }

  // Tugas mingguan (teks bebas) -> flag tambahan bila tidak bentrok.
  const weeklyRaw = Array.isArray(achCfg.weekly) ? achCfg.weekly : Array.isArray(prog.weekly) ? prog.weekly : [];
  const weekly = [];
  for (const w of weeklyRaw) {
    const text = typeof w === 'string' ? w : w?.text;
    if (!text || (isObj(w) && w.done)) continue;
    const m = matchWeeklyTask(text);
    if (!m) {
      notes.push(`tugas mingguan tidak dikenali: ${text}`);
      continue;
    }
    const roleFlags = m.role === 'winner' || m.role === 'feeder' ? { [m.role]: m.flags } : m.flags;
    const pseudo = { id: `weekly:${text}`, roomPreset: m.roomPreset, flags: mode === 'grind' ? roleFlags : m.flags };
    const why = conflicts(preset, flags, pseudo);
    if (why) {
      notes.push(`tugas mingguan "${text}" ditunda (bentrok ${why})`);
      continue;
    }
    for (const [k, v] of Object.entries(m.roomPreset ?? {})) if (preset[k] === undefined) preset[k] = v;
    mergeFlags(flags, pseudo.flags);
    weekly.push(m);
  }

  // Juara 2 hanya dihitung di game ≥ 10 ronde: feeder menahan bangkrut di mode grind.
  const hasJuara2 = targetIds.some((id) => byId.get(id)?.kind === 'juara2');
  if (mode === 'grind' && hasJuara2 && !(flags.holdBankruptUntilRound >= JUARA2_MIN_ROUNDS)) {
    flags.holdBankruptUntilRound = JUARA2_MIN_ROUNDS;
  }
  if (flags.holdBankruptUntilRound === 0) delete flags.holdBankruptUntilRound;
  if (flags.holdBankruptUntilRound) flags.minRounds = flags.holdBankruptUntilRound;

  // Mode arena: tidak ada peran; flag "winner" berlaku untuk akun ini sendiri, flag "feeder" diabaikan.
  if (mode === 'arena') {
    const { winner: w = {}, feeder: _f, ...rest } = flags;
    for (const k of Object.keys(flags)) delete flags[k];
    mergeFlags(flags, rest);
    mergeFlags(flags, w);
    delete flags.holdBankruptUntilRound;
  }

  // Susun preset room final.
  const room = isObj(c.room) ? c.room : {};
  const auto = room.autoByAchievement !== false;
  const roomPreset = { ...DEFAULT_ROOM };
  for (const k of Object.keys(DEFAULT_ROOM)) if (room[k] !== undefined) roomPreset[k] = room[k];
  if (auto) Object.assign(roomPreset, preset);
  if (roomPreset.map === 'cycle') roomPreset.map = pickMap(prog);
  if (roomPreset.access !== 'teman') roomPreset.access = 'privat'; // tidak pernah Publik
  if (accounts.length) roomPreset.maxPlayers = Math.max(roomPreset.maxPlayers ?? 4, seatsFor(accounts.length));
  if (roomPreset.mode === 'ronde') {
    const need = flags.minRounds ?? JUARA2_MIN_ROUNDS;
    const r = Math.max(roomPreset.rounds ?? 0, need);
    roomPreset.rounds = r <= 10 ? 10 : r <= 15 ? 15 : 20;
  } else {
    roomPreset.rounds = null;
  }
  if (targetIds.some((id) => (byId.get(id)?.roomPreset ?? {}).awards)) roomPreset.awards = true;
  if (roomPreset.difficulty === 'krismon' && flagValues(flags, 'wantPinjol').some(Boolean)) {
    roomPreset.difficulty = 'santai';
    notes.push('Krismon tidak punya Pinjol: tingkat diganti Santai');
  }

  const manual = list
    .filter((a) => a.automatable === 'manual' && !done(a.id))
    .map((a) => ({ id: a.id, name: a.name, note: a.note ?? '' }));

  return { targetIds, roomPreset, policyFlags: flags, weekly, manual, notes };
}

/** Flag untuk satu peran (grind) — membantu UI/log. */
export function flagsForRole(policyFlags, role) {
  const { winner = {}, feeder = {}, ...common } = isObj(policyFlags) ? policyFlags : {};
  if (role === 'winner') return { ...common, ...winner };
  if (role === 'feeder') return { ...common, ...feeder };
  return { ...common };
}
