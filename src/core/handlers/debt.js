import { parseRupiah } from '../dom/money.js';
import { ask, nowMs, rowOfButton, throttle, tileIndexFromText } from './util.js';

const SELL = /^jual \+\s*rp/;
const MORTGAGE = /^gadai \+\s*rp/;
const LOAN = /^(minta|ajukan) pinjaman/;
const PINJOL = /^(ambil|pakai|ajukan) pinjol/;
const BANKRUPT = /^bangkrut$/;
const CONFIRM = /^ya,? bangkrut/;

/** Gali Lubang (kas minus): jual/gadai -> pinjaman/pinjol -> bangkrut, keputusan dari policy.debtStep. */
export default {
  id: 'debt',
  scope: 'game',
  priority: 30,
  detect(ctx) {
    const { findButton, findButtons, findLeaf } = ctx.dom;
    // Tawaran pinjaman sedang ditampilkan: biarkan handler loan-offer yang memutuskan.
    if (findButtons(/^terima \d+\s*%/).length) return null;
    // Hanya dari tombol yang terlihat: fase 'debt' saja tidak cukup (bisa utang pemain lain, atau layar
    // "X bangkrut … Lanjut" masih fase debt) dan akan memblokir handler lain karena run() tak bisa apa-apa.
    return (
      findButton(CONFIRM) ||
      findButton(SELL) ||
      findButton(MORTGAGE) ||
      findButton(PINJOL) ||
      findButton(BANKRUPT) ||
      (findButton(LOAN) && findLeaf(/kas minus/))
    );
  },
  async run(ctx) {
    const { findButton, findButtons, labelOf, findLeaf } = ctx.dom;
    const now = nowMs(ctx);

    const yes = findButton(CONFIRM);
    if (yes) {
      if (now - (ctx.memo.bankruptIntent ?? 0) < 30000) {
        ctx.act.click(yes);
        ctx.memo.bankruptIntent = 0;
        ctx.log.warn('Konfirmasi: Ya, bangkrut.');
        await ctx.act.sleep(2000);
        return true;
      }
      const cancel = findButton('batal');
      if (cancel) {
        ctx.act.click(cancel);
        ctx.log.info('Batal bangkrut (bukan keputusan strategi).');
        await ctx.act.sleep(800);
        return true;
      }
      return false;
    }

    const sells = findButtons(SELL);
    const mortgages = findButtons(MORTGAGE);
    const loan = findButton(LOAN);
    const pinjol = findButton(PINJOL);
    const bankrupt = findButton(BANKRUPT);
    const tileOf = (btn, kind) => tileIndexFromText(rowOfButton(ctx, btn, (l) => kind.test(l)).textContent ?? '');
    const sellTiles = sells.map((b) => tileOf(b, SELL));
    const mortgageTiles = mortgages.map((b) => tileOf(b, MORTGAGE));
    const oweText = findLeaf(/kas minus/);
    const owe = oweText ? Math.abs(parseRupiah(oweText.textContent) ?? 0) : Math.max(0, -(ctx.me?.cash ?? 0));
    // Cegah loop: setelah "Minta pinjaman" ditolak ("Tidak jadi, pilih lagi") policy jangan diminta
    // mengulang requestLoan. Jejak ini auto-reset antar-episode (kadaluarsa 15 dtk) & saat game baru.
    const triedLoan = now - (ctx.memo.debtTriedLoanAt ?? 0) < 45000;
    const info = {
      owe,
      canSell: sellTiles.filter((t) => t != null),
      canMortgage: mortgageTiles.filter((t) => t != null),
      canLoan: !!loan && !triedLoan,
      canPinjol: !!pinjol,
      pinjolSeen: !!findButton(PINJOL, document, { enabledOnly: false }),
      triedLoan,
    };

    const fallback = () => {
      if (sells.length) return { type: 'sell', tile: sellTiles[0] };
      if (mortgages.length) return { type: 'mortgage', tile: mortgageTiles[0] };
      if (loan && !triedLoan) return { type: 'requestLoan' };
      return { type: 'bankrupt' };
    };
    const step = ask(ctx, 'debtStep', fallback, info) ?? fallback();

    const pick = (btns, tiles, tile) => btns[tiles.indexOf(tile)] ?? btns[0] ?? null;
    let target = null;
    switch (step.type) {
      case 'sell':
        target = pick(sells, sellTiles, step.tile);
        break;
      case 'mortgage':
        target = pick(mortgages, mortgageTiles, step.tile);
        break;
      case 'requestLoan':
        target = loan;
        break;
      case 'pinjol':
        target = pinjol;
        break;
      case 'bankrupt':
        target = bankrupt || sells[0] || mortgages[0] || null; // jual/gadai habis dulu sebelum "Bangkrut" muncul
        break;
      default:
        break;
    }
    if (!target || !throttle(ctx, 'debt', 1200)) return false;
    if (target === bankrupt) ctx.memo.bankruptIntent = now;
    if (target === loan) ctx.memo.debtTriedLoanAt = now;
    ctx.memo.debtCanPinjol = !!pinjol;
    ctx.memo.debtOwe = owe;
    ctx.act.click(target);
    const reason = ctx.policy?.lastReason ? ` (${ctx.policy.lastReason})` : '';
    const seen = [sells.length && 'jual', mortgages.length && 'gadai', loan && 'pinjaman', pinjol && 'pinjol']
      .filter(Boolean)
      .join('/');
    ctx.log.info(`Gali Lubang: ${labelOf(target)}${reason}. Opsi terlihat: ${seen || 'bangkrut saja'}.`);
    await ctx.act.sleep(900);
    return true;
  },
};
