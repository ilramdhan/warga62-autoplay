import { throttle } from './util.js';

const SKIP = /^lewati \d+\s*\/\s*\d+$/;

/** Layar akhir: "Lewati N/M" (sekali per game), "Lanjut", lalu host "Mulai lagi"/"Main lagi". */
export default {
  id: 'endgame',
  scope: 'game',
  priority: 22,
  detect(ctx) {
    const { findButton } = ctx.dom;
    return (
      ctx.game?.phase === 'game_over' ||
      findButton(SKIP, document, { enabledOnly: false }) ||
      findButton(/^(bagikan hasil|simpan gambar)$/) ||
      (ctx.cfg.role === 'host' && findButton(/^(mulai lagi|main lagi)$/))
    );
  },
  async run(ctx) {
    const { findButton, labelOf } = ctx.dom;
    const skip = findButton(SKIP, document, { enabledOnly: false });
    if (skip) {
      if (!ctx.memo.skipClicked && !skip.disabled) {
        ctx.memo.skipClicked = true;
        ctx.act.click(skip);
        ctx.log.info(`Klik "${labelOf(skip)}" (sekali).`);
        await ctx.act.sleep(800);
        return true;
      }
      return false; // jangan klik dua kali: bisa membatalkan suara lewati
    }
    const next = findButton('lanjut');
    if (next && throttle(ctx, 'endgame-lanjut', 1500)) {
      ctx.act.click(next);
      ctx.log.info('Layar akhir: Lanjut.');
      await ctx.act.sleep(1000);
      return true;
    }
    if (ctx.cfg.role === 'host') {
      const again = findButton(/^(mulai lagi|main lagi)$/);
      if (again && throttle(ctx, 'endgame-again', 5000)) {
        ctx.act.click(again);
        ctx.log.info(`Host: ${labelOf(again)}.`);
        ctx.memo.skipClicked = false;
        await ctx.act.sleep(2500);
        return true;
      }
    }
    return false;
  },
};
