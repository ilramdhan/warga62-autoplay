import { ask, findPlayerInText, percentFromText, throttle } from './util.js';
import { parseRupiah } from '../dom/money.js';

const ACCEPT = /^terima \d+\s*%/;
const PERCENT = /^\d+\s*%$/;

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
    // pemberi
    const box = boxOf(d.offer, 2);
    const amount = ctx.game?.pending?.amount ?? parseRupiah(box.textContent ?? '');
    const borrowerId = ctx.game?.pending?.borrowerId ?? ctx.game?.pending?.borrower ?? null;
    let percent = ask(ctx, 'lendOffer', 50, { borrowerId, amount });
    if (percent == null) {
      const decline = findButton(/^(tolak|batal|tutup|lewati)$/, box);
      if (decline) {
        ctx.act.click(decline);
        ctx.log.info('Tidak menawarkan pinjaman.');
        await ctx.act.sleep(800);
        return true;
      }
      percent = 50; // tidak ada tombol menolak: tawarkan bunga tertinggi
    }
    const btn = findButtons(PERCENT, box, { enabledOnly: false }).find((b) => percentFromText(labelOf(b)) === percent);
    if (btn && isSelected(btn) !== true) {
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
