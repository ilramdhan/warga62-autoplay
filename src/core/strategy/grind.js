/**
 * Policy mode 'grind': satu pemenang (cfg.winnerName), akun lain = feeder.
 * Hanya untuk room privat berisi akun milik sendiri. Peran ditentukan per panggilan dari view.
 *
 * policyFlags boleh berisi kunci umum + sub-objek `winner` / `feeder` (lihat planner.js).
 */
import { PROVINCES, TILES, provinceOf } from '../data/board.js';
import { parseRupiahText, recommendedReserve, visitProbabilities } from './risk.js';
import { createSmartPolicy } from './smart.js';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const MIN_SEND = 100_000;
const HARMFUL = /sita|denda|tagih|ambil|curi|rebut|lepas|hilang|seize|steal|korban/;

export function createGrindPolicy(cfg = {}) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const raw = c.policyFlags ?? {};
  const { winner: winnerFlags = {}, feeder: feederFlags = {}, ...common } = raw;
  const wf = { ...common, ...winnerFlags };
  const ff = { ...common, ...feederFlags };
  const winnerName = c.winnerName ?? '';

  // Pemenang memakai otak smart (lebih agresif) untuk keputusan yang tidak di-override.
  const base = createSmartPolicy({
    ...c,
    policyFlags: wf,
    strategy: { ...(c.strategy ?? {}), riskTolerance: Math.max(0.8, num(c.strategy?.riskTolerance, 0.5)) },
  });
  // Feeder yang tidak menemukan pemenang di meja kembali ke smart biasa (tidak berkolusi buta).
  const fallback = createSmartPolicy({ ...c, policyFlags: ff });

  const policy = { name: 'grind', lastReason: '' };
  const why = (reason, value) => {
    policy.lastReason = reason;
    try {
      c.explain?.(reason);
    } catch {}
    return value;
  };
  const via = (p, fn, args) => {
    const out = p[fn](...args);
    return why(p.lastReason, out);
  };

  const roleOf = (view) => {
    if (!view?.me) return 'none';
    if (view.isWinner(view.meId)) return 'winner';
    const w = view.winner;
    if (!w || w.bankrupt) return 'orphan';
    return 'feeder';
  };
  const holdActive = (view) => view.round < num(ff.holdBankruptUntilRound, 0);
  const winnerReserve = (view) => {
    if (typeof wf.reserveOverride === 'number') return wf.reserveOverride;
    const r = recommendedReserve(view, view.meId, { turns: 2, riskTolerance: wf.neverNegative ? 0.2 : 0.8 });
    return wf.neverNegative ? r + 500_000 : r;
  };
  const isWinnerId = (view, id) => view.isWinner(id) || String(id) === winnerName;

  // ---------- feeder ----------
  const feeder = {
    rollTarget: () => why('feeder: target lempar', ff.rollTarget ?? 'perfect'),
    preRoll: (view) => {
      const p = view.me;
      const actions = [];
      let cash = p.cash;
      if (p.inJail && ff.wantBail && cash >= view.fees.bail) {
        actions.push({ type: 'payBail' });
        cash -= view.fees.bail;
      }
      let amount = cash;
      if (holdActive(view)) {
        const keep = Math.max(
          num(ff.feederKeepCash),
          recommendedReserve(view, p.id, { turns: 2, riskTolerance: 0 }),
          view.fees.toll,
        );
        amount = Math.floor(Math.max(0, cash - keep) / MIN_SEND) * MIN_SEND;
      }
      if (amount >= MIN_SEND) actions.push({ type: 'send', to: winnerName, amount });
      return why(
        holdActive(view)
          ? `feeder: kirim ${amount}, tahan kas sampai ronde ${ff.holdBankruptUntilRound}`
          : 'feeder: kirim semua kas',
        actions,
      );
    },
    shouldBuy: (view, { tile, price } = {}) => {
      const cost = num(price, PROVINCES[provinceOf(tile)]?.price ?? Infinity);
      const ok = Boolean(ff.feederBuyForTakeover) && provinceOf(tile) != null && view.me.cash >= cost;
      return why(ok ? 'feeder: beli untuk diambil alih pemenang' : 'feeder: tidak beli', ok);
    },
    shouldTakeover: () => why('feeder: tidak ambil alih', false),
    chooseUpgrades: () => why('feeder: tidak bangun', []),
    chooseToll: (view, options = []) => {
      const opts = (Array.isArray(options) ? options : []).filter(Number.isInteger);
      if (!opts.length) return why('tidak ada opsi tol', options?.[0] ?? null);
      const wid = view.winner?.id;
      const score = (dest) => {
        const v = visitProbabilities(dest, 2);
        return v.reduce((s, x, t) => (view.properties[t]?.owner === wid ? s + x * view.rentAt(t) : s), 0);
      };
      const best = [...opts].sort((a, b) => score(b) - score(a) || a - b)[0];
      return why('feeder: tol ke arah kota pemenang', best);
    },
    chooseOption: (_view, { options = [] } = {}) => {
      const list = Array.isArray(options) ? options : [];
      let idx = list.findIndex((o) => /bayar|setor/.test(norm(o)) && parseRupiahText(o) != null);
      if (idx < 0) idx = list.findIndex((o) => parseRupiahText(o) != null);
      return why('feeder: pilih opsi bayar', Math.max(0, idx));
    },
    chooseTile: (view, { purpose, candidates = [] } = {}) => {
      const cands = (Array.isArray(candidates) ? candidates : []).filter(Number.isInteger);
      if (!cands.length) return why('tidak ada kandidat', null);
      const wid = view.winner?.id;
      const harmful = HARMFUL.test(norm(purpose));
      const pick = cands.find((t) => (view.properties[t]?.owner === wid) !== harmful) ?? cands[0];
      return why(`feeder: pilih petak ${pick}`, pick);
    },
    choosePlayer: (view, { purpose, candidates = [] } = {}) => {
      const list = (Array.isArray(candidates) ? candidates : []).map(String);
      if (!list.length) return why('tidak ada kandidat', null);
      const harmful = HARMFUL.test(norm(purpose)) || !/beri|kirim|hadiah|bagi|bantu|give/.test(norm(purpose));
      const winnerPick = list.find((x) => isWinnerId(view, x));
      const other = list.find((x) => !isWinnerId(view, x) && view.idOf(x) !== view.meId);
      const pick = harmful ? (other ?? list[0]) : (winnerPick ?? list[0]);
      return why(`feeder: pilih pemain ${pick}`, pick);
    },
    useKeepCard: (view, { cardId, situation } = {}) => {
      const id = norm(cardId).replace(/\s+/g, '-');
      if (id === 'orang-dalam' && ff.wantJail) return why('feeder: wantJail', false);
      if (ff.useAllKeepCards || (Array.isArray(ff.useKeepCards) && ff.useKeepCards.includes(id))) {
        return why('feeder: pakai kartu (flag)', true);
      }
      if (id === 'joki-dadu') {
        const dice = situation?.dice;
        return why('feeder: joki dadu', Boolean(dice && feeder.jokiDadu(view, { dice })));
      }
      return why('feeder: simpan kartu', false);
    },
    jokiDadu: (view, { dice } = {}) => {
      if (!Array.isArray(dice) || dice.length < 2) return why('joki: data kosong', null);
      const wid = view.winner?.id;
      const pos = view.me.position;
      const score = (d1, d2) => {
        const t = (pos + d1 + d2) % TILES.length;
        if (ff.wantJail && ['raid', 'court'].includes(TILES[t].kind)) return 1e9;
        return view.properties[t]?.owner === wid ? view.rentAt(t) : 0;
      };
      const [a, b] = dice;
      let best = null;
      for (const dieIndex of [0, 1]) {
        for (let v = 1; v <= 6; v++) {
          const s = dieIndex === 0 ? score(v, b) : score(a, v);
          if (!best || s > best.s) best = { dieIndex, value: v, s };
        }
      }
      if (best && best.s > score(a, b)) {
        return why('feeder joki: mendarat di kota pemenang', { dieIndex: best.dieIndex, value: best.value });
      }
      return why('feeder joki: tidak perlu', null);
    },
    debtStep: (view, { canSell = [], canMortgage = [], canLoan, canPinjol, triedLoan } = {}) => {
      if (ff.wantPinjol && canPinjol) return why('feeder: ambil Pinjol (target pencapaian)', { type: 'pinjol' });
      if (canSell?.length) return why('feeder: jual bangunan', { type: 'sell', tile: canSell[0] });
      if (canMortgage?.length) return why('feeder: gadai', { type: 'mortgage', tile: canMortgage[0] });
      const hold = holdActive(view);
      if ((hold || ff.preferPlayerLoan) && canLoan && !triedLoan) {
        return why('feeder: pinjam dulu (tahan bangkrut)', { type: 'requestLoan' });
      }
      if (hold && canPinjol) return why('feeder: Pinjol (tahan bangkrut)', { type: 'pinjol' });
      return why('feeder: bangkrut', { type: 'bankrupt' });
    },
    lendOffer: () => why('feeder: tidak meminjamkan', null),
    acceptLoan: (view, { offers = [] } = {}) => {
      const list = (Array.isArray(offers) ? offers : []).filter((o) => o && (o.lender ?? o.lenderId) != null);
      if (!list.length) return why('tidak ada tawaran', null);
      const fromWinner = list.find((o) => isWinnerId(view, o.lender ?? o.lenderId));
      const pick = fromWinner ?? [...list].sort((x, y) => num(x.interestPercent, 100) - num(y.interestPercent, 100))[0];
      return why('feeder: terima pinjaman', String(pick.lender ?? pick.lenderId));
    },
    respondMoneyRequest: (view, { fromId } = {}) => {
      const ok = isWinnerId(view, fromId);
      return why(ok ? 'feeder: kirim ke pemenang' : 'feeder: tolak', ok);
    },
    respondTrade: (view, trade) => {
      const from = trade?.from ?? trade?.fromId ?? trade?.proposer;
      const ok = isWinnerId(view, from);
      return why(ok ? 'feeder: terima tawaran pemenang' : 'feeder: tolak', ok);
    },
  };

  // ---------- winner ----------
  const upgradePriority = (view, t) => {
    const prov = provinceOf(t);
    const lvl = view.properties[t].level;
    let s = view.rentAt(t, lvl + 1, view.meId) / PROVINCES[prov].upgradeCost;
    if (view.ownsProvince(view.meId, prov)) s += 10;
    if (lvl + 1 === 3) s += wf.wantElit ? 100 : 2;
    return s;
  };
  const winner = {
    rollTarget: () => why('pemenang: target lempar', wf.rollTarget ?? 'perfect'),
    preRoll: (view) => {
      const p = view.me;
      const actions = [];
      let cash = p.cash;
      const reserve = winnerReserve(view);
      if (p.inJail && !wf.wantJail && cash >= view.fees.bail) {
        actions.push({ type: 'payBail' }); // sewa pemenang masuk Negara selama di Lapas
        cash -= view.fees.bail;
      }
      const ratio = num(view.rules.redeem, view.difficulty.redeem);
      for (const t of view.myTiles.filter((x) => view.properties[x].mortgaged)) {
        const cost = Math.round(PROVINCES[provinceOf(t)].price * ratio);
        if (cash - cost >= reserve) {
          actions.push({ type: 'redeem', tile: t });
          cash -= cost;
        }
      }
      return why(`pemenang: pre-roll ${actions.map((a) => a.type).join(',') || '-'}`, actions);
    },
    shouldBuy: (view, { tile, price } = {}) => {
      const prov = provinceOf(tile);
      if (!prov) return why('bukan kota', false);
      const cost = num(price, PROVINCES[prov].price);
      const want = Array.isArray(wf.wantProvinces) && wf.wantProvinces.includes(prov);
      const ok = view.me.cash - cost >= (want ? 0 : winnerReserve(view));
      return why(ok ? 'pemenang: beli' : 'pemenang: kas kurang', ok);
    },
    shouldTakeover: (view, { tile, price } = {}) => {
      if (!provinceOf(tile) || view.isTakeoverSafe(tile)) return why('pemenang: target aman/bukan kota', false);
      const cost = num(price, view.takeoverPrice(tile));
      const ok = view.me.cash - cost >= winnerReserve(view);
      return why(ok ? 'pemenang: ambil alih' : 'pemenang: kas kurang untuk ambil alih', ok);
    },
    chooseUpgrades: (view, candidates = []) => {
      const list = (Array.isArray(candidates) ? candidates : []).filter(
        (t) => provinceOf(t) && view.properties[t]?.owner === view.meId && view.properties[t].level < 3,
      );
      let budget = view.me.cash - winnerReserve(view);
      const picked = [];
      for (const t of [...list].sort((a, b) => upgradePriority(view, b) - upgradePriority(view, a) || a - b)) {
        const cost = PROVINCES[provinceOf(t)].upgradeCost;
        if (budget >= cost) {
          picked.push(t);
          budget -= cost;
        }
      }
      return why(`pemenang: bangun ${picked.join(',') || '-'}`, picked);
    },
    debtStep: (view, { canSell = [], canMortgage = [], canLoan, canPinjol, triedLoan } = {}) => {
      if (wf.wantPinjol && canPinjol) return why('pemenang: Pinjol (target pencapaian)', { type: 'pinjol' });
      const cheapest = (arr, fn) => [...arr].filter((t) => provinceOf(t)).sort((a, b) => fn(a) - fn(b) || a - b)[0];
      const s = cheapest(Array.isArray(canSell) ? canSell : [], (t) => PROVINCES[provinceOf(t)].upgradeCost);
      if (s != null) return why('pemenang: jual bangunan termurah', { type: 'sell', tile: s });
      const m = cheapest(Array.isArray(canMortgage) ? canMortgage : [], (t) => PROVINCES[provinceOf(t)].price);
      if (m != null) return why('pemenang: gadai kota termurah', { type: 'mortgage', tile: m });
      if (canLoan && !triedLoan) return why('pemenang: minta pinjaman', { type: 'requestLoan' });
      if (canPinjol) return why('pemenang: Pinjol', { type: 'pinjol' });
      return why('pemenang: tidak ada pilihan, bangkrut', { type: 'bankrupt' });
    },
    lendOffer: (view, { borrowerId } = {}) => {
      if (!view.isFeeder(borrowerId)) return why('pemenang: tidak meminjamkan ke non-feeder', null);
      if (typeof wf.lendInterest === 'number') return why(`pemenang: pinjamkan ${wf.lendInterest}%`, wf.lendInterest);
      if (holdActive(view)) return why('pemenang: pinjaman 0% agar feeder bertahan sampai ronde target', 0);
      return why('pemenang: tidak meminjamkan', null);
    },
    acceptLoan: (view, { offers = [] } = {}) => {
      const list = (Array.isArray(offers) ? offers : []).filter((o) => o && (o.lender ?? o.lenderId) != null);
      if (!list.length) return why('tidak ada tawaran', null);
      const pick = [...list].sort((x, y) => num(x.interestPercent, 100) - num(y.interestPercent, 100))[0];
      return why(`pemenang: bunga terendah ${num(pick.interestPercent)}%`, String(pick.lender ?? pick.lenderId));
    },
    respondMoneyRequest: () => why('pemenang: tidak pernah membayar feeder', false),
    respondTrade: (view, trade) => {
      const from = trade?.from ?? trade?.fromId ?? trade?.proposer;
      if (!view.isFeeder(from)) return via(base, 'respondTrade', [view, trade]);
      const t = trade ?? {};
      const tiles = (v) => (Array.isArray(v) ? v : []).reduce((s, x) => s + view.tileValue(Number(x)), 0);
      const gain =
        tiles(t.offerTiles ?? t.offer?.tiles) +
        num(t.offerCash ?? t.offer?.cash) -
        tiles(t.requestTiles ?? t.request?.tiles) -
        num(t.requestCash ?? t.request?.cash);
      return why(`pemenang: tukar dengan feeder (selisih ${gain})`, gain >= 0);
    },
  };

  const METHODS = [
    'rollTarget',
    'preRoll',
    'shouldBuy',
    'shouldTakeover',
    'chooseUpgrades',
    'chooseToll',
    'chooseOption',
    'chooseTile',
    'choosePlayer',
    'useKeepCard',
    'jokiDadu',
    'debtStep',
    'lendOffer',
    'acceptLoan',
    'respondMoneyRequest',
    'respondTrade',
  ];
  for (const m of METHODS) {
    policy[m] = (view, arg) => {
      const role = roleOf(view);
      if (role === 'feeder') return feeder[m](view, arg);
      if (role === 'winner') return winner[m] ? winner[m](view, arg) : via(base, m, [view, arg]);
      return via(fallback, m, [view, arg]);
    };
  }
  return policy;
}
