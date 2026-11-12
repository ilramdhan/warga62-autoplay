import { throttle } from './util.js';

/** Fase urutan main: "Lempar ulang" (seri), "Mulai main" (di luar ruang tunggu), "Lanjut". */
export default {
  id: 'order',
  scope: 'game',
  priority: 20,
  detect(ctx) {
    const { findButton, inLobby } = ctx.dom;
    const again = findButton('lempar ulang');
    if (again) return { btn: again, what: 'Lempar ulang (urutan seri)' };
    if (!inLobby()) {
      const start = findButton('mulai main');
      if (start) return { btn: start, what: 'Mulai main (urutan giliran)' };
    }
    if (ctx.game?.phase === 'order_roll') {
      const next = findButton('lanjut');
      if (next) return { btn: next, what: 'Lanjut (urutan giliran)' };
    }
    return null;
  },
  async run(ctx, { btn, what }) {
    if (!throttle(ctx, 'order', 2500)) return false;
    ctx.act.click(btn);
    ctx.log.info(what + '.');
    await ctx.act.sleep(1200);
    return true;
  },
};
