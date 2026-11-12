import { ask, throttle } from './util.js';

/** Tawaran tukar tanah masuk: policy.respondTrade -> "Terima tawaran" / "Tolak". */
export default {
  id: 'trade',
  scope: 'game',
  priority: 56,
  detect: (ctx) => ctx.dom.findButton('terima tawaran'),
  async run(ctx, accept) {
    if (!throttle(ctx, 'trade', 2000)) return false;
    const yes = ask(ctx, 'respondTrade', false, ctx.game?.trade ?? ctx.game?.pending ?? {});
    const btn = yes ? accept : ctx.dom.findButton('tolak');
    if (!btn) return false;
    await ctx.act.pause(ctx.cfg.timing.actionDelayMs);
    ctx.act.click(btn);
    ctx.log.info(yes ? 'Tukar tanah diterima.' : 'Tukar tanah ditolak.');
    await ctx.act.sleep(1000);
    return true;
  },
};
