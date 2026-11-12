import { parseRupiah } from '../dom/money.js';
import { ask, myPosition, throttle, tileIndexFromText } from './util.js';

/** Beli tanah (awaiting_buy): policy.shouldBuy; "Flash Sale" bila policy.useKeepCard setuju. */
export default {
  id: 'buy',
  scope: 'game',
  priority: 42,
  detect: (ctx) => ctx.dom.findButton('tidak beli', document, { enabledOnly: false }),
  async run(ctx, no) {
    const { findButton, boxOf, labelOf } = ctx.dom;
    if (!throttle(ctx, 'buy', 1500)) return false;
    const box = boxOf(no, 2);
    const buyBtn = findButton(/^beli rp/, box);
    const flash = findButton(/^flash sale/, box);
    const tile = ctx.game?.pending?.tile ?? tileIndexFromText(box.textContent ?? '') ?? myPosition(ctx);
    const price = parseRupiah(labelOf(buyBtn ?? flash ?? box));
    let choice = null;
    if (buyBtn || flash) {
      const want = ask(ctx, 'shouldBuy', true, { tile, price });
      if (want) {
        choice =
          flash && ask(ctx, 'useKeepCard', false, { cardId: 'flash-sale', situation: 'buy' })
            ? flash
            : (buyBtn ?? flash);
      }
    }
    await ctx.act.pause(ctx.cfg.timing.actionDelayMs);
    ctx.act.click(choice ?? no);
    ctx.log.info(choice ? `Beli: ${labelOf(choice)}.` : 'Tidak beli.');
    await ctx.act.sleep(1000);
    return true;
  },
};
