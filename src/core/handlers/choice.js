import { IGNORED_LABELS, ask, throttle } from './util.js';

/** Kartu pilihan (awaiting_choice): urutan tombol = urutan opsi; pilihan dari policy.chooseOption. */
export default {
  id: 'choice',
  scope: 'game',
  priority: 48,
  detect(ctx) {
    const pay = ctx.dom.findButton(/^bayar rp/, document, { enabledOnly: false });
    if (pay) return { anchor: pay };
    if (ctx.game?.phase === 'awaiting_choice') {
      const modal = ctx.dom.findModal();
      if (modal) return { anchor: modal };
    }
    return null;
  },
  async run(ctx, { anchor }) {
    const { buttons, labelOf, isDisabled, boxOf } = ctx.dom;
    if (!throttle(ctx, 'choice', 2000)) return false;
    const box = anchor.matches?.('button, a, [role="button"]') ? boxOf(anchor, 2) : anchor;
    const opts = buttons(box).filter((b) => !IGNORED_LABELS.has(labelOf(b)) && labelOf(b));
    if (opts.length < 2) return false;
    const labels = opts.map(labelOf);
    const cardId = ctx.game?.pending?.cardId ?? ctx.game?.pending?.card ?? null;
    let idx = ask(ctx, 'chooseOption', 0, { cardId, options: labels });
    if (!Number.isInteger(idx) || idx < 0 || idx >= opts.length || isDisabled(opts[idx])) {
      idx = Math.max(
        0,
        opts.findIndex((b) => !isDisabled(b)),
      );
    }
    await ctx.act.pause(ctx.cfg.timing.actionDelayMs);
    ctx.act.click(opts[idx]);
    ctx.log.info(`Kartu pilihan: ${labels[idx]}.`);
    await ctx.act.sleep(1200);
    return true;
  },
};
