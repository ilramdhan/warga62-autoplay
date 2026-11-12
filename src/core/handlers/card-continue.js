import { throttle } from './util.js';

/** Kartu terbuka / pesan: klik "Lanjut" saat sudah aktif. */
export default {
  id: 'card-continue',
  scope: 'game',
  priority: 58,
  detect: (ctx) => ctx.dom.findButton('lanjut'),
  async run(ctx, btn) {
    if (!throttle(ctx, 'lanjut', 800)) return false;
    ctx.act.click(btn);
    ctx.log.info('Kartu: Lanjut.');
    await ctx.act.sleep(900);
    return true;
  },
};
