import { parseRupiah } from '../dom/money.js';
import { ask, myPosition, throttle, tileIndexFromText } from './util.js';

/** Ambil alih kota lawan (awaiting_takeover): policy.shouldTakeover. */
export default {
  id: 'takeover',
  scope: 'game',
  priority: 44,
  detect(ctx) {
    const take = ctx.dom.findButton(/^ambil alih rp/, document, { enabledOnly: false });
    return (
      take ||
      (ctx.dom.findLeaf(/^ambil alih kota\??$/) && ctx.dom.findButton('tidak usah', document, { enabledOnly: false }))
    );
  },
  async run(ctx) {
    const { findButton, boxOf, labelOf } = ctx.dom;
    if (!throttle(ctx, 'takeover', 1500)) return false;
    const take = findButton(/^ambil alih rp/);
    const no = findButton('tidak usah');
    const box = boxOf(take ?? no, 2);
    const tile = ctx.game?.pending?.tile ?? tileIndexFromText(box.textContent ?? '') ?? myPosition(ctx);
    const ownerId = ctx.game?.properties?.[tile]?.owner ?? ctx.game?.pending?.owner ?? null;
    const price = parseRupiah(labelOf(take ?? box));
    const want = take && ask(ctx, 'shouldTakeover', false, { tile, price, ownerId });
    await ctx.act.pause(ctx.cfg.timing.actionDelayMs);
    const btn = want ? take : (no ?? null);
    if (!btn) return false;
    ctx.act.click(btn);
    ctx.log.info(want ? `Ambil alih: ${labelOf(btn)}.` : 'Tidak ambil alih.');
    await ctx.act.sleep(1000);
    return true;
  },
};
