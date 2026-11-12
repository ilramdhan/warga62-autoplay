import { parseRupiah } from '../dom/money.js';
import {
  ask,
  findPlayerById,
  findPlayerByName,
  isMyTurnOrUnknown,
  textHasName,
  throttle,
  tileIndexFromText,
} from './util.js';

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
    findButton('bayar utang') ||
    findButton(/^bayar jaminan rp/) ||
    findButtonByAria(/^kocok dadu:/i)
  );
}

function state(ctx) {
  const key = `${ctx.game?.round ?? '?'}:${ctx.me?.id ?? ctx.cfg.myName}`;
  if (!ctx.memo.preRoll || ctx.memo.preRoll.key !== key) ctx.memo.preRoll = { key, attempts: {} };
  return ctx.memo.preRoll;
}

const SEND_STATUS = /^(pilih pemainnya dulu|kirim rp|minta rp|kasmu kurang)/;

/**
 * Tutup modal: "Tutup" di dalam kotak (atau di halaman), lalu Escape bila masih terbuka.
 * @returns {Promise<boolean>} true bila `stillOpen()` tidak lagi benar (atau tak bisa dicek).
 */
async function closeModal(ctx, box, stillOpen) {
  const { findButton } = ctx.dom;
  const open = typeof stillOpen === 'function' ? stillOpen : () => false;
  const close = findButton('tutup', box ?? document) || findButton('tutup');
  if (close) {
    ctx.act.click(close);
    if (await ctx.act.waitFor(() => !open(), { timeout: 1000 })) return true;
  }
  ctx.act.pressKey(document.activeElement ?? document.body, 'keydown', 'Escape');
  return !!(await ctx.act.waitFor(() => !open(), { timeout: 800 }));
}

/** Modal "Kirim / minta uang" sedang terbuka? (stepper Tambah + tombol status kirim). */
export function sendModalOpen(ctx) {
  const { findButtonByAria, findButton } = ctx.dom;
  return !!(
    findButtonByAria('tambah', document, { enabledOnly: false }) &&
    findButton(SEND_STATUS, document, { enabledOnly: false })
  );
}

/** Kotak modal kirim uang: leluhur stepper yang memuat tombol status kirim DAN tombol Tutup. */
function sendBox(ctx) {
  const { findButtonByAria, findButton, climb } = ctx.dom;
  const plus = findButtonByAria('tambah', document, { enabledOnly: false });
  if (!plus) return null;
  return (
    climb(
      plus,
      (p) => !!findButton(SEND_STATUS, p, { enabledOnly: false }) && !!findButton('tutup', p, { enabledOnly: false }),
      16,
    ) ?? climb(plus, (p) => !!findButton(SEND_STATUS, p, { enabledOnly: false }), 16)
  );
}

