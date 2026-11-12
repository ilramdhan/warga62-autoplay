import { ask, throttle, tileIndexFromText } from './util.js';
import { BOARD_SIZE } from '../data/board.js';

const WALK = /^jalan ke /;
const USE = /^pakai joki,? jalan ke /;
const STEPS = /(\d+)\s*petak ke /;
const ALL_KINDS = ['start', 'city', 'takdir', 'musibah', 'tax', 'jail', 'toll', 'parking', 'raid', 'court'];
const MAX_SPIN = 20;

/** Nilai dadu dari state (bila game menyediakannya), else null. */
function diceFromState(game) {
  const d = game?.pending?.dice ?? game?.dice ?? game?.lastRoll ?? game?.pending?.roll;
  return Array.isArray(d) && d.length >= 2 ? [Number(d[0]), Number(d[1])] : null;
}

/** Angka 1–6 yang tertulis di elemen dadu (teks atau aria-label), else null. */
export function faceOf(el) {
  const t = String(el?.textContent ?? '').trim();
  if (/^[1-6]$/.test(t)) return Number(t);
  const m = /(?:^|\D)([1-6])(?:\D|$)/.exec(el?.getAttribute?.('aria-label') ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * Batas nilai dadu KEDUA dari total awal `sum` dan total-total teramati saat dadu PERTAMA diputar
 * (dadu kedua tetap). Murni, diekspor untuk tes. Berlaku baik bila putaran berurutan maupun acak.
 * @returns {{lo:number, hi:number}}
 */
export function secondDieBounds(sum, observed) {
  const obs = observed.filter(Number.isFinite);
  let lo = Math.max(1, sum - 6);
  let hi = Math.min(6, sum - 1);
  if (obs.length) {
    lo = Math.max(lo, Math.max(...obs) - 6);
    hi = Math.min(hi, Math.min(...obs) - 1);
  }
  return { lo, hi };
}

/** [a, b] bila nilai dadu sudah pasti dari batas, else null. */
export function inferDice(sum, observed) {
  if (!Number.isFinite(sum)) return null;
  const { lo, hi } = secondDieBounds(sum, observed);
  return lo === hi && sum - lo >= 1 && sum - lo <= 6 ? [sum - lo, lo] : null;
}

/**
 * Rencana policy (bisa untuk dadu 1 atau 2) diubah ke nilai baru DADU PERTAMA dengan total & status
 * kembar yang sama. null bila tidak setara. Murni, diekspor untuk tes.
 */
export function planForFirstDie([a, b], plan) {
  if (!plan || !Number.isInteger(plan.dieIndex) || !(plan.value >= 1 && plan.value <= 6)) return null;
  if (plan.dieIndex === 0) return plan.value === a ? null : plan.value;
  const total = a + plan.value;
  const v = total - b;
  const wasDouble = a === plan.value;
  return v >= 1 && v <= 6 && v !== a && (v === b) === wasDouble ? v : null;
}

/**
 * Modal Joki Dadu (muncul SETELAH lempar bila memegang kartu Joki Dadu): "ketuk dadu untuk memutar
 * angkanya. Hanya satu dadu yang bisa diganti.", "N petak ke <petak>", dua ikon dadu, tombol
 * "Jalan ke <petak>" (atau "Pakai Joki, jalan ke …").
 *
 * Aturan aman: hanya DADU PERTAMA yang pernah disentuh. Nilai dadu dari state / angka di dadu, atau
 * disimpulkan dari total langkah saat dadu pertama diputar. Kartu hanya dipakai bila total akhir
 * PERSIS sesuai rencana; selain itu dadu dikembalikan ke hasil asli dan jalan biasa.
 */
export default {
  id: 'joki-dadu',
  scope: 'game',
  priority: 38,
  detect: (ctx) => ctx.dom.findButton(WALK) || ctx.dom.findButton(USE),
  async run(ctx) {
    const { findButton, findLeaf, climb, buttons, labelOf, isDisabled, isVisible } = ctx.dom;
    if (!throttle(ctx, 'joki', 2000)) return false;
    const anchor = findButton(WALK) || findButton(USE);
    const box = climb(anchor, (p) => !!findLeaf(/ketuk dadu/, p) || !!findLeaf(STEPS, p)) ?? null;
    const stepsNow = () => {
      const leaf = box && findLeaf(STEPS, box);
      const m = leaf ? STEPS.exec(ctx.dom.textOf(leaf)) : null;
      return m ? Number(m[1]) : null;
    };
    const clickWalk = async (useCard, why) => {
      const scope = box ?? document;
      const btn = useCard
        ? findButton(USE, scope) || findButton(WALK, scope)
        : findButton(WALK, scope) || findButton(USE, scope);
      if (!btn) return false;
      ctx.act.click(btn);
      ctx.log.info(`Joki Dadu: ${labelOf(btn)}${why ? ` (${why})` : ''}.`);
      await ctx.act.sleep(1200);
      return true;
    };

    const sum0 = stepsNow();
    if (!box || !findLeaf(/ketuk dadu/, box) || sum0 == null) return clickWalk(false, '');

    // Elemen dadu: hanya yang jelas dadu (angka 1–6 / aria "dadu"), bukan tombol tutup/info.
    const isDie = (e) =>
      isVisible(e) &&
      !WALK.test(labelOf(e)) &&
      !USE.test(labelOf(e)) &&
      (faceOf(e) != null || /dadu/i.test(e.getAttribute?.('aria-label') ?? ''));
    const dice = [...new Set([...buttons(box), ...box.querySelectorAll('[aria-label*="dadu" i]')])]
      .filter(isDie)
      .slice(0, 2);
    if (dice.length < 2) return clickWalk(false, 'ikon dadu tidak dikenali');
    const die = dice[0];

    const spin = async () => {
      ctx.act.click(die);
      await ctx.act.sleep(300);
      return stepsNow();
    };
    // Kembalikan dadu pertama ke total asli (dipanggil hanya bila sudah diputar).
    const restore = async () => {
      for (let i = 0; i < MAX_SPIN && stepsNow() !== sum0 && !isDisabled(die); i++) await spin();
      return stepsNow() === sum0;
    };

    let values = diceFromState(ctx.game);
    if (!values) {
      const f = dice.map(faceOf);
      if (f.every((x) => x != null) && f[0] + f[1] === sum0) values = f;
    }
    let touched = false;
    if (!values) {
      const seen = [sum0];
      for (let i = 0; i < MAX_SPIN && !values && !isDisabled(die); i++) {
        const s = await spin();
        touched = true;
        if (s == null) break;
        seen.push(s);
        values = inferDice(sum0, seen.slice(1).concat(sum0));
      }
      if (!values) {
        const back = await restore();
        return clickWalk(false, back ? 'nilai dadu tidak terbaca; hasil asli' : 'nilai dadu tidak terbaca');
      }
    }

    // Posisi asal = tujuan awal − total awal (state bisa sudah/ belum memindahkan bidak).
    const dest = tileIndexFromText(
      labelOf(findButton(WALK, box) || findButton(USE, box)).replace(/^.*jalan ke /, ''),
      ALL_KINDS,
    );
    const from =
      dest != null && !touched ? (dest - sum0 + BOARD_SIZE) % BOARD_SIZE : (ctx.memo.jokiFrom ?? ctx.me?.position);
    if (dest != null && !touched) ctx.memo.jokiFrom = from;
    const view = ctx.view && Number.isFinite(from) ? { ...ctx.view, me: { ...ctx.view.me, position: from } } : ctx.view;

    const plan = ask({ ...ctx, view }, 'jokiDadu', null, { dice: values });
    const reason = ctx.policy?.lastReason ?? '';
    const v = planForFirstDie(values, plan);
    if (v == null) {
      if (touched && !(await restore())) return clickWalk(false, 'gagal mengembalikan dadu');
      return clickWalk(false, `hasil asli dipakai${reason ? `; ${reason}` : ''}`);
    }
    const target = v + values[1];
    for (let i = 0; i < MAX_SPIN && stepsNow() !== target && !isDisabled(die); i++) await spin();
    if (stepsNow() === target) {
      return clickWalk(true, `dadu 1: ${values[0]}→${v}, ${target} petak${reason ? `; ${reason}` : ''}`);
    }
    ctx.log.warn(`Joki Dadu: tidak berhasil mengatur dadu ke total ${target}; kembali ke hasil asli.`);
    const back = await restore();
    return clickWalk(false, back ? 'hasil asli' : 'dadu tidak bisa dikembalikan');
  },
};
