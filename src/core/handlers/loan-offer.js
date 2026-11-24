import { ask, closeDialog, findPlayerById, findPlayerInText, percentFromText, throttle } from './util.js';
import { parseRupiah } from '../dom/money.js';
import { norm } from '../dom/query.js';
import { playersOf } from '../state/reader.js';

const ACCEPT = /^terima \d+\s*%/;
const PERCENT = /^\d+\s*%$/;
/** Tombol menolak/menutup tawaran pemberi pinjaman. "Ubah" bukan penolakan. */
const DECLINE = /^(tolak|batal|tutup|lewati|nanti|nanti saja|tidak|tidak jadi|tidak meminjamkan|jangan)$/;
const CLOSE_ARIA = /^(tutup|close|batal)$/;
/** Teks yang menandai jumlah pinjaman yang diminta. */
const AMOUNT_HINT = /(pinjam|butuh|kurang|jumlah|minta|nominal)/;

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Jumlah pinjaman dari teks-teks pendek di modal pemberi (murni). Utamakan teks berlabel ("pinjam Rp…",
 * "butuh", "kurang", "jumlah") atau label yang langsung diikuti nominal; kalau tidak ada label, hanya dipakai
 * bila tepat SATU nominal positif berbeda yang terlihat. Selain itu null (tidak diketahui → tolak).
 * @param {string[]} texts
 * @returns {number|null}
 */
export function loanAmountFromTexts(texts) {
  const list = (Array.isArray(texts) ? texts : []).map((t) => String(t ?? '')).filter((t) => t.trim());
  const positive = (t) => {
    const v = parseRupiah(t);
    return v != null && v > 0 ? v : null;
  };
  const labeled = new Set();
  list.forEach((t, i) => {
    if (!AMOUNT_HINT.test(norm(t))) return;
    const own = positive(t);
    if (own != null) labeled.add(own);
    else if (i + 1 < list.length && positive(list[i + 1]) != null) labeled.add(positive(list[i + 1]));
  });
  if (labeled.size === 1) return [...labeled][0];
  if (labeled.size > 1) return null;
  const all = new Set(list.map(positive).filter((v) => v != null));
  return all.size === 1 ? [...all][0] : null;
}

/**
 * Id peminjam (murni): dari game.pending dulu, lalu nama pemain lain yang muncul tepat satu di modal,
 * lalu pemain yang sedang giliran (Gali Lubang terjadi di giliran peminjam) bila fase awaiting_loan/debt.
 * Bukan diri sendiri. null bila tidak diketahui.
 * @param {object|null} game
 * @param {string|null} meId
 * @param {string[]} texts teks modal
 * @returns {string|null}
 */
export function resolveBorrowerId(game, meId, texts = []) {
  const pend = game?.pending && typeof game.pending === 'object' ? game.pending : {};
  const req = pend.request && typeof pend.request === 'object' ? pend.request : {};
  const isMe = (id) => meId != null && String(id) === String(meId);
  const direct = [
    pend.borrowerId,
    pend.borrower,
    pend.requesterId,
    pend.requester,
    pend.playerId,
    pend.from,
    req.borrowerId,
    req.borrower,
    req.from,
  ].find((v) => v != null && v !== '' && typeof v !== 'object');
  if (direct != null) {
    const p = findPlayerById(game, direct) ?? playersOf(game).find((x) => norm(x.name) === norm(direct));
    const id = p?.id ?? direct;
    return isMe(id) ? null : String(id);
  }
  const names = new Set();
  for (const t of Array.isArray(texts) ? texts : []) {
    const p = findPlayerInText(game, t);
    if (p && !isMe(p.id)) names.add(String(p.id));
  }
  if (names.size === 1) return [...names][0];
  if (names.size > 1) return null;
  const cp = game?.currentPlayer;
  if (cp != null && !isMe(cp) && ['awaiting_loan', 'debt'].includes(game?.phase)) return String(cp);
  return null;
}

/** Teks daun (tanpa tombol) di dalam modal; [] kalau modal tak diketahui (jangan baca seluruh halaman). */
function modalTexts(box) {
  if (!box || typeof document === 'undefined' || box === document || box === document.body) return [];
  if (typeof box.querySelectorAll !== 'function') return box.textContent ? [String(box.textContent)] : [];
  const out = [];
  for (const el of box.querySelectorAll('*')) {
    if (el.children?.length || el.closest?.('button, [role="button"]')) continue;
    const t = el.textContent?.trim();
    if (t) out.push(t);
  }
  return out;
}

/**
 * Tolak tawaran sebagai pemberi tanpa pernah mengklik "Tawarkan": tombol tolak/tutup/nanti di modal,
 * tombol X (aria-label), lalu Escape. Gagal → false (biarkan tawaran kedaluwarsa).
 */
