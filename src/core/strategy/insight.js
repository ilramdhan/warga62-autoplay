/**
 * Analisis untuk Monitor (murni, tanpa DOM): posisi saya, kondisi & gaya tiap lawan, ancaman sewa,
 * dan ringkasan strategi yang sedang dipakai. Hanya memakai info yang terlihat pemain biasa.
 */
import { PROVINCES, provinceOf } from '../data/board.js';
import { expectedRentExposure, recommendedReserve } from './risk.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const lc = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase();

/** Ringkasan aset seorang pemain dari view. */
function assetsOf(view, id) {
  const tiles = view.tilesOf(id);
  const buildings = tiles.reduce((s, t) => s + view.properties[t].level, 0);
  const mortgaged = tiles.filter((t) => view.properties[t].mortgaged).length;
  const provinces = Object.keys(PROVINCES).filter((p) => view.ownsProvince(id, p));
  const nearProvinces = Object.keys(PROVINCES).filter((p) => {
    const tl = PROVINCES[p].tiles;
    const mine = view.provinceCount(id, p);
    const free = tl.filter((t) => !view.properties[t].owner).length;
    return mine === tl.length - 1 && free === 1;
  });
  return { tiles, buildings, mortgaged, provinces, nearProvinces };
}

/** Gaya main yang terlihat dari aset & riwayat singkat (heuristik deskriptif, bukan prediksi). */
function styleOf(a, p, view, hist) {
  const loan = view.debtOf(p.id);
  if (p.bankrupt) return 'bangkrut';
  if (loan > 0 || a.mortgaged >= 2) return 'terjepit utang';
  if (a.buildings >= 4 || (a.provinces.length && a.buildings >= 2)) return 'pembangun';
  if (a.tiles.length >= 5 && a.buildings <= 1) return 'kolektor tanah';
  if (hist && hist.boughtRecently === 0 && p.cash > 3 * view.difficulty.salary) return 'menimbun kas';
  return 'seimbang';
}

/**
 * @param {object} view hasil buildView
 * @param {object} cfg config bot
 * @param {object} [memory] objek milik pemanggil untuk melacak perubahan antar panggilan (dimutasi)
 */
