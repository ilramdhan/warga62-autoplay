import { ask, keepCardIdFromText, throttle } from './util.js';

/** Pengadilan: pakai kartu ("Pakai …") bila policy setuju, jika tidak "Kocok dadu sekarang". */
export default {
  id: 'court',
  scope: 'game',
  priority: 35,
  detect: (ctx) => ctx.dom.findButton('kocok dadu sekarang'),
  async run(ctx, roll) {
    if (!throttle(ctx, 'court', 1500)) return false;
    for (const use of ctx.dom.findButtons(/^pakai /)) {
      const cardId = keepCardIdFromText(ctx.dom.labelOf(use));
      if (ask(ctx, 'useKeepCard', false, { cardId, situation: 'court' })) {
        ctx.act.click(use);
        ctx.log.info(`Pengadilan: ${ctx.dom.labelOf(use)}.`);
        await ctx.act.sleep(1200);
        return true;
      }
    }
    ctx.act.click(roll);
    ctx.log.info('Pengadilan: kocok dadu sekarang.');
    await ctx.act.sleep(1000);
    return true;
  },
};