async function doSend(ctx, action) {
  const { findButton, findButtonByAria, buttons, labelOf, optionByText, optionChecked } = ctx.dom;
  const open = findButton(OPEN_SEND);
  if (!open) return false;
  const toPlayer = findPlayerById(ctx.game, action.to) ?? findPlayerByName(ctx.game, action.to);
  const toName = toPlayer?.name ?? action.to;
  const isOpen = () => sendModalOpen(ctx);
  const giveUp = async (msg) => {
    ctx.log.warn(msg);
    const closed = await closeModal(ctx, sendBox(ctx), isOpen);
    if (!closed) ctx.log.warn('Modal kirim uang tidak bisa ditutup.');
    return false;
  };

  ctx.act.click(open);
  const box = await ctx.act.waitFor(() => sendBox(ctx), { timeout: 3000 });
  if (!box) return giveUp('Kirim uang: modal tidak terbuka.');

  // Segmented "Kirim uang" bisa <label>+radio (seperti setelan room) atau tombol.
  const seg = optionByText('Kirim uang', box) || findButton('kirim uang', box);
  if (seg && optionChecked(seg) === false) {
    ctx.act.click(seg);
    await ctx.act.sleep(250);
  }

  // Daftar pemain bisa termuat sedikit terlambat; cari tombol yang memuat nama UTUH penerima.
  const candidates = () =>
    buttons(box).filter((b) => {
      const l = labelOf(b);
      return l && !SKIP_PLAYER_LABELS.test(l) && !b.getAttribute('aria-label')?.match(/^(tambah|kurangi)$/i);
    });
  const target = await ctx.act.waitFor(
    () => {
      const list = candidates().filter((b) => textHasName(labelOf(b), toName));
      return list.sort((a, b) => labelOf(a).length - labelOf(b).length)[0] ?? null;
    },
    { timeout: 2500 },
  );
  if (!target) {
    const seen = candidates()
      .map((b) => labelOf(b))
      .slice(0, 8);
    return giveUp(`Kirim uang: pemain "${toName}" tidak ketemu di modal (tombol: ${seen.join(' | ') || '-'}).`);
  }
  const status = () => labelOf(findButton(SEND_STATUS, box, { enabledOnly: false }));
  const picked = () => !/^pilih pemainnya dulu/.test(status());
  for (let i = 0; i < 2 && !picked(); i++) {
    // Beberapa build merender tombol pemain dengan elemen anak; coba klik elemen terdalam bila klik pertama gagal.
    ctx.act.click(i === 0 ? target : (target.querySelector('span, div, p') ?? target));
    await ctx.act.waitFor(picked, { timeout: 1200 });
  }
  if (!picked()) return giveUp(`Kirim uang: gagal memilih "${toName}" (status: ${status() || '-'}).`);

  const cash = ctx.me?.cash;
  const wantAll = !Number.isFinite(action.amount) || (Number.isFinite(cash) && action.amount >= cash);
  const plusBtn = () => findButtonByAria('tambah', box, { enabledOnly: false });
  if (!plusBtn()) return giveUp('Kirim uang: tombol Tambah tidak ditemukan.');
  if (wantAll) await ctx.act.pressPlusUntilMax(plusBtn());
  else {
    for (let i = 0; i < 400; i++) {
      const submit = findButton(SUBMIT_SEND, box, { enabledOnly: false });
      const current = submit ? (parseRupiah(labelOf(submit)) ?? 0) : 0;
      if (current >= action.amount || ctx.dom.isDisabled(plusBtn())) break;
      plusBtn().click();
      await ctx.act.sleep(12);
    }
  }
  await ctx.act.sleep(250);
  const send = findButton(SUBMIT_SEND, box);
  if (!send) return giveUp(`Kirim uang: tombol kirim tidak aktif (${status() || '-'}).`);
  const text = labelOf(send);
  ctx.act.click(send);
  ctx.log.info(`${text} ke ${toName}.`);
  await ctx.act.waitFor(() => !isOpen(), { timeout: 1500 });
  if (isOpen()) await closeModal(ctx, sendBox(ctx), isOpen);
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

/**
 * Lunasi utang lebih awal: "Bayar utang" di dok, lalu tombol bayar di modal. Label di dalam modal
 * BELUM diverifikasi; dicari pola "Bayar Rp…"/"Lunasi…". Kalau tidak ada, modal ditutup tanpa aksi.
 */
async function doRepay(ctx) {
  const { findButton, findButtons, labelOf } = ctx.dom;
  const open = findButton('bayar utang');
  if (!open) return false;
  ctx.act.click(open);
  await ctx.act.waitFor(() => findButtons(/^(bayar rp|lunasi)/).length, { timeout: 2000 });
  const pay = findButtons(/^(bayar rp|lunasi)/).find((b) => b !== open);
  if (!pay) {
    ctx.log.warn('Bayar utang: tombol pelunasan tidak ditemukan.');
    await closeModal(ctx);
    return false;
  }
  ctx.act.click(pay);
  ctx.log.info(`Bayar utang: ${labelOf(pay)}.`);
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

/** Dok giliran sebelum kocok: jalankan aksi dari policy.preRoll (kirim uang, tebus, gadai, jaminan, bayar utang). */
export default {
  id: 'pre-roll',
  scope: 'game',
  priority: 60,
  detect(ctx) {
    // Modal kirim uang yang tertinggal terbuka (detect tidak pernah jalan selama run(), jadi pasti basi)
    // menutupi tombol kocok: tutup dulu.
    if (sendModalOpen(ctx)) return { closeStale: true };
    if (!ctx.view || !ctx.policy || !isMyTurnOrUnknown(ctx) || !dockVisible(ctx)) return null;
    const st = state(ctx);
    const actions = (ask(ctx, 'preRoll', []) ?? []).filter((a) => a && (st.attempts[actionSig(a)] ?? 0) < 2);
    return actions.length ? { action: actions[0] } : null;
  },
  async run(ctx, { action, closeStale }) {
    if (!throttle(ctx, 'pre-roll', 1500)) return false;
    if (closeStale) {
      const ok = await closeModal(ctx, sendBox(ctx), () => sendModalOpen(ctx));
      ctx.log.info(ok ? 'Menutup modal kirim/minta uang yang tertinggal.' : 'Modal kirim uang tidak bisa ditutup.');
      return ok;
    }
    const st = state(ctx);
    const sig = actionSig(action);
    st.attempts[sig] = (st.attempts[sig] ?? 0) + 1;
    let ok = false;
    if (action.type === 'send') ok = await doSend(ctx, action);
    else if (action.type === 'redeem') ok = await doRedeem(ctx, action);
    else if (action.type === 'mortgage') ok = await doMortgage(ctx, action);
    else if (action.type === 'payBail') ok = await doBail(ctx);
    else if (action.type === 'repay') ok = await doRepay(ctx);
    else ctx.log.warn(`Aksi pre-roll tidak dikenal: ${action.type}`);
    if (ok) st.attempts[sig] = 99; // sukses: jangan ulangi di giliran ini
    return ok;
  },
};
