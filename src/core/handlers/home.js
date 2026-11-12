import { pathname, throttle } from './util.js';

/** Beranda: host klik link "Main Online". Guest menunggu undangan. */
export default {
  id: 'home',
  scope: 'home',
  priority: 96,
  detect: (ctx) => ctx.cfg.role === 'host' && pathname() === '/' && ctx.dom.findButton('main online'),
  async run(ctx, btn) {
    if (!throttle(ctx, 'home', 4000)) return false;
    ctx.act.click(btn);
    ctx.log.info('Masuk Main Online.');
    await ctx.act.sleep(1500);
    return true;
  },
};