export function buildInsight(view, cfg = {}, memory = {}) {
  if (!view?.me?.id) return null;
  const me = view.me;
  const own = new Set((cfg.accounts ?? []).map(lc));
  const rt = num(cfg.strategy?.riskTolerance, 0.5);
  const reserve = recommendedReserve(view, me.id, { turns: 2, riskTolerance: rt });
  const exp = expectedRentExposure(view, me.id, 2);
  const myNet = view.netWorth(me.id);
  const prev = (memory.players ??= {});

  // Ancaman tiap lawan = ekspektasi sewa yang saya bayar ke lawan itu dalam 2 giliran.
  const threatBy = {};
  exp.byTile.forEach((cost, t) => {
    const owner = view.properties[t]?.owner;
    if (owner && owner !== me.id && provinceOf(t)) threatBy[owner] = (threatBy[owner] ?? 0) + cost;
  });

  const opponents = view.allPlayers
    .filter((p) => p.id !== me.id)
    .map((p) => {
      const a = assetsOf(view, p.id);
      const net = view.netWorth(p.id);
      const before = prev[p.id];
      const changes = [];
      if (before) {
        const dCash = p.cash - before.cash;
        if (Math.abs(dCash) >= 500_000) changes.push(`kas ${dCash > 0 ? '+' : ''}${Math.round(dCash / 1e5) / 10} jt`);
        if (a.tiles.length > before.cities) changes.push(`beli ${a.tiles.length - before.cities} kota`);
        if (a.tiles.length < before.cities) changes.push(`lepas ${before.cities - a.tiles.length} kota`);
        if (a.buildings > before.buildings) changes.push(`bangun +${a.buildings - before.buildings}`);
        if (a.mortgaged > before.mortgaged) changes.push(`gadai +${a.mortgaged - before.mortgaged}`);
        if (a.provinces.length > before.provinces) changes.push('provinsi lengkap baru!');
        if (p.bankrupt && !before.bankrupt) changes.push('bangkrut');
      }
      const trendBase = before?.net ?? net;
      const trend = net > trendBase * 1.05 ? 'naik' : net < trendBase * 0.95 ? 'turun' : (before?.trend ?? 'stabil');
      const boughtRecently = before ? a.tiles.length - before.cities : null;
      prev[p.id] = {
        cash: p.cash,
        cities: a.tiles.length,
        buildings: a.buildings,
        mortgaged: a.mortgaged,
        provinces: a.provinces.length,
        net,
        trend,
        bankrupt: p.bankrupt,
      };
      return {
        name: p.name,
        own: own.has(lc(p.name)),
        cash: p.cash,
        netWorth: net,
        loanDebt: view.debtOf(p.id),
        cities: a.tiles.length,
        buildings: a.buildings,
        mortgaged: a.mortgaged,
        provinces: a.provinces.map((k) => PROVINCES[k].name),
        nearProvinces: a.nearProvinces.map((k) => PROVINCES[k].name),
        threat: Math.round(threatBy[p.id] ?? 0),
        jailed: Boolean(p.inJail),
        bankrupt: Boolean(p.bankrupt),
        style: styleOf(a, p, view, { boughtRecently }),
        trend,
        changes,
      };
    });

  const alive = view.allPlayers.filter((p) => !p.bankrupt);
  const leader = alive.reduce((best, p) => (!best || view.netWorth(p.id) > view.netWorth(best.id) ? p : best), null);
  const mine = assetsOf(view, me.id);
  const loanDebt = view.debtOf(me.id);

  let stance = 'seimbang';
  let stanceWhy = 'kas cukup di atas cadangan';
  if (me.cash < reserve || loanDebt > 0) {
    stance = 'bertahan';
    stanceWhy = loanDebt > 0 ? 'masih punya utang; utamakan bayar & jaga kas' : 'kas di bawah cadangan risiko sewa';
  } else if (me.cash > reserve * 2 && view.round <= 12) {
    stance = 'agresif';
    stanceWhy = 'kas jauh di atas cadangan; kejar tanah & bangunan';
  }

  const strategy = [];
  if (view.mode === 'grind') {
    strategy.push(
      view.isWinner(me.id)
        ? 'Grinding: saya pemenang — beli & bangun agresif.'
        : 'Grinding: saya pengumpan — kirim kas ke pemenang, tidak beli.',
    );
  } else {
    strategy.push(
      `Beli kota bila sisa kas ≥ cadangan (${Math.round(reserve / 1e5) / 10} jt); longgar untuk melengkapi provinsi.`,
    );
    if (mine.nearProvinces.length) {
      strategy.push(`Prioritas melengkapi: ${mine.nearProvinces.map((k) => PROVINCES[k].name).join(', ')}.`);
    }
    const block = opponents.filter((o) => !o.own && o.nearProvinces.length);
    if (block.length) {
      strategy.push(
        `Gagalkan provinsi lawan: ${block.map((o) => `${o.name} (${o.nearProvinces.join(', ')})`).join('; ')}.`,
      );
    }
    if (mine.provinces.length) {
      strategy.push(`Bangun di provinsi lengkap: ${mine.provinces.map((k) => PROVINCES[k].name).join(', ')}.`);
    }
    if (mine.mortgaged) strategy.push(`Tebus ${mine.mortgaged} kota tergadai saat kas ≥ 1,5× cadangan.`);
    if (stance === 'bertahan') {
      strategy.push('Mode bertahan: tidak bangun/ambil alih; Gali Lubang = jual/gadai termurah → pinjaman → Pinjol.');
    }
  }
  if (view.crisis) {
    strategy.push(`Krisis aktif: sewa naik ×${view.rentMultiplier.toFixed(2)}; cadangan otomatis lebih besar.`);
  }

  const notes = [];
  if (exp.worst > me.cash) {
    notes.push(`Risiko: sewa terburuk 2 giliran (${Math.round(exp.worst / 1e5) / 10} jt) > kas.`);
  }
  if (view.gameMode === 'ronde' && Number.isFinite(view.roundsLeft)) notes.push(`Sisa ${view.roundsLeft} ronde.`);
  const pj = view.difficulty.pinjol;
  notes.push(
    pj
      ? `Pinjol: maks ${pj.max / 1e6} jt, bunga ${Math.round(pj.interest * 100)}%.`
      : 'Pinjol tidak tersedia di tingkat ini.',
  );

  return {
    round: view.round,
    mode: view.mode,
    crisis: view.crisis,
    difficulty: view.difficulty.label ?? view.difficultyKey,
    me: {
      name: me.name,
      cash: me.cash,
      netWorth: myNet,
      loanDebt,
      reserve,
      exposure: Math.round(exp.expected),
      stance,
      stanceWhy,
    },
    opponents,
    leaderName: leader?.name ?? null,
    notes,
    strategy,
  };
}