async function declineLend(ctx, box, reason) {
  const { findButton, findButtonByAria } = ctx.dom;
  const inModal = box && box !== document;
  const isOpen = () => !!findButton('tawarkan', inModal ? box : document, { enabledOnly: false });
  const btn =
    (inModal ? findButton(DECLINE, box) : null) ||
    (inModal && typeof findButtonByAria === 'function' ? findButtonByAria(CLOSE_ARIA, box) : null);
  if (btn) {
    ctx.act.click(btn);
    ctx.log.info(`Tidak meminjamkan (${reason}).`);
    await ctx.act.sleep(800);
    return true;
  }
  // Tanpa tombol tolak: Escape (tanpa mengklik "Tutup" di luar modal).
  const closed = await closeDialog(ctx, { box: inModal ? box : null, anywhere: false, isOpen });
  if (closed) {
    ctx.log.info(`Tidak meminjamkan (${reason}); tawaran ditutup.`);
    return true;
  }
  ctx.log.info(`Tidak meminjamkan (${reason}); tidak ada tombol tolak, tawaran dibiarkan kedaluwarsa.`);
  return false;
}

/** Tawaran pinjaman: pemberi (pilih bunga lalu "Tawarkan") atau peminjam ("Terima N%" / "Tidak jadi"). */
export default {
  id: 'loan-offer',
  scope: 'game',
  priority: 54,
  detect(ctx) {
    const { findButtons, findButton } = ctx.dom;
    const accepts = findButtons(ACCEPT);
    if (accepts.length) return { side: 'borrower', accepts };
    const offer = findButton('tawarkan');
    if (offer && findButtons(PERCENT, document, { enabledOnly: false }).length) {
      return { side: 'lender', offer };
    }
    return null;
  },
  async run(ctx, d) {
    const { findButton, findButtons, labelOf, boxOf, isSelected } = ctx.dom;
    if (!throttle(ctx, 'loan', 2000)) return false;
    if (d.side === 'borrower') {
      const offers = d.accepts.map((b, i) => {
        const row = ctx.dom.climb(b, (p) => findPlayerInText(ctx.game, p.textContent ?? '') != null, 4);
        const lender = findPlayerInText(ctx.game, row?.textContent ?? '');
        const fromState = ctx.game?.pending?.offers?.[i];
        return {
          lender: String(lender?.id ?? fromState?.lender ?? fromState?.lenderId ?? i),
          interestPercent: percentFromText(labelOf(b)),
        };
      });
      // Info dari Gali Lubang: apakah tombol Pinjol benar-benar tersedia & berapa kekurangannya.
      const picked = ask(ctx, 'acceptLoan', null, {
        offers,
        canPinjol: ctx.memo.debtCanPinjol,
        owe: ctx.memo.debtOwe,
      });
      const i = picked == null ? -1 : offers.findIndex((o) => o.lender === String(picked));
      await ctx.act.pause(ctx.cfg.timing.actionDelayMs);
      if (i >= 0) {
        ctx.act.click(d.accepts[i]);
        ctx.log.info(`Pinjaman diterima: ${labelOf(d.accepts[i])}.`);
      } else {
        // Utamakan "Tidak jadi, pilih lagi" (kembali ke Gali Lubang → Pinjol); jangan sampai klik "…, bangkrut".
        const no =
          findButton(/^tidak jadi,? pilih lagi/) ||
          findButton(/^tidak jadi(?!,? bangkrut)/) ||
          findButton(/^tidak jadi/);
        if (!no) return false;
        ctx.act.click(no);
        ctx.log.info(`Pinjaman ditolak: ${labelOf(no)}.`);
      }
      await ctx.act.sleep(1000);
      return true;
    }
    // pemberi: hanya menawarkan kalau policy jelas setuju; ragu (peminjam/jumlah tak diketahui) = tolak.
    const box = boxOf(d.offer, 2);
    const texts = modalTexts(box);
    const amount =
      finite(ctx.game?.pending?.amount) ?? finite(ctx.game?.pending?.request?.amount) ?? loanAmountFromTexts(texts);
    const borrowerId = resolveBorrowerId(ctx.game, ctx.me?.id ?? ctx.view?.meId ?? null, texts);
    if (borrowerId == null) return declineLend(ctx, box, 'peminjam tidak dikenal');
    if (amount == null) return declineLend(ctx, box, 'jumlah pinjaman tidak terbaca');
    const percent = ask(ctx, 'lendOffer', null, { borrowerId, amount });
    if (typeof percent !== 'number' || !Number.isFinite(percent)) {
      return declineLend(ctx, box, ctx.policy?.lastReason || 'strategi menolak');
    }
    const btn = findButtons(PERCENT, box, { enabledOnly: false }).find((b) => percentFromText(labelOf(b)) === percent);
    if (!btn) return declineLend(ctx, box, `tombol bunga ${percent}% tidak ada`);
    if (isSelected(btn) !== true) {
      ctx.act.click(btn);
      await ctx.act.sleep(250);
    }
    const send = findButton('tawarkan', box);
    if (!send) return false;
    ctx.act.click(send);
    ctx.log.info(`Menawarkan pinjaman dengan bunga ${percent}%.`);
    await ctx.act.sleep(1000);
    return true;
  },
};
