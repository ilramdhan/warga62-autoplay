import { pathname, throttle } from './util.js';

/** Guest di halaman /room/KODE yang belum masuk: klik "Gabung". */
export default {
  id: 'join-page',
  scope: 'any',
  priority: 90,
  detect(ctx) {
    if (ctx.cfg.role !== 'guest' || !pathname().startsWith('/room/')) return null;
    if (ctx.dom.inLobby() || ctx.dom.findLeaf(/ mengajak mabar$/)) return null;
    if (ctx.game?.phase && ctx.game.phase !== 'game_over') return null;
    return ctx.dom.findButton('gabung');
  },
  async run(ctx, btn) {
    if (!throttle(ctx, 'join-page', 4000)) return false;
    ctx.act.click(btn);
    ctx.log.info('Bergabung ke room.');
    await ctx.act.sleep(2000);
    return true;
  },
};
