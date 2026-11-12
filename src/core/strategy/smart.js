/**
 * Policy mode 'arena': tiap akun main untuk menang sendiri (tanpa kolusi).
 * Semua fungsi murni & sinkron. Setiap keputusan mengisi `policy.lastReason` (dan memanggil cfg.explain bila ada).
 * Penjelasan heuristik: docs/strategy.md.
 */
import { BOARD_SIZE, LOAN_INTEREST_OPTIONS, PROVINCES, TILES, TILE_RULES, provinceOf } from '../data/board.js';
import {
  expectedRentExposure,
  expectedRentIncome,
  hotspotScore,
  landingCost,
  parseRupiahText,
  passStartProbability,
  propertyEV,
  recommendedReserve,
  visitProbabilities,
} from './risk.js';

const clamp01 = (v, d = 0.5) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Rata-rata giliran untuk satu putaran papan (48 petak / ~7 langkah). */
const TURNS_PER_LAP = BOARD_SIZE / 7;
/** Rata-rata kunjungan ke Pajak Tahunan per giliran (1 petak dari 48, ≈ 0,02). */
const TAX_VISITS_PER_TURN = TILES.filter((t) => t.kind === 'tax').length / BOARD_SIZE;

/** Status kepemilikan provinsi dari sudut pandang pemain `pid`. */
export function provinceStatus(view, tile, pid) {
  const prov = provinceOf(tile);
  if (!prov) return null;
  const tiles = PROVINCES[prov].tiles;
  const owners = tiles.map((t) => view.properties[t]?.owner ?? null);
  const mine = owners.filter((o) => o === pid).length;
  const unowned = owners.filter((o) => !o).length;
  const others = {};
  for (const o of owners) if (o && o !== pid) others[o] = (others[o] ?? 0) + 1;
  const maxOther = Math.max(0, ...Object.values(others));
  return { prov, tiles, owners, mine, unowned, others, maxOther, size: tiles.length };
}

/** Ekspektasi kunjungan lawan ke petak dalam `turns` giliran (jumlah atas semua lawan). */
function opponentVisits(view, tile, ownerId, turns) {
  let total = 0;
  for (const p of view.activePlayers) {
    if (p.id === ownerId) continue;
    total += visitProbabilities(p.position, turns)[tile];
  }
  return total;
}

/**
 * Normalisasi tawaran tukar tanah ke {from, inTiles, inCash, outTiles, outCash} dari sudut pandang penerima.
 * Bentuk asli tidak dijamin; beberapa alias didukung.
 */
export function normalizeTrade(trade) {
  const t = trade && typeof trade === 'object' ? trade : {};
  const arr = (...vs) => vs.find((v) => Array.isArray(v)) ?? [];
  const n = (...vs) => num(vs.find((v) => typeof v === 'number'));
  return {
    from: String(t.from ?? t.fromId ?? t.proposer ?? t.by ?? ''),
    inTiles: arr(t.offerTiles, t.giveTiles, t.offer?.tiles, t.fromTiles).map(Number),
    inCash: n(t.offerCash, t.giveCash, t.offer?.cash, t.fromCash),
    outTiles: arr(t.requestTiles, t.wantTiles, t.request?.tiles, t.toTiles).map(Number),
    outCash: n(t.requestCash, t.wantCash, t.request?.cash, t.toCash),
  };
}

/** Jumlah provinsi lengkap milik pid seandainya kepemilikan diganti `owners` (array 48). */
function completeCount(owners, pid) {
  return Object.values(PROVINCES).filter((p) => p.tiles.every((t) => owners[t] === pid)).length;
}

