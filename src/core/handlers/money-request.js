import { parseRupiah } from '../dom/money.js';
import { ask, findPlayerByName, nameFromTitle, throttle } from './util.js';

/** Modal "<nama> minta uang": jawab lewat policy.respondMoneyRequest. */
export default {
  id: 'money-request',
  scope: 'game',
  priority: 15,
  detect(ctx) {
    const title = ctx.dom.findLeaf(/^[^/]+? minta uang\b/);
    if (!title) return null;
    const box = ctx.dom.climb(title, (p) => ctx.dom.findButton('tolak', p, { enabledOnly: false }));
    if (!box) return null;
    return { name: nameFromTitle(title.textContent, 'minta'), box };
  },
  async run(ctx, { name, box }) {
    const { findButton, norm } = ctx.dom;
    if (!throttle(ctx, 'money-request', 1500)) return false;
    const send = findButton(/^kirim rp/, box);
    const reject = findButton('tolak', box);
    const amount = parseRupiah(ctx.dom.labelOf(findButton(/^kirim rp/, box, { enabledOnly: false }) ?? box));
    const from = findPlayerByName(ctx.game, name);
    const fallback = () =>
      ctx.cfg.mode === 'grind' &&
      norm(name) === norm(ctx.cfg.winnerName) &&
      norm(ctx.cfg.myName) !== norm(ctx.cfg.winnerName);
    const accept = !!send && !!ask(ctx, 'respondMoneyRequest', fallback, { fromId: from?.id ?? name, amount });
    await ctx.act.pause(ctx.cfg.timing.actionDelayMs);
    if (accept) {
      ctx.act.click(send);
      ctx.log.info(`Permintaan uang dari ${name} disetujui.`);
    } else if (reject) {
      ctx.act.click(reject);
      ctx.log.info(`Permintaan uang dari ${name} ditolak.`);
    } else return false;
    await ctx.act.sleep(800);
    return true;
  },
};
