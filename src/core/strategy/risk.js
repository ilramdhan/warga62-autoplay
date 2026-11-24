/**
 * Perhitungan peluang & risiko untuk strategi. Semua murni & sinkron.
 *
 * Model gerak (penyederhanaan yang dijelaskan di docs/strategy.md):
 * - 2d6; zona Perfect menggandakan peluang kembar (2/36 per angka kembar), Cupu membaginya dua.
 * - Kembar tidak memberi giliran tambahan (hanya menarik kartu Takdir), jadi satu giliran = satu gerakan.
 * - Mendarat di Gerbang Tol -> pindah ke gerbang tol lain (gerakan berikutnya dari sana).
 * - Razia/Pengadilan memakai lemparan satu dadu: Biasa/Cupu satu dadu, Perfect dua dadu ambil yang TERTINGGI
 *   (Razia Lapas 1/9; Pengadilan menang 5/9, Lapas+denda 1/3, Lapas+sita 1/9). Lama di Lapas diabaikan di
 *   model gerak, tapi biayanya (jaminan + sewa yang masuk Negara) dihitung di landingCost.
 * Bot TIDAK memprediksi dadu: ini peluang murni, sama dengan yang bisa dihitung pemain biasa.
 */
import { BOARD_SIZE, LOAN_INTEREST_OPTIONS, PROVINCES, TILES, provinceOf } from '../data/board.js';

export const JAIL_TILE = TILES.findIndex((t) => t.kind === 'jail');
export const TOLL_TILES = TILES.map((t, i) => (t.kind === 'toll' ? i : -1)).filter((i) => i >= 0);
/** Petak tempat pemain sering "mulai" bergerak: START, Lapas, keluar tol. */
export const HOTSPOTS = [0, JAIL_TILE, ...TOLL_TILES];

/** Perkiraan rata-rata kerugian satu kartu Musibah (asumsi, lihat docs/strategy.md). */
export const MUSIBAH_EXPECTED_LOSS = 300_000;

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

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

/**
 * Peluang hasil lemparan satu dadu (Razia, Pengadilan) menurut zona lempar. Perfect melempar dua dadu dan
 * mengambil yang tertinggi; `rolls` > 1 = lempar ulang ambil terbaik (Pengacara Kenalan), jadi jumlah dadu
 * yang diambil maksimumnya = rolls × (Perfect ? 2 : 1). P(maks ≤ k) = (k/6)^n.
 * @returns {{low:number, mid:number, high:number}} low = 1–2, mid = 3–4, high = 5–6
 */
export function singleDieOdds(target = 'biasa', rolls = 1) {
  const n = Math.max(1, Math.trunc(num(rolls, 1))) * (target === 'perfect' ? 2 : 1);
  const le = (k) => (k / 6) ** n;
  return { low: le(2), mid: le(4) - le(2), high: 1 - le(4) };
}

