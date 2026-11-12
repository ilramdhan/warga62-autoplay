/**
 * buildView(game, meId, cfg) -> View
 *
 * Data turunan dari state game untuk dipakai strategi. Fungsi murni: tidak menyentuh DOM,
 * tidak mengubah `game`, dan tidak pernah melempar error. Field yang hilang diganti default aman.
 * Tidak membaca `game.seed` / `game.rng` (lihat .claude/rules/game-integrity.md).
 */
import { BOARD_SIZE, DIFFICULTY, PROVINCES, TILES, TILE_RULES, provinceOf } from '../data/board.js';

/** Nama tingkat di UI/config -> key DIFFICULTY. */
export const DIFFICULTY_ALIASES = {
  easy: 'easy',
  santai: 'easy',
  medium: 'medium',
  normal: 'medium',
  hard: 'hard',
  inflasi: 'hard',
  extreme: 'extreme',
  krismon: 'extreme',
};

export const difficultyKeyOf = (value) => DIFFICULTY_ALIASES[String(value ?? '').toLowerCase()] ?? 'medium';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const optNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Normalisasi satu pemain. `key` dipakai kalau `raw.id` kosong. */
function normalizePlayer(raw, key) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const id = p.id ?? p.sessionId ?? key ?? p.name ?? '';
  const keepCards = Array.isArray(p.keepCards) ? p.keepCards : [];
  const jailTurns = num(p.jailTurns);
  return {
    ...p,
    id: String(id),
    name: String(p.name ?? p.nick ?? id ?? ''),
    cash: num(p.cash),
    position: ((Math.trunc(num(p.position)) % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE,
    jailTurns,
    inJail: Boolean(p.inJail ?? p.jailed ?? jailTurns > 0),
    skipTurns: num(p.skipTurns),
    passStartCount: num(p.passStartCount),
    pinjolTaken: num(p.pinjolTaken, p.pinjolTaken === true ? 1 : 0),
    keepCards,
    keepCardIds: keepCards.map((c) => (typeof c === 'string' ? c : (c?.id ?? c?.cardId ?? ''))).filter(Boolean),
    bankrupt: Boolean(p.bankrupt),
  };
}

function normalizePlayers(game) {
  const raw = game?.players;
  if (Array.isArray(raw)) return raw.map((p, i) => normalizePlayer(p, p?.id ?? String(i)));
  if (raw && typeof raw === 'object') return Object.entries(raw).map(([k, p]) => normalizePlayer(p, k));
  return [];
}

function normalizeProperties(game) {
  const out = [];
  const raw = game?.properties;
  for (let i = 0; i < BOARD_SIZE; i++) {
    let p = null;
    if (Array.isArray(raw)) p = raw[i];
    else if (raw && typeof raw === 'object') p = raw[i] ?? raw[String(i)];
    const level = Math.max(0, Math.min(3, Math.trunc(num(p?.level))));
    const owner = p?.owner ?? p?.ownerId ?? null;
    out.push({ owner: owner == null || owner === '' ? null : String(owner), level, mortgaged: Boolean(p?.mortgaged) });
  }
  return out;
}

/** Ambil daftar pinjaman aktif dengan bentuk yang dinormalisasi. */
function normalizeLoans(game) {
  const raw = Array.isArray(game?.loans) ? game.loans : [];
  return raw
    .filter((l) => l && typeof l === 'object' && !l.repaid && !l.paid)
    .map((l) => {
      const principal = num(l.principal ?? l.amount);
      const pct = num(l.interestPercent ?? l.interest ?? l.rate);
      const interest = pct > 1 ? pct / 100 : pct;
      const owed = optNum(l.remaining) ?? optNum(l.owed) ?? optNum(l.total) ?? principal * (1 + interest);
      return {
        borrower: String(l.borrower ?? l.borrowerId ?? l.from ?? ''),
        lender: String(l.lender ?? l.lenderId ?? l.to ?? (l.kind === 'pinjol' ? 'pinjol' : '')),
        principal,
        interest,
        owed,
        kind: l.kind ?? (l.lender === 'pinjol' ? 'pinjol' : 'player'),
      };
    });
}

/**
 * @param {object|null} game state dari readGame()
 * @param {string} meId id pemain (atau nama) milik instance ini
 * @param {object} [cfg] config bot (mode, winnerName, accounts, myName)
 */
export function buildView(game, meId, cfg = {}) {
  const g = game && typeof game === 'object' ? game : {};
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const settings = g.settings && typeof g.settings === 'object' ? g.settings : {};
  const rules = g.rules && typeof g.rules === 'object' ? g.rules : {};
  const difficultyKey = difficultyKeyOf(settings.difficulty);
  const difficulty = DIFFICULTY[difficultyKey];
  const crisis = Boolean(g.crisisActive ?? rules.crisisActive);

  const allPlayers = normalizePlayers(g);
  const byId = new Map(allPlayers.map((p) => [p.id, p]));
  const findPlayer = (key) => {
    if (key == null) return null;
    const k = String(key);
    return byId.get(k) ?? allPlayers.find((p) => p.name === k) ?? null;
  };
  const me =
    findPlayer(meId) ??
    findPlayer(c.myName) ??
    normalizePlayer({ id: meId ?? c.myName ?? 'me', name: c.myName ?? '', missing: true }, 'me');
  const opponents = allPlayers.filter((p) => p.id !== me.id && !p.bankrupt);

  const properties = normalizeProperties(g);
  const loans = normalizeLoans(g);
  const myTiles = properties.map((p, i) => (p.owner === me.id ? i : -1)).filter((i) => i >= 0);

  const ruleMult = optNum(rules.rentMultiplier) ?? optNum(g.rentMultiplier);
  const rentMultiplier = Math.min(TILE_RULES.maxRentMultiplier, ruleMult ?? difficulty.rentMultiplier);
  const feeMultiplier = optNum(rules.feeMultiplier) ?? difficulty.feeMultiplier;

  const gameMode = String(settings.mode ?? 'survival').toLowerCase() === 'ronde' ? 'ronde' : 'survival';
  const round = Math.max(1, Math.trunc(num(g.round, 1)));
  const maxRounds = optNum(settings.maxRounds ?? settings.rounds);
  const roundsLeft = gameMode === 'ronde' && maxRounds ? Math.max(0, maxRounds - round + 1) : Infinity;

  const idOf = (key) => findPlayer(key)?.id ?? (key == null ? null : String(key));
  const ownerOf = (i) => properties[i]?.owner ?? null;

  const provinceTiles = (prov) => PROVINCES[prov]?.tiles ?? [];
  const ownsProvince = (id, prov) => {
    const pid = idOf(id);
    const tiles = provinceTiles(prov);
    return Boolean(pid) && tiles.length > 0 && tiles.every((t) => properties[t].owner === pid);
  };
  const provinceCount = (id, prov) => {
    const pid = idOf(id);
    return provinceTiles(prov).filter((t) => properties[t].owner === pid).length;
  };
  const completeProvinces = (id) => Object.keys(PROVINCES).filter((prov) => ownsProvince(id, prov));

  const tileValue = (i) => {
    const prov = provinceOf(i);
    if (!prov) return 0;
    const info = PROVINCES[prov];
    return info.price + (properties[i]?.level ?? 0) * info.upgradeCost;
  };

  /**
   * Sewa kalau seseorang mendarat di petak i.
   * level default = level sekarang. asOwner = hitung seolah-olah petak dimiliki pemain ini (hipotesis).
   */
  const rentAt = (i, level, asOwner) => {
    const prov = provinceOf(i);
    if (!prov) return 0;
    const prop = properties[i];
    const hypothetical = level !== undefined || asOwner !== undefined;
    if (!hypothetical && (prop.mortgaged || !prop.owner)) return 0;
    const lv = Math.max(0, Math.min(3, Math.trunc(num(level, prop.level))));
    const owner = asOwner !== undefined ? idOf(asOwner) : prop.owner;
    let rent = PROVINCES[prov].rent[lv];
    if (lv === 0 && owner && owner !== 'state') {
      const full = provinceTiles(prov).every((t) => t === i || properties[t].owner === owner);
      if (full) rent *= 2;
    }
    let extra = 0;
    const landing = rules.provinceLandingFee;
    if (landing && typeof landing === 'object' && optNum(landing[prov])) extra = landing[prov];
    return Math.round(rent * rentMultiplier + extra);
  };

  const isTakeoverSafe = (i) => {
    const prop = properties[i];
    if (!prop || !prop.owner || prop.owner === 'state') return true;
    if (prop.mortgaged || prop.level >= 3) return true;
    const prov = provinceOf(i);
    return prov ? ownsProvince(prop.owner, prov) : true;
  };

  const debtOf = (id) => {
    const pid = idOf(id);
    const fromLoans = loans.filter((l) => l.borrower === pid).reduce((s, l) => s + l.owed, 0);
    if (fromLoans > 0) return fromLoans;
    return num(findPlayer(pid)?.debt);
  };

  const redeemRatio = optNum(rules.redeem) ?? difficulty.redeem;
  const netWorth = (id) => {
    const pid = idOf(id);
    const p = findPlayer(pid);
    let total = num(p?.cash);
    properties.forEach((prop, i) => {
      if (prop.owner !== pid) return;
      const prov = provinceOf(i);
      if (!prov) return;
      const info = PROVINCES[prov];
      total += prop.mortgaged ? info.price * (1 - redeemRatio) : info.price + prop.level * info.upgradeCost;
    });
    return total - debtOf(pid);
  };

  const mode = c.mode === 'grind' ? 'grind' : 'arena';
  const accountNames = Array.isArray(c.accounts) ? c.accounts.map(String) : [];
  const isWinner = (id) => {
    if (mode !== 'grind' || !c.winnerName) return false;
    const p = findPlayer(id);
    return Boolean(p) && (p.name === c.winnerName || p.id === c.winnerName);
  };
  const isFeeder = (id) => {
    if (mode !== 'grind' || !c.winnerName) return false;
    const p = findPlayer(id);
    if (!p || isWinner(p.id)) return false;
    return accountNames.length === 0 || accountNames.includes(p.name) || accountNames.includes(p.id);
  };
  const winner = mode === 'grind' ? (allPlayers.find((p) => isWinner(p.id)) ?? null) : null;

  const pinjolCfg = difficulty.pinjol;
  const pinjolDisabled = Boolean(rules.disablePinjol ?? rules.pinjolDisabled);
  const pinjolAvailable = (id) => {
    if (!pinjolCfg || pinjolDisabled) return false;
    const p = findPlayer(id);
    return num(p?.pinjolTaken) < pinjolCfg.uses;
  };

  /** Biaya petak khusus (sudah dikali multiplier tingkat & Krisis). */
  const fees = {
    tax: (id) => {
      const count = properties.filter((p) => p.owner === idOf(id)).length;
      const per = crisis ? TILE_RULES.tax.crisisPerProperty : TILE_RULES.tax.perProperty;
      return Math.round((count > 0 ? count * per : TILE_RULES.tax.noProperty) * feeMultiplier);
    },
    toll: Math.round((crisis ? TILE_RULES.toll.crisisFee : TILE_RULES.toll.fee) * feeMultiplier),
    parking: Math.round(TILE_RULES.parking.fee * feeMultiplier),
    raidFine: Math.round(TILE_RULES.raid.fine * feeMultiplier),
    courtFine: TILE_RULES.court.jailFine.fine,
    courtWin: TILE_RULES.court.win.gain,
    courtSeize: difficulty.courtSeize,
    bail: difficulty.jailBail,
  };

  return {
    me,
    meId: me.id,
    opponents,
    allPlayers,
    activePlayers: allPlayers.filter((p) => !p.bankrupt),
    phase: g.phase ?? null,
    round,
    maxRounds: maxRounds ?? null,
    roundsLeft,
    gameMode,
    mode,
    settings,
    rules,
    difficultyKey,
    difficulty,
    crisis,
    rentMultiplier,
    feeMultiplier,
    fees,
    properties,
    loans,
    myTiles,
    pending: g.pending ?? null,
    treasury: num(g.stateTreasury),
    tiles: TILES,
    player: findPlayer,
    idOf,
    ownerOf,
    ownsProvince,
    provinceCount,
    completeProvinces,
    tileValue,
    rentAt,
    isTakeoverSafe,
    takeoverPrice: (i) => Math.round(tileValue(i) * difficulty.takeoverMultiplier),
    debtOf,
    netWorth,
    cashOf: (id) => num(findPlayer(id)?.cash),
    position: (id) => findPlayer(id)?.position ?? 0,
    isJailed: (id) => Boolean(findPlayer(id)?.inJail),
    tilesOf: (id) => properties.map((p, i) => (p.owner === idOf(id) ? i : -1)).filter((i) => i >= 0),
    pinjolAvailable,
    isWinner,
    isFeeder,
    winner,
  };
}
