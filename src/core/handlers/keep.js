import { ask, keepCardIdFromText, throttle } from './util.js';

/** Prompt kartu simpanan (awaiting_keep): "Pakai …" atau "Tidak usah", dari policy.useKeepCard. */
export default {
  id: 'keep',
  scope: 'game',
  priority: 50,
  detect(ctx) {
    if (ctx.dom.findButton('kocok dadu sekarang')) return null; // itu pengadilan
    const uses = ctx.dom.findButtons(/^pakai /).filter((b) => !/^pakai joki,? jalan ke /.test(ctx.dom.labelOf(b)));
    return uses.length ? uses : null;
  },
  async run(ctx, uses) {
    if (!throttle(ctx, 'keep', 2000)) return false;
    for (const use of uses) {
      const cardId = keepCardIdFromText(ctx.dom.labelOf(use));
      if (ask(ctx, 'useKeepCard', true, { cardId, situation: 'prompt' })) {
        await ctx.act.pause(ctx.cfg.timing.actionDelayMs);
        ctx.act.click(use);
        ctx.log.info(`Kartu simpanan: ${ctx.dom.labelOf(use)}.`);
        await ctx.act.sleep(1200);
        return true;
      }
    }
    const no = ctx.dom.findButton('tidak usah');
    if (!no) return false;
    ctx.act.click(no);
    ctx.log.info('Kartu simpanan: tidak dipakai.');
    await ctx.act.sleep(900);
    return true;
  },
};