export function createSmartPolicy(cfg = {}) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const flags = { ...(c.policyFlags ?? {}) };
  const strat = c.strategy ?? {};
  const rt = clamp01(strat.riskTolerance, 0.5);
  const reserveTurns = Math.max(1, Math.round(2 * num(strat.reserveRounds, 1)));

  const policy = { name: 'smart', lastReason: '' };
  const why = (reason, value) => {
    policy.lastReason = reason;
    try {
      c.explain?.(reason);
    } catch {}
    return value;
  };

  const me = (view) => view?.me ?? null;
  const horizon = (view) => (Number.isFinite(view.roundsLeft) ? view.roundsLeft : 15);
  const finalRound = (view) => view.gameMode === 'ronde' && view.roundsLeft <= 1;
  const crisisFactor = (view) =>
    view.crisis ? 1 + (view.difficulty.crisisRentEscalation * Math.min(horizon(view), 20)) / TURNS_PER_LAP / 2 : 1;

  /** Horizon penilaian (giliran), dibatasi 20 supaya nilai jangka panjang tidak dilebih-lebihkan. */
  const valueHorizon = (view) => Math.min(20, horizon(view));

  /** Utang yang jatuh tempo dalam ≤ 2 giliran (atau tempo tak diketahui) ikut dicadangkan. */
  const dueSoonDebt = (view) =>
    (view.loans ?? [])
      .filter((l) => l.borrower === view.meId && (l.turnsLeft === undefined || l.turnsLeft <= 2))
      .reduce((sum, l) => sum + num(l.owed), 0);

  const reserveFor = (view) => {
    if (typeof flags.reserveOverride === 'number') return flags.reserveOverride;
    let base = recommendedReserve(view, view.meId, { turns: reserveTurns, riskTolerance: rt });
    // Satu kali kena sewa terbesar yang mungkin (kota lawan berbangunan) jangan sampai memaksa gadai beruntun.
    const worst = expectedRentExposure(view, view.meId, reserveTurns).worst;
    base = Math.max(base, worst * (1.3 - rt));
    // Krisis menaikkan sewa tiap putaran. Kalau game tidak mengirim pengali aktual, tambah setengah eskalasi.
    if (view.crisis && typeof view.rules.rentMultiplier !== 'number') {
      base *= 1 + num(view.difficulty.crisisRentEscalation) / 2;
    }
    base += dueSoonDebt(view);
    base = Math.round(base);
    return flags.neverNegative ? Math.round(base * 1.5 + 300_000) : base;
  };

  /** Tambahan Pajak Tahunan per kota selama horizon (pajak dihitung per properti). */
  const taxDrag = (view) => {
    const per = view.crisis ? TILE_RULES.tax.crisisPerProperty : TILE_RULES.tax.perProperty;
    return per * view.feeMultiplier * TAX_VISITS_PER_TURN * valueHorizon(view);
  };

  /** Petak milik saya yang paling layak dibangun berikutnya (null kalau tidak ada). */
  const bestUpgrade = (view) => {
    let best = null;
    for (const t of view.myTiles) {
      const prop = view.properties[t];
      if (!provinceOf(t) || prop.mortgaged || prop.level >= 3) continue;
      const score = upgradeScore(view, t);
      if (!best || score > best.score) best = { t, score };
    }
    return best;
  };

  /**
   * Dana bangun yang ditahan saat membeli tanah biasa: bangunan memberi tambahan sewa per rupiah ~4× tanah,
   * tapi kesempatan bangun hanya datang saat gajian. Tanpa dana ini kas habis untuk tanah dan bot tak pernah bangun.
   */
  const buildFund = (view) => {
    const best = bestUpgrade(view);
    if (!best) return 0;
    const prov = provinceOf(best.t);
    const cost = PROVINCES[prov].upgradeCost;
    if (!view.ownsProvince(view.meId, prov)) return cost * 0.5;
    // Provinsi lengkap: cukup untuk satu putaran bangun di semua kotanya yang belum Elit.
    const open = PROVINCES[prov].tiles.filter((t) => view.properties[t].level < 3).length;
    return cost * Math.max(1, open);
  };

  /** Skor peningkatan satu tingkat untuk petak t (semakin besar semakin baik). */
  const upgradeScore = (view, t) => {
    const prov = provinceOf(t);
    if (!prov) return -Infinity;
    const lvl = view.properties[t].level;
    if (lvl >= 3) return -Infinity;
    const cost = PROVINCES[prov].upgradeCost;
    const inc = view.rentAt(t, lvl + 1, view.meId) - view.rentAt(t, lvl, view.meId);
    const visits = opponentVisits(view, t, view.meId, Math.min(12, horizon(view)));
    let score = ((inc * Math.max(visits, 0.05) * crisisFactor(view)) / cost) * (1 + 3 * hotspotScore(t));
    if (view.ownsProvince(view.meId, prov)) score *= 1.5;
    if (lvl + 1 === 3) score *= 1.25; // Perumahan Elit aman dari ambil alih
    if (flags.wantElit) score += lvl * 100;
    return score;
  };

  /** Nilai strategis membeli/memiliki petak t untuk pid (rupiah). */
  const ownershipValue = (view, t, price) => {
    const pid = view.meId;
    const st = provinceStatus(view, t, pid);
    if (!st) return 0;
    const ev = propertyEV(view, t, { ownerId: pid, price, horizon: valueHorizon(view), level: 0 });
    let value = ev.income * crisisFactor(view) - taxDrag(view);
    const othersHere = Object.keys(st.others).length > 0;
    const completes = !othersHere && st.mine === st.size - 1;
    if (completes) value += ev.income + 0.5 * PROVINCES[st.prov].price;
    else if (!othersHere && st.mine > 0) value += 0.25 * price;
    if (st.maxOther === st.size - 1) value += 0.5 * price; // menggagalkan provinsi lawan
    if (othersHere && st.maxOther < st.size - 1) value *= 0.8;
    return value;
  };

  policy.rollTarget = (view) => {
    if (flags.rollTarget) return why(`flag rollTarget=${flags.rollTarget}`, flags.rollTarget);
    const jailed = view?.me?.inJail;
    return why(
      jailed ? 'di Lapas: Perfect menambah peluang kembar' : 'Perfect: kembar & lemparan satu dadu terbaik',
      'perfect',
    );
  };

  policy.preRoll = (view) => {
    const p = me(view);
    if (!p) return why('view kosong', []);
    const actions = [];
    let cash = p.cash;
    const reserve = reserveFor(view);
    if (p.inJail) {
      const bail = view.fees.bail;
      if (flags.wantJail) {
        why('flag wantJail: tetap di Lapas', null);
      } else if (flags.wantBail && cash >= bail) {
        actions.push({ type: 'payBail' });
        cash -= bail;
      } else if (cash >= bail) {
        // Selama di Lapas sewa kita masuk Negara -> rugi sebesar ekspektasi sewa per giliran.
        const lostIncome = view.myTiles.reduce((s, t) => s + expectedRentIncome(view, t, { horizon: 1 }), 0);
        const exposure = expectedRentExposure(view, p.id, 1).expected;
        const unowned = view.properties.filter((pr, i) => TILES[i].kind === 'city' && !pr.owner).length;
        const early = unowned >= 6;
        // Kalau Orang Dalam akan dipakai untuk keluar, jangan bayar jaminan.
        const holdsOrangDalam =
          p.keepCardIds.includes('orang-dalam') &&
          policy.useKeepCard(view, { cardId: 'orang-dalam', situation: { kind: 'jail' } });
        const worthIt = early || lostIncome + 0.5 * bail > exposure;
        if (worthIt && !holdsOrangDalam && cash - bail >= reserve * 0.5) {
          actions.push({ type: 'payBail' });
          cash -= bail;
          why(`bayar jaminan: ${early ? 'awal game' : 'sewa kita sedang masuk Negara'}`, null);
        }
      }
    }
    // Lunasi utang lebih awal kalau kas tetap aman dan utangnya mahal / hampir jatuh tempo.
    const debt = num(view.debtOf(p.id));
    const freeReserve = Math.max(0, reserve - dueSoonDebt(view)); // utang ini sendiri sudah termasuk cadangan
    if (debt > 0 && cash - debt >= freeReserve) {
      const mine = (view.loans ?? []).filter((l) => l.borrower === p.id);
      const costly = mine.some((l) => l.kind === 'pinjol' || l.lender === 'pinjol' || l.interest >= 0.25);
      const dueSoon = mine.some((l) => l.turnsLeft !== undefined && l.turnsLeft <= 1);
      const unknown = !mine.length; // hanya tahu total utang: lunasi kalau kas sangat longgar
      if (costly || dueSoon || (unknown && cash - debt >= freeReserve * 1.5)) {
        actions.push({ type: 'repay' });
        cash -= debt;
        why(`lunasi utang ${debt}: ${dueSoon ? 'hampir jatuh tempo' : 'bunga tinggi'}`, null);
      }
    }
    if (!finalRound(view)) {
      const mortgaged = view.myTiles.filter((t) => view.properties[t].mortgaged);
      const ratio = num(view.rules.redeem, view.difficulty.redeem);
      mortgaged
        .map((t) => ({
          t,
          cost: Math.round(PROVINCES[provinceOf(t)].price * ratio),
          prio: (view.ownsProvince(p.id, provinceOf(t)) ? 2 : 1) * view.rentAt(t, 0, p.id),
        }))
        .sort((a, b) => b.prio - a.prio)
        .forEach(({ t, cost }) => {
          // Tebus = bayar lebih mahal dari hasil gadai; hanya sepadan untuk provinsi lengkap (sewa 2× & bisa
          // dibangun) atau kalau kas benar-benar berlebih.
          const full = view.ownsProvince(p.id, provinceOf(t));
          if (cash - cost >= reserve * (full ? 1.5 : 2.5)) {
            actions.push({ type: 'redeem', tile: t });
            cash -= cost;
          }
        });
    }
    return why(
      actions.length ? `pre-roll: ${actions.map((a) => a.type).join(', ')}` : 'pre-roll: tidak ada aksi',
      actions,
    );
  };

  policy.shouldBuy = (view, { tile, price } = {}) => {
    const p = me(view);
    const prov = provinceOf(tile);
    if (!p || !prov) return why('bukan kota', false);
    const cost = num(price, PROVINCES[prov].price);
    if (p.cash < cost) return why('kas tidak cukup', false);
    const after = p.cash - cost;
    if (Array.isArray(flags.wantProvinces) && flags.wantProvinces.includes(prov)) {
      return why(`target provinsi ${prov}`, true);
    }
    const reserve = reserveFor(view);
    const st = provinceStatus(view, tile, p.id);
    const othersHere = Object.keys(st.others).length > 0;
    const completes = !othersHere && st.mine === st.size - 1;
    const denial = st.maxOther === st.size - 1;
    // Provinsi masih bisa kita lengkapi tanpa ambil alih?
    const open = !othersHere;
    const fund = buildFund(view);
    let needed;
    if (completes) needed = reserve * 0.4;
    else if (denial) needed = reserve * 0.7;
    else if (open) needed = reserve + fund;
    else needed = reserve * 1.5 + fund; // kota "nyasar" di provinsi milik bersama: hanya kalau kas longgar
    if (after < needed) {
      return why(`lewati: sisa kas ${after} < cadangan ${Math.round(needed)}${fund ? ' (+dana bangun)' : ''}`, false);
    }
    if (completes || denial) {
      return why(`beli: ${completes ? 'melengkapi provinsi' : 'menggagalkan provinsi lawan'}`, true);
    }
    // Harga tanah tetap dihitung di kekayaan bersih, jadi biaya riil = likuiditas + pajak per properti.
    const value = ownershipValue(view, tile, cost);
    // Provinsi terbuka: nilai utamanya peluang monopoli (sewa 2× + bangun), cukup asal likuid.
    const ok = open ? value >= -0.25 * cost : value >= cost * 0.1;
    return why(
      ok
        ? `beli: ${open ? 'membuka/menambah provinsi' : 'nilai sewa positif'}`
        : 'lewati: sewa tidak menutup pajak & likuiditas',
      ok,
    );
  };

  policy.shouldTakeover = (view, { tile, price, ownerId } = {}) => {
    const p = me(view);
    if (!p || !provinceOf(tile)) return why('bukan kota', false);
    if (view.isTakeoverSafe(tile)) return why('kota aman dari ambil alih', false);
    const cost = num(price, view.takeoverPrice(tile));
    if (p.cash < cost) return why('kas tidak cukup', false);
    const after = p.cash - cost;
    const reserve = reserveFor(view);
    if (flags.wantTakeover) return why('flag wantTakeover', after >= reserve * 0.5);
    const owner = view.idOf(ownerId ?? view.properties[tile].owner);
    const st = provinceStatus(view, tile, p.id);
    const prov = st.prov;
    const value = view.tileValue(tile);
    const premium = cost - value;
    const completes = st.mine === st.size - 1;
    const denial = (st.others[owner] ?? 0) === st.size - 1;
    // Premi ambil alih (harga − nilai kota) hilang permanen dari kekayaan. Hanya untuk langkah strategis.
    if (!completes && !denial) return why('ambil alih tidak: tidak melengkapi/menggagalkan provinsi', false);
    // Mode Ronde: premi langsung mengurangi kekayaan bersih akhir, sewa tambahannya tak sempat kembali.
    if (view.gameMode === 'ronde' && view.roundsLeft <= 3) return why('ambil alih tidak: ronde hampir habis', false);
    // Setelah melengkapi provinsi, harus masih ada kas untuk membangun (di situlah sewa melonjak).
    const needed = reserve * 1.2 + (completes ? PROVINCES[prov].upgradeCost : 0);
    if (after < needed) return why(`ambil alih menguras cadangan (sisa ${after} < ${Math.round(needed)})`, false);
    const h = valueHorizon(view);
    const income = expectedRentIncome(view, tile, { ownerId: p.id, horizon: h }) * crisisFactor(view);
    let gain = income;
    if (completes) {
      // Provinsi lengkap: sewa 2× lalu bisa dibangun (kas untuk satu bangunan sudah dipastikan di atas).
      // Nilai provinsi dihitung dengan sewa KPR Subsidi (level 1) sebagai target realistis jangka pendek.
      const provIncome = st.tiles.reduce(
        (sum, t) => sum + expectedRentIncome(view, t, { ownerId: p.id, horizon: h, level: 1 }) * 0.8,
        0,
      );
      gain += provIncome * crisisFactor(view) + 0.25 * value;
    }
    if (denial) gain += 0.5 * value;
    const ok = gain >= premium * (1.3 + (1 - rt) * 0.6);
    return why(`ambil alih ${ok ? 'ya' : 'tidak'}: manfaat ${Math.round(gain)} vs premi ${Math.round(premium)}`, ok);
  };

  policy.chooseUpgrades = (view, candidates = []) => {
    const p = me(view);
    if (!p || !Array.isArray(candidates) || !candidates.length) return why('tidak ada kandidat', []);
    if (finalRound(view) && !flags.wantElit && !flags.maxBuild) return why('ronde terakhir: simpan kas', []);
    const reserve = reserveFor(view);
    // Bangunan di provinsi lengkap = sumber sewa utama & bisa dijual lagi (refund) saat Gali Lubang,
    // jadi cadangannya sedikit lebih longgar dari pembelian tanah.
    const keepFull = flags.maxBuild ? reserve * 0.25 : reserve * 0.75;
    const keepOther = flags.maxBuild ? reserve * 0.25 : reserve;
    let cash = p.cash;
    const ranked = candidates
      .filter(
        (t) =>
          provinceOf(t) &&
          view.properties[t]?.owner === p.id &&
          !view.properties[t].mortgaged &&
          view.properties[t].level < 3,
      )
      .map((t) => ({
        t,
        full: view.ownsProvince(p.id, provinceOf(t)),
        score: upgradeScore(view, t),
        cost: PROVINCES[provinceOf(t)].upgradeCost,
      }))
      .sort((a, b) => Number(b.full) - Number(a.full) || b.score - a.score || a.t - b.t);
    const picked = [];
    for (const { t, cost, full } of ranked) {
      if (cash - cost >= (full ? keepFull : keepOther)) {
        picked.push(t);
        cash -= cost;
      }
    }
    return why(picked.length ? `bangun ${picked.join(',')}` : 'tidak bangun: menjaga cadangan', picked);
  };

  policy.chooseToll = (view, options = []) => {
    const opts = (Array.isArray(options) ? options : []).filter((o) => Number.isInteger(o));
    if (!opts.length) return why('tidak ada opsi tol', options?.[0] ?? null);
    const p = me(view);
    if (!p) return why('view kosong', opts[0]);
    const salary = num(p.salary, view.difficulty.salary);
    const scored = opts.map((dest) => {
      const exp = expectedRentExposure(view, p.id, 2, 'biasa', dest).expected;
      const wraps = dest < p.position; // lewat START lewat tol = tidak gajian
      let score = -exp + salary * passStartProbability(dest) - (wraps ? salary : 0);
      const visits = visitProbabilities(dest, 1);
      for (let t = 0; t < BOARD_SIZE; t++) {
        if (TILES[t].kind === 'city' && !view.properties[t].owner && p.cash > PROVINCES[provinceOf(t)].price) {
          score += visits[t] * 0.2 * PROVINCES[provinceOf(t)].price;
        }
        if (flags.wantJail && (TILES[t].kind === 'raid' || TILES[t].kind === 'court')) score += visits[t] * 1e6;
      }
      return { dest, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return why(`tol ke ${scored[0].dest}: risiko terendah`, scored[0].dest);
  };

  policy.chooseOption = (view, { options = [] } = {}) => {
    const list = Array.isArray(options) ? options : [];
    if (!list.length) return why('tidak ada opsi', 0);
    const p = me(view);
    const cash = num(p?.cash);
    const salary = num(p?.salary, view?.difficulty?.salary ?? 1_000_000);
    const perTurnExposure = view && p ? expectedRentExposure(view, p.id, 1).expected : 0;
    const costs = list.map((text) => {
      const s = norm(text);
      const rp = parseRupiahText(s);
      const skip = s.match(/lewati\s+(\d+)\s+giliran/);
      if (flags.payStateWhenChoice && rp != null && /bayar|setor/.test(s)) return -1e12;
      if (rp != null && /dapat|terima|menang/.test(s)) return -rp;
      if (skip) {
        // Lewati giliran: kehilangan tempo (gaji/beli) tapi juga terhindar dari sewa.
        return Number(skip[1]) * (salary / TURNS_PER_LAP + 150_000 - perTurnExposure);
      }
      if (/sita|disita|kota termurah/.test(s)) {
        const mine = view ? view.myTiles.map((t) => view.tileValue(t)) : [];
        return mine.length ? Math.min(...mine) : 0;
      }
      if (rp != null) return rp + (rp > cash ? (rp - cash) * 0.5 : 0);
      return 0;
    });
    let best = 0;
    costs.forEach((v, i) => {
      if (v < costs[best]) best = i;
    });
    return why(`pilih opsi "${list[best]}" (biaya ≈ ${Math.round(costs[best])})`, best);
  };

  policy.chooseTile = (view, { purpose, candidates = [] } = {}) => {
    const cands = (Array.isArray(candidates) ? candidates : []).filter((t) => Number.isInteger(t));
    if (!cands.length) return why('tidak ada kandidat', null);
    if (!view) return why('view kosong', cands[0]);
    const pid = view.meId;
    const pur = norm(purpose);
    const by = (fn, label) => {
      const best = [...cands].sort((a, b) => fn(b) - fn(a) || a - b)[0];
      return why(`${label}: petak ${best}`, best);
    };
    if (/sita|lepas|jual|gadai|lose|seize|korban|hilang/.test(pur)) {
      return by((t) => {
        const prov = provinceOf(t);
        const full = prov && view.ownsProvince(view.properties[t].owner, prov);
        return -(view.tileValue(t) * (full ? 3 : 1));
      }, 'korbankan yang paling murah');
    }
    if (/upgrade|bangun|promo|cicilan/.test(pur)) return by((t) => upgradeScore(view, t), 'bangun gratis');
    if (/steal|rebut|sertifikat|ambil/.test(pur)) {
      return by((t) => {
        const st = provinceStatus(view, t, pid);
        if (!st) return 0;
        const owner = view.properties[t].owner;
        return (
          view.tileValue(t) + (st.mine === st.size - 1 ? 5e6 : 0) + ((st.others[owner] ?? 0) === st.size - 1 ? 2e6 : 0)
        );
      }, 'rebut kota terbaik');
    }
    if (/buy|beli|unowned|murah/.test(pur)) {
      return by((t) => ownershipValue(view, t, view.tileValue(t)), 'beli kota terbaik');
    }
    return by((t) => (view.properties[t].owner === pid ? view.rentAt(t) : view.tileValue(t)), 'nilai tertinggi');
  };

  policy.choosePlayer = (view, { purpose, candidates = [] } = {}) => {
    const list = (Array.isArray(candidates) ? candidates : []).map(String);
    if (!list.length) return why('tidak ada kandidat', null);
    if (!view) return why('view kosong', list[0]);
    const others = list.filter((x) => view.idOf(x) !== view.meId);
    const pool = others.length ? others : list;
    const nw = (x) => view.netWorth(x);
    const beneficial = /beri|kirim|hadiah|bagi|traktir|bantu|give|gift/.test(norm(purpose));
    const sorted = [...pool].sort((a, b) => (beneficial ? nw(a) - nw(b) : nw(b) - nw(a)));
    return why(beneficial ? `untungkan pemain terlemah ${sorted[0]}` : `rugikan pemimpin ${sorted[0]}`, sorted[0]);
  };

  policy.jokiDadu = (view, { dice } = {}) => {
    const p = me(view);
    if (!p || !Array.isArray(dice) || dice.length < 2) return why('joki: data dadu kosong', null);
    const [a, b] = dice.map((d) => Math.max(1, Math.min(6, Math.trunc(num(d, 1)))));
    const salary = num(p.salary, view.difficulty.salary);
    const evalDice = (d1, d2) => {
      const dbl = d1 === d2;
      if (p.inJail && !dbl) return flags.wantJail ? 0 : -200_000;
      const steps = d1 + d2;
      const tile = (p.position + steps) % BOARD_SIZE;
      let score = -landingCost(view, p.id, tile);
      if (p.position + steps >= BOARD_SIZE) score += salary;
      const prop = view.properties[tile];
      if (TILES[tile].kind === 'city' && !prop.owner && p.cash >= PROVINCES[provinceOf(tile)].price) {
        score += ownershipValue(view, tile, PROVINCES[provinceOf(tile)].price) * 0.3;
      }
      if (dbl) score += 50_000; // kartu Takdir
      if (flags.wantJail && ['raid', 'court'].includes(TILES[tile].kind)) score += 5e6;
      if (flags.preferParking && TILES[tile].kind === 'parking') score += 5e6;
      return score;
    };
    const base = evalDice(a, b);
    let best = null;
    for (const dieIndex of [0, 1]) {
      for (let v = 1; v <= 6; v++) {
        const d = dieIndex === 0 ? [v, b] : [a, v];
        if (d[0] === a && d[1] === b) continue;
        const score = evalDice(d[0], d[1]);
        if (!best || score > best.score) best = { dieIndex, value: v, score };
      }
    }
    if (best && best.score > base + 1) {
      return why(`joki: dadu ${best.dieIndex} -> ${best.value}`, { dieIndex: best.dieIndex, value: best.value });
    }
    return why('joki: hasil sekarang sudah terbaik', null);
  };

  policy.useKeepCard = (view, { cardId, situation } = {}) => {
    const id = norm(cardId).replace(/\s+/g, '-');
    const sit = typeof situation === 'object' && situation ? situation : { kind: situation };
    const kind = norm(sit.kind ?? sit.type ?? '');
    const amount = num(sit.amount ?? sit.loss ?? sit.rent);
    const p = me(view);
    const cash = num(p?.cash);
    if (id === 'orang-dalam' && /jail|lapas/.test(kind) && flags.wantJail) return why('flag wantJail', false);
    if (flags.useAllKeepCards) return why('flag useAllKeepCards', true);
    if (Array.isArray(flags.useKeepCards) && flags.useKeepCards.includes(id)) return why('flag useKeepCards', true);
    switch (id) {
      case 'voucher-tol':
      case 'juru-parkir':
      case 'surat-rt':
      case 'pengacara':
        return why('kartu khusus situasi ini: pakai', true);
      case 'orang-dalam': {
        if (/court|pengadilan|putusan|sita/.test(kind)) {
          const verdict = norm(sit.verdict ?? sit.outcome ?? '');
          const bad = !verdict || /sita|seize|lapas|jail|denda/.test(verdict);
          return why(`Orang Dalam di Pengadilan: ${bad ? 'batalkan putusan' : 'simpan'}`, bad);
        }
        if (/jail|lapas/.test(kind)) {
          const late = view ? view.round >= 6 : false;
          const income = view ? view.myTiles.reduce((s, t) => s + expectedRentIncome(view, t, { horizon: 1 }), 0) : 0;
          const bail = view?.fees?.bail ?? 500_000;
          const use = late || income > bail * 0.5 || cash < bail;
          return why(`Orang Dalam di Lapas: ${use ? 'keluar' : 'simpan untuk Pengadilan'}`, use);
        }
        return why('Orang Dalam: simpan', false);
      }
      case 'restu-ibu':
      case 'asuransi': {
        const big = amount >= Math.max(500_000, cash * 0.2) || amount > cash || /sita|jail|lapas/.test(kind);
        return why(`${id}: kerugian ${amount} ${big ? 'besar, pakai' : 'kecil, simpan'}`, big);
      }
      case 'numpang-dulu': {
        const big = amount >= Math.max(400_000, cash * 0.15) || amount > cash;
        return why(`Numpang Dulu: sewa ${amount} ${big ? 'tinggi, pakai' : 'kecil, simpan'}`, big);
      }
      case 'flash-sale':
      case 'flash-sale-tanggal-kembar': {
        if (Number.isInteger(sit.tile) && view) {
          const price = Math.round(PROVINCES[provinceOf(sit.tile)]?.price / 2);
          return why('Flash Sale: evaluasi beli setengah harga', policy.shouldBuy(view, { tile: sit.tile, price }));
        }
        return why('Flash Sale: pakai', true);
      }
      case 'joki-dadu':
        return why('Joki Dadu', Boolean(sit.dice && policy.jokiDadu(view, { dice: sit.dice })));
      default:
        return why(`kartu ${id}: simpan`, false);
    }
  };

  policy.debtStep = (view, { owe, canSell = [], canMortgage = [], canLoan, canPinjol, triedLoan, pinjolSeen } = {}) => {
    const p = me(view);
    if (!p) return why('view kosong', { type: 'bankrupt' });
    if (flags.wantPinjol && canPinjol) return why('flag wantPinjol', { type: 'pinjol' });
    const need = num(owe, Math.max(0, -p.cash));
    const opts = [];
    const refund = num(view.rules.buildingRefund, view.difficulty.buildingRefund);
    const mRatio = num(view.rules.mortgage, view.difficulty.mortgage);
    const rRatio = num(view.rules.redeem, view.difficulty.redeem);
    const shortH = Math.min(8, horizon(view));
    for (const t of Array.isArray(canSell) ? canSell : []) {
      const prov = provinceOf(t);
      if (!prov) continue;
      const lvl = Math.max(1, view.properties[t].level);
      const up = PROVINCES[prov].upgradeCost;
      const raise = up * refund;
      const lost = (view.rentAt(t, lvl, p.id) - view.rentAt(t, lvl - 1, p.id)) * opponentVisits(view, t, p.id, shortH);
      opts.push({ action: { type: 'sell', tile: t }, raise, loss: up - raise + lost });
    }
    for (const t of Array.isArray(canMortgage) ? canMortgage : []) {
      const prov = provinceOf(t);
      if (!prov) continue;
      const price = PROVINCES[prov].price;
      const raise = price * mRatio;
      const lost = view.rentAt(t, 0, p.id) * opponentVisits(view, t, p.id, shortH);
      const full = view.ownsProvince(p.id, prov) ? 1.5 : 1;
      opts.push({ action: { type: 'mortgage', tile: t }, raise, loss: (price * (rRatio - mRatio) + lost) * full });
    }
    const pinjolMax = num(view.difficulty.pinjol?.max);
    const pinjolRate = num(view.difficulty.pinjol?.interest, 1);
    const richest = Math.max(0, ...view.opponents.map((o) => o.cash));
    const loanOk = Boolean(canLoan) && !triedLoan;
    if (opts.length) {
      opts.forEach((o) => (o.rate = o.loss / Math.max(1, o.raise) - (o.raise >= need ? 0.01 : 0)));
      opts.sort((x, y) => x.rate - y.rate || x.action.tile - y.action.tile);
      const best = opts[0];
      // Kalau game menampilkan Pinjol/pinjaman bersamaan dengan jual/gadai, bandingkan biayanya: menghancurkan
      // provinsi lengkap (bangunan dijual rugi + sewa hilang) bisa lebih mahal dari bunga Pinjol.
      if (canPinjol && pinjolMax >= need && pinjolRate < best.rate) {
        return why(`Pinjol (${Math.round(pinjolRate * 100)}%) lebih murah dari ${best.action.type}`, {
          type: 'pinjol',
        });
      }
      if (loanOk && richest >= need && 0.25 < best.rate) {
        return why(`minta pinjaman: lebih murah dari ${best.action.type}`, { type: 'requestLoan' });
      }
      return why(`gali lubang: ${best.action.type} ${best.action.tile} (kerugian per rupiah terkecil)`, best.action);
    }
    if (loanOk && richest >= need) {
      return why('minta pinjaman pemain (bunga biasanya < Pinjol)', { type: 'requestLoan' });
    }
    if (canPinjol && pinjolMax >= need) return why('ambil Pinjol untuk bertahan', { type: 'pinjol' });
    if (loanOk) return why('minta pinjaman (upaya terakhir)', { type: 'requestLoan' });
    if (canPinjol) return why('Pinjol walau mungkin kurang', { type: 'pinjol' });
    return why(pinjolSeen ? 'Pinjol nonaktif & tidak ada pinjaman: bangkrut' : 'tidak ada pilihan lain: bangkrut', {
      type: 'bankrupt',
    });
  };

  policy.lendOffer = (view, { borrowerId, amount } = {}) => {
    const p = me(view);
    if (!p) return why('view kosong', null);
    const b = view.player(borrowerId);
    if (!b || b.id === p.id) return why('peminjam tidak dikenal', null);
    const amt = num(amount);
    const reserve = reserveFor(view);
    if (p.cash - amt < reserve * 1.2) return why('kas kita tidak cukup sehat untuk meminjamkan', null);
    if (view.roundsLeft <= view.difficulty.loanTurns) return why('game hampir selesai, pinjaman tak kembali', null);
    const bNet = view.netWorth(b.id);
    if (bNet > view.netWorth(p.id)) return why('jangan bantu pemain yang lebih kaya', null);
    const capacity = Math.max(0, bNet) + num(b.salary, view.difficulty.salary) * view.difficulty.loanTurns * 0.5;
    const ratio = capacity > 0 ? (amt * 1.5) / capacity : Infinity;
    let pct;
    if (ratio > 1) return why('peminjam hampir bangkrut', null);
    else if (ratio > 0.6) pct = 50;
    else if (ratio > 0.3) pct = 25;
    else pct = 10;
    const fixed = strat.lendInterest;
    if (typeof fixed === 'number' && LOAN_INTEREST_OPTIONS.includes(fixed)) pct = fixed;
    if (typeof flags.lendInterest === 'number' && LOAN_INTEREST_OPTIONS.includes(flags.lendInterest)) {
      pct = flags.lendInterest;
    }
    return why(`tawarkan pinjaman ${pct}% (rasio risiko ${ratio.toFixed(2)})`, pct);
  };

  policy.acceptLoan = (view, { offers = [], canPinjol, owe } = {}) => {
    const list = (Array.isArray(offers) ? offers : [])
      .map((o) => ({
        lender: o?.lender ?? o?.lenderId ?? o?.name ?? null,
        pct: num(o?.interestPercent ?? o?.interest, Infinity),
      }))
      .filter((o) => o.lender != null && Number.isFinite(o.pct));
    if (!list.length) return why('tidak ada tawaran', null);
    list.sort((a, b) => a.pct - b.pct);
    const best = list[0];
    const pj = view?.difficulty?.pinjol;
    // Tolak pinjaman pemain demi Pinjol hanya kalau tombol Pinjol memang aktif dan plafonnya cukup.
    const pinjolUsable =
      pj &&
      canPinjol !== false &&
      view.pinjolAvailable(view.meId) &&
      (typeof owe !== 'number' || !Number.isFinite(owe) || pj.max >= owe);
    if (pinjolUsable && pj.interest * 100 < best.pct && !flags.keepLoanToEnd) {
      return why(`Pinjol (${pj.interest * 100}%) lebih murah dari ${best.pct}%`, null);
    }
    return why(`terima bunga terendah ${best.pct}% dari ${best.lender}`, String(best.lender));
  };

  policy.respondMoneyRequest = (view, { fromId, amount } = {}) => {
    const p = me(view);
    if (!p) return why('view kosong', false);
    const amt = num(amount, Infinity);
    const from = view.player(fromId);
    const leader = from && view.netWorth(from.id) >= view.netWorth(p.id);
    const ok = amt <= 100_000 && !leader && p.cash - amt >= reserveFor(view) * 2;
    return why(ok ? 'permintaan kecil & aman: kirim' : 'tolak permintaan uang', ok);
  };

  policy.respondTrade = (view, trade) => {
    const p = me(view);
    if (!p) return why('view kosong', false);
    const tr = normalizeTrade(trade);
    const from = view.idOf(tr.from);
    const valueOf = (tiles) => tiles.reduce((s, t) => s + view.tileValue(t), 0);
    const before = view.properties.map((x) => x.owner);
    const after = [...before];
    tr.inTiles.forEach((t) => (after[t] = p.id));
    tr.outTiles.forEach((t) => (after[t] = from));
    const provPrice = 0.75 * 3 * 1_000_000; // bonus kasar per provinsi lengkap
    const myDelta = (completeCount(after, p.id) - completeCount(before, p.id)) * provPrice;
    const theirDelta = from ? (completeCount(after, from) - completeCount(before, from)) * provPrice : 0;
    const gain = valueOf(tr.inTiles) + tr.inCash - valueOf(tr.outTiles) - tr.outCash + myDelta - theirDelta;
    const cashOk = p.cash - tr.outCash >= reserveFor(view) * 0.5;
    const ok = gain > 0 && cashOk && (theirDelta === 0 || myDelta >= theirDelta);
    return why(`tukar tanah: selisih ${Math.round(gain)} -> ${ok ? 'terima' : 'tolak'}`, ok);
  };

  return policy;
}