/** Tujuan akhir setelah mendarat di petak t (tol -> gerbang lain, Razia/Pengadilan -> sebagian ke Lapas). */
function settle(t, target = 'biasa') {
  const kind = TILES[t]?.kind;
  if (kind === 'toll' && TOLL_TILES.length > 1) {
    const other = TOLL_TILES.find((x) => x !== t);
    return [[other, 1]];
  }
  if (kind === 'raid' || kind === 'court') {
    const o = singleDieOdds(target);
    const pJail = kind === 'raid' ? o.low : o.low + o.mid;
    return [
      [JAIL_TILE, pJail],
      [t, 1 - pJail],
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
        for (const [dest, w] of settle(t, target)) next[dest] += pr * w;
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
 * Biaya masuk Lapas bagi `pid`: jaminan + sewa kota sendiri yang masuk Negara selama satu putaran lawan
 * (sebelum giliran berikut kita sempat membayar jaminan). Tanpa view/kota = jaminan saja.
 */
export function jailCost(view, pid, target = 'biasa') {
  if (!view) return 0;
  const bail = num(view.fees?.bail);
  let lost = 0;
  for (const t of view.tilesOf?.(pid) ?? []) {
    if (view.properties[t]?.mortgaged) continue;
    lost += expectedRentIncome(view, t, { ownerId: pid, horizon: 1, target });
  }
  return bail + lost;
}

/**
 * Biaya (rupiah, positif = rugi) bila `playerId` mendarat di petak t. Pemasukan negatif.
 * Sewa ke pemilik lain (termasuk Negara). Petak sendiri = 0. `target` = zona lempar pemain (dadu tunggal
 * Razia/Pengadilan: Perfect ambil tertinggi dari dua dadu).
 */
export function landingCost(view, playerId, t, target = 'biasa') {
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
    case 'raid': {
      if (hasKeep(player, 'surat-rt')) return 0;
      const o = singleDieOdds(target);
      return o.low * jailCost(view, pid, target) + (1 - o.low) * view.fees.raidFine;
    }
    case 'court': {
      const cash = Math.max(0, view.cashOf(pid));
      const win = view.fees.courtWin;
      const fine = view.fees.courtFine;
      const seize = cash * view.fees.courtSeize;
      const jail = jailCost(view, pid, target);
      // Pengacara: lempar dua kali ambil terbaik.
      const o = singleDieOdds(target, hasKeep(player, 'pengacara') ? 2 : 1);
      // Orang Dalam membatalkan putusan buruk; hanya hasil menang yang tersisa.
      if (hasKeep(player, 'orang-dalam')) return -win * singleDieOdds(target).high;
      return -win * o.high + (fine + jail) * o.mid + (seize + jail) * o.low;
    }
    case 'musibah': {
      const loss = MUSIBAH_EXPECTED_LOSS * num(view.feeMultiplier, 1);
      return hasKeep(player, 'asuransi') || hasKeep(player, 'restu-ibu') ? loss / 3 : loss;
    }
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
    const cost = landingCost(view, playerId, t, target);
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

/** Utang `playerId` yang jatuh tempo dalam ≤ 2 giliran (atau tempo tak diketahui). */
export function dueSoonDebt(view, playerId) {
  if (!view) return 0;
  const pid = view.idOf ? view.idOf(playerId ?? view.meId) : (playerId ?? view.meId);
  return (Array.isArray(view.loans) ? view.loans : [])
    .filter((l) => l.borrower === pid && (l.turnsLeft === undefined || l.turnsLeft <= 2))
    .reduce((sum, l) => sum + num(l.owed), 0);
}

/**
 * Cadangan kas yang dipakai policy smart (dan Monitor): recommendedReserve, minimal (1,3 − toleransi) × sewa
 * terburuk, + setengah eskalasi Krisis (kalau game tidak mengirim pengali aktual), + utang jatuh tempo ≤ 2 giliran.
 * @param {object} opts { riskTolerance, reserveRounds, flags: {reserveOverride, neverNegative}, target, playerId }
 */
export function policyReserve(
  view,
  { riskTolerance = 0.5, reserveRounds = 1, flags = {}, target = 'biasa', playerId } = {},
) {
  if (!view) return 0;
  const f = flags && typeof flags === 'object' ? flags : {};
  if (typeof f.reserveOverride === 'number' && Number.isFinite(f.reserveOverride)) return f.reserveOverride;
  const rt = Math.max(0, Math.min(1, Number.isFinite(riskTolerance) ? riskTolerance : 0.5));
  const turns = Math.max(1, Math.round(2 * num(reserveRounds, 1)));
  const pid = playerId ?? view.meId;
  let base = recommendedReserve(view, pid, { turns, riskTolerance: rt, target });
  // Satu kali kena sewa terbesar yang mungkin (kota lawan berbangunan) jangan sampai memaksa gadai beruntun.
  const worst = expectedRentExposure(view, pid, turns, target).worst;
  base = Math.max(base, worst * (1.3 - rt));
  if (view.crisis && typeof view.rules?.rentMultiplier !== 'number') {
    base *= 1 + num(view.difficulty?.crisisRentEscalation) / 2;
  }
  base += dueSoonDebt(view, pid);
  base = Math.round(base);
  return f.neverNegative ? Math.round(base * 1.5 + 300_000) : base;
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
 * @param {object} opts { ownerId, level, horizon, target } (target = zona lempar lawan, default 'biasa')
 */
export function expectedRentIncome(view, tile, { ownerId, level, horizon = 10, target = 'biasa' } = {}) {
  if (!view || !provinceOf(tile)) return 0;
  const owner = view.idOf(ownerId ?? view.properties[tile]?.owner ?? view.meId);
  const h = Math.max(0, horizon);
  const simTurns = Math.min(12, Math.ceil(h));
  if (simTurns === 0) return 0;
  const rent = view.rentAt(tile, level ?? view.properties[tile]?.level ?? 0, owner);
  let total = 0;
  for (const opp of view.activePlayers) {
    if (opp.id === owner) continue;
    const visits = visitProbabilities(opp.position, simTurns, target);
    total += visits[tile];
  }
  return rent * total * (h / simTurns);
}

/**
 * Nilai ekspektasi sebuah properti: pemasukan sewa selama horizon vs harga.
 * @returns {{income:number, cost:number, net:number, roi:number}}
 */
export function propertyEV(view, tile, { ownerId, price, horizon = 10, level, target } = {}) {
  const income = expectedRentIncome(view, tile, { ownerId, horizon, level, target });
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

/** Rata-rata giliran per putaran papan (gaji diterima saat melewati START). */
const TURNS_PER_LAP = BOARD_SIZE / 7;

/**
 * Peluang peminjam gagal melunasi `amount` + bunga `pct`% dalam tempo pinjaman (heuristik murni).
 * Kemampuan bayar = kas setelah menerima pinjaman + gaji yang diharapkan selama tempo + ½ nilai cair aset
 * (gadai kota tak tergadai + refund bangunan; kota tergadai tidak dihitung) − ekspektasi sewa/biaya selama
 * tempo − utang lain. Cakupan = kemampuan ÷ total tagihan; pDefault = 1,25 − 0,4 × cakupan (dibatasi 5–95%).
 * Bunga lebih tinggi → tagihan lebih besar → peluang gagal bayar naik.
 */
export function loanDefaultProbability(view, borrowerId, amount, pct, target = 'biasa') {
  if (!view?.player) return 0.95;
  const b = view.player(borrowerId);
  if (!b || b.bankrupt) return 1;
  const amt = Math.max(0, num(amount));
  const owed = amt * (1 + Math.max(0, num(pct)) / 100);
  if (owed <= 0) return 0.05;
  const cashAfter = num(b.cash) + amt;
  if (cashAfter < 0) return 0.95; // pinjaman tidak menutup kekurangan: tetap bangkrut
  const d = view.difficulty ?? {};
  const turns = Math.max(1, num(d.loanTurns, 3));
  const income = num(b.salary, num(d.salary)) * (turns / TURNS_PER_LAP);
  let liquid = 0;
  for (const t of view.tilesOf?.(b.id) ?? []) {
    const prop = view.properties[t];
    const info = PROVINCES[provinceOf(t)];
    if (!prop || !info || prop.mortgaged) continue;
    liquid += info.price * num(d.mortgage, 0.5) + prop.level * info.upgradeCost * num(d.buildingRefund, 0.5);
  }
  const exposure = expectedRentExposure(view, b.id, turns, target).expected;
  const capacity = cashAfter + income + liquid * 0.5 - exposure - num(view.debtOf?.(b.id));
  const coverage = capacity / owed;
  return Math.max(0.05, Math.min(0.95, 1.25 - 0.4 * coverage));
}

/**
 * Penilaian keamanan meminjamkan `amount` ke `borrowerId` (murni). Tidak pernah melempar.
 * Syarat: jumlah diketahui; peminjam ada, belum bangkrut, tidak punya utang lain; kita tidak berutang;
 * game tidak hampir selesai; kas − jumlah ≥ cadangan × reserveFactor; jumlah ≤ maxShare × (kas − cadangan);
 * peminjam tidak lebih kaya. Lolos → daftar opsi bunga dengan pDefault & EV = tagihan × (1 − pDefault) − jumlah.
 * @returns {{ok:boolean, reason:string, amt?:number, options?:Array<{pct:number,pDefault:number,ev:number}>}}
 */
export function assessLoan(
  view,
  borrowerId,
  amount,
  { reserve = 0, reserveFactor = 1.5, maxShare = 0.25, target = 'biasa', requireNotRicher = true } = {},
) {
  const no = (reason) => ({ ok: false, reason });
  const p = view?.me;
  if (!p || p.missing) return no('view kosong');
  const b = view.player?.(borrowerId);
  if (!b || b.id === p.id) return no('peminjam tidak dikenal');
  if (b.bankrupt) return no('peminjam sudah bangkrut');
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return no('jumlah pinjaman tidak diketahui');
  }
  const amt = amount;
  if (num(view.debtOf?.(p.id)) > 0 || num(p.cash) < 0) return no('kita sendiri masih berutang');
  if (num(view.debtOf?.(b.id)) > 0) return no('peminjam masih punya utang lain');
  const loanTurns = num(view.difficulty?.loanTurns, 3);
  if (num(view.roundsLeft, Infinity) <= loanTurns + 1) return no('game hampir selesai, pinjaman tak kembali');
  const r = Math.max(0, num(reserve));
  if (p.cash - amt < r * reserveFactor) return no('kas kita tipis untuk meminjamkan');
  if (amt > maxShare * (p.cash - r)) return no('pinjaman terlalu besar dibanding kas lebih');
  if (requireNotRicher && view.netWorth(b.id) > view.netWorth(p.id)) return no('jangan bantu pemain yang lebih kaya');
  const options = LOAN_INTEREST_OPTIONS.map((pct) => {
    const pDefault = loanDefaultProbability(view, b.id, amt, pct, target);
    return { pct, pDefault, ev: amt * (1 + pct / 100) * (1 - pDefault) - amt };
  });
  return { ok: true, reason: 'aman', amt, options };
}
