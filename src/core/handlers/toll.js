import { ask, myPosition, throttle, tileIndexFromText, tollStepsFromText } from './util.js';
import { BOARD_SIZE } from '../data/board.js';

const TOLL = /petak ke depan$/;

/** Gerbang tol: tiap opsi tombol "<gerbang> N petak ke depan"; pilihan dari policy.chooseToll. */
export default {
  id: 'toll',
  scope: 'game',
  priority: 40,
  detect(ctx) {
    const btns = ctx.dom.findButtons(TOLL);
    return btns.length ? btns : null;
  },
  async run(ctx, btns) {
    if (!throttle(ctx, 'toll', 2000)) return false;
    const pos = myPosition(ctx);
    const tiles = btns.map((b) => {
      const text = ctx.dom.labelOf(b);
      const byName = tileIndexFromText(text, ['toll']);
      if (byName != null) return byName;
      const n = tollStepsFromText(text);
      return pos != null && n != null ? (pos + n) % BOARD_SIZE : null;
    });
    const known = tiles.filter((t) => t != null);
    const chosen = known.length ? ask(ctx, 'chooseToll', null, known) : null;
    const idx = chosen != null && tiles.includes(chosen) ? tiles.indexOf(chosen) : 0;
    ctx.act.click(btns[idx]);
    ctx.log.info(`Gerbang tol: ${ctx.dom.labelOf(btns[idx])}.`);
    await ctx.act.sleep(1200);
    return true;
  },
};
