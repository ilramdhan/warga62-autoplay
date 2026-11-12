/**
 * Perhitungan peluang & risiko untuk strategi. Semua murni & sinkron.
 *
 * Model gerak (penyederhanaan yang dijelaskan di docs/strategy.md):
 * - 2d6; zona Perfect menggandakan peluang kembar (2/36 per angka kembar), Cupu membaginya dua.
 * - Kembar tidak memberi giliran tambahan (hanya menarik kartu Takdir), jadi satu giliran = satu gerakan.
 * - Mendarat di Gerbang Tol -> pindah ke gerbang tol lain (gerakan berikutnya dari sana).
 * - Razia: 1/3 masuk Lapas. Pengadilan: 2/3 masuk Lapas. Lama di Lapas diabaikan.
 * Bot TIDAK memprediksi dadu: ini peluang murni, sama dengan yang bisa dihitung pemain biasa.
 */
import { BOARD_SIZE, TILES, provinceOf } from '../data/board.js';

export const JAIL_TILE = TILES.findIndex((t) => t.kind === 'jail');
export const TOLL_TILES = TILES.map((t, i) => (t.kind === 'toll' ? i : -1)).filter((i) => i >= 0);
/** Petak tempat pemain sering "mulai" bergerak: START, Lapas, keluar tol. */
export const HOTSPOTS = [0, JAIL_TILE, ...TOLL_TILES];

/** Perkiraan rata-rata kerugian satu kartu Musibah (asumsi, lihat docs/strategy.md). */
export const MUSIBAH_EXPECTED_LOSS = 300_000;

export const distanceForward = (from, to) => (((to - from) % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;

/**
 * Distribusi jumlah 2d6.
 * @param {'perfect'|'cupu'|'biasa'} [target]
 * @returns {{sum:number[], doubleBySum:number[], pDouble:number}} sum[s] untuk s=0..12
 */
export function diceSumDistribution(target = 'biasa') {
  const pDouble = target === 'perfect' ? 12 / 36 : target === 'cupu' ? 3 / 36 : 6 / 36;
  const perDouble = pDouble / 6;
  const perOther = (1 - pDouble) / 30;
  const sum = new Array(13).fill(0);
  const doubleBySum = new Array(13).fill(0);
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      const p = a === b ? perDouble : perOther;
      sum[a + b] += p;
      if (a === b) doubleBySum[a + b] += p;
    }
  }
  return { sum, doubleBySum, pDouble };
}

/** Tujuan akhir setelah mendarat di petak t (tol -> gerbang lain, Razia/Pengadilan -> sebagian ke Lapas). */
function settle(t) {
  const kind = TILES[t]?.kind;
  if (kind === 'toll' && TOLL_TILES.length > 1) {
    const other = TOLL_TILES.find((x) => x !== t);
    return [[other, 1]];
  }
  if (kind === 'raid') {
    return [
      [JAIL_TILE, 1 / 3],
      [t, 2 / 3],
    ];
  }
  if (kind === 'court') {
    return [
      [JAIL_TILE, 2 / 3],
      [t, 1 / 3],
    ];
  }
  return [[t, 1]];
}

/**
 * Ekspektasi berapa kali mendarat di tiap petak dalam `turns` giliran ke depan.
 * @returns {number[]} panjang 48
 */
