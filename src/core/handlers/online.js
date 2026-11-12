import { pathname, throttle } from './util.js';

/** Halaman /online: host klik "Buat room". Tidak menyentuh daftar room publik atau input kode. */
export default {
  id: 'online',
  scope: 'home',
  priority: 95,
  detect: (ctx) =>
    ctx.cfg.role === 'host' && pathname().replace(/\/+$/, '') === '/online' && ctx.dom.findButton('buat room'),
  async run(ctx, btn) {
    if (!throttle(ctx, 'online', 4000)) return false;
    ctx.act.click(btn);
    ctx.log.info('Membuat room baru.');
    await ctx.act.sleep(1500);
    return true;
  },
};
