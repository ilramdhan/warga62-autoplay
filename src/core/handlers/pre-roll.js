import { parseRupiah } from '../dom/money.js';
import { ask, findPlayerById, isMyTurnOrUnknown, throttle, tileIndexFromText } from './util.js';

const OPEN_SEND = 'kirim / minta uang';
const SUBMIT_SEND = /^kirim rp/;
const SKIP_PLAYER_LABELS =
  /^(kirim uang|minta uang|tutup|kurangi|tambah|pilih pemainnya dulu|kirim rp.*|minta rp.*|rp\d.*)$/;

export const actionSig = (a) => `${a.type}:${a.to ?? a.tile ?? ''}`;

function dockVisible(ctx) {
  const { findButton, findButtonByAria } = ctx.dom;
  return (
    findButton(OPEN_SEND) ||
    findButton('gadai kota') ||
    findButton('tebus gadai') ||
    findButton(/^bayar jaminan rp/) ||
    findButtonByAria(/^kocok dadu:/i)
  );
}

function state(ctx) {
  const key = `${ctx.game?.round ?? '?'}:${ctx.me?.id ?? ctx.cfg.myName}`;
  if (!ctx.memo.preRoll || ctx.memo.preRoll.key !== key) ctx.memo.preRoll = { key, attempts: {} };
  return ctx.memo.preRoll;
}

async function closeModal(ctx, box) {
  const close = ctx.dom.findButton('tutup', box ?? document);
  if (close) {
    ctx.act.click(close);
    await ctx.act.sleep(400);
  }
}

async function doSend(ctx, action) {
  const { findButton, findButtonByAria, buttons, labelOf, norm, climb } = ctx.dom;
  const open = findButton(OPEN_SEND);
  if (!open) return false;
  const toPlayer = findPlayerById(ctx.game, action.to);
  const toName = toPlayer?.name ?? action.to;
  ctx.act.click(open);
  const plus = await ctx.act.waitFor(() => findButtonByAria('tambah', document, { enabledOnly: false }), {
    timeout: 3000,
  });
  if (!plus) return false;
  const box = climb(plus, (p) => buttons(p).length >= 4) ?? document;
  const seg = findButton('kirim uang', box);
  if (seg && ctx.dom.isSelected(seg) !== true) {
    ctx.act.click(seg);
    await ctx.act.sleep(200);
  }
  const target = buttons(box).find((b) => {
    const l = labelOf(b);
    return !SKIP_PLAYER_LABELS.test(l) && l.includes(norm(toName));
  });
  if (!target) {
    ctx.log.warn(`Kirim uang: pemain "${toName}" tidak ketemu di modal.`);
    await closeModal(ctx, box);
    return false;
  }
  ctx.act.click(target);
  await ctx.act.sleep(250);
  const cash = ctx.me?.cash;
  const wantAll = !Number.isFinite(action.amount) || (Number.isFinite(cash) && action.amount >= cash);
  const plusBtn = () => findButtonByAria('tambah', box, { enabledOnly: false }) ?? plus;
  if (wantAll) await ctx.act.pressPlusUntilMax(plusBtn());
  else {
    for (let i = 0; i < 400; i++) {
      const submit = findButton(SUBMIT_SEND, box, { enabledOnly: false });
      const current = submit ? (parseRupiah(labelOf(submit)) ?? 0) : 0;
      if (current >= action.amount || plusBtn().disabled) break;
      plusBtn().click();
      await ctx.act.sleep(12);
    }
  }
  await ctx.act.sleep(250);
  const send = findButton(SUBMIT_SEND, box);
  if (!send) {
    ctx.log.warn('Kirim uang: tombol kirim tidak aktif, modal ditutup.');
    await closeModal(ctx, box);
    return false;
  }
  const text = labelOf(send);
  ctx.act.click(send);
  ctx.log.info(`${text} ke ${toName}.`);
  await ctx.act.sleep(900);
  if (findButtonByAria('tambah')) await closeModal(ctx, box);
  return true;
}

async function doRedeem(ctx, action) {
  const { findButton, findButtons, labelOf } = ctx.dom;
  const open = findButton('tebus gadai');
  if (!open) return false;
  ctx.act.click(open);
  await ctx.act.sleep(600);
  const options = findButtons(/^tebus rp/);
  const match = options.find(
    (b) =>
      tileIndexFromText(
        ctx.dom.climb(b, (p) => tileIndexFromText(p.textContent ?? '') != null, 4)?.textContent ?? '',
      ) === action.tile,
  );
  const btn = match ?? (options.length === 1 ? options[0] : null);
  if (!btn) {
    await closeModal(ctx);
    return false;
  }
  ctx.act.click(btn);
  ctx.log.info(`Tebus gadai: ${labelOf(btn)}.`);
  await ctx.act.sleep(900);
  await closeModal(ctx);
  return true;
}

async function doMortgage(ctx, action) {
  const { findButton, buttons, labelOf, climb } = ctx.dom;
  const open = findButton('gadai kota');
  if (!open) return false;
  ctx.act.click(open);
  await ctx.act.sleep(600);
  const btn = buttons().find((b) => {
    if (b === open) return false;
    const row = climb(b, (p) => tileIndexFromText(p.textContent ?? '') != null, 3);
    return row && tileIndexFromText(row.textContent) === action.tile && /gadai|rp/.test(labelOf(b));
  });
  if (!btn) {
    await closeModal(ctx);
    return false;
  }
  ctx.act.click(btn);
  ctx.log.info(`Gadai kota: ${labelOf(btn)}.`);
  await ctx.act.sleep(900);
  await closeModal(ctx);
  return true;
}

async function doBail(ctx) {
  const pay = ctx.dom.findButton(/^bayar jaminan rp/);
  if (!pay) return false;
  ctx.act.click(pay);
  ctx.log.info(`Bayar jaminan: ${ctx.dom.labelOf(pay)}.`);
  await ctx.act.sleep(900);
  return true;
}

/** Dok giliran sebelum kocok: jalankan aksi dari policy.preRoll (kirim uang, tebus, gadai, jaminan). */
export default {
  id: 'pre-roll',
  scope: 'game',
  priority: 60,
  detect(ctx) {
    if (!ctx.view || !ctx.policy || !isMyTurnOrUnknown(ctx) || !dockVisible(ctx)) return null;
    const st = state(ctx);
    const actions = (ask(ctx, 'preRoll', []) ?? []).filter((a) => a && (st.attempts[actionSig(a)] ?? 0) < 2);
    return actions.length ? { action: actions[0] } : null;
  },
  async run(ctx, { action }) {
    if (!throttle(ctx, 'pre-roll', 1500)) return false;
    const st = state(ctx);
    const sig = actionSig(action);
    st.attempts[sig] = (st.attempts[sig] ?? 0) + 1;
    let ok = false;
    if (action.type === 'send') ok = await doSend(ctx, action);
    else if (action.type === 'redeem') ok = await doRedeem(ctx, action);
    else if (action.type === 'mortgage') ok = await doMortgage(ctx, action);
    else if (action.type === 'payBail') ok = await doBail(ctx);
    else ctx.log.warn(`Aksi pre-roll tidak dikenal: ${action.type}`);
    if (ok) st.attempts[sig] = 99; // sukses: jangan ulangi di giliran ini
    return ok;
  },
};