const visitCache = new Map();
export function visitProbabilities(from, turns = 1, target = 'biasa') {
  const key = `${from}|${turns}|${target}`;
  const hit = visitCache.get(key);
  if (hit) return hit.slice();
  const { sum } = diceSumDistribution(target);
  let pos = new Array(BOARD_SIZE).fill(0);
  pos[((from % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE] = 1;
  const visits = new Array(BOARD_SIZE).fill(0);
  const n = Math.max(0, Math.min(40, Math.trunc(turns)));
  for (let k = 0; k < n; k++) {
    const next = new Array(BOARD_SIZE).fill(0);
    for (let p = 0; p < BOARD_SIZE; p++) {
      if (!pos[p]) continue;
      for (let s = 2; s <= 12; s++) {
        const pr = pos[p] * sum[s];
        const t = (p + s) % BOARD_SIZE;
        visits[t] += pr;
        for (const [dest, w] of settle(t)) next[dest] += pr * w;
      }
    }
    pos = next;
  }
  if (visitCache.size > 2000) visitCache.clear();
  visitCache.set(key, visits.slice());
  return visits;
}

/** Peluang mendarat di tiap petak pada gerakan berikutnya (total = 1). */
export const landingProbabilities = (from, target = 'biasa') => visitProbabilities(from, 1, target);

/** Peluang (≈) mendarat minimal sekali di petak berjenis `kinds` dalam `turns` giliran. */
export function specialLandingProbability(from, kinds, turns = 1, target = 'biasa') {
  const list = Array.isArray(kinds) ? kinds : [kinds];
  const visits = visitProbabilities(from, turns, target);
  const expected = visits.reduce((s, v, i) => (list.includes(TILES[i].kind) ? s + v : s), 0);
  return turns <= 1 ? Math.min(1, expected) : 1 - Math.exp(-expected);
}

/** Ringkasan peluang petak khusus untuk giliran berikut. */
export function specialLandingRisks(from, turns = 1, target = 'biasa') {
  const out = {};
  for (const kind of ['tax', 'parking', 'toll', 'raid', 'court', 'takdir', 'musibah', 'start']) {
    out[kind] = specialLandingProbability(from, kind, turns, target);
  }
  return out;
}

/** Peluang melewati/berhenti di START pada gerakan berikutnya dari `from` (gaji). */
export function passStartProbability(from, target = 'biasa') {
  const { sum } = diceSumDistribution(target);
  let p = 0;
  for (let s = 2; s <= 12; s++) if (from + s >= BOARD_SIZE) p += sum[s];
  return p;
}

const hasKeep = (player, id) => Boolean(player?.keepCardIds?.includes(id));

/**
 * Biaya (rupiah, positif = rugi) bila `playerId` mendarat di petak t. Pemasukan negatif.
 * Sewa ke pemilik lain (termasuk Negara). Petak sendiri = 0.
 */
export function landingCost(view, playerId, t) {
  if (!view) return 0;
  const tile = TILES[t];
  const player = view.player?.(playerId);
  const pid = player?.id ?? playerId;
  switch (tile?.kind) {
    case 'city': {
      const owner = view.properties[t]?.owner;
      if (!owner || owner === pid) return 0;
      return view.rentAt(t);
    }
    case 'tax':
      return view.fees.tax(pid);
    case 'parking':
      return view.completeProvinces(pid).length > 0 || hasKeep(player, 'juru-parkir') ? 0 : view.fees.parking;
    case 'toll':
      return hasKeep(player, 'voucher-tol') ? 0 : view.fees.toll;
    case 'raid':
      return hasKeep(player, 'surat-rt') ? 0 : (2 / 3) * view.fees.raidFine;
    case 'court': {
      const cash = Math.max(0, view.cashOf(pid));
      return (-view.fees.courtWin + view.fees.courtFine + cash * view.fees.courtSeize) / 3;
    }
    case 'musibah':
      return hasKeep(player, 'asuransi') || hasKeep(player, 'restu-ibu')
        ? MUSIBAH_EXPECTED_LOSS / 3
        : MUSIBAH_EXPECTED_LOSS;
    case 'start':
      return 0;
    default:
      return 0;
  }
}

/**
 * Ekspektasi pengeluaran pemain dalam `turns` giliran ke depan (opsional dari petak `fromTile`).
 * @returns {{expected:number, rent:number, fees:number, worst:number, byTile:number[]}}
 */
export function expectedRentExposure(view, playerId, turns = 2, target = 'biasa', fromTile) {
  const empty = { expected: 0, rent: 0, fees: 0, worst: 0, byTile: new Array(BOARD_SIZE).fill(0) };
  if (!view) return empty;
  const from = Number.isInteger(fromTile) ? fromTile : view.position(playerId);
  const visits = visitProbabilities(from, turns, target);
  let rent = 0;
  let fees = 0;
  let worst = 0;
  const byTile = new Array(BOARD_SIZE).fill(0);
  for (let t = 0; t < BOARD_SIZE; t++) {
    if (!visits[t]) continue;
    const cost = landingCost(view, playerId, t);
    byTile[t] = visits[t] * cost;
    if (TILES[t].kind === 'city') rent += byTile[t];
    else fees += byTile[t];
    if (visits[t] >= 0.02 && cost > worst) worst = cost;
  }
  return { expected: Math.max(0, rent + fees), rent, fees, worst, byTile };
}

/**
 * Cadangan kas yang disarankan: ekspektasi pengeluaran + (1 − toleransi) × kasus terburuk.
 * riskTolerance 0 = sangat hati-hati, 1 = nekat.
 */
export function recommendedReserve(view, playerId, { turns = 2, riskTolerance = 0.5, target = 'biasa' } = {}) {
  if (!view) return 0;
  const rt = Math.max(0, Math.min(1, Number.isFinite(riskTolerance) ? riskTolerance : 0.5));
  const exp = expectedRentExposure(view, playerId, turns, target);
  return Math.round(exp.expected + (1 - rt) * exp.worst);
}

/** Bonus petak "hotspot": 5–9 langkah setelah START/Lapas/tol (paling sering didarati). */
export function hotspotScore(tile) {
  const { sum } = diceSumDistribution('biasa');
  let score = 0;
  for (const h of HOTSPOTS) {
    const d = distanceForward(h, tile);
    if (d >= 2 && d <= 12) score += sum[d];
  }
  return score;
}

/**
 * Ekspektasi pemasukan sewa petak `tile` dari lawan dalam `horizon` giliran.
 * @param {object} opts { ownerId, level, horizon }
 */
export function expectedRentIncome(view, tile, { ownerId, level, horizon = 10 } = {}) {
  if (!view || !provinceOf(tile)) return 0;
  const owner = view.idOf(ownerId ?? view.properties[tile]?.owner ?? view.meId);
  const h = Math.max(0, horizon);
  const simTurns = Math.min(12, Math.ceil(h));
  if (simTurns === 0) return 0;
  const rent = view.rentAt(tile, level ?? view.properties[tile]?.level ?? 0, owner);
  let total = 0;
  for (const opp of view.activePlayers) {
    if (opp.id === owner) continue;
    const visits = visitProbabilities(opp.position, simTurns);
    total += visits[tile];
  }
  return rent * total * (h / simTurns);
}

/**
 * Nilai ekspektasi sebuah properti: pemasukan sewa selama horizon vs harga.
 * @returns {{income:number, cost:number, net:number, roi:number}}
 */
export function propertyEV(view, tile, { ownerId, price, horizon = 10, level } = {}) {
  const income = expectedRentIncome(view, tile, { ownerId, horizon, level });
  const cost = Number.isFinite(price) ? price : view ? view.tileValue(tile) : 0;
  return { income, cost, net: income - cost, roi: cost > 0 ? income / cost : 0 };
}

/** Parse teks rupiah sederhana: "Bayar Rp500 rb", "Rp1,5 jt", "Rp 1.200.000". */
export function parseRupiahText(text) {
  const s = String(text ?? '').toLowerCase();
  const m = s.match(/rp\s*([\d.,]+)\s*(rb|ribu|jt|juta|m|miliar)?/);
  if (!m) return null;
  let raw = m[1];
  const unit = m[2];
  if (unit) raw = raw.replace(/\./g, '').replace(',', '.');
  else raw = raw.replace(/[.,]/g, '');
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  const mult = !unit ? 1 : unit.startsWith('r') ? 1e3 : unit === 'm' || unit === 'miliar' ? 1e9 : 1e6;
  return Math.round(n * mult);
}
